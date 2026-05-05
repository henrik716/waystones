"""
Custom pygeoapi provider for GeoParquet files on Edge S3 Storage (or public HTTPS).
Uses DuckDB with httpfs + spatial — no file downloads, proper LIMIT/OFFSET pagination.

Two connection modes based on the `data` URL scheme:
  s3://bucket/path/file.parquet   — Edge S3 Storage, credentials from env or provider options
  https://cdn.example.com/...     — public, CDN-cached range requests (no credentials)
"""
import json
import logging
import os
import threading

from pygeoapi.provider.base import BaseProvider, ProviderItemNotFoundError

try:
    from pygeofilter.backends.sql import to_sql_where
except ImportError:
    to_sql_where = None

LOGGER = logging.getLogger(__name__)

_DUCK_TO_OGC = {
    'INTEGER': 'integer', 'INT': 'integer', 'INT4': 'integer', 'INT2': 'integer',
    'BIGINT': 'integer', 'INT8': 'integer', 'HUGEINT': 'integer', 'UBIGINT': 'integer',
    'FLOAT': 'number', 'DOUBLE': 'number', 'REAL': 'number', 'DECIMAL': 'number',
    'BOOLEAN': 'boolean', 'BOOL': 'boolean',
}

# ------------------------------------------------------------------
# SHARED ENGINE STATE — one DuckDB engine per Gunicorn worker process.
# All collections share the engine so they share the HTTP keep-alive
# pool and the in-memory metadata/object caches.
# ------------------------------------------------------------------
_SHARED_CONN = None
_SPATIAL_LOADED = False
_META_CACHE: dict = {}   # data_url → metadata dict
_LOCK = threading.Lock()


def _ogc_type(duckdb_type: str) -> str:
    """Safely map DuckDB types to OGC types, handling None values from nested structs."""
    if not duckdb_type:
        return 'string'
    return _DUCK_TO_OGC.get(duckdb_type.upper().split('(')[0], 'string')


