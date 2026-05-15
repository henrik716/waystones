import os
import json
import base64
import subprocess
import threading

_lock = threading.Lock()
_CONFIG_LOADED = False
_pygeoapi_app = None

CONFIG_PATH = os.environ.get("PYGEOAPI_CONFIG", "/pygeoapi/local.config.yml")
OPENAPI_PATH = os.environ.get("PYGEOAPI_OPENAPI", "/pygeoapi/local.openapi.yml")
_TASKS_FLAG = "/tmp/waystones_tasks_triggered"
# Written after the real tenant config is installed (either by boot.sh or by this
# wrapper). Guards against loading the base-image demo config on cold start.
_TENANT_FLAG = "/tmp/waystones_tenant_config_written"


def _inject_container_env(raw_config_json: str) -> None:
    """Inject container_env credentials into os.environ before pygeoapi loads.

    Fallback for when this.start({ envVars }) in the CF Container Durable Object
    fails to inject environment variables on cold start.
    """
    try:
        payload = json.loads(raw_config_json)
        container_env = payload.get("container_env") or payload.get("machine_env") or {}
        injected = 0
        for k, v in container_env.items():
            if k not in os.environ or not os.environ[k]:
                os.environ[k] = str(v)
                injected += 1
        if injected:
            print(f"[waystones_wsgi] Injected {injected} env vars from container_env", flush=True)
    except Exception as e:
        print(f"[waystones_wsgi] Warning: could not parse container_env: {e}", flush=True)


def _is_stub_openapi() -> bool:
    """Return True if local.openapi.yml is still the baked-in 'booting' placeholder."""
    try:
        with open(OPENAPI_PATH, "r") as f:
            head = f.read(256)
        return "booting" in head or "paths: {}" in head
    except OSError:
        return True


def _ensure_openapi_ready() -> None:
    """Guarantee a real openapi.yml exists before Flask loads.

    Fast path: try S3/local cache download (already done by boot.sh on non-CF paths,
    but skipped there when config didn't exist yet). Falls back to synchronous
    generation — this blocks the first request but ensures correct UI on cold start.
    The background task (_trigger_background_tasks) then uploads to S3 so future
    cold starts hit the cache instead.
    """
    # Trivial fast path: real OpenAPI already on disk (SIGHUP reload, or second worker
    # calling this after the first worker already generated it).
    if not _is_stub_openapi():
        return

    # Fast path: pull from S3/local cache
    subprocess.run(
        ["python3", "/cache_openapi.py", "--download-only"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )

    if not _is_stub_openapi():
        print("[waystones_wsgi] OpenAPI ready (from cache)", flush=True)
        return

    # Slow path: generate synchronously from the config we just wrote
    print("[waystones_wsgi] Cache miss — generating OpenAPI spec (blocking)...", flush=True)
    tmp = OPENAPI_PATH + ".tmp"
    openapi_dir = os.path.dirname(OPENAPI_PATH)
    os.makedirs(openapi_dir, exist_ok=True)
    try:
        with open(tmp, "w") as f:
            subprocess.run(
                ["pygeoapi", "openapi", "generate", CONFIG_PATH],
                stdout=f, check=True,
            )
        os.replace(tmp, OPENAPI_PATH)
        print("[waystones_wsgi] OpenAPI spec generated", flush=True)
    except Exception as e:
        print(f"[waystones_wsgi] Warning: OpenAPI generation failed: {e}", flush=True)
        try:
            os.unlink(tmp)
        except OSError:
            pass


def _trigger_background_tasks() -> None:
    """Fire cache upload + asyncapi + warmup once per container boot."""
    if os.path.exists(_TASKS_FLAG):
        return
    try:
        open(_TASKS_FLAG, "w").close()
    except OSError:
        pass

    devnull = {"stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}

    # Uploads the generated openapi.yml to S3 and sends SIGHUP to reload workers.
    subprocess.Popen(["python3", "/cache_openapi.py", "--generate-and-reload"], **devnull)

    subprocess.Popen(
        ["pygeoapi", "asyncapi", "generate", CONFIG_PATH,
         "--output-file", "/pygeoapi/local.asyncapi.yml"],
        **devnull,
    )

    if os.path.exists("/warmup.py"):
        subprocess.Popen(["python3", "/warmup.py"], **devnull)


def _load_app():
    from pygeoapi.flask_app import APP
    return APP


def application(environ, start_response):
    global _CONFIG_LOADED, _pygeoapi_app

    if not _CONFIG_LOADED:
        with _lock:
            if not _CONFIG_LOADED:
                # Always inject machine_env first so DuckDB/boto3 have R2 credentials
                # before pygeoapi loads, regardless of which config path we take below.
                raw_config = environ.get("HTTP_X_WAYSTONES_CONFIG")
                if raw_config:
                    _inject_container_env(raw_config)

                # Priority 1: clean base64 header set by containers.ts
                b64 = environ.get("HTTP_X_WAYSTONES_CONFIG_B64")

                # Priority 2: extract pygeoapi_yml from the raw JSON (fallback for
                # when the containers.ts forwarding fix is not yet deployed)
                if not b64 and raw_config:
                    try:
                        b64 = json.loads(raw_config).get("pygeoapi_yml")
                    except Exception:
                        pass

                if b64:
                    # Always write — overrides any base-image demo config on disk.
                    try:
                        config_bytes = base64.b64decode(b64)
                    except Exception:
                        start_response("400 Bad Request", [("Content-Type", "text/plain")])
                        return [b"Invalid config base64."]

                    tmp = CONFIG_PATH + ".tmp"
                    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
                    with open(tmp, "wb") as f:
                        f.write(config_bytes)
                    os.replace(tmp, CONFIG_PATH)
                    open(_TENANT_FLAG, "w").close()

                    print(f"[waystones_wsgi] Config written to {CONFIG_PATH}", flush=True)

                    # Ensure openapi.yml is real before Flask loads — pygeoapi uses it
                    # to build the collections index and API spec on startup.
                    _ensure_openapi_ready()

                    # Background: upload openapi to S3 cache, asyncapi, warmup
                    _trigger_background_tasks()

                elif os.path.exists(CONFIG_PATH) and os.path.exists(_TENANT_FLAG):
                    # Real tenant config is on disk (written by boot.sh or a previous
                    # worker in this container boot). Safe to load.
                    print(f"[waystones_wsgi] Using existing config at {CONFIG_PATH}", flush=True)
                    _ensure_openapi_ready()

                else:
                    start_response("503 Service Unavailable", [
                        ("Content-Type", "text/plain"),
                        ("Retry-After", "5"),
                    ])
                    return [b"Service initializing. Missing config header."]

                _pygeoapi_app = _load_app()
                _CONFIG_LOADED = True

    return _pygeoapi_app(environ, start_response)
