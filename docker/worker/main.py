#!/usr/bin/env python3
"""
main.py — Universal worker entrypoint.

Reads 4 environment variables and routes to the appropriate conversion script:

  INPUT_TYPE   "gpkg" | "postgis"
  INPUT_URI    Source: local path (/input/data.gpkg), s3://bucket/key.gpkg,
               or postgresql://user:pass@host:5432/dbname
  OUTPUT_TYPE  "local" | "s3"
  OUTPUT_URI   Destination: local dir (/data/) or s3://bucket/prefix
  MODEL_PATH   Optional: Path to model.json for layer mapping/naming
  TARGET_CRS   Optional: Target CRS (default EPSG:4326) for normalization
  TASK_TYPE    Optional: "snapshot" (default) or "tiles"

For INPUT_TYPE=postgis the URI is parsed and individual PG_* env vars are
injected so postgis-snapshot.py's build_pg_connection_string() works unchanged.
"""

import os
import sys
import time
import subprocess
from urllib.parse import urlparse

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))


def parse_pg_uri(uri: str) -> dict:
    """Parse postgresql://user:pass@host:port/dbname → PG_* env vars."""
    parsed = urlparse(uri)
    if parsed.scheme not in ("postgresql", "postgres"):
        raise ValueError(f"Expected a postgresql:// URI, got scheme {parsed.scheme!r}")
    return {
        "PG_HOST":     parsed.hostname or "localhost",
        "PG_PORT":     str(parsed.port or 5432),
        "PG_DB":       (parsed.path or "").lstrip("/"),
        "PG_USER":     parsed.username or "",
        "PG_PASSWORD": parsed.password or "",
    }


def send_log_lines(lines: list) -> None:
    """Batch-POST log lines to the cloud append-log endpoint."""
    app_url = os.environ.get("APP_URL", "").strip()
    proj_id = os.environ.get("PROJECT_ID", "").strip()
    if not app_url or not proj_id or not lines:
        return
    try:
        import urllib.request, json as _json
        secret = os.environ.get("PEON_CALLBACK_SECRET", "").strip()
        body = _json.dumps({"lines": lines}).encode()
        url = f"{app_url.rstrip('/')}/api/projects/{proj_id}/worker/append-log"
        headers = {"Content-Type": "application/json", "User-Agent": "Waystones-Peon/1.0"}
        if secret:
            headers["Authorization"] = f"Bearer {secret}"
        rq = urllib.request.Request(url, data=body, headers=headers, method="POST")
        with urllib.request.urlopen(rq, timeout=10) as _resp:
            pass
    except Exception as e:
        print(f"[main] Warning: Failed to send log lines to cloud: {e}", flush=True)


def run_subprocess_with_log_stream(cmd: list, env: dict) -> int:
    """Run a subprocess, stream output to stdout, and batch-POST lines to the cloud."""
    import subprocess, threading

    proc = subprocess.Popen(cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)

    buffer = []
    last_flush = time.time()
    FLUSH_INTERVAL = 3.0
    FLUSH_SIZE = 20

    def flush():
        nonlocal buffer, last_flush
        if buffer:
            send_log_lines(buffer[:])
            buffer = []
        last_flush = time.time()

    for raw_line in proc.stdout:
        line = raw_line.rstrip("\n")
        print(line, flush=True)
        ts = time.strftime("%H:%M:%S") + " "
        buffer.append(ts + line)
        if len(buffer) >= FLUSH_SIZE or time.time() - last_flush >= FLUSH_INTERVAL:
            flush()

    proc.wait()
    flush()
    return proc.returncode


