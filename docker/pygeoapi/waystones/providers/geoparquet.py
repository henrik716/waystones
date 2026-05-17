"""
pygeoapi provider for GeoParquet files via DuckDB.

Supports two connection modes based on the ``data`` URL scheme:

* ``s3://bucket/path/file.parquet``   → S3-compatible object storage (AWS, Cloudflare R2,
                                        MinIO, etc.). Credentials from provider options or
                                        the standard AWS environment variables.
* ``https://cdn.example.com/...``     → Public HTTPS, CDN-cached range requests.
                                        No credentials required.

DuckDB is fetched as an optional dependency. Install it with::

    pip install duckdb

Provider options (all optional):

    options:
        s3_endpoint:         <host:port>   # Omit for AWS; set for S3-compatible endpoints
        s3_access_key_id:    <key>         # Falls back to AWS_ACCESS_KEY_ID env var
        s3_secret_access_key: <secret>    # Falls back to AWS_SECRET_ACCESS_KEY env var

Performance notes:

* One DuckDB in-memory connection is shared across all provider instances within a
  single worker process. This is intentional: it preserves the HTTP keep-alive pool,
  the in-memory Parquet metadata cache, and the spatial extension load across
  collections. Under Gunicorn's pre-fork model each worker has its own connection.
  Set ``workers: 1`` or use a threading worker class if you need a true singleton.

* Parquet row-group pruning is applied via numeric bbox columns (``bbox.*`` struct or
  ``bbox_xmin/ymin/xmax/ymax`` flat columns) before the geometry intersection test,
  so only relevant row groups are transferred from remote storage.
"""
import json
import logging
import os
import threading

from pygeoapi.provider.base import (
    BaseProvider,
    ProviderConnectionError,
    ProviderItemNotFoundError,
)

try:
    import duckdb as _duckdb
except ImportError:
    _duckdb = None

try:
    from pygeofilter.backends.sql import to_sql_where
except ImportError:
    to_sql_where = None

LOGGER = logging.getLogger(__name__)

# DuckDB logical type → OGC property type
_DUCK_TO_OGC = {
    'INTEGER': 'integer', 'INT': 'integer', 'INT4': 'integer', 'INT2': 'integer',
    'BIGINT': 'integer', 'INT8': 'integer', 'HUGEINT': 'integer', 'UBIGINT': 'integer',
    'FLOAT': 'number', 'DOUBLE': 'number', 'REAL': 'number', 'DECIMAL': 'number',
    'BOOLEAN': 'boolean', 'BOOL': 'boolean',
}

# ---------------------------------------------------------------------------
# Worker-process-scoped shared state
#
# One DuckDB connection per worker process is shared across all provider
# instances (collections). This keeps the HTTP keep-alive pool and DuckDB's
# in-memory object/metadata caches alive between requests, which is critical
# for remote Parquet performance. The lock protects one-time initialization
# only; individual queries use cursor() and are thread-safe.
# ---------------------------------------------------------------------------
_SHARED_CONN = None
_SPATIAL_LOADED = False
_META_CACHE: dict = {}   # data_url → metadata dict
_LOCK = threading.Lock()


def _ogc_type(duckdb_type: str) -> str:
    """Map a DuckDB column type string to an OGC property type string."""
    if not duckdb_type:
        return 'string'
    return _DUCK_TO_OGC.get(duckdb_type.upper().split('(')[0], 'string')


