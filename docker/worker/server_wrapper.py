from fastapi import FastAPI, Request, BackgroundTasks
import subprocess
import os
import sys
import json
import logging
import time
import urllib.request
import re

# Tippecanoe emits one progress line per tile: "49.0%\t10/585/220"
_TIPPECANOE_PROGRESS = re.compile(r'^\d+\.\d+%\s+\d+/\d+/\d+')
# PostgreSQL connection strings with embedded passwords
_PG_DSN = re.compile(r'(postgresql|postgres)://([^:]+):([^@]+)@')
# S3 / generic secret key patterns
_SECRET_KEY = re.compile(r'(secret[_\-]?(?:access[_\-]?)?key\s*[=:]\s*)\S+', re.IGNORECASE)


def sanitize(line: str) -> str | None:
    """Return None to drop the line, or a redacted version to keep it."""
    if _TIPPECANOE_PROGRESS.match(line):
        return None
    line = _PG_DSN.sub(r'\1://***:***@', line)
    line = _SECRET_KEY.sub(r'\1***', line)
    return line

# Configure logging to stdout so it shows up in platform logs
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger("peon-wrapper")

app = FastAPI(title="Waystones Peon Worker Wrapper")

import threading

# Thread-safe counter for active tasks
active_tasks_lock = threading.Lock()
active_tasks_count = 0

class _PostRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if code in (307, 308):
            return urllib.request.Request(newurl, data=req.data, headers=dict(req.headers), method=req.get_method())
        return super().redirect_request(req, fp, code, msg, headers, newurl)

_opener = urllib.request.build_opener(_PostRedirectHandler)


def send_log_lines(lines: list, app_url: str, proj_id: str, secret: str) -> None:
    if not lines or not app_url or not proj_id:
        return
    try:
        import json as _json
        body = _json.dumps({"lines": lines}).encode()
        url = f"{app_url.rstrip('/')}/api/projects/{proj_id}/worker/append-log"
        headers = {"Content-Type": "application/json", "User-Agent": "Waystones-Peon/1.0"}
        if secret:
            headers["Authorization"] = f"Bearer {secret}"
        rq = urllib.request.Request(url, data=body, headers=headers, method="POST")
        with _opener.open(rq, timeout=10):
            pass
    except Exception as e:
        logger.warning(f"Failed to send log lines to cloud: {e}")


def run_task_subprocess(env_vars: dict):
    """
    Runs the main.py script in a subprocess with the provided environment variables.
    """
    global active_tasks_count
    
    with active_tasks_lock:
        active_tasks_count += 1
        
    logger.info(f"--- Starting task execution (Active tasks: {active_tasks_count}) ---")
    
    # Prepare environment
    task_env = os.environ.copy()
    task_env.update({k: str(v) for k, v in env_vars.items() if v is not None})
    task_env["PYTHONUNBUFFERED"] = "1"
    
    # Log the task type and project ID
    task_type = task_env.get("TASK_TYPE", "unknown")
    project_id = task_env.get("PROJECT_ID", "unknown")
    logger.info(f"Task Type: {task_type}, Project ID: {project_id}")
    
    try:
        # Execute main.py
        process = subprocess.Popen(
            [sys.executable, "/app/main.py"],
            env=task_env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            universal_newlines=True
        )
        
        # Stream logs to stdout and batch-POST to cloud
        app_url = task_env.get("APP_URL", "").strip()
        proj_id = task_env.get("PROJECT_ID", "").strip()
        secret = task_env.get("PEON_CALLBACK_SECRET", "").strip()
        FLUSH_INTERVAL = 3.0
        FLUSH_SIZE = 20
        buffer = []
        last_flush = time.time()

        def flush_buffer():
            nonlocal buffer, last_flush
            if buffer:
                send_log_lines(buffer[:], app_url, proj_id, secret)
                buffer = []
            last_flush = time.time()

        if process.stdout:
            for line in process.stdout:
                stripped = line.strip()
                print(f"[worker] {stripped}", flush=True)
                clean = sanitize(stripped)
                if clean is not None:
                    ts = time.strftime("%H:%M:%S") + " "
                    buffer.append(ts + clean)
                    if len(buffer) >= FLUSH_SIZE or time.time() - last_flush >= FLUSH_INTERVAL:
                        flush_buffer()

        process.wait()
        flush_buffer()
        
        if process.returncode == 0:
            logger.info(f"--- Task completed successfully (code 0) ---")
        else:
            logger.error(f"--- Task failed with exit code {process.returncode} ---")
            
    except Exception as e:
        logger.exception(f"Unexpected error during task execution: {e}")
    finally:
        with active_tasks_lock:
            active_tasks_count -= 1
            logger.info(f"Task finished. Remaining active tasks: {active_tasks_count}")
            
            if active_tasks_count == 0:
                logger.info("No more active tasks. Shutting down container now...")
                # We use a short delay to ensure the log is flushed before the process dies
                # and to allow a tiny window for another request to hit before we die.
                def delayed_exit():
                    import time
                    time.sleep(20)
                    logger.info("Goodbye!")
                    os._exit(0)
                
                threading.Thread(target=delayed_exit, daemon=True).start()