class GeoParquetDuckDBProvider(BaseProvider):
    def __init__(self, provider_def: dict):
        super().__init__(provider_def)
        options = self.options or {}

        injected_schema = provider_def.get('schema') or options.get('schema') or {}
        raw_props = injected_schema.get('properties') if isinstance(injected_schema, dict) else None

        if raw_props and isinstance(raw_props, dict):
            self._static_fields = {}
            for name, info in raw_props.items():
                if isinstance(info, dict):
                    field_def = {
                        'type': info.get('type', 'string'),
                        'title': info.get('title', name)
                    }
                    if 'enum' in info:
                        field_def['enum'] = info['enum']
                    if 'format' in info:
                        field_def['format'] = info['format']

                    self._static_fields[name] = field_def
        else:
            self._static_fields = None

        global _SHARED_CONN

        with _LOCK:
            if _SHARED_CONN is None:
                import duckdb
                LOGGER.info("Booting shared DuckDB engine for worker...")
                conn = duckdb.connect(':memory:')

                ext_dir = os.environ.get('DUCKDB_EXTENSION_DIRECTORY', '/duckdb-extensions')
                conn.execute(f"SET extension_directory='{ext_dir}'")
                conn.execute("LOAD httpfs")

                conn.execute("SET enable_http_metadata_cache = true")
                conn.execute("SET enable_object_cache = true")

                ddb_version_str = duckdb.__version__
                LOGGER.info(f"DuckDB version: {ddb_version_str}")
                ddb_version = tuple(map(int, ddb_version_str.split('.')[:3]))

                endpoint = (
                    options.get('r2_endpoint') or
                    os.environ.get('AWS_ENDPOINT_URL') or
                    os.environ.get('S3_ENDPOINT') or
                    os.environ.get('AWS_S3_ENDPOINT', '')
                )
                if endpoint:
                    if '://' in endpoint:
                        endpoint = endpoint.split('://')[-1]
                    endpoint = endpoint.rstrip('/')

                    key = options.get('r2_access_key_id') or os.environ.get('AWS_ACCESS_KEY_ID', '')
                    secret = options.get('r2_secret_access_key') or os.environ.get('AWS_SECRET_ACCESS_KEY', '')

                    if ddb_version >= (1, 5, 0):
                        # DuckDB 1.5+ credential scope change: SET s3_* only applies to
                        # connection.execute(), not cursor.execute(). CREATE SECRET applies
                        # to all execution contexts, including cursors used in query().
                        conn.execute(f"""
                            CREATE OR REPLACE SECRET edge_s3_secret (
                                TYPE S3,
                                KEY_ID '{key}',
                                SECRET '{secret}',
                                ENDPOINT '{endpoint}',
                                URL_STYLE 'path',
                                REGION 'auto',
                                USE_SSL true
                            )
                        """)
                    else:
                        conn.execute(f"SET s3_endpoint='{endpoint}'")
                        conn.execute(f"SET s3_access_key_id='{key}'")
                        conn.execute(f"SET s3_secret_access_key='{secret}'")
                        conn.execute("SET s3_url_style='path'")
                        conn.execute("SET s3_region='auto'")
                        conn.execute("SET s3_use_ssl=true")

                # On <1.5 we need spatial loaded eagerly to even DESCRIBE a GeoParquet file.
                if ddb_version < (1, 5, 0):
                    conn.execute("LOAD spatial")
                    global _SPATIAL_LOADED
                    _SPATIAL_LOADED = True

                _SHARED_CONN = conn

            self._conn = _SHARED_CONN

            if self.data not in _META_CACHE:
                _META_CACHE[self.data] = self._init_metadata()

            self._apply_metadata(_META_CACHE[self.data])
            self._fields = self.get_fields()

    def _apply_metadata(self, meta: dict):
        self._geom_col        = meta['geom_col']
        self._geom_is_native  = meta['geom_is_native']
        self._source_crs      = meta['source_crs']
        self._fields_cache    = meta['fields_cache']
        self._count_cache     = meta['count_cache']
        self._has_bbox_struct = meta.get('has_bbox_struct', False)
        self._has_bbox_cols   = meta.get('has_bbox_cols', False)

    # ------------------------------------------------------------------
    # Startup metadata — runs once per data URL per worker process
    # ------------------------------------------------------------------

    def _init_metadata(self) -> dict:
        """Fetch all Parquet metadata via DESCRIBE (logical schema)."""
        schema = self._conn.execute(
            f"DESCRIBE SELECT * FROM read_parquet('{self.data}')"
        ).fetchall()

        geo_meta: dict = {}
        try:
            row = self._conn.execute(
                f"SELECT value FROM parquet_kv_metadata('{self.data}') WHERE key='geo'"
            ).fetchone()
            if row:
                geo_meta = json.loads(row[0])
        except Exception:
            pass

        primary_col = geo_meta.get('primary_column', '')
        if primary_col:
            geom_col = primary_col
        else:
            geom_col = next(
                (name for name, dtype, *_ in schema if dtype and dtype.upper().startswith('GEOMETRY')),
                None,
            ) or next(
                (name for name, *_ in schema if name.lower() in ('geometry', 'geom', 'wkb_geometry')),
                'geometry',
            )

        geom_is_native = any(
            name == geom_col and dtype and dtype.upper().startswith('GEOMETRY')
            for name, dtype, *_ in schema
        )

        source_crs = None
        col_crs = geo_meta.get('columns', {}).get(geom_col, {}).get('crs')
        if col_crs is not None:
            if isinstance(col_crs, str):
                if col_crs not in ('OGC:CRS84', 'EPSG:4326'):
                    source_crs = col_crs
            elif isinstance(col_crs, dict):
                crs_id = col_crs.get('id', {})
                tag = f"{crs_id.get('authority', 'EPSG')}:{crs_id.get('code', '')}"
                if tag not in ('EPSG:4326', 'OGC:CRS84'):
                    source_crs = tag

        schema_names = [name.lower() for name, *_ in schema]
        has_bbox_struct = 'bbox' in schema_names
        has_bbox_cols = all(c in schema_names for c in ['bbox_xmin', 'bbox_ymin', 'bbox_xmax', 'bbox_ymax'])

        exclude_fields = {geom_col.lower(), 'ogc_fid', 'bbox', 'bbox_xmin', 'bbox_ymin', 'bbox_xmax', 'bbox_ymax'}
        fields_cache = {
            name: {'type': _ogc_type(dtype), 'title': name}
            for name, dtype, *_ in schema
            if name.lower() not in exclude_fields
        }

        return {
            'geom_col':       geom_col,
            'geom_is_native': geom_is_native,
            'source_crs':     source_crs,
            'fields_cache':   fields_cache,
            'count_cache':    {},
            'has_bbox_struct': has_bbox_struct,
            'has_bbox_cols':   has_bbox_cols
        }

    # ------------------------------------------------------------------
    # SQL expression helpers
    # ------------------------------------------------------------------

    def _ensure_spatial(self):
        """Lazy-load spatial extension once per worker (DuckDB 1.5 optimization)."""
        global _SPATIAL_LOADED
        if _SPATIAL_LOADED:
            return
        with _LOCK:
            if _SPATIAL_LOADED:
                return
            LOGGER.info("Lazy loading spatial extension...")
            self._conn.execute("LOAD spatial")
            _SPATIAL_LOADED = True

    def _geom_to_json(self) -> str:
        self._ensure_spatial()
        if self._geom_is_native:
            if self._source_crs:
                return (f"ST_AsGeoJSON(ST_Transform(\"{self._geom_col}\","
                        f" '{self._source_crs}', 'EPSG:4326', true))")
            return f'ST_AsGeoJSON("{self._geom_col}")'
        return f'ST_AsGeoJSON(ST_GeomFromWKB("{self._geom_col}"))'

    def _geom_for_filter(self) -> str:
        """Geometry expression in WGS84 lon/lat for bbox intersection."""
        self._ensure_spatial()
        if self._geom_is_native:
            if self._source_crs:
                return (f"ST_Transform(\"{self._geom_col}\","
                        f" '{self._source_crs}', 'EPSG:4326', true)")
            return f'"{self._geom_col}"'
        return f'ST_GeomFromWKB("{self._geom_col}")'

    def _build_where(self, bbox: list, properties: list, filterq=None) -> tuple[str, list]:
        clauses: list[str] = []
        params: list = []
        if len(bbox) == 4:
            minx, miny, maxx, maxy = bbox

            # Parquet row-group pruning on raw numeric bbox columns: this is what
            # actually skips chunk downloads on R2. Must precede ST_Intersects.
            if self._has_bbox_struct:
                clauses.append("bbox.xmin <= ? AND bbox.xmax >= ? AND bbox.ymin <= ? AND bbox.ymax >= ?")
                params.extend([maxx, minx, maxy, miny])
            elif self._has_bbox_cols:
                clauses.append("bbox_xmin <= ? AND bbox_xmax >= ? AND bbox_ymin <= ? AND bbox_ymax >= ?")
                params.extend([maxx, minx, maxy, miny])

            # ST_MakeEnvelope is the optimized envelope path. Do NOT replace with a
            # WKT POLYGON via ST_GeomFromText — that defeats the bbox shortcut.
            clauses.append(f"ST_Intersects({self._geom_for_filter()}, ST_MakeEnvelope(?, ?, ?, ?))")
            params.extend([minx, miny, maxx, maxy])

        for name, value in (properties or []):
            clauses.append(f'"{name}" = ?')
            params.append(value)

        if filterq is not None:
            if to_sql_where is not None:
                field_mapping = {f: f for f in self.get_fields().keys()}
                try:
                    # Pass through as-is. Wrapping columns in TRY_CAST blinds Parquet
                    # row-group statistics and forces full-file scans.
                    cql_sql = to_sql_where(filterq, field_mapping)
                    clauses.append(f"({cql_sql})")
                except Exception as e:
                    LOGGER.error(f"Failed to compile CQL2 to SQL: {e}")
            else:
                LOGGER.warning('pygeofilter is not installed. CQL2 filters are ignored.')

        return ('WHERE ' + ' AND '.join(clauses)) if clauses else '', params

    def _count(self, where: str, params: list) -> int:
        cache_key = f"{where}|{params}"
        if cache_key not in self._count_cache:
            cur = self._conn.cursor()
            row = cur.execute(
                f"SELECT COUNT(*) FROM read_parquet('{self.data}') {where}", params
            ).fetchone()
            self._count_cache[cache_key] = int(row[0]) if row else 0
        return self._count_cache[cache_key]

    def _get_select_clause(self) -> str:
        """Helper to build a columnar projection string."""
        col_names = [f'"{f}"' for f in self._fields_cache.keys()]
        if f'"{self.id_field}"' not in col_names:
            col_names.insert(0, f'"{self.id_field}"')
        return ', '.join(col_names)

    def _row_to_feature(self, cur, row: tuple) -> dict:
        cols = [d[0] for d in (cur.description or [])]
        geom_idx = next((i for i, c in enumerate(cols) if c == '__geom_json'), None)
        id_idx   = cols.index(self.id_field)
        _exclude = {self._geom_col, '__geom_json', self.id_field, 'ogc_fid', 'OGC_FID'}
        props = {
            name: value
            for name, value in zip(cols, row)
            if name not in _exclude
        }
        geom = (
            json.loads(row[geom_idx])
            if (geom_idx is not None and row[geom_idx])
            else None
        )
        return {
            'type': 'Feature',
            'id': str(row[id_idx]),
            'geometry': geom,
            'properties': props,
        }

    # ------------------------------------------------------------------
    # BaseProvider interface
    # ------------------------------------------------------------------

    def get_fields(self) -> dict:
        """Return field definitions for the /queryables endpoint.

        Priority:
        1. Static schema injected from the YAML provider block by the TypeScript
           config generator — authoritative, rich (titles, enums, formats).
        2. DuckDB-discovered fields from DESCRIBE — auto-detected fallback.
        """
        if self._static_fields is not None:
            return self._static_fields
        return self._fields_cache

    def get(self, identifier, **kwargs):
        cur = self._conn.cursor()
        row = cur.execute(
            f"""
            SELECT {self._get_select_clause()}, {self._geom_to_json()} AS __geom_json
            FROM read_parquet('{self.data}')
            WHERE "{self.id_field}" = ?
            LIMIT 1
            """,
            [identifier],
        ).fetchone()
        if not row:
            raise ProviderItemNotFoundError()
        return self._row_to_feature(cur, row)

    def query(self, offset=0, limit=10, resulttype='results',
              bbox=[], properties=[], skip_geometry=False, filterq=None, **kwargs):
        where, params = self._build_where(bbox, properties, filterq=filterq)
        number_matched = self._count(where, params)

        if resulttype == 'hits':
            return {
                'type': 'FeatureCollection',
                'features': [],
                'numberMatched': number_matched,
                'numberReturned': 0,
            }

        geom_expr = 'NULL AS __geom_json' if skip_geometry else f'{self._geom_to_json()} AS __geom_json'

        cur = self._conn.cursor()
        rows = cur.execute(
            f"""
            SELECT {self._get_select_clause()}, {geom_expr}
            FROM read_parquet('{self.data}')
            {where}
            ORDER BY "{self.id_field}"
            LIMIT ? OFFSET ?
            """,
            params + [limit, offset],
        ).fetchall()

        return {
            'type': 'FeatureCollection',
            'features': [self._row_to_feature(cur, r) for r in rows],
            'numberMatched': number_matched,
            'numberReturned': len(rows),
        }
