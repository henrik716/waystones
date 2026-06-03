/**
 * railway-templates.ts
 * 
 * Static templates for Railway Dockerfiles and boot scripts.
 * These are included in the deployment export when the Railway target is selected.
 */

// isGpkg / gpkgFilename are unused for oapif-go (data stays in S3),
// kept in the signature for backwards compatibility.
export function generateDockerfile(_isGpkg: boolean, _gpkgFilename?: string): string {
  return `FROM ghcr.io/waystones-nexus/oapif-go:latest

# Configuration — oapif-go reads this at startup via CONFIG_PATH.
COPY oapif-go-config.json /config.json

# Default env vars (Railway overrides PORT automatically)
ENV PORT=80
ENV CONFIG_PATH=/config.json

# oapif-go binary is the entrypoint — no boot script needed.
`;
}


export const dockerfileQgis = `FROM ghcr.io/waystones-nexus/waystones-keystone:qgis-latest

USER root

# 1. Prevent apt-get from hanging on interactive prompts (like tzdata)
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies (cached)
RUN apt-get update && apt-get install -y --no-install-recommends \\
    gdal-bin \\
    libgdal-dev \\
    libpq5 \\
    curl \\
    unzip \\
    python3-pip \\
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir --break-system-packages duckdb

# 2. Install AWS CLI (added -q to unzip to prevent log-choking)
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip \\
    && unzip -q /tmp/awscliv2.zip -d /tmp \\
    && /tmp/aws/install \\
    && rm -rf /tmp/awscliv2.zip /tmp/aws

WORKDIR /app

# Direct COPY is faster for core scripts
COPY docker/worker/*.py /app/worker/
COPY docker/railway/qgis-boot.sh /qgis-boot.sh
RUN chmod +x /qgis-boot.sh

# Configuration
COPY model.json /app/model.json

# Build context sync for optional data only
COPY . /tmp/build-context
RUN mkdir -p /data && \\
    if [ -d /tmp/build-context/data ]; then \\
        cp -r /tmp/build-context/data/* /data/ || true; \\
    fi && \\
    rm -rf /tmp/build-context

ENTRYPOINT ["/qgis-boot.sh"]
`;

export const railwayBoot = `#!/bin/bash
set -euo pipefail

# This script handles the initialization process.
# If /data/ is empty and INPUT_URI is present, it executes the worker script (saving outputs to /data/).
# Once the data exists, it hands over to the standard API boot process

mkdir -p /data || true

echo "[railway-boot] Checking for existing data in /data..."

# baked-in data sync (aggressive no-clobber)
if [ -d /app/data-sync ] && [ "$(ls -A /app/data-sync 2>/dev/null)" ]; then
    echo "[railway-boot] Syncing baked-in data to /data (no-clobber)..."
    cp -rn /app/data-sync/* /data/ || true
fi

# Debug: Log the final contents of /data to help identify naming mismatches
echo "[railway-boot] Volume contents (/data):"
ls -R /data
echo "---"

# Detective work: see if we have source data vs. prepared data
LOCAL_GPKG=$(ls /data/*.gpkg 2>/dev/null | head -n 1 || true)
HAS_PARQUET=$(ls /data/*.parquet 2>/dev/null | head -n 1 || true)

# Model awareness
export MODEL_PATH=""
if [ -f "/app/model.json" ]; then
    export MODEL_PATH="/app/model.json"
fi

if [ -z "$HAS_PARQUET" ]; then
    echo "[railway-boot] No GeoParquet files found in /data. Initialization required."
    
    # Check if we have the minimum environment required to run the worker
    if [ -n "\${INPUT_URI:-}" ] || [ -n "$LOCAL_GPKG" ] || ( [ -n "\${POSTGRES_HOST:-}" ] && [ -n "\${POSTGRES_DB:-}" ] ); then
        echo "[railway-boot] Starting uninitialized volume setup..."
        
        # Auto-detect local GeoPackage if no URI is provided
        if [ -n "$LOCAL_GPKG" ] && [ -z "\${INPUT_URI:-}" ]; then
            echo "[railway-boot] Using local GeoPackage as source: $LOCAL_GPKG"
            export INPUT_TYPE="gpkg"
            export INPUT_URI="$LOCAL_GPKG"
        fi
        
        # Inject Universal Contract defaults if not provided
        export INPUT_TYPE="\${INPUT_TYPE:-postgis}"
        export OUTPUT_TYPE="\${OUTPUT_TYPE:-local}"
        export OUTPUT_URI="\${OUTPUT_URI:-/data/}"
        
        # Build INPUT_URI for PostGIS if needed
        if [ -z "\${INPUT_URI:-}" ] && [ "$INPUT_TYPE" = "postgis" ]; then
            export INPUT_URI="postgresql://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@\${POSTGRES_HOST}:\${POSTGRES_PORT:-5432}/\${POSTGRES_DB}"
        fi
        
        echo "[railway-boot] Running Conversion Worker..."
        python3 /app/worker/main.py
        
        echo "[railway-boot] Worker complete. Final volume contents:"
        ls -R /data
    else
        echo "[railway-boot] No source data found (GeoPackage, S3, or PostGIS). Skipping initial snapshot."
        echo "[railway-boot] Warning: The pygeoapi server may fail to start if it expects GeoParquet data."
    fi
else
    echo "[railway-boot] GeoParquet data exists in /data. Skipping worker (subsequent boot)."
fi

# Switch to the pygeoapi nobody user's privileges to run the API properly
if [ "$(id -u)" = "0" ]; then
    chown -R nobody:nogroup /data
    chown -R nobody:nogroup /pygeoapi || true
    echo "[railway-boot] Handing over to standard pygeoapi boot (as nobody)..."
    exec su nobody -s /bin/bash -c "/boot.sh"
else
    echo "[railway-boot] Handing over to pygeoapi boot..."
    exec /boot.sh
fi
`;