def report_done(status, error_msg=None):
    app_url = os.environ.get("APP_URL", "").strip()
    proj_id = os.environ.get("PROJECT_ID", "").strip()
    task_type = os.environ.get("TASK_TYPE", "snapshot").strip().lower()
    
    if not app_url or not proj_id:
        return

    try:
        import urllib.request, json as _json
        
        payload = {}
        if status == "success":
            # Try to read metrics from sub-scripts - use absolute path in /tmp for reliability
            metrics_path = "/tmp/.peon-metrics.json"
            if os.path.exists(metrics_path):
                try:
                    with open(metrics_path, "r") as f:
                        payload = _json.load(f)
                    # Clean up after reading
                    os.remove(metrics_path)
                except:
                    pass
        else:
            payload = {"error": error_msg or "Unknown error"}

        callback_url = f"{app_url.rstrip('/')}/api/projects/{proj_id}/worker/report-done"
        secret = os.environ.get("PEON_CALLBACK_SECRET", "").strip()
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Waystones-Peon/1.0"
        }
        if secret:
            headers["Authorization"] = f"Bearer {secret}"
        
        body = _json.dumps({
            "taskType": task_type,
            "status": status,
            "payload": payload
        }).encode()
        
        # Custom opener that follows 307/308 redirects while preserving POST method
        class _PostRedirectHandler(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                if code in (307, 308):
                    return urllib.request.Request(newurl, data=req.data, headers=dict(req.headers), method=req.get_method())
                return super().redirect_request(req, fp, code, msg, headers, newurl)
        opener = urllib.request.build_opener(_PostRedirectHandler)

        # Simple retry logic for the cloud callback
        max_retries = 3
        for attempt in range(max_retries):
            try:
                print(f"[main] Reporting {status} to {callback_url} (Attempt {attempt+1}/{max_retries})...", flush=True)
                rq = urllib.request.Request(callback_url, data=body, headers=headers, method="POST")
                with opener.open(rq, timeout=15) as resp:
                    print(f"[main] Cloud reported: {resp.status} {resp.reason}", flush=True)
                    return # Success!
            except Exception as e:
                status_code = getattr(e, 'code', 'N/A')
                print(f"[main] Attempt {attempt+1} failed ({status_code}). Retrying in 2s...", flush=True)
                if attempt < max_retries - 1:
                    time.sleep(2)
                else:
                    raise e
    except Exception as e:
        if hasattr(e, 'code'):
            print(f"[main] Error: Cloud rejected callback after {max_retries} attempts with status {e.code}: {e.reason}", flush=True)
        else:
            print(f"[main] Warning: Failed to report {status} to cloud after {max_retries} attempts: {e}", flush=True)


def report_success(app_url, proj_id, task_type):
    report_done("success")


def report_error(message: str) -> None:
    report_done("error", error_msg=message)


def main() -> None:
    input_type  = os.environ.get("INPUT_TYPE",  "").strip().lower()
    input_uri   = os.environ.get("INPUT_URI",   "").strip()
    output_type = os.environ.get("OUTPUT_TYPE", "").strip().lower()
    output_uri  = os.environ.get("OUTPUT_URI",  "").strip()
    model_path  = os.environ.get("MODEL_PATH",  "").strip()

    missing = [name for name, val in [
        ("INPUT_TYPE",  input_type),
        ("INPUT_URI",   input_uri),
        ("OUTPUT_TYPE", output_type),
        ("OUTPUT_URI",  output_uri),
    ] if not val]
    if missing:
        msg = f"Missing required environment variable(s): {', '.join(missing)}"
        print(f"[main] ERROR: {msg}", file=sys.stderr, flush=True)
        report_error(msg)
        sys.exit(1)

    if input_type not in ("gpkg", "postgis"):
        msg = f"Unsupported INPUT_TYPE={input_type!r}. Must be 'gpkg' or 'postgis'."
        print(f"[main] ERROR: {msg}", file=sys.stderr, flush=True)
        report_error(msg)
        sys.exit(1)

    if output_type not in ("local", "s3"):
        msg = f"Unsupported OUTPUT_TYPE={output_type!r}. Must be 'local' or 's3'."
        print(f"[main] ERROR: {msg}", file=sys.stderr, flush=True)
        report_error(msg)
        sys.exit(1)

    # The Parquet/FlatGeobuf pipeline must always output WGS84 so that bbox columns
    # are in decimal degrees and pygeoapi spatial filtering works correctly.
    # TARGET_CRS is provided as an escape hatch for advanced use; otherwise hardcode WGS84.
    target_crs = os.environ.get("TARGET_CRS", "").strip() or "EPSG:4326"
    print(f"[main] Target CRS for reprojection: {target_crs}", flush=True)

    print(f"[main] INPUT_TYPE={input_type}   INPUT_URI={input_uri}",  flush=True)
    print(f"[main] OUTPUT_TYPE={output_type}  OUTPUT_URI={output_uri}", flush=True)
    if model_path:
        print(f"[main] MODEL_PATH={model_path}", flush=True)

    env = os.environ.copy()
    env["TARGET_CRS"] = target_crs

    task_type = os.environ.get("TASK_TYPE", "snapshot").strip().lower()

    if task_type == "tiles":
        script = os.path.join(SCRIPTS_DIR, "vector-tile-generator.py")
        cmd = [
            sys.executable, script,
            f"--output-prefix={output_uri}",
            "--user-id=local",
        ]
        if input_type == "gpkg":
            cmd.append(f"--source={input_uri}")
        else: # postgis
            try:
                pg_vars = parse_pg_uri(input_uri)
                env.update(pg_vars)
            except Exception as exc:
                print(f"[main] ERROR: {exc}", file=sys.stderr, flush=True)
                sys.exit(1)
        
        if model_path:
            cmd.append(f"--model={model_path}")
        
        # Pass zoom levels if provided
        min_z = os.environ.get("MIN_ZOOM")
        max_z = os.environ.get("MAX_ZOOM")
        if min_z: cmd.append(f"--min-zoom={min_z}")
        if os.environ.get("AUTO_ZOOM", "").lower() in ("1", "true", "yes"):
            cmd.append("--auto-zoom")
        elif max_z:
            cmd.append(f"--max-zoom={max_z}")
        simplification = os.environ.get("SIMPLIFICATION")
        if simplification: cmd.append(f"--simplification={simplification}")

    elif task_type == "stac":
        script = os.path.join(SCRIPTS_DIR, "duckdb-stac-generator.py")
        cmd = [
            sys.executable, script,
            f"--source={input_uri}",
            f"--source-type={input_type}",
            f"--output={output_uri}",
        ]
        
        # Pass optional args
        strategy = os.environ.get("STRATEGY")
        if strategy: cmd.append(f"--strategy={strategy}")
            
        column = os.environ.get("COLUMN")
        if column: cmd.append(f"--column={column}")
            
        fmt = os.environ.get("FORMAT", "all")
        if fmt: cmd.append(f"--format={fmt}")
            
        tables = os.environ.get("TABLES")
        if tables: cmd.append(f"--layers={tables}")
            
        model_b64 = os.environ.get("MODEL_B64")
        if model_b64: cmd.append(f"--model={model_b64}")

        # Postgis vars just in case DuckDB native connection wants them
        if input_type == "postgis":
            try:
                pg_vars = parse_pg_uri(input_uri)
                env.update(pg_vars)
            except Exception as exc:
                print(f"[main] ERROR: {exc}", file=sys.stderr, flush=True)
                sys.exit(1)

    elif input_type == "gpkg":
        script = os.path.join(SCRIPTS_DIR, "gpkg-converter.py")
        cmd = [
            sys.executable, script,
            f"--source={input_uri}",
            f"--output-prefix={output_uri}",
            "--user-id=local",
            f"--target-crs={target_crs}",
        ]
        if model_path:
            cmd.append(f"--model={model_path}")

    else:  # postgis
        try:
            pg_vars = parse_pg_uri(input_uri)
        except (ValueError, Exception) as exc:
            print(
                f"[main] ERROR: Cannot parse INPUT_URI as a PostgreSQL URI: {exc}",
                file=sys.stderr, flush=True,
            )
            sys.exit(1)

        env.update(pg_vars)
        print(
            f"[main] Resolved PostGIS connection: "
            f"{pg_vars['PG_USER']}@{pg_vars['PG_HOST']}:{pg_vars['PG_PORT']}/{pg_vars['PG_DB']}",
            flush=True,
        )

        script = os.path.join(SCRIPTS_DIR, "postgis-snapshot.py")
        cmd = [
            sys.executable, script,
            f"--output-prefix={output_uri}",
            "--user-id=local",
        ]
        if model_path:
            cmd.append(f"--model={model_path}")

    print(f"[main] Executing: {' '.join(cmd)}", flush=True)

    returncode = run_subprocess_with_log_stream(cmd, env)

    if returncode != 0:
        msg = f"Worker script exited with code {returncode}."
        print(f"[main] ERROR: {msg}", file=sys.stderr, flush=True)
        report_error(msg)
        sys.exit(returncode)

    print("[main] Worker completed successfully.", flush=True)
    app_url = os.environ.get("APP_URL", "").strip()
    proj_id = os.environ.get("PROJECT_ID", "").strip()
    report_success(app_url, proj_id, task_type)


if __name__ == "__main__":
    main()
