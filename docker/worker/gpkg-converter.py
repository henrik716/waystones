#!/usr/bin/env python3
"""
gpkg-converter.py — GeoPackage → FlatGeobuf + GeoParquet conversion worker.

Accepts both S3 and local-filesystem I/O:

  --source        s3://bucket/path/file.gpkg  OR  /input/data.gpkg
  --output-prefix s3://bucket/prefix          OR  /data/

When --output-prefix starts with s3://, files are uploaded via `aws s3 sync`
and a manifest is written to S3.  Otherwise files are copied directly to the
local directory and a manifest is written there.

Required environment variables (S3 mode only):
    AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION
    S3_ENDPOINT   (full URL, e.g. https://<id>.r2.cloudflarestorage.com)
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
    p.add_argument("--target-crs",    required=False, default="EPSG:4326", help="Target CRS (e.g. EPSG:4326) for reprojection")
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
            f.write(f"\n{ipv4_addr} {domain}\n")
        print(f"[converter] Fixed IPv6 timeout: Forced {domain} to {ipv4_addr} in /etc/hosts", flush=True)
    except Exception as e:
        print(f"[converter] Warning: Could not override DNS for IPv4: {e}", flush=True)

# ---------------------------------------------------------------------------
# S3 helpers
# ---------------------------------------------------------------------------

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
    
    # R2 requires s3v4 signature version. 
    # For signing, R2 prefers 'auto' or 'us-east-1'.
    # We default to 'europe-west' to reflect the project's base, but switch to 'auto' for R2.
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
        print(f"[converter] S3 ERROR ({type(e).__name__}): {e}", flush=True)
        raise

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
# Name sanitization — MUST match TypeScript toTableName() in nameSanitizer.ts:
#   name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
# ---------------------------------------------------------------------------

def to_safe_name(name: str) -> str:
    safe = re.sub(r"[^a-z0-9]", "_", name.lower())
    safe = re.sub(r"_+", "_", safe)
    safe = safe.strip("_")
    return safe or "layer"

# ---------------------------------------------------------------------------
# Conversion (unchanged — no S3 logic here)
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
    """Convert a reprojected FlatGeobuf file to GeoParquet via DuckDB spatial. Non-fatal on failure."""
    import duckdb
    out_path = os.path.join(out_dir, f"{safe_name}.parquet")
    try:
        ext_dir = os.environ.get("DUCKDB_EXTENSION_DIRECTORY", "/duckdb-extensions")
        conn = duckdb.connect(":memory:")
        conn.execute(f"SET extension_directory='{ext_dir}'")
        conn.execute("LOAD spatial")

        # Read directly from the newly reprojected FGB file
        source_query = f"st_read('{fgb_path}')"
        
        # Introspect schema to find geometry and existing identifiers
        schema = conn.execute(f"DESCRIBE SELECT * FROM {source_query} LIMIT 0").fetchall()
        col_names = [r[0].lower() for r in schema]
        
        # Find geometry column dynamically
        geom_col = next((r[0] for r in schema if r[1].upper() in ["GEOMETRY", "POINT", "MULTIPOINT", "LINESTRING", "MULTILINESTRING", "POLYGON", "MULTIPOLYGON", "GEOMETRYCOLLECTION"]), "geom")

        bbox_cols = (
            f', ST_XMin("{geom_col}") AS bbox_xmin'
            f', ST_YMin("{geom_col}") AS bbox_ymin'
            f', ST_XMax("{geom_col}") AS bbox_xmax'
            f', ST_YMax("{geom_col}") AS bbox_ymax'
        )

        # Standardize FID: rename or generate if missing, avoiding column duplication
        if "fid" in col_names:
            select = f"*{bbox_cols}"
        elif "ogc_fid" in col_names:
            select = f"* EXCLUDE (ogc_fid), ogc_fid AS fid{bbox_cols}"
        elif "rowid" in col_names:
            select = f"* EXCLUDE (rowid), rowid AS fid{bbox_cols}"
        else:
            select = f"row_number() OVER () AS fid, *{bbox_cols}"

        conn.execute(f"""
            COPY (SELECT {select} FROM {source_query})
            TO '{out_path}'
            (FORMAT PARQUET, CODEC 'snappy', ROW_GROUP_SIZE 1000)
        """)
        return out_path
    except Exception as e:
        print(f"[converter] Warning: GeoParquet conversion failed for '{safe_name}': {e}", flush=True)
        return None

# ---------------------------------------------------------------------------
# Sidecar computation
# ---------------------------------------------------------------------------

def compute_sidecar(parquet_path: str, hint_geom_col: str = "geom", hint_id_col: str = "fid") -> dict | None:
    """Compute MetaSidecar data from a local parquet file. Returns None on failure."""
    import duckdb
    import datetime
    try:
        ext_dir = os.environ.get("DUCKDB_EXTENSION_DIRECTORY", "/duckdb-extensions")
        conn = duckdb.connect(":memory:")
        conn.execute(f"SET extension_directory='{ext_dir}'")
        conn.execute("LOAD spatial")

        schema = conn.execute(
            f"DESCRIBE SELECT * FROM read_parquet('{parquet_path}') LIMIT 0"
        ).fetchall()
        schema_names_lower = {r[0].lower() for r in schema}

        # Resolve geometry column: prefer hint, then first GEOMETRY column, then first BLOB
        geom_type_map = {r[0].upper(): r[1].upper() for r in schema}
        geom_col = hint_geom_col
        if hint_geom_col.upper() not in geom_type_map:
            for r in schema:
                if r[1].upper().startswith("GEOMETRY"):
                    geom_col = r[0]
                    break
            else:
                for r in schema:
                    if r[1].upper() == "BLOB":
                        geom_col = r[0]
                        break

        # Resolve id column: prefer hint, then heuristic candidates, then first INT
        id_col = hint_id_col
        if hint_id_col.lower() not in schema_names_lower:
            for candidate in ("fid", "id", "gid", "objectid", "feature_id"):
                if candidate in schema_names_lower:
                    id_col = candidate
                    break
            else:
                for r in schema:
                    if "INT" in r[1].upper():
                        id_col = r[0]
                        break

        # Detect geom_is_native: spatial extension auto-converts WKB → GEOMETRY
        geom_type = geom_type_map.get(geom_col.upper(), "BLOB")
        geom_is_native = geom_type.startswith("GEOMETRY")

        # Detect bbox column style
        flat_cols = {"bbox_xmin", "bbox_ymin", "bbox_xmax", "bbox_ymax"}
        if flat_cols.issubset(schema_names_lower):
            bbox_cols_style = "flat"
        elif "bbox" in schema_names_lower:
            bbox_cols_style = "struct"
        else:
            bbox_cols_style = ""

        # Feature count
        feature_count = conn.execute(
            f"SELECT COUNT(*) FROM read_parquet('{parquet_path}')"
        ).fetchone()[0]

        # Extent via spatial functions
        extent_row = conn.execute(f"""
            SELECT
                MIN(ST_XMin({geom_col})), MIN(ST_YMin({geom_col})),
                MAX(ST_XMax({geom_col})), MAX(ST_YMax({geom_col}))
            FROM read_parquet('{parquet_path}')
        """).fetchone()

        # Queryable fields (excluding geometry, id, bbox internals)
        skip_types = {"GEOMETRY", "BLOB", "POINT", "MULTIPOINT", "LINESTRING",
                      "MULTILINESTRING", "POLYGON", "MULTIPOLYGON", "GEOMETRYCOLLECTION"}
        bbox_excl = {"bbox", "bbox_xmin", "bbox_ymin", "bbox_xmax", "bbox_ymax"}

        def duck_to_sidecar_type(t: str) -> str | None:
            t = t.upper().strip()
            if any(t.startswith(s) for s in skip_types):
                return None
            if t in ("INTEGER", "INT", "INT4", "SIGNED", "BIGINT", "INT8", "LONG",
                     "HUGEINT", "UBIGINT", "SMALLINT", "INT2", "SHORT",
                     "TINYINT", "INT1", "UINTEGER", "USMALLINT", "UTINYINT"):
                return "integer"
            if (any(t.startswith(x) for x in ("DOUBLE", "FLOAT", "DECIMAL", "NUMERIC"))
                    or t == "REAL"):
                return "number"
            if t in ("BOOLEAN", "BOOL", "LOGICAL"):
                return "boolean"
            if t.startswith("TIMESTAMP") or t.startswith("DATE"):
                return "datetime"
            return "string"

        queryables = []
        datetime_col = None
        for col_name, col_type, *_ in schema:
            lower = col_name.lower()
            if lower in (geom_col.lower(), id_col.lower()) or lower in bbox_excl:
                continue
            stype = duck_to_sidecar_type(col_type)
            if stype is None:
                continue
            queryables.append({"name": col_name, "type": stype})
            if stype == "datetime" and datetime_col is None:
                datetime_col = col_name

        # Detect simplified geometry type by sampling one row.
        # When the geometry column is WKB (BLOB), wrap with ST_GeomFromWKB() so that
        # GeometryType() can inspect the type — otherwise it silently returns NULL.
        geometry_type = "polygon"
        try:
            geom_expr = f"ST_GeomFromWKB({geom_col})" if not geom_is_native else geom_col
            gt_row = conn.execute(f"""
                SELECT GeometryType({geom_expr}) FROM read_parquet('{parquet_path}')
                WHERE {geom_col} IS NOT NULL LIMIT 1
            """).fetchone()
            if gt_row and gt_row[0]:
                t = gt_row[0].upper()
                if "POINT" in t:
                    geometry_type = "point"
                elif "LINE" in t or "STRING" in t:
                    geometry_type = "line"
        except Exception:
            pass

        return {
            "version": 1,
            "generated_at": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "extent": {
                "minx": extent_row[0] if extent_row[0] is not None else -180.0,
                "miny": extent_row[1] if extent_row[1] is not None else -90.0,
                "maxx": extent_row[2] if extent_row[2] is not None else 180.0,
                "maxy": extent_row[3] if extent_row[3] is not None else 90.0,
            },
            "feature_count": feature_count,
            "geom_column": geom_col,
            "id_column": id_col,
            "geom_is_native": geom_is_native,
            "bbox_cols_style": bbox_cols_style,
            "geometry_type": geometry_type,
            "datetime_column": datetime_col,
            "queryables": queryables,
        }
    except Exception as e:
        print(f"[converter] Warning: sidecar computation failed for {parquet_path}: {e}", flush=True)
        return None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    args = parse_args()

    output_prefix = args.output_prefix
    is_s3_output  = output_prefix.startswith("s3://")
    is_s3_source  = args.source.startswith("s3://")

    bucket = os.environ.get("S3_BUCKET_NAME") or os.environ.get("R2_BUCKET", "")
    if is_s3_output and not bucket:
        raise RuntimeError("Neither S3_BUCKET_NAME nor R2_BUCKET environment variable is set")

    # The Parquet/FlatGeobuf pipeline must always output WGS84 so that bbox columns
    # are in decimal degrees and pygeoapi spatial filtering works correctly.
    # TARGET_CRS is provided as an escape hatch; defaults to EPSG:4326.
    target_crs = args.target_crs or "EPSG:4326"
    print(f"[worker] Enforcing {target_crs} normalization for Parquet files", flush=True)

    with tempfile.TemporaryDirectory() as work_dir:

        # ── 1. Obtain GPKG ───────────────────────────────────────────────────
        if is_s3_source:
            gpkg_path = os.path.join(work_dir, "source.gpkg")
            print(f"[converter] Downloading GeoPackage from {args.source} ...", flush=True)
            s3_cp(args.source, gpkg_path)
            print(f"[converter] Download complete ({os.path.getsize(gpkg_path) / 1024 / 1024:.1f} MB)", flush=True)
        else:
            gpkg_path = args.source
            print(f"[converter] Using local GeoPackage: {gpkg_path} ({os.path.getsize(gpkg_path) / 1024 / 1024:.1f} MB)", flush=True)

        # ── 2. Determine layers to convert ────────────────────────────────────
        # Default mapping: everything in the GPKG
        all_gpkg_layers = list_layers(gpkg_path)
        if not all_gpkg_layers:
            raise RuntimeError("No layers found in the GeoPackage")
        
        # Mapping: { "source_layer_name": "target_safe_name" }
        mapping = {}
        
        if args.model and os.path.exists(args.model):
            print(f"[converter] Loading model from {args.model} for layer mapping...", flush=True)
            try:
                with open(args.model, "r") as f:
                    model = json.load(f)
                
                # In Waystones model:
                # model["layers"] is list of { "id": "uuid", "name": "Technical Name" }
                # model["sourceConnection"]["layerMappings"] is { "layer_uuid": { "sourceLayer": "GPKG Layer Name" } }
                layers = model.get("layers", [])
                mappings_cfg = model.get("sourceConnection", {}).get("layerMappings", {})

                # Mapping: GPKG Layer Name -> target name

                for layer in layers:
                    l_id   = layer.get("id")
                    target = layer.get("name")
                    m_info = mappings_cfg.get(l_id)
                    source = m_info.get("sourceTable") if m_info else None
                    
                    if source and source in all_gpkg_layers:
                        # Use target name from model exactly as provided
                        mapping[source] = target.lower()
                        print(f"[converter] Mapping: GPKG '{source}' → '{mapping[source]}'", flush=True)
            except Exception as e:
                print(f"[converter] Warning: Failed to parse model.json: {e}. Falling back to default names.", flush=True)

        if not mapping:
            print("[converter] Using default layer names (no model or no valid mappings).", flush=True)
            for l in all_gpkg_layers:
                mapping[l] = to_safe_name(l)

        print(f"[converter] Processing {len(mapping)} layer(s)...", flush=True)

        # ── 3. Convert each layer to FlatGeobuf + GeoParquet ────────────────
        fgb_dir = os.path.join(work_dir, "fgb")
        os.makedirs(fgb_dir, exist_ok=True)

        manifest_layers = []
        for layer_name, safe_name in mapping.items():
            print(f"[converter] Converting '{layer_name}' → {safe_name}.fgb ...", flush=True)
            try:
                fgb_path = convert_layer(gpkg_path, layer_name, safe_name, fgb_dir, target_crs)
            except RuntimeError as e:
                print(f"[converter] ERROR: {e}", file=sys.stderr, flush=True)
                sys.exit(1)

            print(f"[converter] Converting '{layer_name}' → {safe_name}.parquet ...", flush=True)
            convert_layer_to_parquet(fgb_path, safe_name, fgb_dir)

            parquet_path = os.path.join(fgb_dir, f"{safe_name}.parquet")
            if os.path.exists(parquet_path):
                print(f"[converter] Computing sidecar for {safe_name} ...", flush=True)
                sidecar = compute_sidecar(parquet_path)
                if sidecar:
                    sidecar_path = parquet_path + ".meta.json"
                    with open(sidecar_path, "w") as sf:
                        json.dump(sidecar, sf)
                    print(f"[converter] Sidecar written: {safe_name}.parquet.meta.json", flush=True)

            manifest_layers.append({"name": layer_name, "safe_name": safe_name})
            print(f"[converter] Layer '{layer_name}' done.", flush=True)

        # ── 4. Deliver output ────────────────────────────────────────────────
        manifest = {"layers": manifest_layers}
        if is_s3_output:
            prefix_key = output_prefix.replace(f"s3://{bucket}/", "", 1)
            for entry in manifest_layers:
                entry["fgb_key"] = f"{prefix_key}/{entry['safe_name']}.fgb"

            print(f"[converter] Uploading all layers to {output_prefix} ...", flush=True)
            client = _boto3_client()
            p = urlparse(output_prefix)
            pfx = p.path.lstrip("/")
            for fname in os.listdir(fgb_dir):
                fpath = os.path.join(fgb_dir, fname)
                if os.path.isfile(fpath):
                    client.upload_file(fpath, p.netloc, f"{pfx}/{fname}")

            manifest_key = f"{prefix_key}/.manifest.json"
            print(f"[converter] Writing manifest to s3://{bucket}/{manifest_key} ...", flush=True)
            s3_put_json(bucket, manifest_key, manifest)
        else:
            os.makedirs(output_prefix, exist_ok=True)
            print(f"[converter] Copying output files to {output_prefix} ...", flush=True)
            for fname in os.listdir(fgb_dir):
                shutil.copy2(os.path.join(fgb_dir, fname), os.path.join(output_prefix, fname))
            manifest_path = os.path.join(output_prefix, ".manifest.json")
            with open(manifest_path, "w") as f:
                json.dump(manifest, f)

        print(f"[converter] Done. {len(manifest_layers)} layer(s) converted.", flush=True)
        print(json.dumps(manifest), flush=True)


if __name__ == "__main__":
    main()
