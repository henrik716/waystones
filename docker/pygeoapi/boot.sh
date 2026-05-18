#!/bin/bash
# boot.sh — unified entrypoint for the Waystones pygeoapi image.
# Universal script for both Open Source (Docker Compose) and SaaS (Fly.io).

set -euo pipefail

# ─── Environment Activation ───────────────────────────────────────────────
if [ -s /etc/pygeoapi-venv-bin ]; then
    export PATH="$(cat /etc/pygeoapi-venv-bin):$PATH"
    echo "[startup] Activated venv: $(cat /etc/pygeoapi-venv-bin)"
fi

if [ -s /etc/pygeoapi-site-packages ]; then
    export PYTHONPATH="$(cat /etc/pygeoapi-site-packages):${PYTHONPATH:-}"
fi

export PYGEOAPI_CONFIG="${PYGEOAPI_CONFIG:-/pygeoapi/local.config.yml}"
export PYGEOAPI_OPENAPI="/pygeoapi/local.openapi.yml"
export PYGEOAPI_TEMPLATES_PATH="/pygeoapi/local-templates"

# ─── Caddy Configuration ──────────────────────────────────────────────────
export HOME=/tmp
export XDG_CONFIG_HOME=/tmp/caddy_config
export XDG_DATA_HOME=/tmp/caddy_data

# When the host injects a TLS cert (SaaS path: Edge SSL Certificate
# mounted by the provisioner), use the wrapper Caddyfile that adds a :443 TLS
# site. Otherwise stick with the base Caddyfile (Railway / self-hosted / local).
CADDY_CONFIG="/etc/caddy/Caddyfile"
if [ -n "${TLS_CERT_FILE:-}" ] && [ -f "${TLS_CERT_FILE}" ] && [ -n "${TLS_KEY_FILE:-}" ] && [ -f "${TLS_KEY_FILE}" ]; then
    echo "[startup] TLS cert detected at ${TLS_CERT_FILE}; using Caddyfile.tls"
    CADDY_CONFIG="/etc/caddy/Caddyfile.tls"
fi

# ─── Proactive QGIS Wakeup ────────────────────────────────────────────────
# Only runs if WMS is enabled AND a wakeup URL is provided by the host environment
if [ "${DEPLOY_QGIS:-0}" = "1" ] && [ -n "${WMS_WAKEUP_URL:-}" ]; then
    (sleep 2 && \
     echo "[startup] Proactively waking up QGIS (WMS) machine..." && \
     curl -s -o /dev/null --retry 1 --connect-timeout 5 "${WMS_WAKEUP_URL}") &
fi

# ─── Config Injection Fallback ────────────────────────────────────────────
if [ -n "${PYGEOAPI_CONFIG_B64:-}" ]; then
    echo "[startup] Writing pygeoapi config from PYGEOAPI_CONFIG_B64..."
    echo "$PYGEOAPI_CONFIG_B64" | base64 -d > "$PYGEOAPI_CONFIG"
    touch /tmp/waystones_tenant_config_written
fi

# If config exists (either injected above or volume-mounted), signal readiness
if [ -f "$PYGEOAPI_CONFIG" ]; then
    touch /tmp/waystones_tenant_config_written
fi

# ─── Process Management ───────────────────────────────────────────────────
USE_SIDECAR="${DEPLOY_SIDE_GATEWAY:-0}"

if [ "${DEPLOY_PYGEOAPI:-1}" = "0" ]; then
    echo "[startup] Gateway-only mode. Starting Caddy..."
    exec caddy run --config "$CADDY_CONFIG" --adapter caddyfile
fi

# If sidecar is requested OR we have a WMS Wakeup URL (implying cloud/SaaS routing)
if [ "$USE_SIDECAR" = "1" ] || [ -n "${WMS_WAKEUP_URL:-}" ]; then
    echo "[startup] Starting Caddy Gateway (Sidecar)..."
    export GOMAXPROCS=1
    caddy run --config "$CADDY_CONFIG" --adapter caddyfile &

    echo "[startup] Routing pygeoapi to internal port 5001..."
    export CONTAINER_PORT=5001
    export GUNICORN_CMD_ARGS="${GUNICORN_CMD_ARGS:-} --forwarded-allow-ips=127.0.0.1"
    # Map WSGI_WORKERS (from Waystones Cloud provisioner) to Gunicorn workers
    export CONTAINER_WORKERS="${WSGI_WORKERS:-${CONTAINER_WORKERS:-2}}"
else
    export CONTAINER_PORT="${PORT:-5000}"
fi

# ─── Background Tasks ─────────────────────────────────────────────────────
if [ -f "$PYGEOAPI_CONFIG" ]; then
    # 1. Fast Path: Synchronous download of pre-baked doc
    python3 /cache_openapi.py --download-only || true
    
    if [ ! -f "$PYGEOAPI_OPENAPI" ]; then
        # Initialize placeholder if download failed (Slow Path / Local dev)
        echo "[startup] Cache miss - initializing placeholder OpenAPI..."
        cat <<EOF > "$PYGEOAPI_OPENAPI"
openapi: 3.0.0
info:
  title: Waystones API (Initializing)
  description: "Documentation is currently being built in the background. Please refresh in 60-120 seconds."
  version: 1.0.0
paths: {}
EOF
        # Background generation & hot-reload
        (sleep 5 && nice -n 19 python3 /cache_openapi.py --generate-and-reload) &
    fi

    # 2. AsyncAPI generation (Lightweight)
    (pygeoapi asyncapi generate "$PYGEOAPI_CONFIG" --output-file /pygeoapi/local.asyncapi.yml 2>/dev/null || true) &

    # 3. DuckDB / Parquet Warmup
    if [ -f "/warmup.py" ]; then
        (sleep 5 && nice -n 19 python3 /warmup.py) &
    fi
else
    echo "[startup] Warning: No pygeoapi config found at $PYGEOAPI_CONFIG"
fi

# ─── Start Gunicorn ───────────────────────────────────────────────────────
# DuckDB extensions are loaded lazily by the provider on first use, and
# warmup.py pulls them into the OS page cache after Gunicorn is bound.
# Pre-loading here would block port 5001 and fail Fly health checks.
echo "[startup] Starting Gunicorn on port ${CONTAINER_PORT}..."
exec gunicorn \
    --workers "${CONTAINER_WORKERS:-2}" \
    --worker-class=gthread \
    --threads 2 \
    --max-requests 500 \
    --max-requests-jitter 50 \
    --bind "${CONTAINER_HOST:-0.0.0.0}:${CONTAINER_PORT}" \
    --access-logfile - \
    --timeout 6000 \
    --limit-request-field-size 0 \
    --pythonpath / \
    waystones_wsgi:application