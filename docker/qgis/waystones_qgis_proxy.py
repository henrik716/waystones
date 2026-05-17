#!/usr/bin/env python3
"""
Thin HTTP proxy that sits on port 80 and intercepts the first request to write
the QGIS project file from X-Waystones-Qgis-B64, then starts spawn-fcgi +
nginx on an internal port and proxies all traffic there.
"""
import os
import signal
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
    """Inject R2/S3 credentials from X-Waystones-Config into:
      1. os.environ  — inherited by spawn-fcgi and its QGIS child
      2. /tmp/qgis-env.sh — sourced by qgis-wrapper.sh before exec
      3. nginx fastcgi_params — passed as FastCGI params to QGIS per-request

    Without this, the entrypoint would write empty fastcgi_params at boot
    (credentials aren't available yet) and GDAL would hang on 169.254.169.254.
    """
    os.environ["AWS_EC2_METADATA_DISABLED"] = "true"
    
    raw_config = headers.get("X-Waystones-Config")
    machine_env = {}
    
    if raw_config:
        try:
            cfg = json.loads(raw_config)
            machine_env = cfg.get("container_env") or cfg.get("machine_env") or {}
        except Exception as e:
            print(f"[waystones_qgis_proxy] Warning: could not parse X-Waystones-Config: {e}", flush=True)
    else:
        # Fallback for Open Source / Docker Compose: use container environment variables
        # Filter for the same set of variables the cloud provisioner sends.
        prefixes = ("AWS_", "S3_", "CPL_", "GDAL_")
        for k, v in os.environ.items():
            if k.startswith(prefixes):
                machine_env[k] = v
        
        # Ensure AWS_S3_ENDPOINT is derived if only URL is present
        if "AWS_ENDPOINT_URL" in machine_env and "AWS_S3_ENDPOINT" not in machine_env:
            machine_env["AWS_S3_ENDPOINT"] = machine_env["AWS_ENDPOINT_URL"].replace("https://", "").replace("http://", "")

    if not machine_env:
        return

    for k, v in machine_env.items():
        os.environ[k] = str(v)

    # Write env file sourced by qgis-wrapper.sh
    with open("/tmp/qgis-env.sh", "w") as f:
        for k, v in machine_env.items():
            f.write(f'export {k}="{v}"\n')
        f.write('export AWS_EC2_METADATA_DISABLED="true"\n')

    # Inject into nginx fastcgi_params so QGIS receives them per-request
    aws_id     = machine_env.get("AWS_ACCESS_KEY_ID", "")
    aws_secret = machine_env.get("AWS_SECRET_ACCESS_KEY", "")
    raw_ep     = machine_env.get("AWS_S3_ENDPOINT") or machine_env.get("AWS_ENDPOINT_URL", "")
    clean_ep   = raw_ep.replace("https://", "").replace("http://", "")

    nginx_params = "\n".join([
        f'fastcgi_param AWS_ACCESS_KEY_ID "{aws_id}";',
        f'fastcgi_param AWS_SECRET_ACCESS_KEY "{aws_secret}";',
        f'fastcgi_param AWS_S3_ENDPOINT "{clean_ep}";',
        'fastcgi_param AWS_VIRTUAL_HOSTING "FALSE";',
        'fastcgi_param AWS_HTTPS "YES";',
        'fastcgi_param AWS_EC2_METADATA_DISABLED "true";',
        'fastcgi_param CPL_VSIL_CURL_USE_HEAD "FALSE";',
    ])
    for nginx_file in ["/etc/nginx/fastcgi_params", "/etc/nginx/fastcgi.conf"]:
        if os.path.exists(nginx_file):
            with open(nginx_file, "a") as f:
                f.write("\n" + nginx_params + "\n")

    print(f"[waystones_qgis_proxy] Injected {len(machine_env)} credentials into env, wrapper, and nginx", flush=True)


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
        if self.path == "/health":
            self._send_plain(200, b"OK")
            return

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
    mode = os.environ.get("WAYSTONES_MODE", "cloud")
    
    # Eager startup for Open Source users to avoid first-request delay
    if mode == "open-source" and os.path.exists(PROJECT_PATH):
        print("[waystones_qgis_proxy] Open Source mode detected; performing eager startup", flush=True)
        _inject_credentials({}) # Pass empty headers to trigger env fallback
        if _start_qgis_stack():
            _STARTED = True

    server = ThreadedHTTPServer(("0.0.0.0", LISTEN_PORT), ProxyHandler)
    print(f"[waystones_qgis_proxy] Listening on :{LISTEN_PORT}, nginx internal :{NGINX_INTERNAL_PORT}", flush=True)

    def _handle_sigterm(signum, frame):
        print("[waystones_qgis_proxy] SIGTERM received — exiting", flush=True)
        os._exit(0)

    signal.signal(signal.SIGTERM, _handle_sigterm)
    server.serve_forever()
