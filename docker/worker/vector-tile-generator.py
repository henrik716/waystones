#!/usr/bin/env python3
"""
vector-tile-generator.py — PostGIS/GPKG → PMTiles worker.

Generates high-performance vector tiles (MVT) packed in a PMTiles archive.
Uses ogr2ogr for extraction and tippecanoe for tiling.
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
    p = argparse.ArgumentParser(description="Generate PMTiles from PostGIS or GeoPackage")
    p.add_argument("--source",        required=False, help="Source .gpkg (local or s3://)")
    p.add_argument("--output-prefix", required=True,  help="Output destination: local dir or s3:// prefix")
    p.add_argument("--user-id",       required=True,  help="User ID (for logging)")
    p.add_argument("--model",         required=False, default=None, help="Path to model.json for layer mapping")
    p.add_argument("--min-zoom",      type=int,   default=0,    help="Min zoom level")
    p.add_argument("--max-zoom",      type=int,   default=14,   help="Max zoom level")
    p.add_argument("--auto-zoom",     action="store_true",      help="Let tippecanoe pick max zoom from feature density (-zg)")
    p.add_argument("--simplification",type=float, default=None, help="Geometry simplification factor (tippecanoe --simplification)")
    return p.parse_args()

# ---------------------------------------------------------------------------
# S3 / DNS helpers (Reused from postgis-snapshot.py)
# ---------------------------------------------------------------------------

def force_ipv4_for_endpoint(endpoint_url: str):
    domain = urlparse(endpoint_url).hostname
    if not domain: return
    try:
        ipv4_addr = socket.gethostbyname(domain)
        with open("/etc/hosts", "a") as f:
            f.write(f"\n{ipv4_addr} {domain}\n")
        print(f"[tiles] Forced {domain} to {ipv4_addr} in /etc/hosts", flush=True)
    except Exception as e:
        print(f"[tiles] Warning: DNS override failed: {e}", flush=True)

def get_endpoint_url() -> str:
    return (
        os.environ.get("AWS_ENDPOINT_URL") or
        os.environ.get("S3_ENDPOINT") or
        None
    )

_ipv4_patched = False

def _ensure_ipv4():
    global _ipv4_patched
    if _ipv4_patched:
        return
    _orig = socket.getaddrinfo
    def _ipv4_only(host, port, family=0, type=0, proto=0, flags=0):
        try:
            return _orig(host, port, socket.AF_INET, type, proto, flags)
        except Exception:
            return _orig(host, port, family, type, proto, flags)
    socket.getaddrinfo = _ipv4_only
    _ipv4_patched = True

def _boto3_client():
    import boto3
    from botocore.config import Config

    endpoint = os.environ.get('AWS_ENDPOINT_URL') or os.environ.get('S3_ENDPOINT')
    if endpoint:
        _ensure_ipv4()
    endpoint_url = None
    if endpoint:
        endpoint_url = endpoint if endpoint.startswith('https://') else f"https://{endpoint}"
        
    region = os.environ.get("AWS_DEFAULT_REGION")
    if not region:
        if endpoint_url and "r2.cloudflarestorage.com" in endpoint_url:
            region = "auto"
        else:
            region = "europe-west"
        
    config = Config(
        signature_version='s3v4',
        retries={'max_attempts': 3, 'mode': 'standard'}
    )
    
    kwargs = {
        "endpoint_url": endpoint_url,
        "region_name": region,
        "config": config,
    }
    if os.environ.get("AWS_ACCESS_KEY_ID"):
        kwargs["aws_access_key_id"] = os.environ.get("AWS_ACCESS_KEY_ID")
    if os.environ.get("AWS_SECRET_ACCESS_KEY"):
        kwargs["aws_secret_access_key"] = os.environ.get("AWS_SECRET_ACCESS_KEY")
    return boto3.client("s3", **kwargs)

def s3_cp(src: str, dst: str) -> None:
    client = _boto3_client()
    try:
        if src.startswith("s3://"):
            p = urlparse(src)
            client.download_file(p.netloc, p.path.lstrip("/"), dst)
        else:
            p = urlparse(dst)
            client.upload_file(src, p.netloc, p.path.lstrip("/"))
    except Exception as e:
        print(f"[tile-generator] S3 ERROR ({type(e).__name__}): {e}", flush=True)
        raise

def to_safe_name(name: str) -> str:
    safe = re.sub(r"[^a-z0-9]", "_", name.lower())
    safe = re.sub(r"_+", "_", safe)
    return safe.strip("_") or "layer"

# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def build_pg_connection_string() -> str:
    host     = os.environ.get("PG_HOST")
    if not host: return None
    port     = os.environ.get("PG_PORT", "5432")
    dbname   = os.environ["PG_DB"]
    user     = os.environ["PG_USER"]
    password = os.environ["PG_PASSWORD"]
    return f"PG:host={host} port={port} dbname={dbname} user={user} password={password}"

def list_layers(src_conn: str) -> list:
    """List layers in the source."""
    cmd = ["ogrinfo", "-ro", "-so", "-al", src_conn]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return []
    layers = []
    for line in result.stdout.splitlines():
        if line.startswith("Layer name:"):
            layers.append(line.split(":", 1)[1].strip())
    return layers

# ---------------------------------------------------------------------------
# Tiling logic — all layers extracted to GeoJSONSeq first, then one tippecanoe pass
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    args = parse_args()
    output_prefix = args.output_prefix
    is_s3_output  = output_prefix.startswith("s3://")
    
    if is_s3_output:
        force_ipv4_for_endpoint(get_endpoint_url())

    # 1. Resolve source
    pg_conn = build_pg_connection_string()
    src_conn = pg_conn if pg_conn else args.source
    
    if not src_conn:
        print("[tiles] ERROR: No source (PostGIS or GPKG) provided.", file=sys.stderr)
        sys.exit(1)

    if src_conn.startswith("s3://"):
        # Download GPKG if source is S3
        tmp_gpkg = "/tmp/source.gpkg"
        print(f"[tiles] Downloading source from {src_conn}...", flush=True)
        s3_cp(src_conn, tmp_gpkg)
        src_conn = tmp_gpkg

    # 2. Determine layers
    all_layers = list_layers(src_conn)
    tables_to_process = [] # (original_name, safe_name)

    tables_raw = os.environ.get("TABLES", "").strip()
    if tables_raw:
        requested = [t.strip() for t in tables_raw.split(",") if t.strip()]
        for req in requested:
            if req in all_layers:
                tables_to_process.append((req, to_safe_name(req)))
    else:
        for l in all_layers:
            tables_to_process.append((l, to_safe_name(l)))

    exclude_layers_raw = os.environ.get("EXCLUDE_LAYERS", "").strip()
    if exclude_layers_raw:
        excluded = {l.strip() for l in exclude_layers_raw.split(",") if l.strip()}
        tables_to_process = [(orig, safe) for orig, safe in tables_to_process if orig not in excluded]

    if not tables_to_process:
        print(f"[tiles] ERROR: No layers found to process in {src_conn}", file=sys.stderr)
        sys.exit(1)

    print(f"[tiles] Extracting {len(tables_to_process)} layer(s) then tiling in one pass", flush=True)

    with tempfile.TemporaryDirectory() as work_dir:
        # Step 1: Extract each layer to a GeoJSONSeq file
        extracted = []  # (orig_name, safe_name, geojsonseq_path)
        for orig_name, safe_name in tables_to_process:
            geojsonseq_path = os.path.join(work_dir, f"{safe_name}.geojsonseq")
            print(f"[tiles] Extracting '{orig_name}'...", flush=True)
            extract_cmd = [
                "ogr2ogr",
                "-f", "GeoJSONSeq",
                geojsonseq_path,
                src_conn,
                orig_name,
                "-t_srs", "EPSG:4326",
                "-lco", "RS=YES",
            ]
            result = subprocess.run(extract_cmd, capture_output=True, text=True)
            if result.returncode != 0:
                print(f"[tiles] ERROR: ogr2ogr failed for '{orig_name}': {result.stderr.strip()}", file=sys.stderr, flush=True)
                continue
            extracted.append((orig_name, safe_name, geojsonseq_path))

        if not extracted:
            print("[tiles] ERROR: No layers extracted successfully.", file=sys.stderr, flush=True)
            sys.exit(1)

        # Step 2: Single tippecanoe pass — all layers → one named .pmtiles
        project_name = os.environ.get("PROJECT_NAME", "").strip() or "combined"
        output_filename = f"{project_name}.pmtiles"
        combined_pmtiles = os.path.join(work_dir, output_filename)
        tile_cmd = [
            "tippecanoe",
            "-o", combined_pmtiles,
            "-Z", str(args.min_zoom),
            "--drop-densest-as-needed",
            "--force",
        ]
        if args.auto_zoom:
            tile_cmd.append("-zg")
        else:
            tile_cmd.extend(["-z", str(args.max_zoom)])
        if args.simplification is not None:
            tile_cmd.extend(["--simplification", str(args.simplification)])
        exclude_raw = os.environ.get("EXCLUDE_ATTRIBUTES", "").strip()
        exclude_fields = [f.strip() for f in exclude_raw.split(",") if f.strip()] if exclude_raw else []
        if exclude_fields == ["*"]:
            tile_cmd.append("--exclude-all")
        else:
            for field in exclude_fields:
                tile_cmd.extend(["--exclude", field])
        for orig_name, safe_name, geojsonseq_path in extracted:
            tile_cmd.extend(["-L", f"{safe_name}:{geojsonseq_path}"])

        zoom_label = f"Z{args.min_zoom}-auto" if args.auto_zoom else f"Z{args.min_zoom}-Z{args.max_zoom}"
        print(f"[tiles] Tiling {len(extracted)} layer(s) into combined.pmtiles ({zoom_label})...", flush=True)
        result = subprocess.run(tile_cmd)
        if result.returncode != 0:
            print("[tiles] ERROR: tippecanoe failed.", file=sys.stderr, flush=True)
            sys.exit(1)

        total_bytes = os.path.getsize(combined_pmtiles)

        # Step 3: Deliver output
        if is_s3_output:
            dst_path = f"{output_prefix.rstrip('/')}/{output_filename}"
            print(f"[tiles] Uploading {output_filename} ({total_bytes} bytes) to {dst_path}...", flush=True)
            s3_cp(combined_pmtiles, dst_path)
        else:
            os.makedirs(output_prefix, exist_ok=True)
            shutil.copy2(combined_pmtiles, os.path.join(output_prefix, output_filename))

        # Write manifest
        manifest = {
            "type": "pmtiles",
            "pmtiles": output_filename,
            "layers": [{"name": orig_name, "safe_name": safe_name} for orig_name, safe_name, _ in extracted],
            "total_size": total_bytes,
        }
        if is_s3_output:
            bucket = output_prefix.split("//")[1].split("/")[0]
            prefix = "/".join(output_prefix.split("//")[1].split("/")[1:])
            manifest_key = f"{prefix.rstrip('/')}/.tiles.json"
            
            with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
                json.dump(manifest, f)
                tmp_manifest = f.name
            try:
                s3_cp(tmp_manifest, f"s3://{bucket}/{manifest_key}")
            finally:
                os.unlink(tmp_manifest)
        else:
            with open(os.path.join(output_prefix, ".tiles.json"), "w") as f:
                json.dump(manifest, f)

        # ── Write Metrics for main.py callback ───────────────────────────────
        try:
            with open("/tmp/.peon-metrics.json", "w") as f:
                json.dump({"totalBytes": total_bytes}, f)
        except Exception as e:
            print(f"[tiles] Warning: Failed to write metrics file: {e}", flush=True)

    print("[tiles] Done.", flush=True)

if __name__ == "__main__":
    main()