export const qgisBoot = `#!/bin/bash
set -euo pipefail

mkdir -p /data || true

echo "[railway-qgis-boot] Checking for existing data in /data..."
if [ -z "$(ls -A /data/*.fgb 2>/dev/null)" ]; then
    echo "[railway-qgis-boot] Data directory lacks .fgb files."
    
    if [ -n "\${INPUT_URI:-}" ] || ( [ -n "\${POSTGRES_HOST:-}" ] && [ -n "\${POSTGRES_DB:-}" ] ); then
        echo "[railway-qgis-boot] Initialization starting (Snapshotting FlatGeobufs)..."
        
        export INPUT_TYPE="\${INPUT_TYPE:-postgis}"
        export OUTPUT_TYPE="\${OUTPUT_TYPE:-local}"
        export OUTPUT_URI="\${OUTPUT_URI:-/data/}"
        
        if [ -z "\${INPUT_URI:-}" ] && [ "$INPUT_TYPE" = "postgis" ]; then
            export INPUT_URI="postgresql://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@\${POSTGRES_HOST}:\${POSTGRES_PORT:-5432}/\${POSTGRES_DB}"
        fi
        
        if [ "$INPUT_TYPE" = "gpkg" ] && [ -z "\${INPUT_URI:-}" ]; then
            export INPUT_URI="/input/data.gpkg"
        fi
        
        # Model awareness
        export MODEL_PATH=""
        if [ -f "/app/model.json" ]; then
            export MODEL_PATH="/app/model.json"
        fi

        echo "[railway-qgis-boot] Running Conversion Worker..."
        python3 /app/worker/main.py
        
        echo "[railway-qgis-boot] Worker complete. Final volume contents:"
        ls -R /data
    else
        echo "[railway-qgis-boot] No source connection details found. Skipping initial snapshot."
    fi
else
    echo "[railway-qgis-boot] FlatGeobuf data already exists in /data."
fi

# Chown data so www-data can read it in QGIS
chown -R www-data:www-data /data || true

echo "[railway-qgis-boot] Handing over to qgis-entrypoint.sh..."
exec /entrypoint.sh
`;

