import duckdb
import argparse
import sys
import json
import logging
import os
import subprocess
import base64
import shutil
import time
import socket
import re
from urllib.parse import urlparse
from collections import namedtuple
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

GEOM_TYPES: frozenset = frozenset({
    'GEOMETRY', 'POINT', 'MULTIPOINT', 'LINESTRING', 'MULTILINESTRING',
    'POLYGON', 'MULTIPOLYGON', 'GEOMETRYCOLLECTION',
})

PartitionInfo = namedtuple('PartitionInfo', ['p_safe', 'safe_keys', 'folder_path', 'where_clauses'])

_GDAL_FMT = {
    'flatgeobuf': ('FlatGeobuf', '.fgb',  'flatgeobuf'),
    'gpkg':       ('GPKG',       '.gpkg', 'gpkg'),
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_env_or_arg(env_name, arg_val, default=None):
    """Utility to resolve a value from env var or CLI arg, with fallback."""
    return arg_val or os.environ.get(env_name) or default


# ---------------------------------------------------------------------------
# DNS Fix (IPv6 TCP Blackhole)
# ---------------------------------------------------------------------------

def force_ipv4_for_endpoint(endpoint_url: str):
    """
    Prevents the 120-second IPv6 TCP timeout by forcing the OS to
    resolve the R2 endpoint to its IPv4 address via /etc/hosts.
    """
    domain = urlparse(endpoint_url).hostname
    if not domain:
        return

    try:
        # socket.gethostbyname explicitly requests an IPv4 address (A record)
        ipv4_addr = socket.gethostbyname(domain)
        with open("/etc/hosts", "a") as f:
            f.write(f"\n{ipv4_addr} {domain}\n")
        logging.info(f"Fixed IPv6 timeout: Forced {domain} to {ipv4_addr} in /etc/hosts")
    except Exception as e:
        logging.warning(f"Could not override DNS for IPv4: {e}")


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
        endpoint_url = endpoint if endpoint.startswith(('http://', 'https://')) else f"https://{endpoint}"
    
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

def s3_copy(src, dest, timeout=300, retries=3):
    client = _boto3_client()
    try:
        if src.startswith("s3://"):
            p = urlparse(src)
            client.download_file(p.netloc, p.path.lstrip("/"), dest)
        else:
            p = urlparse(dest)
            client.upload_file(src, p.netloc, p.path.lstrip("/"))
    except Exception as e:
        logging.error(f"S3 ERROR ({type(e).__name__}): {e}")
        raise


def stage_or_copy(local_path, rel_path, out_dir, staging_dir, *, log_label=""):
    """Place a locally-written file at its final destination.

    - staging_dir set  → copy into staging tree (for bulk s3 sync later)
    - out_dir is s3:// → upload directly via s3_copy
    - otherwise        → copy into local out_dir tree
    """
    label = log_label or os.path.basename(local_path)
    if staging_dir:
        dest = os.path.join(staging_dir, rel_path)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copy2(local_path, dest)
        logging.info(f"Staged {label} to {dest}")
    elif out_dir.startswith("s3://"):
        s3_dest = f"{out_dir}/{rel_path}"
        logging.info(f"Uploading {label} to {s3_dest}...")
        s3_copy(local_path, s3_dest)
    else:
        dest = os.path.join(out_dir, rel_path)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copy2(local_path, dest)


def upload_json(data, rel_path, out_dir, staging_dir=None):
    """Write a JSON file to a safe tmp path, then stage or upload."""
    safe_name = rel_path.replace('/', '_').replace(' ', '_')
    tmp = f"/tmp/stac-{safe_name}"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
    stage_or_copy(tmp, rel_path, out_dir, staging_dir)


def partition_key(cols, raw_values):
    """Transform a raw DuckDB partition row into derived path/filter components.

    Returns a PartitionInfo namedtuple with:
      p_safe        - NULLs replaced with 'unknown'
      safe_keys     - filesystem-safe, lowercased values
      folder_path   - Hive-style path segment, e.g. 'country=nz/year=unknown'
      where_clauses - SQL WHERE fragment, e.g. "country = 'NZ' AND year IS NULL"
    """
    p_safe = [k if k is not None else 'unknown' for k in raw_values]
    safe_keys = [str(k).replace("/", "_").replace(" ", "_").lower() for k in p_safe]
    folder_path = "/".join([f"{col}={k}" for col, k in zip(cols, safe_keys)])
    where_clauses = " AND ".join([
        f"{col} IS NULL" if val is None else f"{col} = '{val}'"
        for col, val in zip(cols, raw_values)
    ])
    return PartitionInfo(p_safe, safe_keys, folder_path, where_clauses)


def safe_transform_expr(geom_col, target_crs, source_srid=0):
    """
    Wrap ST_Transform in a safe way.
    If the source SRID is unknown (0), use the 3-argument ST_Transform 
    to explicitly declare the source CRS and target CRS to DuckDB.
    """
    if source_srid == 0:
        # Source unknown: assume it's already in the target CRS but missing metadata.
        # Transforming from target_crs -> target_crs tags the geometry without altering coordinates.
        return f"ST_Transform({geom_col}, '{target_crs}', '{target_crs}')"
    else:
        # Source known: trust standard 2-argument transform
        return f"ST_Transform({geom_col}, '{target_crs}')"


def build_gdal_select(layer_schema, geom_col, model_crs, partition_cols, source_srid=0):
    """
    Build a SELECT expression that transforms geometry to the model coordinate system.
    Returns (attr_cols, select_expr) where select_expr is a SQL fragment:
    '<attr_cols>, ST_Transform(<geom_col>, ...) AS geom'
    """
    attr_cols = [
        col[0] for col in layer_schema
        if col[1].upper() not in GEOM_TYPES
        and not col[1].upper().startswith('GEOMETRY')
        and col[0] not in partition_cols
        and col[0].lower() not in ['fid', 'ogc_fid']
    ]

    geom_select = safe_transform_expr(geom_col, model_crs, source_srid)
    select_expr = ", ".join([f'"{c}"' for c in attr_cols] + [f"{geom_select} AS geom"])
    return attr_cols, select_expr


def export_gdal_partition(fmt, con, query_with_key, partitions, partition_cols,
                          layer_name, layer_names, layer_schema, layer_geom_col,
                          model_crs, out_dir, staging_dir, source_srid=0):
    """Export all partitions of a single layer to a GDAL vector format (flatgeobuf or gpkg)."""
    driver, ext, subdir = _GDAL_FMT[fmt]
    _, select_expr = build_gdal_select(layer_schema, layer_geom_col, model_crs, partition_cols, source_srid=source_srid)
    multi_layer = len(layer_names) > 1

    for p in partitions:
        pi = partition_key(partition_cols, p)
        local_path = f"/tmp/partition_{'-'.join(pi.safe_keys)}{ext}"
        logging.info(f"Writing {fmt} to {local_path}...")
        con.execute(f"""
            COPY (
                SELECT {select_expr}
                FROM ({query_with_key}) AS _src
                {f"WHERE {pi.where_clauses}" if pi.where_clauses else ""}
            ) TO '{local_path}' WITH (FORMAT GDAL, DRIVER '{driver}')
        """)

        path_parts = [subdir]
        if multi_layer:
            path_parts.append(layer_name)
        if pi.folder_path:
            path_parts.append(pi.folder_path)
        path_parts.append(f"{layer_name}{ext}")
        rel_path = "/".join(path_parts)

        stage_or_copy(local_path, rel_path, out_dir, staging_dir, log_label=fmt)


def parse_model(b64_str):
    """Decode a base64-encoded JSON model string. Returns an empty dict on missing input or error."""
    if not b64_str:
        return {}
    try:
        return json.loads(base64.b64decode(b64_str).decode("utf-8"))
    except Exception as e:
        logging.warning(f"Could not parse --model: {e}")
        return {}


def build_stac_hierarchy(items, partition_cols, out_dir, catalog_meta, staging_dir=None):
    """
    Build a STAC catalog tree.
    - 1 column  → flat: root catalog links directly to items in stac/
    - 2-3 cols  → hierarchy: catalogs/ subdirs, leaf catalogs link to stac/ items
    """
    base_url = out_dir.rstrip("/")
    n_cols = len(partition_cols)

    def compute_bbox(item_list):
        return [
            min(it["item"]["bbox"][0] for it in item_list),
            min(it["item"]["bbox"][1] for it in item_list),
            max(it["item"]["bbox"][2] for it in item_list),
            max(it["item"]["bbox"][3] for it in item_list),
        ]

    def group_by(item_list, depth):
        groups = {}
        for it in item_list:
            key = it['safe_keys'][depth]
            groups.setdefault(key, []).append(it)
        return groups

    def build_level(item_list, depth, path_parts):
        """Recursively build intermediate catalogs; return child/item links for the parent."""
        if depth == n_cols:
            # Leaf level — link to items; items are at the root/stac, n_cols levels above catalogs/
            ups = "../" * (n_cols + 1)
            return [
                {"rel": "item",
                 "href": f"{ups}stac/{it['item']['id']}.json",
                 "type": "application/geo+json"}
                for it in item_list
            ]

        child_links = []
        for key_val, group in sorted(group_by(item_list, depth).items()):
            col_name = partition_cols[depth]
            folder   = key_val if col_name == "layer" else f"{col_name}={key_val}"
            parts    = path_parts + [folder]
            rel_dir  = "catalogs/" + "/".join(parts)
            sub_links = build_level(group, depth + 1, parts)
            cat_bbox  = compute_bbox(group)

            # depth+2: depth dirs inside catalogs/ + 1 for catalogs/ dir itself
            root_href = "../" * (depth + 2) + "catalog.json"

            if col_name == "layer":
                lm = group[0].get("layer_meta", {})
                cat_title       = lm.get("title", key_val)
                cat_description = lm.get("description", "")
                cat_keywords    = lm.get("keywords", [])
                cat_type        = "Collection"
            else:
                cat_title       = key_val
                cat_description = ""
                cat_keywords    = []
                cat_type        = "Catalog"

            sub_cat = {
                "stac_version": "1.0.0",
                "type": cat_type,
                "id": f"{col_name}-{key_val}",
                "title": cat_title,
                "description": cat_description or f"Data for {col_name} {key_val}",
                **({"keywords": cat_keywords} if cat_keywords else {}),
                "links": [
                    {"rel": "self",   "href": "catalog.json",                                  "type": "application/json"},
                    {"rel": "root",   "href": root_href,                                       "type": "application/json"},
                    {"rel": "parent", "href": root_href if depth == 0 else "../catalog.json",  "type": "application/json"},
                    *sub_links,
                ],
                "extent": {"spatial": {"bbox": [cat_bbox]}}
            }
            # Add temporal extent for Collection
            if cat_type == "Collection":
                sub_cat["extent"]["temporal"] = {"interval": [[None, None]]}
                sub_cat["license"] = catalog_meta.get("license", "proprietary")

            upload_json(sub_cat, f"{rel_dir}/catalog.json", out_dir, staging_dir)

            # depth 0 returns links for the root catalog (root-relative paths);
            # depth > 0 returns links for a sub-catalog (relative to that catalog's dir).
            child_href = f"catalogs/{folder}/catalog.json" if depth == 0 else f"{folder}/catalog.json"
            child_links.append({
                "rel":   "child",
                "href":  child_href,
                "title": cat_title,
                **({"description": cat_description} if cat_description else {}),
                "type":  "application/json"
            })

        return child_links

    if n_cols >= 1:
        # Update item parent links to point at their leaf catalog
        for it in items:
            folder_path = "/".join([
                k if col == "layer" else f"{col}={k}"
                for col, k in zip(partition_cols, it['safe_keys'])
            ])
            it['item']['links'] = [lnk for lnk in it['item']['links'] if lnk['rel'] != 'parent']
            it['item']['links'].append({
                "rel":  "parent",
                "href": f"../catalogs/{folder_path}/catalog.json",
                "type": "application/json"
            })
            upload_json(it['item'], f"stac/{it['item']['id']}.json", out_dir, staging_dir)

        child_links = build_level(items, 0, [])
    else:
        # Flat: root links directly to items — deduplicate by href
        seen_hrefs = set()
        child_links = []
        for it in items:
            href = f"stac/{it['item']['id']}.json"
            if href not in seen_hrefs:
                seen_hrefs.add(href)
                child_links.append({"rel": "item", "href": href, "type": "application/geo+json"})
            upload_json(it['item'], f"stac/{it['item']['id']}.json", out_dir, staging_dir)

    root_bbox = compute_bbox(items) if items else None
    root_cat = {
        "stac_version": "1.0.0",
        # Use Collection (not Catalog) so that extent and license are valid STAC fields
        "type": "Collection",
        "id": catalog_meta["id"],
        "title": catalog_meta["title"],
        "description": catalog_meta["description"],
        **({"license": catalog_meta["license"]} if catalog_meta.get("license") else {"license": "proprietary"}),
        **({"keywords": catalog_meta["keywords"]} if catalog_meta.get("keywords") else {}),
        **({"providers": catalog_meta["providers"]} if catalog_meta.get("providers") else {}),
        **({"summaries": {"geometry_type": catalog_meta["geometry_types"]}} if catalog_meta.get("geometry_types") else {}),
        "links": [
            {"rel": "self", "href": "catalog.json", "type": "application/json"},
            {"rel": "root", "href": "catalog.json", "type": "application/json"},
            *child_links,
        ],
        "extent": {
            "spatial":  {"bbox": [root_bbox or [-180, -90, 180, 90]]},
            "temporal": {"interval": catalog_meta.get("temporal_interval") or [[None, None]]},
        }
    }
    upload_json(root_cat, "catalog.json", out_dir, staging_dir)


def main():
    # Force IPv4 to prevent 120s timeout on Fly.io (IPv6 is enabled but not routed)
    endpoint = os.environ.get("S3_ENDPOINT")
    if endpoint:
        try:
            force_ipv4_for_endpoint(endpoint)
        except Exception as e:
            logging.warning(f"Failed to call force_ipv4_for_endpoint: {e}")

    parser = argparse.ArgumentParser(description="DuckDB Cloud-Native Spatial Partitioner")
    parser.add_argument("--source",      help="S3 path, local path, or PostGIS URI")
    parser.add_argument("--source-type", choices=["gpkg", "geopackage", "postgis", "csv"], help="Type of input source (default: gpkg)")
    parser.add_argument("--output",      help="Base output path (e.g. s3://bucket/projects/123/data)")
    parser.add_argument("--format",      choices=["flatgeobuf", "parquet", "gpkg", "all"], default="all")
    parser.add_argument("--strategy",    choices=["none", "custom_column"], help="Partitioning strategy")
    parser.add_argument("--column",      help="Comma-separated column(s) to partition by (required for custom_column)")
    parser.add_argument("--layers",      help="Comma-separated list of tables/layers to process")
    parser.add_argument("--model",       default="", help="Base64-encoded JSON of the DataModel for STAC metadata")
    parser.add_argument("--no-staging",  action="store_true", help="Disable local staging; upload to S3 immediately")

    args = parser.parse_args()

    # Resolve core parameters from CLI args or ENV vars (for Unified Worker compatibility)
    source      = get_env_or_arg("INPUT_URI",   args.source)
    source_type = get_env_or_arg("INPUT_TYPE",  args.source_type, "gpkg")
    if source_type == "geopackage":
        source_type = "gpkg"
    out_dir     = get_env_or_arg("OUTPUT_URI",  args.output)
    strategy    = get_env_or_arg("STRATEGY",    args.strategy, "none")
    column      = get_env_or_arg("COLUMN",      args.column)
    layers_str  = get_env_or_arg("TABLE_LIST",  args.layers) or os.environ.get("TABLES")

    if not source or not out_dir:
        logging.error("--source and --output (or INPUT_URI/OUTPUT_URI env vars) are required")
        sys.exit(1)

    if strategy == "custom_column" and not column:
        logging.error("--column is required when strategy is custom_column")
        sys.exit(1)

    # Parse model metadata for STAC enrichment
    model_data = parse_model(args.model)

    model_meta          = model_data.get("metadata", {})
    dataset_title       = model_data.get("name",        "Data Partitions")
    dataset_description = model_data.get("description", "Partitioned geographic datasets")
    dataset_id          = model_data.get("id",          "waystones-partition-catalog")
    dataset_keywords    = model_meta.get("keywords",    [])
    dataset_license     = model_meta.get("license",     "")
    contact_name        = model_meta.get("contactName", "")
    contact_email       = model_meta.get("contactEmail","")
    contact_org         = model_meta.get("contactOrganization", "")
    access_rights       = model_meta.get("accessRights","")
    # The Parquet/FlatGeobuf pipeline must always output WGS84 so that bbox columns
    # are in decimal degrees and pygeoapi spatial filtering works correctly.
    # TARGET_CRS is provided as an escape hatch; defaults to EPSG:4326.
    model_crs = os.environ.get("TARGET_CRS") or "EPSG:4326"
    logging.info(f"Target CRS for exports: {model_crs}")
    model_created       = model_data.get("createdAt",   "")
    model_updated       = model_data.get("updatedAt",   "")

    def _iso(s):
        """Parse an ISO-8601 string to UTC isoformat, or return None if absent/invalid."""
        if not s:
            return None
        try:
            dt = datetime.fromisoformat(s.rstrip("Z"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.isoformat()
        except ValueError:
            return None

    t_start = _iso(model_meta.get("temporalExtentFrom", ""))
    t_end   = _iso(model_meta.get("temporalExtentTo",   ""))
    temporal_interval = [[t_start, t_end]]

    # Bounding box from model metadata (authoritative; avoids relying on geometry reads)
    spatial_extent      = model_meta.get("spatialExtent", {})
    model_bbox = None
    if spatial_extent:
        try:
            w = float(spatial_extent.get("westBoundLongitude",  ""))
            e = float(spatial_extent.get("eastBoundLongitude",  ""))
            s = float(spatial_extent.get("southBoundLatitude",  ""))
            n = float(spatial_extent.get("northBoundLatitude",  ""))
            model_bbox = [w, s, e, n]
            logging.info(f"Model bbox: {model_bbox}")
        except (TypeError, ValueError):
            logging.warning("spatialExtent in model is incomplete or non-numeric; will compute from geometry")

    # Stage all non-Parquet files locally so a single `aws s3 sync` replaces many `cp` calls.
    # Each `aws s3 cp` invocation incurs a full TCP+TLS+auth round-trip (~60s on some Fly machines),
    # so batching is critical for performance.
    # --no-staging disables this (useful for massive datasets that might exceed disk space).
    staging_dir = None
    if out_dir.startswith("s3://") and not args.no_staging:
        staging_dir = "/tmp/stac-output"
        shutil.rmtree(staging_dir, ignore_errors=True)
        os.makedirs(staging_dir, exist_ok=True)
        logging.info(f"Using local staging directory: {staging_dir}")

    # ── 1. CONFIGURE GDAL ENVIRONMENT ─────────────────────────────────────────
    # Must be set BEFORE DuckDB connects and loads the spatial extension,
    # because GDAL initialises once at extension load time.
    r2_endpoint = os.environ.get('S3_ENDPOINT', '').replace('https://', '')
    r2_key      = os.environ.get('AWS_ACCESS_KEY_ID', '')
    r2_secret   = os.environ.get('AWS_SECRET_ACCESS_KEY', '')

    if r2_endpoint:
        os.environ['AWS_ENDPOINT_URL']   = os.environ.get('S3_ENDPOINT', '')
        os.environ['AWS_S3_ENDPOINT']    = r2_endpoint
        os.environ['AWS_VIRTUAL_HOSTING']= 'FALSE'
        logging.info(f"GDAL configured for R2: {r2_endpoint}")

    # ── 2. CONNECT DUCKDB ─────────────────────────────────────────────────────
    con = duckdb.connect()
    con.execute("SET home_directory='/tmp'")
    con.execute("PRAGMA memory_limit='3GB'")
    con.execute("PRAGMA temp_directory='/tmp/duckdb_swap'")
    con.execute("SET extension_directory='/duckdb-extensions'")
    con.execute("LOAD spatial;")
    con.execute("LOAD httpfs;")
    con.execute("SET allow_asterisks_in_http_paths = true;")

    # ── 3. CONFIGURE DUCKDB S3 SECRET FOR R2 ─────────────────────────────────
    target_bucket = out_dir.replace("s3://", "").split("/")[0] if out_dir.startswith("s3://") else ""

    if r2_endpoint and r2_key and r2_secret and target_bucket:
        con.execute(f"""
            CREATE OR REPLACE SECRET r2_secret (
                TYPE S3,
                KEY_ID '{r2_key}',
                SECRET '{r2_secret}',
                ENDPOINT '{r2_endpoint}',
                URL_STYLE 'path',
                REGION 'auto',
                SCOPE 's3://{target_bucket}'
            )
        """)
        logging.info(f"Configured DuckDB R2 secret for bucket: {target_bucket}")

    # ── 4. RESOLVE SOURCE ─────────────────────────────────────────────────────
    gdal_source = source
    pg_schema   = model_data.get("sourceConnection", {}).get("config", {}).get("schema", "public")

    if source_type == "postgis":
        # Ensure URI is prefixed for OGR PostgreSQL driver if not already (for discovery via ogrinfo)
        if source.startswith("postgresql://") or source.startswith("postgres://"):
            gdal_source = f"PG:{source}"

        # Connect DuckDB natively to Postgres to bypass GDAL driver issues for extraction
        try:
            con.execute("INSTALL postgres; LOAD postgres;")
            con.execute(f"ATTACH '{source}' AS pg_source (TYPE postgres, READ_ONLY);")
            logging.info(f"Attached PostGIS source natively as pg_source (default schema: {pg_schema})")
        except Exception as e:
            logging.warning(f"Could not attach PostGIS natively: {e}. Worker will fallback to GDAL/st_read.")

        logging.info(f"Using PostGIS source for discovery: {source}")
    else:
        # GDAL cannot random-access SQLite/GPKG reliably over HTTP range requests,
        # so we always download the source to local disk first.
        local_source = source
        if source.startswith('s3://'):
            local_source = f"/tmp/{os.path.basename(source)}"
            logging.info(f"Downloading source GPKG to {local_source}...")
            s3_copy(source, local_source)
        gdal_source = local_source

    # ── 5. LIST ALL LAYERS IN THE GPKG USING OGRINFO ───────────────────────
    # DuckDB's st_layers() may not be available, so use GDAL's ogrinfo instead
    try:
        result = subprocess.run(
            ["ogrinfo", gdal_source],
            capture_output=True,
            text=True,
            check=True
        )
        # Parse layer names from ogrinfo output
        # ogrinfo lists layers like:
        # 1: castles (Point)
        # 2: parks (MultiPolygon)
        layer_names = []
        lines = result.stdout.split('\n') + result.stderr.split('\n')
        for line in lines:
            line = line.strip()
            # Match pattern: digit(s) followed by colon or dot
            # e.g. "1: beaches (Point)" or "1. lighthouses"
            if not line or not line[0].isdigit():
                continue

            # Find the FIRST colon or dot after the digit(s)
            first_sep_idx = -1
            for i, char in enumerate(line):
                if char in (':', '.'):
                    first_sep_idx = i
                    break
                if not char.isdigit() and not char.isspace():
                    # If we hit something else first, it's not a standard layer line
                    break

            if first_sep_idx > 0:
                rest = line[first_sep_idx+1:].strip()
                if rest:
                    # Remove trailing (Type) if present
                    name = rest.split('(')[0].strip()
                    if name and name not in layer_names:
                        layer_names.append(name)
                        logging.info(f"Found layer: {name}")

        # Filter layers if explicit list provided
        if layers_str:
            allowed_layers = [l.strip().lower() for l in layers_str.split(",")]

            def is_allowed(name):
                n_low = name.lower()
                for al in allowed_layers:
                    if n_low == al:
                        return True
                    # Match if requested is 'schema.table' and found is 'table'
                    if '.' in al and al.split('.')[-1] == n_low:
                        return True
                    # Match if requested is 'table' and found is 'schema.table'
                    if '.' in n_low and n_low.split('.')[-1] == al:
                        return True
                return False

            original_count = len(layer_names)
            layer_names = [l for l in layer_names if is_allowed(l)]
            logging.info(f"Filtered {original_count} found layers down to: {', '.join(layer_names)} (based on requested TABLES: {layers_str})")

        if not layer_names:
            logging.error(f"No layers found (or all filtered out) in {gdal_source}. Requested TABLES: {layers_str}")
            sys.exit(1)
        logging.info(f"Total: {len(layer_names)} layer(s) to process: {', '.join(layer_names)}")
    except subprocess.CalledProcessError as e:
        logging.error(f"ogrinfo failed: {e.stderr}")
        sys.exit(1)

    # ── 6. PROCESS EACH LAYER ────────────────────────────────────────────────
    formats_to_run = ["flatgeobuf", "parquet", "gpkg"] if args.format == "all" else [args.format]
    all_items = []       # Collect items from all layers for STAC
    all_geom_types = []  # Collect geometry types for Collection summaries
    all_keywords = list(dataset_keywords)  # Collect all keywords across layers

    logging.info(f"Target CRS for exports: {model_crs}")

    for layer_name in layer_names:
        logging.info(f"Processing layer '{layer_name}'...")

        # Resolve layer-specific metadata from the model (title, description, keywords)
        # Note: model may have IDs or names; try to match both case-insensitively
        def find_model_layer(name, model_layers):
            n_low = name.lower()
            for l in model_layers:
                m_name = l.get("name", "").lower()
                m_id = l.get("id", "").lower()
                if m_name == n_low or m_id == n_low:
                    return l
                # Handle schema-qualified names: match 'parks' to 'public.parks'
                if '.' in m_name and m_name.split('.')[-1] == n_low:
                    return l
                if '.' in n_low and n_low.split('.')[-1] == m_name:
                    return l
            return None

        model_layer = find_model_layer(layer_name, model_data.get("layers", []))
        layer_title         = (model_layer.get("title") or model_layer.get("name") or layer_name) if model_layer else layer_name
        layer_description   = (model_layer.get("description") or dataset_description)             if model_layer else dataset_description
        layer_keywords      = (model_layer.get("keywords")    or dataset_keywords)                if model_layer else dataset_keywords
        for kw in layer_keywords:
            if kw not in all_keywords:
                all_keywords.append(kw)
        layer_geometry_type = (model_layer.get("geometryType") or "")                             if model_layer else ""
        if layer_geometry_type and layer_geometry_type not in all_geom_types:
            all_geom_types.append(layer_geometry_type)

        # Determine the base query for this layer
        if source_type == "postgis":
            # Attempt to use the natively attached postgres source first
            try:
                # If layer_name already has a schema (e.g. 'public.beaches'), use it directly
                # Otherwise, use the schema from the connection config
                fq_table = f"pg_source.{layer_name}" if "." in layer_name else f"pg_source.{pg_schema}.{layer_name}"
                con.execute(f"SELECT 1 FROM {fq_table} LIMIT 0")
                base_query = fq_table
                logging.info(f"Using natively attached PostgreSQL table: {base_query}")
            except Exception as e:
                logging.warning(f"Native PostgreSQL access failed for layer '{layer_name}': {e}. Falling back to st_read.")
                base_query = f"st_read('{gdal_source}', layer='{layer_name}')"
        else:
            # For GPKG, st_read is standard
            try:
                # Note: st_read() with layer= may not work in all DuckDB versions
                con.execute(f"SELECT 1 FROM st_read('{gdal_source}', layer='{layer_name}') LIMIT 0")
                base_query = f"st_read('{gdal_source}', layer='{layer_name}')"
                logging.info(f"Using st_read with layer parameter: {layer_name}")
            except:
                # Fallback: read all and filter — not ideal but works for small layers
                logging.warning(f"layer= parameter not supported for st_read, reading and filtering")
                base_query = f"st_read('{gdal_source}')"

        # Determine partition columns for this layer
        if strategy == "none":
            partition_cols  = []
            query_with_key  = f"SELECT * FROM {base_query}"
        else:  # custom_column
            partition_cols  = [c.strip() for c in column.split(",")]
            query_with_key  = f"SELECT * FROM {base_query}"


        # Introspect schema once per layer — used by both export and bbox computation
        layer_schema = []
        try:
            # We use SELECT * FROM (...) AS _discovery to ensure DESCRIBE works even if query_with_key is a complex query
            layer_schema = con.execute(f"DESCRIBE SELECT * FROM ({query_with_key}) AS _discovery").fetchall()
            logging.info(f"Layer '{layer_name}' schema: {[(col[0], col[1]) for col in layer_schema]}")
        except Exception as e:
            logging.warning(f"Could not describe layer '{layer_name}': {e}")

        # Identify the primary geometry column
        layer_geom_col = None
        col_type = "unknown"
        for c_name, c_type, *_ in layer_schema:
            if c_type.upper() in GEOM_TYPES or c_type.upper().startswith('GEOMETRY'):
                layer_geom_col = c_name
                col_type = c_type
                break

        if layer_geom_col:
            logging.info(f"Layer '{layer_name}' geometry column: {layer_geom_col} ({col_type})")
        else:
            layer_geom_col = 'geom'
            logging.warning(f"Could not detect geometry column for '{layer_name}', assuming 'geom'")

        # Detect source SRID from the column type (e.g. "GEOMETRY(EPSG:4326)")
        source_srid = 0
        if col_type != "unknown":
            # DuckDB types look like: GEOMETRY, GEOMETRY(EPSG:4326), POINT(4326), etc.
            if '(' in col_type:
                try:
                    # Extract the numeric part (handles both "EPSG:4326" and "4326")
                    m = re.search(r'[:]?(\d+)\)', col_type)
                    if m:
                        source_srid = int(m.group(1))
                        logging.info(f"Detected SRID {source_srid} for '{layer_name}' via type inspection")
                except:
                    pass

        if source_srid == 0:
            logging.info(f"No SRID detected for '{layer_name}' type ({col_type}); will use target SRID as fallback.")

        # Resolve requested columns and check which ones exist in this layer's schema
        partition_cols_requested = [c.strip() for c in column.split(",")] if strategy == "custom_column" else []
        all_layer_cols = [c[0] for c in layer_schema]

        # Build a SELECT fragment that uses the column if it exists, or NULL if it doesn't
        select_parts = []
        missing_cols = []
        if strategy == "none":
            select_parts = ["1"]
        else:
            for c in partition_cols_requested:
                if c in all_layer_cols:
                    select_parts.append(f'"{c}"')
                else:
                    select_parts.append(f'CAST(NULL AS VARCHAR) AS "{c}"')
                    missing_cols.append(c)

        # FIX: If this layer is missing requested columns, inject them into the base query
        # so the WHERE clause in the export step doesn't crash.
        if missing_cols:
            injected_cols = ", ".join([f'CAST(NULL AS VARCHAR) AS "{c}"' for c in missing_cols])
            query_with_key = f"SELECT *, {injected_cols} FROM ({query_with_key}) AS _wrapped"

        part_by_str = ", ".join(select_parts)
        partitions = con.execute(
            f"SELECT DISTINCT {part_by_str} FROM ({query_with_key}) AS _parts"
        ).fetchall()
        
        # Always use the full requested list for partition_cols to keep hierarchy depth consistent
        partition_cols = partition_cols_requested
        logging.info(f"Layer '{layer_name}': {len(partitions)} partition(s)")

        # ── 6a. EXPORT DATA ─────────────────────────────────────────────────
        for fmt in formats_to_run:
            logging.info(f"Exporting {layer_name} to {fmt}...")

            if fmt == "parquet":
                # Ensure parquet uses the model CRS too
                _, select_expr = build_gdal_select(layer_schema, layer_geom_col, model_crs, partition_cols, source_srid=source_srid)
                multi_layer = len(layer_names) > 1
                for p in partitions:
                    pi = partition_key(partition_cols, p)
                    local_path = f"/tmp/partition_{'-'.join(pi.safe_keys)}.parquet"
                    logging.info(f"Writing parquet to {local_path}...")
                    con.execute(f"""
                        COPY (
                            SELECT {select_expr} FROM ({query_with_key}) AS _src
                            {f"WHERE {pi.where_clauses}" if pi.where_clauses else ""}
                        ) TO '{local_path}' (FORMAT PARQUET)
                    """)

                    path_parts = ["parquet"]
                    if multi_layer:
                        path_parts.append(layer_name)
                    if pi.folder_path:
                        path_parts.append(pi.folder_path)
                    path_parts.append(f"{layer_name}.parquet")
                    rel_path = "/".join(path_parts)

                    stage_or_copy(local_path, rel_path, out_dir, staging_dir, log_label="parquet")

            elif fmt in _GDAL_FMT:
                export_gdal_partition(
                    fmt, con, query_with_key, partitions, partition_cols,
                    layer_name, layer_names, layer_schema, layer_geom_col,
                    model_crs, out_dir, staging_dir, source_srid=source_srid
                )

        # ── 6b. BUILD STAC ITEMS FOR THIS LAYER ─────────────────────────────
        logging.info(f"Generating STAC metadata for layer '{layer_name}'...")
        layer_items = []

        for p in partitions:
            pi = partition_key(partition_cols, p)

            try:
                _bbox_geom = safe_transform_expr(layer_geom_col, 'OGC:CRS84', source_srid)
                bbox_row = con.execute(f"""
                    SELECT
                        MIN(ST_XMin({_bbox_geom})),
                        MIN(ST_YMin({_bbox_geom})),
                        MAX(ST_XMax({_bbox_geom})),
                        MAX(ST_YMax({_bbox_geom}))
                    FROM ({query_with_key}) AS _bbox
                    {f"WHERE {pi.where_clauses}" if pi.where_clauses else ""}
                """).fetchone()
            except Exception as e:
                logging.warning(f"Could not compute bbox for partition {p}: {e}")
                bbox_row = None

            if not bbox_row or any(v is None for v in bbox_row):
                logging.warning(f"Skipping partition {p}: bbox query returned null (empty geometry?)")
                continue
            else:
                minx, miny, maxx, maxy = map(float, bbox_row)

            # Expand degenerate bboxes (e.g. single-point layers) so STAC clients
            # can display the item on a map
            EPSILON = 0.0001
            if maxx - minx < EPSILON:
                minx -= EPSILON
                maxx += EPSILON
            if maxy - miny < EPSILON:
                miny -= EPSILON
                maxy += EPSILON

            # Include layer name in item ID to avoid collisions across layers
            item_id = f"partition-{layer_name}-{'-'.join(pi.safe_keys)}" if len(layer_names) > 1 else f"partition-{'-'.join(pi.safe_keys)}"
            item = {
                "stac_version": "1.0.0",
                "type":         "Feature",
                "id":           item_id,
                "bbox":         [minx, miny, maxx, maxy],
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[minx, miny], [maxx, miny], [maxx, maxy], [minx, maxy], [minx, miny]]]
                },
                "properties": {
                    "datetime":     datetime.now(timezone.utc).isoformat(),
                    "title":        layer_title,
                    **({"description":   layer_description}   if layer_description   else {}),
                    **({"keywords":      layer_keywords}       if layer_keywords       else {}),
                    **({"license":       dataset_license}      if dataset_license      else {}),
                    **({"rights":        access_rights}        if access_rights        else {}),
                    **({"geometry_type": layer_geometry_type}  if layer_geometry_type  else {}),
                    **({"created":       _iso(model_created)}  if model_created        else {}),
                    **({"updated":       _iso(model_updated)}  if model_updated        else {}),
                },
                **({"providers": [{"name": contact_org or contact_name, "roles": ["producer"],
                                   "url": f"mailto:{contact_email}"}]}
                   if (contact_name or contact_org) else {}),
                "links": [
                    {"rel": "self",   "href": f"{item_id}.json", "type": "application/geo+json"},
                    {"rel": "root",   "href": "../catalog.json", "type": "application/json"},
                    # parent link is filled in by build_stac_hierarchy for multi-col;
                    # single-col: root is parent
                    {"rel": "parent", "href": "../catalog.json", "type": "application/json"},
                ],
                "assets": {}
            }

            for col, val in zip(partition_cols, pi.p_safe):
                item["properties"][col] = val

            if "flatgeobuf" in formats_to_run:
                path_parts = ["../flatgeobuf"]
                if len(layer_names) > 1:
                    path_parts.append(layer_name)
                if pi.folder_path:
                    path_parts.append(pi.folder_path)
                path_parts.append(f"{layer_name}.fgb")
                fgb_asset_path = "/".join(path_parts)

                item["assets"]["flatgeobuf"] = {
                    "href":  fgb_asset_path,
                    "type":  "application/vnd.flatgeobuf",
                    "title": "FlatGeobuf",
                    "roles": ["data"]
                }
            if "parquet" in formats_to_run:
                path_parts = ["../parquet"]
                if len(layer_names) > 1:
                    path_parts.append(layer_name)
                if pi.folder_path:
                    path_parts.append(pi.folder_path)
                path_parts.append(f"{layer_name}.parquet")
                parquet_path = "/".join(path_parts)

                item["assets"]["parquet"] = {
                    "href":  parquet_path,
                    "type":  "application/vnd.apache.parquet",
                    "title": "Parquet",
                    "roles": ["data"]
                }
            if "gpkg" in formats_to_run:
                path_parts = ["../gpkg"]
                if len(layer_names) > 1:
                    path_parts.append(layer_name)
                if pi.folder_path:
                    path_parts.append(pi.folder_path)
                path_parts.append(f"{layer_name}.gpkg")
                gpkg_asset_path = "/".join(path_parts)

                item["assets"]["gpkg"] = {
                    "href":  gpkg_asset_path,
                    "type":  "application/geopackage+sqlite3",
                    "title": "GeoPackage",
                    "roles": ["data"]
                }

            layer_meta = {
                "title":       layer_title,
                "description": layer_description,
                "keywords":    layer_keywords,
            }
            layer_items.append({
                "item":       item,
                "keys":       [layer_name] + pi.p_safe,
                "safe_keys":  [layer_name] + pi.safe_keys,
                "layer_meta": layer_meta,
            })

            # Write item JSON (parent link may be overwritten by build_stac_hierarchy for multi-col)
            upload_json(item, f"stac/{item_id}.json", out_dir, staging_dir)

        # Collect items from this layer
        all_items.extend(layer_items)

    # ── 7. STAC CATALOG HIERARCHY ─────────────────────────────────────────────
    logging.info(f"Building STAC catalog hierarchy...")
    providers = []
    if contact_name or contact_org:
        providers.append({
            "name":  contact_org or contact_name,
            "roles": ["producer"],
            **({"url": f"mailto:{contact_email}"} if contact_email else {}),
        })

    # For multi-layer projects prepend "layer" so build_stac_hierarchy creates
    # per-layer Collections with titles/descriptions from the data model.
    # For single-layer, strip the prepended layer_name that was added to safe_keys.
    if len(layer_names) > 1:
        effective_partition_cols = ["layer"] + partition_cols
    else:
        for it in all_items:
            it["safe_keys"] = it["safe_keys"][1:]
            it["keys"] = it["keys"][1:]
        effective_partition_cols = partition_cols

    build_stac_hierarchy(
        all_items,
        effective_partition_cols,
        out_dir,
        {
            "id":               dataset_id,
            "title":            dataset_title,
            "description":      dataset_description,
            "license":          dataset_license,
            "keywords":         all_keywords,
            "providers":        providers,
            "geometry_types":   all_geom_types,
            "temporal_interval": temporal_interval,
        },
        staging_dir=staging_dir,
    )

    # Bulk-upload all staged files in a single AWS CLI invocation.
    # This replaces N individual `aws s3 cp` calls (each with ~60s of TCP+TLS+auth overhead)
    # with one `aws s3 sync` that reuses the same connection for all files.
    if staging_dir and out_dir.startswith("s3://"):
        logging.info(f"Uploading all staged files to {out_dir} via s3 sync...")
        import glob as _glob
        client = _boto3_client()
        p = urlparse(out_dir)
        pfx = p.path.lstrip("/")
        for fpath in _glob.glob(os.path.join(staging_dir, "**", "*"), recursive=True):
            if os.path.isfile(fpath):
                rel = os.path.relpath(fpath, staging_dir).replace("\\", "/")
                client.upload_file(fpath, p.netloc, f"{pfx}/{rel}" if pfx else rel)
        logging.info("Bulk upload complete.")

    logging.info("STAC generation complete.")

    # Report output size back to the app so it can meter storage against the user's quota.
    # Walk the staging dir (populated before the s3 sync) for an accurate byte count.
    total_output_bytes = 0
    size_source = staging_dir if staging_dir else None
    if size_source and os.path.isdir(size_source):
        for dirpath, _, filenames in os.walk(size_source):
            for fname in filenames:
                try:
                    total_output_bytes += os.path.getsize(os.path.join(dirpath, fname))
                except OSError:
                    pass

    # ── Write Metrics for main.py callback ───────────────────────────────
    try:
        with open("/tmp/.peon-metrics.json", "w") as f:
            json.dump({"totalBytes": total_output_bytes}, f)
    except Exception as e:
        logging.warning(f"Failed to write metrics file: {e}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logging.exception(f"Fatal error: {e}")
        sys.exit(1)