@app.post("/internal-task")
async def handle_internal_task(request: Request, background_tasks: BackgroundTasks):
    """
    Receives JSON payload from the Edge Proxy,
    translates it to environment variables, and triggers the worker script.
    """
    try:
        payload = await request.json()
    except Exception as e:
        logger.error(f"Failed to parse JSON body: {e}")
        return {"status": "error", "message": "Invalid JSON body"}, 400

    logger.info(f"Received internal task request: {json.dumps(payload)}")

    # Map payload to environment variables expected by main.py
    # We prioritize the explicit outputUri if provided by the worker proxy
    task_type = payload.get("taskType", "convert")
    
    # Dynamic output target determination logic (as requested)
    output_uri = payload.get("outputUri")
    if not output_uri:
        # Fallback logic if proxy didn't calculate it
        # We assume /layers as default unless it's a specific type
        folder = "layers"
        if task_type in ["tiles", "tile"]:
            folder = "tiles"
        elif task_type == "stac":
            folder = "data"
        output_uri = f"/app/output/{folder}" # Local fallback
        logger.warning(f"outputUri not provided, falling back to: {output_uri}")

    env_vars = {
        "PROJECT_ID": payload.get("projectId"),
        "PROJECT_NAME": payload.get("projectName"),
        "TASK_TYPE": task_type,
        "INPUT_TYPE": payload.get("inputType", "gpkg"),
        "INPUT_URI": payload.get("inputUri") or payload.get("r2ObjectKey"),
        "OUTPUT_TYPE": payload.get("outputType", "s3"),
        "OUTPUT_URI": output_uri,
        "MIN_ZOOM": payload.get("minZoom"),
        "MAX_ZOOM": payload.get("maxZoom"),
        "STRATEGY": payload.get("partitionStrategy"),
        "COLUMN": payload.get("partitionColumn"),
        "MODEL_B64": payload.get("dataModelB64"),
        "FORMAT": payload.get("format", "all"),
        "TABLES": payload.get("tables"),
        "EXCLUDE_ATTRIBUTES": ",".join(payload.get("excludeAttributes") or [])
            if isinstance(payload.get("excludeAttributes"), list)
            else (payload.get("excludeAttributes") or ""),
        "EXCLUDE_LAYERS": ",".join(payload.get("excludeLayerNames") or [])
            if isinstance(payload.get("excludeLayerNames"), list)
            else (payload.get("excludeLayerNames") or ""),
    }

    # Inject S3 credentials if passed (proxy worker often passes these)
    s3_env = payload.get("s3Env", {})
    if isinstance(s3_env, dict):
        for k, v in s3_env.items():
            env_vars[k] = v

    # Queue the task for background execution
    background_tasks.add_task(run_task_subprocess, env_vars)

    return {
        "status": "accepted",
        "message": f"Task {task_type} for project {payload.get('projectId')} has been queued.",
        "outputTarget": output_uri
    }

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    # Defaulting to 8080 as it's common for Edge Containers
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