export const workerMain = `#!/usr/bin/env python3
import os
import sys
import subprocess
from urllib.parse import urlparse

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))

def parse_pg_uri(uri: str) -> dict:
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
        print(
            f"[main] ERROR: Missing required environment variable(s): {', '.join(missing)}",
            file=sys.stderr, flush=True,
        )
        sys.exit(1)

    if input_type not in ("gpkg", "postgis"):
        print(
            f"[main] ERROR: Unsupported INPUT_TYPE={input_type!r}. Must be 'gpkg' or 'postgis'.",
            file=sys.stderr, flush=True,
        )
        sys.exit(1)

    if output_type not in ("local", "s3"):
        print(
            f"[main] ERROR: Unsupported OUTPUT_TYPE={output_type!r}. Must be 'local' or 's3'.",
            file=sys.stderr, flush=True,
        )
        sys.exit(1)

    print(f"[main] INPUT_TYPE={input_type}   INPUT_URI={input_uri}",  flush=True)
    print(f"[main] OUTPUT_TYPE={output_type}  OUTPUT_URI={output_uri}", flush=True)
    if model_path:
        print(f"[main] MODEL_PATH={model_path}", flush=True)

    env = os.environ.copy()

    if input_type == "gpkg":
        script = os.path.join(SCRIPTS_DIR, "gpkg-converter.py")
        cmd = [
            sys.executable, script,
            f"--source={input_uri}",
            f"--output-prefix={output_uri}",
            "--user-id=local",
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
    result = subprocess.run(cmd, env=env)
    sys.exit(result.returncode)

if __name__ == "__main__":
    main()
`;

