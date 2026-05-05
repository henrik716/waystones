#!/bin/bash
# entrypoint for the QGIS Server container

set -euo pipefail

# ─── Ensure /data directory exists ────────────────────────────────────────
mkdir -p /data

# Decode QGIS project from env var (backward-compat: Fly.io / Railway / local dev).
# In Cloudflare Containers this env var may not be set; the proxy handles it via
# the X-Waystones-Qgis-B64 request header instead.
if [ -n "${QGIS_PROJECT_B64:-}" ] && [ ! -f "/data/project.qgs" ]; then
    echo "[qgis-startup] Writing QGIS project from env..."
    echo "$QGIS_PROJECT_B64" | base64 -d > /data/project.qgs
fi

chown -R www-data:www-data /data
[ -f "/data/project.qgs" ] && chmod 644 /data/project.qgs || true

# ─── BULLETPROOF ENVIRONMENT DUMP ─────────────────────────────────────────
echo "[qgis-startup] Capturing root environment for FastCGI..."
env | grep -E '^(AWS_|QGIS_|CPL_|GDAL_|QT_)' | sed 's/^/export /' > /tmp/qgis-env.sh
chmod 644 /tmp/qgis-env.sh

# ─── GDAL /vsis3/ Pre-flight ──────────────────────────────────────────────
if [ -f "/data/project.qgs" ]; then
    FIRST_FGB=$(grep -oP '/vsis3/[^<"]+\.fgb' /data/project.qgs 2>/dev/null | head -1 || true)
    if [ -n "$FIRST_FGB" ]; then
        echo "[qgis-startup] Testing GDAL access to: $FIRST_FGB"
        cat <<'PYEOF' > /tmp/test.py
import sys
try:
    from osgeo import ogr, gdal
    gdal.UseExceptions()
    ds = ogr.Open(sys.argv[1])
    if ds:
        print(f"[qgis-startup] Pre-flight: OK ({ds.GetLayerCount()} layer(s))", flush=True)
    else:
        print("[qgis-startup] Pre-flight: FAILED — ogr.Open returned None", flush=True)
except Exception as e:
    print(f"[qgis-startup] Pre-flight: FAILED — {e}", flush=True)
PYEOF
        su -s /bin/bash www-data -c "source /tmp/qgis-env.sh && python3 /tmp/test.py \"$FIRST_FGB\""
    fi
fi

# ─── INJECT VARIABLES INTO NGINX ──────────────────────────────────────────
echo "[qgis-startup] Injecting FastCGI parameters into Nginx..."
for file in /etc/nginx/fastcgi_params /etc/nginx/fastcgi.conf; do
    if [ -f "$file" ]; then
        echo "fastcgi_param AWS_ACCESS_KEY_ID \"${AWS_ACCESS_KEY_ID:-}\";" >> "$file"
        echo "fastcgi_param AWS_SECRET_ACCESS_KEY \"${AWS_SECRET_ACCESS_KEY:-}\";" >> "$file"
        _raw_ep="${AWS_ENDPOINT_URL:-${AWS_S3_ENDPOINT:-}}"
        _clean_ep="${_raw_ep#https://}"
        _clean_ep="${_clean_ep#http://}"
        echo "fastcgi_param AWS_S3_ENDPOINT \"${_clean_ep}\";" >> "$file"
        echo "fastcgi_param AWS_VIRTUAL_HOSTING \"FALSE\";" >> "$file"
        echo "fastcgi_param AWS_HTTPS \"YES\";" >> "$file"
        echo "fastcgi_param CPL_VSIL_CURL_USE_HEAD \"FALSE\";" >> "$file"
    fi
done

# nginx-qgis.conf (baked into the image) already listens on 8080.
# No runtime port rebinding needed.
export NGINX_INTERNAL_PORT="${NGINX_INTERNAL_PORT:-8080}"

# Validate nginx config early so startup failures are obvious in logs.
echo "[qgis-startup] Testing nginx config..."
nginx -t 2>&1 || { echo "[qgis-startup] nginx config test FAILED — aborting"; exit 1; }

# ─── Generate QGIS FastCGI Wrapper ─────────────────────────────────────────
echo "[qgis-startup] Generating FastCGI wrapper..."

cat <<'EOF' > /usr/local/bin/qgis-wrapper.sh
#!/bin/bash
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
source /tmp/qgis-env.sh

# PREVENT HANGING & NETWORK BUGS
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

# Skip per-layer S3 validation on GetCapabilities — avoids multi-second hangs
# on cold start when projects have many /vsis3/ layers
export QGIS_SERVER_TRUST_LAYER_METADATA=1

exec /usr/lib/cgi-bin/qgis_mapserv.fcgi
EOF

chmod +x /usr/local/bin/qgis-wrapper.sh
touch /tmp/qgis-server.log /tmp/nginx-error.log /tmp/nginx-access.log
chown www-data:www-data /tmp/qgis-server.log /tmp/nginx-error.log /tmp/nginx-access.log

# ─── Hand off to the proxy wrapper ────────────────────────────────────────
# The proxy writes the project file (if not already present), starts
# spawn-fcgi + nginx, and proxies all traffic to nginx internally.
echo "[qgis-startup] Starting proxy wrapper on port ${CONTAINER_PORT:-80}..."
exec python3 /waystones_qgis_proxy.py