class GeoParquetDuckDBProvider(BaseProvider):
    """
    pygeoapi provider for GeoParquet files accessed via DuckDB + httpfs.

    Supports S3-compatible storage and public HTTPS. Pagination is handled
    via native SQL LIMIT/OFFSET against the remote file — no local download.

    Example pygeoapi configuration::

        providers:
            - type: feature
              name: GeoParquetDuckDB
              data: s3://my-bucket/dataset.parquet
              id_field: ogc_fid
              options:
                  s3_endpoint: <account>.r2.cloudflarestorage.com
                  s3_access_key_id: ${R2_ACCESS_KEY_ID}
                  s3_secret_access_key: ${R2_SECRET_ACCESS_KEY}
    """

    def __init__(self, provider_def: dict):
        if _duckdb is None:
            raise ProviderConnectionError(
                'duckdb is required for GeoParquetDuckDBProvider. '
                'Install it with: pip install duckdb'
            )

        super().__init__(provider_def)
        options = self.options or {}

        # Optional injected schema — richer type/title/enum info from the
        # config generator. When present it takes precedence over the types
        # inferred by DuckDB DESCRIBE. Keys must match the actual column names.
        injected_schema = provider_def.get('schema') or options.get('schema') or {}
        raw_props = injected_schema.get('properties') if isinstance(injected_schema, dict) else None

        if raw_props and isinstance(raw_props, dict):
            self._static_fields = {}
            for name, info in raw_props.items():
                if isinstance(info, dict):
                    field_def = {
                        'type': info.get('type', 'string'),
                        'title': info.get('title', name),
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
                _SHARED_CONN = self._init_connection(options)
            self._conn = _SHARED_CONN

            if self.data not in _META_CACHE:
                # Accept pre-baked metadata to avoid a round-trip DESCRIBE on
                # startup. Any caller that pre-computes field/geometry info can
                # pass it in as ``_prebaked_metadata`` inside provider_def.
                pre = provider_def.get('_prebaked_metadata')
                if pre and 'geom_col' in pre:
                    LOGGER.info(
                        'Using pre-baked metadata for %s (skipping DESCRIBE)', self.data
                    )
                    _META_CACHE[self.data] = {
                        'geom_col':        pre['geom_col'],
                        'geom_is_native':  bool(pre.get('geom_is_native', True)),
                        'source_crs':      pre.get('source_crs') or None,
                        'fields_cache':    {
                            col: {'type': 'string', 'title': col}
                            for col in (pre.get('columns') or [])
                        },
                        'count_cache':     {},
                        'has_bbox_struct': bool(pre.get('has_bbox_struct', False)),
                        'has_bbox_cols':   bool(pre.get('has_bbox_cols', True)),
                    }
                else:
                    _META_CACHE[self.data] = self._discover_metadata()

        self._apply_metadata(_META_CACHE[self.data])
        self._fields = self.get_fields()

    # ------------------------------------------------------------------
    # Connection bootstrap
    # ------------------------------------------------------------------

    @staticmethod
    def _init_connection(options: dict):
        """Create and configure the shared DuckDB in-memory connection."""
        LOGGER.info('Initializing shared DuckDB connection for worker process')
        conn = _duckdb.connect(':memory:')

        ext_dir = os.environ.get('DUCKDB_EXTENSION_DIRECTORY', '/duckdb-extensions')
        conn.execute(f"SET extension_directory='{ext_dir}'")
        conn.execute('LOAD httpfs')
        conn.execute('SET enable_http_metadata_cache = true')
        conn.execute('SET enable_object_cache = true')

        ddb_version_str = _duckdb.__version__
        LOGGER.info('DuckDB version: %s', ddb_version_str)
        ddb_version = tuple(map(int, ddb_version_str.split('.')[:3]))

        # Resolve S3-compatible endpoint from options or environment.
        # The ``s3_endpoint`` option should be a bare host (no scheme, no trailing slash).
        endpoint = (
            options.get('s3_endpoint') or
            os.environ.get('AWS_ENDPOINT_URL') or
            os.environ.get('S3_ENDPOINT') or
            os.environ.get('AWS_S3_ENDPOINT', '')
        )
        if endpoint:
            if '://' in endpoint:
                endpoint = endpoint.split('://')[-1]
            endpoint = endpoint.rstrip('/')

            key = options.get('s3_access_key_id') or os.environ.get('AWS_ACCESS_KEY_ID', '')
            secret = (
                options.get('s3_secret_access_key') or
                os.environ.get('AWS_SECRET_ACCESS_KEY', '')
            )

            if ddb_version >= (1, 5, 0):
                # DuckDB ≥1.5: SET s3_* only applies to connection.execute(), not to
                # cursor.execute(). CREATE SECRET propagates to all execution contexts.
                conn.execute(f"""
                    CREATE OR REPLACE SECRET s3_provider_secret (
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

        # On DuckDB <1.5, spatial must be loaded before any GeoParquet DESCRIBE.
        if ddb_version < (1, 5, 0):
            conn.execute('LOAD spatial')
            global _SPATIAL_LOADED
            _SPATIAL_LOADED = True

        return conn

    # ------------------------------------------------------------------
    # Metadata discovery — runs once per data URL per worker process
    # ------------------------------------------------------------------

    def _discover_metadata(self) -> dict:
        """Derive geometry, CRS, and field metadata from the Parquet file schema."""
        schema = self._conn.execute(
            f"DESCRIBE SELECT * FROM read_parquet('{self.data}')"
        ).fetchall()

        # Read GeoParquet ``geo`` key-value metadata for geometry column name and CRS.
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
                (name for name, dtype, *_ in schema
                 if dtype and dtype.upper().startswith('GEOMETRY')),
                None,
            ) or next(
                (name for name, *_ in schema
                 if name.lower() in ('geometry', 'geom', 'wkb_geometry')),
                'geometry',
            )

        geom_is_native = any(
            name == geom_col and dtype and dtype.upper().startswith('GEOMETRY')
            for name, dtype, *_ in schema
        )

        # Detect a non-WGS84 source CRS so queries can reproject on the fly.
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
        has_bbox_cols = all(
            c in schema_names for c in ['bbox_xmin', 'bbox_ymin', 'bbox_xmax', 'bbox_ymax']
        )

        exclude_fields = {
            geom_col.lower(), 'ogc_fid', 'bbox',
            'bbox_xmin', 'bbox_ymin', 'bbox_xmax', 'bbox_ymax',
        }
        fields_cache = {
            name: {'type': _ogc_type(dtype), 'title': name}
            for name, dtype, *_ in schema
            if name.lower() not in exclude_fields
        }

        return {
            'geom_col':        geom_col,
            'geom_is_native':  geom_is_native,
            'source_crs':      source_crs,
            'fields_cache':    fields_cache,
            'count_cache':     {},
            'has_bbox_struct': has_bbox_struct,
            'has_bbox_cols':   has_bbox_cols,
        }

    def _apply_metadata(self, meta: dict):
        self._geom_col        = meta['geom_col']
        self._geom_is_native  = meta['geom_is_native']
        self._source_crs      = meta['source_crs']
        self._fields_cache    = meta['fields_cache']
        self._count_cache     = meta['count_cache']
        self._has_bbox_struct = meta.get('has_bbox_struct', False)
        self._has_bbox_cols   = meta.get('has_bbox_cols', False)

    # ------------------------------------------------------------------
    # SQL expression helpers
    # ------------------------------------------------------------------

    def _ensure_spatial(self):
        """Load the DuckDB spatial extension once per worker (lazy on DuckDB ≥1.5)."""
        global _SPATIAL_LOADED
        if _SPATIAL_LOADED:
            return
        with _LOCK:
            if _SPATIAL_LOADED:
                return
            LOGGER.info('Loading DuckDB spatial extension')
            self._conn.execute('LOAD spatial')
            _SPATIAL_LOADED = True

    def _geom_to_json(self) -> str:
        """SQL expression that yields a GeoJSON string for each row."""
        self._ensure_spatial()
        if self._geom_is_native:
            if self._source_crs:
                return (
                    f"ST_AsGeoJSON(ST_Transform(\"{self._geom_col}\","
                    f" '{self._source_crs}', 'EPSG:4326', true))"
                )
            return f'ST_AsGeoJSON("{self._geom_col}")'
        return f'ST_AsGeoJSON(ST_GeomFromWKB("{self._geom_col}"))'

    def _geom_for_filter(self) -> str:
        """Geometry expression in WGS84 (lon/lat) used for bbox intersection tests."""
        self._ensure_spatial()
        if self._geom_is_native:
            if self._source_crs:
                return (
                    f"ST_Transform(\"{self._geom_col}\","
                    f" '{self._source_crs}', 'EPSG:4326', true)"
                )
            return f'"{self._geom_col}"'
        return f'ST_GeomFromWKB("{self._geom_col}")'

    def _build_where(self, bbox: list, properties: list, filterq=None) -> tuple[str, list]:
        """Build a WHERE clause and positional parameter list for a query."""
        clauses: list[str] = []
        params: list = []

        if len(bbox) == 4:
            minx, miny, maxx, maxy = bbox

            # Push numeric bbox predicates first so DuckDB can prune row groups
            # before evaluating the geometry intersection. This is what avoids
            # unnecessary range requests against the remote object store.
            if self._has_bbox_struct:
                clauses.append(
                    'bbox.xmin <= ? AND bbox.xmax >= ? AND bbox.ymin <= ? AND bbox.ymax >= ?'
                )
                params.extend([maxx, minx, maxy, miny])
            elif self._has_bbox_cols:
                clauses.append(
                    'bbox_xmin <= ? AND bbox_xmax >= ? AND bbox_ymin <= ? AND bbox_ymax >= ?'
                )
                params.extend([maxx, minx, maxy, miny])

            # ST_MakeEnvelope is the optimized envelope constructor.
            # Do NOT substitute a WKT POLYGON via ST_GeomFromText —
            # that bypasses the bbox fast path in the spatial extension.
            clauses.append(
                f'ST_Intersects({self._geom_for_filter()}, ST_MakeEnvelope(?, ?, ?, ?))'
            )
            params.extend([minx, miny, maxx, maxy])

        for name, value in (properties or []):
            clauses.append(f'"{name}" = ?')
            params.append(value)

        if filterq is not None:
            if to_sql_where is not None:
                field_mapping = {f: f for f in self.get_fields().keys()}
                try:
                    # Column names are passed through unmodified. Wrapping them in
                    # TRY_CAST would blind Parquet row-group statistics and force
                    # full-file scans.
                    cql_sql = to_sql_where(filterq, field_mapping)
                    clauses.append(f'({cql_sql})')
                except Exception as e:
                    LOGGER.error('Failed to compile CQL2 filter to SQL: %s', e)
            else:
                LOGGER.warning(
                    'pygeofilter is not installed; CQL2 filters will be ignored'
                )

        where = ('WHERE ' + ' AND '.join(clauses)) if clauses else ''
        return where, params

    def _build_orderby(self, sortby: list | None) -> str:
        """Build an ORDER BY clause from a pygeoapi sortby list."""
        if not sortby:
            return f'ORDER BY "{self.id_field}"'
        parts = []
        for s in sortby:
            prop = s.get('property', self.id_field)
            direction = 'DESC' if s.get('order', '+') == '-' else 'ASC'
            parts.append(f'"{prop}" {direction}')
        return 'ORDER BY ' + ', '.join(parts)

    def _count(self, where: str, params: list) -> int:
        """Return the total row count for a WHERE clause, with per-instance caching."""
        cache_key = f'{where}|{params}'
        if cache_key not in self._count_cache:
            cur = self._conn.cursor()
            row = cur.execute(
                f"SELECT COUNT(*) FROM read_parquet('{self.data}') {where}", params
            ).fetchone()
            self._count_cache[cache_key] = int(row[0]) if row else 0
        return self._count_cache[cache_key]

    def _select_clause(self) -> str:
        """Columnar projection for all non-geometry, non-bbox fields."""
        col_names = [f'"{f}"' for f in self._fields_cache.keys()]
        if f'"{self.id_field}"' not in col_names:
            col_names.insert(0, f'"{self.id_field}"')
        return ', '.join(col_names)

    def _row_to_feature(self, cur, row: tuple) -> dict:
        """Convert a DuckDB result row to a GeoJSON Feature dict."""
        cols = [d[0] for d in (cur.description or [])]
        geom_idx = next((i for i, c in enumerate(cols) if c == '__geom_json'), None)
        id_idx = cols.index(self.id_field)
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
        """Return field definitions used by the /queryables endpoint.

        The injected static schema (from the YAML ``schema`` block) takes
        priority when present, as it carries richer metadata (titles, enums,
        formats). The DuckDB-derived ``_fields_cache`` is the automatic fallback.
        """
        if self._static_fields is not None:
            return self._static_fields
        return self._fields_cache

    def get(self, identifier, **kwargs) -> dict:
        """Return a single feature by identifier."""
        cur = self._conn.cursor()
        row = cur.execute(
            f"""
            SELECT {self._select_clause()}, {self._geom_to_json()} AS __geom_json
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
              bbox=[], properties=[], sortby=[], skip_geometry=False,
              filterq=None, **kwargs) -> dict:
        """Query the GeoParquet file and return a GeoJSON FeatureCollection."""
        where, params = self._build_where(bbox, properties, filterq=filterq)
        number_matched = self._count(where, params)

        if resulttype == 'hits':
            return {
                'type': 'FeatureCollection',
                'features': [],
                'numberMatched': number_matched,
                'numberReturned': 0,
            }

        geom_expr = (
            'NULL AS __geom_json' if skip_geometry
            else f'{self._geom_to_json()} AS __geom_json'
        )
        order_by = self._build_orderby(sortby)

        cur = self._conn.cursor()
        rows = cur.execute(
            f"""
            SELECT {self._select_clause()}, {geom_expr}
            FROM read_parquet('{self.data}')
            {where}
            {order_by}
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