export const workerGpkgConverter = `#!/usr/bin/env python3
"""
gpkg-converter.py — GeoPackage → FlatGeobuf + GeoParquet conversion worker.

Accepts both S3 and local-filesystem I/O:

  --source        s3://bucket/path/file.gpkg  OR  /input/data.gpkg
  --output-prefix s3://bucket/prefix          OR  /data/

When --output-prefix starts with s3://, files are uploaded via \\\`aws s3 sync\\\`
and a manifest is written to S3.  Otherwise files are copied directly to the
local directory and a manifest is written there.

Required environment variables (S3 mode only):
    AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION
    S3_ENDPOINT   (full URL, e.g. https://abc123.r2.cloudflarestorage.com)
    R2_BUCKET     (bucket name, used for manifest key derivation)
"""

import argparse
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
from urllib.parse import urlparse

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

def parse_args():
    p = argparse.ArgumentParser(description="Convert a GeoPackage to per-layer FlatGeobuf + GeoParquet files")
    p.add_argument("--source",        required=True,  help="Source .gpkg: local path or s3:// URI")
    p.add_argument("--output-prefix", required=True,  help="Output destination: local dir or s3:// prefix")
    p.add_argument("--user-id",       required=True,  help="User ID (for logging)")
    p.add_argument("--model",         required=False, default=None, help="Path to model.json for layer mapping")
    p.add_argument("--deployment-id", required=False, default=None, help="Deployment ID (for S3 manifest path)")
    p.add_argument("--target-crs",    required=False, default=None, help="Target CRS (e.g. EPSG:4326) for reprojection")
    return p.parse_args()

# ---------------------------------------------------------------------------
# DNS Fix (IPv6 TCP Blackhole) — only needed when talking to S3
# ---------------------------------------------------------------------------

def force_ipv4_for_endpoint(endpoint_url: str):
    domain = urlparse(endpoint_url).hostname
    if not domain:
        return
    try:
        ipv4_addr = socket.gethostbyname(domain)
        with open("/etc/hosts", "a") as f:
            f.write(f"\\n{ipv4_addr} {domain}\\n")
        print(f"[converter] Fixed IPv6 timeout: Forced {domain} to {ipv4_addr} in /etc/hosts", flush=True)
    except Exception as e:
        print(f"[converter] Warning: Could not override DNS for IPv4: {e}", flush=True)

# ---------------------------------------------------------------------------
# S3 helpers
# ---------------------------------------------------------------------------

def get_endpoint_url() -> str:
    url = (
        os.environ.get("AWS_ENDPOINT_URL") or 
        os.environ.get("S3_ENDPOINT", "")
    )
    if not url:
        raise RuntimeError("Neither AWS_ENDPOINT_URL nor S3_ENDPOINT environment variable is set")
    return url

def s3_cp(src: str, dst: str) -> None:
    cmd = ["aws", "s3", "cp", src, dst, "--endpoint-url", get_endpoint_url(), "--no-progress"]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"aws s3 cp failed: {result.stderr.strip()}")

def s3_put_json(bucket: str, key: str, data: dict) -> None:
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(data, f)
        tmp_path = f.name
    try:
        s3_cp(tmp_path, f"s3://{bucket}/{key}")
    finally:
        os.unlink(tmp_path)

# ---------------------------------------------------------------------------
# Layer enumeration
# ---------------------------------------------------------------------------

def list_layers(gpkg_path: str) -> list[str]:
    result = subprocess.run(["ogrinfo", "-so", "-al", gpkg_path], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ogrinfo failed: {result.stderr.strip()}")
    layers = []
    for line in result.stdout.splitlines():
        if line.startswith("Layer name:"):
            layers.append(line.split(":", 1)[1].strip())
    return layers

# ---------------------------------------------------------------------------
# Name sanitization — MUST match TypeScript toTableName() in nameSanitizer.ts
# ---------------------------------------------------------------------------

def to_safe_name(name: str) -> str:
    safe = re.sub(r"[^a-z0-9]", "_", name.lower())
    safe = re.sub(r"_+", "_", safe)
    safe = safe.strip("_")
    return safe or "layer"

# ---------------------------------------------------------------------------
# Conversion
# ---------------------------------------------------------------------------

def convert_layer(gpkg_path: str, layer_name: str, safe_name: str, out_dir: str, target_crs: str = None) -> str:
    """Convert a single GeoPackage layer to FlatGeobuf. Returns local .fgb path."""
    out_path = os.path.join(out_dir, f"{safe_name}.fgb")
    cmd = [
        "ogr2ogr",
        "-f", "FlatGeobuf",
        out_path,
        gpkg_path,
        layer_name,
        "-nln", safe_name,
        "-nlt", "PROMOTE_TO_MULTI",
    ]
    if target_crs:
        cmd += ["-t_srs", target_crs]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ogr2ogr failed for layer '{layer_name}': {result.stderr.strip()}")
    return out_path


def convert_layer_to_parquet(fgb_path: str, safe_name: str, out_dir: str) -> str | None:
    """Convert FlatGeobuf to GeoParquet via DuckDB spatial. Non-fatal on failure."""
    import duckdb
    out_path = os.path.join(out_dir, f"{safe_name}.parquet")
    try:
        ext_dir = os.environ.get("DUCKDB_EXTENSION_DIRECTORY", "/duckdb-extensions")
        conn = duckdb.connect(":memory:")
        conn.execute(f"SET extension_directory='{ext_dir}'")
        conn.execute("LOAD spatial")
        schema = conn.execute(f"DESCRIBE SELECT * FROM st_read('{fgb_path}')").fetchall()
        col_names = [r[0].lower() for r in schema]
        if "fid" in col_names:
            select = "*"
        elif "ogc_fid" in col_names:
            other = ", ".join(f'"{r[0]}"' for r in schema if r[0].lower() != "ogc_fid")
            select = f"ogc_fid AS fid, {other}"
        else:
            select = "row_number() OVER () AS fid, *"
        conn.execute(f"""
            COPY (SELECT {select} FROM st_read('{fgb_path}'))
            TO '{out_path}'
            (FORMAT PARQUET, CODEC 'snappy', ROW_GROUP_SIZE 1000)
        """)
        return out_path
    except Exception as e:
        print(f"[converter] Warning: GeoParquet conversion failed for '{safe_name}': {e}", flush=True)
        return None

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    args = parse_args()

    output_prefix = args.output_prefix
    is_s3_output  = output_prefix.startswith("s3://")
    is_s3_source  = args.source.startswith("s3://")

    if is_s3_source or is_s3_output:
        try:
            force_ipv4_for_endpoint(get_endpoint_url())
        except Exception as e:
            print(f"[converter] Warning: Failed DNS override: {e}", flush=True)

    bucket = os.environ.get("S3_BUCKET_NAME") or os.environ.get("R2_BUCKET", "")
    if is_s3_output and not bucket:
        raise RuntimeError("Neither S3_BUCKET_NAME nor R2_BUCKET environment variable is set")

    with tempfile.TemporaryDirectory() as work_dir:

        if is_s3_source:
            gpkg_path = os.path.join(work_dir, "source.gpkg")
            print(f"[converter] Downloading GeoPackage from {args.source} ...", flush=True)
            s3_cp(args.source, gpkg_path)
        else:
            gpkg_path = args.source
            print(f"[converter] Using local GeoPackage: {gpkg_path}", flush=True)

        all_gpkg_layers = list_layers(gpkg_path)
        if not all_gpkg_layers:
            raise RuntimeError("No layers found in the GeoPackage")
        
        mapping = {}
        if args.model and os.path.exists(args.model):
            print(f"[converter] Loading model from {args.model} for layer mapping...", flush=True)
            try:
                with open(args.model, "r") as f:
                    model = json.load(f)
                layers = model.get("layers", [])
                mappings_cfg = model.get("sourceConnection", {}).get("layerMappings", {})
                for layer in layers:
                    l_id   = layer.get("id")
                    target = layer.get("name")
                    m_info = mappings_cfg.get(l_id)
                    source = m_info.get("sourceTable") if m_info else None
                    if source and source in all_gpkg_layers:
                        mapping[source] = target.lower()
                        print(f"[converter] Mapping: GPKG '{source}' → '{mapping[source]}'", flush=True)
            except Exception as e:
                print(f"[converter] Warning: Failed to parse model.json: {e}", flush=True)

        if not mapping:
            print("[converter] Using default layer names.", flush=True)
            for l in all_gpkg_layers:
                mapping[l] = to_safe_name(l)

        fgb_dir = os.path.join(work_dir, "fgb")
        os.makedirs(fgb_dir, exist_ok=True)

        manifest_layers = []
        for layer_name, safe_name in mapping.items():
            print(f"[converter] Converting '{layer_name}' → {safe_name}.parquet ...", flush=True)
            try:
                fgb_path = convert_layer(gpkg_path, layer_name, safe_name, fgb_dir, args.target_crs)
                convert_layer_to_parquet(fgb_path, safe_name, fgb_dir)
                manifest_layers.append({"name": layer_name, "safe_name": safe_name})
            except RuntimeError as e:
                print(f"[converter] ERROR: {e}", file=sys.stderr, flush=True)
                sys.exit(1)

        manifest = {"layers": manifest_layers}
        if is_s3_output:
            prefix_key = output_prefix.replace(f"s3://{bucket}/", "", 1)
            sync_cmd = ["aws", "s3", "sync", fgb_dir + "/", output_prefix + "/", "--endpoint-url", get_endpoint_url(), "--no-progress"]
            subprocess.run(sync_cmd, capture_output=True, text=True)
            s3_put_json(bucket, f"{prefix_key}/.manifest.json", manifest)
        else:
            os.makedirs(output_prefix, exist_ok=True)
            for fname in os.listdir(fgb_dir):
                shutil.copy2(os.path.join(fgb_dir, fname), os.path.join(output_prefix, fname))
            with open(os.path.join(output_prefix, ".manifest.json"), "w") as f:
                json.dump(manifest, f)

        print(f"[converter] Done. {len(manifest_layers)} layer(s) converted.", flush=True)

if __name__ == "__main__":
    main()
`;

