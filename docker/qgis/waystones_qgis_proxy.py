#!/usr/bin/env python3
"""
Thin HTTP proxy that sits on port 80 and intercepts the first request to write
the QGIS project file from X-Waystones-Qgis-B64, then starts spawn-fcgi +
nginx on an internal port and proxies all traffic there.
"""
import os
import base64
import json
import subprocess
import threading
import time
import socket
import http.server
import http.client
import socketserver

NGINX_INTERNAL_PORT = int(os.environ.get("NGINX_INTERNAL_PORT", "8080"))
LISTEN_PORT = int(os.environ.get("CONTAINER_PORT", "80"))
PROJECT_PATH = "/data/project.qgs"
FCGI_SOCKET = "/tmp/qgis-fcgi.sock"

_init_lock = threading.Lock()
_STARTED = False


def _wait_for_nginx(timeout=60):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            s = socket.create_connection(("127.0.0.1", NGINX_INTERNAL_PORT), timeout=1)
            s.close()
            return True
        except OSError:
            time.sleep(0.5)
    return False


def _inject_credentials(headers) -> None:
    """Inject R2/S3 credentials from X-Waystones-Config into os.environ so that
    spawn-fcgi and its QGIS child inherit them. Without explicit credentials GDAL
    falls back to EC2 instance metadata (169.254.169.254) and hangs indefinitely.
    """
    os.environ["AWS_EC2_METADATA_DISABLED"] = "true"
    raw_config = headers.get("X-Waystones-Config")
    if not raw_config:
        return
    try:
        machine_env = json.loads(raw_config).get("machine_env") or {}
        for k, v in machine_env.items():
            os.environ[k] = str(v)
        print(f"[waystones_qgis_proxy] Injected {len(machine_env)} credentials from machine_env", flush=True)
    except Exception as e:
        print(f"[waystones_qgis_proxy] Warning: could not parse X-Waystones-Config: {e}", flush=True)


def _start_qgis_stack() -> bool:
    subprocess.run(["chown", "-R", "www-data:www-data", "/data"], check=False)
    if os.path.exists(PROJECT_PATH):
        subprocess.run(["chmod", "644", PROJECT_PATH], check=False)

    # Remove stale socket if it exists (e.g. from a crashed previous run)
    if os.path.exists(FCGI_SOCKET):
        os.unlink(FCGI_SOCKET)

    fcgi = subprocess.Popen(
        [
            "spawn-fcgi", "-u", "www-data", "-g", "www-data",
            "-d", "/var/lib/qgis", "-s", FCGI_SOCKET,
            "--", "/usr/local/bin/qgis-wrapper.sh",
        ],
        stderr=subprocess.PIPE,
    )
    time.sleep(0.5)
    # spawn-fcgi forks the child and exits with rc=0 on success — only fail on non-zero
    if fcgi.poll() is not None and fcgi.returncode != 0:
        err = (fcgi.stderr.read() if fcgi.stderr else b"").decode("utf-8", errors="replace")
        print(f"[waystones_qgis_proxy] spawn-fcgi failed (rc={fcgi.returncode}): {err}", flush=True)
        return False

    subprocess.Popen(["nginx", "-g", "daemon off;"])
    subprocess.Popen(["tail", "-f", "/tmp/qgis-server.log"])
    subprocess.Popen(["tail", "-f", "/tmp/nginx-error.log"])

    if not _wait_for_nginx():
        print("[waystones_qgis_proxy] FATAL: nginx did not become ready in time", flush=True)
        return False

    print("[waystones_qgis_proxy] nginx ready on internal port", flush=True)
    return True


_STRIP_HEADERS = {"x-waystones-qgis-b64", "x-waystones-config", "x-waystones-config-b64"}


class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def _ensure_started(self) -> bool:
        global _STARTED
        if _STARTED:
            return True
        with _init_lock:
            if _STARTED:
                return True

            if os.path.exists(PROJECT_PATH):
                print("[waystones_qgis_proxy] Project found on disk, starting stack", flush=True)
                _inject_credentials(self.headers)
                if not _start_qgis_stack():
                    self._send_plain(503, b"QGIS stack failed to start. Check container logs.",
                                     extra=[("Retry-After", "10")])
                    return False
                _STARTED = True
                return True

            b64 = self.headers.get("X-Waystones-Qgis-B64")
            if not b64:
                self._send_plain(503, b"QGIS initializing. Missing X-Waystones-Qgis-B64 header.",
                                 extra=[("Retry-After", "5")])
                return False

            try:
                project_bytes = base64.b64decode(b64)
            except Exception:
                self._send_plain(400, b"Invalid X-Waystones-Qgis-B64: not valid base64.")
                return False

            os.makedirs("/data", exist_ok=True)
            tmp = PROJECT_PATH + ".tmp"
            with open(tmp, "wb") as f:
                f.write(project_bytes)
            os.replace(tmp, PROJECT_PATH)
            print(f"[waystones_qgis_proxy] Project written to {PROJECT_PATH}", flush=True)

            _inject_credentials(self.headers)
            if not _start_qgis_stack():
                self._send_plain(503, b"QGIS stack failed to start. Check container logs.",
                                 extra=[("Retry-After", "10")])
                return False
            _STARTED = True
            return True

    def _send_plain(self, code: int, body: bytes, extra: list = []):
        self.send_response(code)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        for k, v in extra:
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _proxy(self):
        if not self._ensure_started():
            return

        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None

        fwd_headers = {k: v for k, v in self.headers.items()
                       if k.lower() not in _STRIP_HEADERS}

        try:
            conn = http.client.HTTPConnection("127.0.0.1", NGINX_INTERNAL_PORT, timeout=300)
            conn.request(self.command, self.path, body=body, headers=fwd_headers)
            resp = conn.getresponse()

            self.send_response(resp.status, resp.reason)
            for k, v in resp.getheaders():
                if k.lower() != "transfer-encoding":
                    self.send_header(k, v)
            self.end_headers()

            if self.command != "HEAD":
                while chunk := resp.read(65536):
                    self.wfile.write(chunk)
        except Exception as e:
            print(f"[waystones_qgis_proxy] Proxy error: {e}", flush=True)
            try:
                self._send_plain(502, f"Gateway error: {e}".encode())
            except Exception:
                pass

    do_GET = _proxy
    do_POST = _proxy
    do_HEAD = _proxy
    do_OPTIONS = _proxy
    do_PUT = _proxy
    do_DELETE = _proxy

    def log_message(self, fmt, *args):
        print(f"[waystones_qgis_proxy] {self.address_string()} - {fmt % args}", flush=True)


class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


if __name__ == "__main__":
    server = ThreadedHTTPServer(("0.0.0.0", LISTEN_PORT), ProxyHandler)
    print(f"[waystones_qgis_proxy] Listening on :{LISTEN_PORT}, nginx internal :{NGINX_INTERNAL_PORT}", flush=True)
    server.serve_forever()
