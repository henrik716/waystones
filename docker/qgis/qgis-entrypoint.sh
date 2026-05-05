#!/bin/bash
# entrypoint for the QGIS Server container

set -euo pipefail

mkdir -p /data
chown -R www-data:www-data /data

# Decode QGIS project from env var (backward-compat: Fly.io / Railway / local dev).
# In Edge Containers this env var may not be set; the proxy handles it via
# the X-Waystones-Qgis-B64 request header instead.
if [ -n "${QGIS_PROJECT_B64:-}" ] && [ ! -f "/data/project.qgs" ]; then
    echo "[qgis-startup] Writing QGIS project from env..."
    echo "$QGIS_PROJECT_B64" | base64 -d > /data/project.qgs
    chmod 644 /data/project.qgs
fi

export NGINX_INTERNAL_PORT="${NGINX_INTERNAL_PORT:-8080}"

echo "[qgis-startup] Testing nginx config..."
nginx -t 2>&1 || { echo "[qgis-startup] nginx config test FAILED — aborting"; exit 1; }

# Generate the FastCGI wrapper. Credentials are NOT injected here — they arrive
# in the HTTP header and are written to /tmp/qgis-env.sh by the Python proxy
# at request time, so this wrapper always sources the up-to-date file.
echo "[qgis-startup] Generating FastCGI wrapper..."
cat <<'EOF' > /usr/local/bin/qgis-wrapper.sh
#!/bin/bash
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

if [ -f /tmp/qgis-env.sh ]; then
    source /tmp/qgis-env.sh
fi

export HOME=/tmp
export XDG_RUNTIME_DIR=/tmp
export QGIS_OPTIONS_PATH=/tmp
export QGIS_CUSTOM_CONFIG_PATH=/tmp
export QT_BEARER_POLL_TIMEOUT=-1
export QGIS_PROJECT_FILE="/data/project.qgs"
export QT_QPA_PLATFORM="offscreen"
export QGIS_SERVER_LOG_LEVEL=0
export QGIS_SERVER_LOG_FILE="/tmp/qgis-server.log"
export QGIS_SERVER_LOG_STDERR=1
export QGIS_SERVER_TRUST_LAYER_METADATA=1

exec /usr/lib/cgi-bin/qgis_mapserv.fcgi
EOF

chmod +x /usr/local/bin/qgis-wrapper.sh
touch /tmp/qgis-env.sh /tmp/qgis-server.log /tmp/nginx-error.log /tmp/nginx-access.log
chown www-data:www-data /tmp/qgis-env.sh /tmp/qgis-server.log /tmp/nginx-error.log /tmp/nginx-access.log

echo "[qgis-startup] Starting proxy wrapper on port ${CONTAINER_PORT:-80}..."
exec python3 /waystones_qgis_proxy.py