export const workerPostgisSnapshot = `#!/usr/bin/env python3
"""
postgis-snapshot.py — PostGIS → FlatGeobuf + GeoParquet snapshot worker.

Accepts both S3 and local-filesystem output:

  --output-prefix s3://bucket/prefix  OR  /data/

When --output-prefix starts with s3://, files are uploaded via \\\`aws s3 sync\\\`
and a manifest is written to S3.  Otherwise files are copied directly to the
local directory and a manifest is written there.

Input (PostGIS) is always read from environment variables:
    PG_HOST, PG_PORT, PG_DB, PG_USER, PG_PASSWORD
    TABLES      comma-separated "schema.table" values (optional — auto-discovers if unset)
    TARGET_CRS  optional target CRS (e.g. "EPSG:4326")

Required additionally for S3 output:
    AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION
    S3_ENDPOINT, R2_BUCKET
"""

import argparse
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
from urllib.parse import urlparse

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

def parse_args():
    p = argparse.ArgumentParser(description="Snapshot PostGIS tables to per-layer FlatGeobuf + GeoParquet files")
    p.add_argument("--output-prefix", required=True, help="Output destination: local dir or s3:// prefix")
    p.add_argument("--user-id",       required=True, help="User ID (for logging)")
    p.add_argument("--model",         required=False, default=None, help="Path to model.json for layer mapping")
    return p.parse_args()

# ---------------------------------------------------------------------------
# DNS Fix (IPv6 TCP Blackhole)
# ---------------------------------------------------------------------------

def force_ipv4_for_endpoint(endpoint_url: str):
    domain = urlparse(endpoint_url).hostname
    if not domain:
        return
    try:
        ipv4_addr = socket.gethostbyname(domain)
        with open("/etc/hosts", "a") as f:
            f.write(f"\\n{ipv4_addr} {domain}\\n")
        print(f"[snapshot] Fixed IPv6 timeout: {domain} → {ipv4_addr}", flush=True)
    except Exception as e:
        print(f"[snapshot] Warning: Could not override DNS for IPv4: {e}", flush=True)

# ---------------------------------------------------------------------------
# S3 helpers
# ---------------------------------------------------------------------------

def get_endpoint_url() -> str:
    url = (
        os.environ.get("AWS_ENDPOINT_URL") or 
        os.environ.get("S3_ENDPOINT", "")
    )
    if not url:
        raise RuntimeError("Neither AWS_ENDPOINT_URL nor S3_ENDPOINT environment variable is set")
    return url

def s3_cp(src: str, dst: str) -> None:
    cmd = ["aws", "s3", "cp", src, dst, "--endpoint-url", get_endpoint_url(), "--no-progress"]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"aws s3 cp failed: {result.stderr.strip()}")

def s3_put_json(bucket: str, key: str, data: dict) -> None:
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(data, f)
        tmp_path = f.name
    try:
        s3_cp(tmp_path, f"s3://{bucket}/{key}")
    finally:
        os.unlink(tmp_path)

# ---------------------------------------------------------------------------
# Name sanitization
# ---------------------------------------------------------------------------

def to_safe_name(name: str) -> str:
    safe = re.sub(r"[^a-z0-9]", "_", name.lower())
    safe = re.sub(r"_+", "_", safe)
    safe = safe.strip("_")
    return safe or "layer"

# ---------------------------------------------------------------------------
# PostGIS helpers
# ---------------------------------------------------------------------------

def get_layer_catalog(pg_conn: str) -> dict:
    """Scan all layers in the database."""
    print("[snapshot] Scanning database for layers...", flush=True)
    cmd = ["ogrinfo", "-ro", "-al", "-so", pg_conn]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            return {}
        catalog = {}
        current_layer = None
        for line in result.stdout.splitlines():
            m_start = re.match(r"^Layer name:\\s*(.*)$", line, re.IGNORECASE)
            if m_start:
                current_layer = m_start.group(1).strip()
                catalog[current_layer] = {"geom_col": "geom"}
                continue
            if current_layer:
                m_geom = re.search(r"Geometry Column\\s*=\\s*(\\w+)", line, re.IGNORECASE)
                if m_geom:
                    catalog[current_layer]["geom_col"] = m_geom.group(1)
        return catalog
    except:
        return {}

def get_table_geom_col(pg_conn: str, table_name: str, default: str = "geom") -> str:
    cmd = ["ogrinfo", "-ro", "-so", pg_conn, table_name]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        if result.returncode == 0:
            for line in result.stdout.splitlines():
                m = re.search(r"Geometry Column\\s*=\\s*(\\w+)", line, re.IGNORECASE)
                if m:
                    return m.group(1)
    except: pass
    return default

def build_pg_connection_string() -> str:
    host     = os.environ["PG_HOST"]
    port     = os.environ.get("PG_PORT", "5432")
    dbname   = os.environ["PG_DB"]
    user     = os.environ["PG_USER"]
    password = os.environ["PG_PASSWORD"]
    return f"PG:host={host} port={port} dbname={dbname} user={user} password={password}"

def snapshot_table(pg_conn: str, full_name: str, geom_col: str, safe_name: str, out_dir: str, target_crs: str = None) -> str:
    out_path = os.path.join(out_dir, f"{safe_name}.fgb")
    if "." in full_name:
        s, t = full_name.rsplit(".", 1)
        quoted_name = f'"{s}"."{t}"'
    else:
        quoted_name = f'"{full_name}"'
    cmd = ["ogr2ogr", "-f", "FlatGeobuf", out_path, pg_conn, "-sql", f"SELECT * FROM {quoted_name} WHERE {geom_col} IS NOT NULL", "-nln", safe_name, "-nlt", "PROMOTE_TO_MULTI", "-skipfailures"]
    if target_crs:
        cmd += ["-t_srs", target_crs]
    env = os.environ.copy()
    env["OGR_FGB_ALLOW_NULL_GEOMETRIES"] = "YES"
    result = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if result.returncode != 0:
        raise RuntimeError(f"ogr2ogr failed for '{full_name}': {result.stderr.strip()}")
    return out_path

def convert_to_parquet(fgb_path: str, safe_name: str, out_dir: str) -> None:
    import duckdb
    out_path = os.path.join(out_dir, f"{safe_name}.parquet")
    try:
        ext_dir = os.environ.get("DUCKDB_EXTENSION_DIRECTORY", "/duckdb-extensions")
        conn = duckdb.connect(":memory:")
        conn.execute(f"SET extension_directory='{ext_dir}'")
        conn.execute("LOAD spatial")
        schema = conn.execute(f"DESCRIBE SELECT * FROM st_read('{fgb_path}')").fetchall()
        col_names = [r[0].lower() for r in schema]
        id_col = "row_number() OVER () AS fid"
        if "fid" in col_names: id_col = "*"
        elif "ogc_fid" in col_names: id_col = "ogc_fid AS fid, *"
        conn.execute(f"COPY (SELECT {id_col} FROM st_read('{fgb_path}')) TO '{out_path}' (FORMAT PARQUET, CODEC 'snappy')")
    except Exception as e:
        print(f"[snapshot] Warning: Parquet conversion failed for '{safe_name}': {e}", flush=True)

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    args = parse_args()
    output_prefix = args.output_prefix
    is_s3_output  = output_prefix.startswith("s3://")

    if is_s3_output:
        try: force_ipv4_for_endpoint(get_endpoint_url())
        except: pass

    bucket = os.environ.get("S3_BUCKET_NAME") or os.environ.get("R2_BUCKET", "")
    target_crs = os.environ.get("TARGET_CRS") or None
    pg_conn    = build_pg_connection_string()
    tables_raw = os.environ.get("TABLES", "").strip()
    tables_to_process = []

    if not tables_raw:
        catalog = get_layer_catalog(pg_conn)
        if args.model and os.path.exists(args.model):
            try:
                with open(args.model, "r") as f: model = json.load(f)
                layers = model.get("layers", [])
                mappings_cfg = model.get("sourceConnection", {}).get("layerMappings", {})
                for layer in layers:
                    source = mappings_cfg.get(layer.get("id"), {}).get("sourceTable")
                    if source and source in catalog:
                        tables_to_process.append((source, catalog[source]["geom_col"], layer.get("name").lower()))
            except: pass
        if not tables_to_process:
            for layer_name in catalog:
                tables_to_process.append((layer_name, catalog[layer_name]["geom_col"], to_safe_name(layer_name)))
    else:
        requested = [t.strip() for t in tables_raw.split(",") if t.strip()]
        for req in requested:
            geom_col = get_table_geom_col(pg_conn, req)
            safe_name = to_safe_name(req.rsplit(".", 1)[-1])
            if args.model and os.path.exists(args.model):
                try:
                    with open(args.model, "r") as f: model = json.load(f)
                    for l in model.get("layers", []):
                        if model.get("sourceConnection", {}).get("layerMappings", {}).get(l.get("id"), {}).get("sourceTable") == req:
                            safe_name = l.get("name").lower()
                            break
                except: pass
            tables_to_process.append((req, geom_col, safe_name))

    if not tables_to_process: raise RuntimeError("No valid tables found.")

    with tempfile.TemporaryDirectory() as work_dir:
        fgb_dir = os.path.join(work_dir, "fgb")
        os.makedirs(fgb_dir, exist_ok=True)
        manifest_layers = []
        for full_name, geom_col, safe_name in tables_to_process:
            print(f"[snapshot] Exporting '{full_name}' → {safe_name} ...", flush=True)
            try:
                fgb_path = snapshot_table(pg_conn, full_name, geom_col, safe_name, fgb_dir, target_crs)
                convert_to_parquet(fgb_path, safe_name, fgb_dir)
                manifest_layers.append({"name": full_name, "safe_name": safe_name})
            except Exception as e:
                print(f"[snapshot] Skipping '{full_name}': {e}", flush=True)

        manifest = {"layers": manifest_layers}
        if is_s3_output:
            prefix_key = output_prefix.replace(f"s3://{bucket}/", "", 1)
            sync_cmd = ["aws", "s3", "sync", fgb_dir + "/", output_prefix + "/", "--endpoint-url", get_endpoint_url(), "--no-progress"]
            subprocess.run(sync_cmd, capture_output=True, text=True)
            s3_put_json(bucket, f"{prefix_key}/.manifest.json", manifest)
        else:
            os.makedirs(output_prefix, exist_ok=True)
            for fname in os.listdir(fgb_dir): shutil.copy2(os.path.join(fgb_dir, fname), os.path.join(output_prefix, fname))
            with open(os.path.join(output_prefix, ".manifest.json"), "w") as f: json.dump(manifest, f)
        print(f"[snapshot] Done. {len(manifest_layers)} tables snapshotted.", flush=True)

if __name__ == "__main__":
    main()
`;
