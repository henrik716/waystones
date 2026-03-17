import {
  DataModel, SourceConnection, DatabricksConfig
} from '../../types';
import { toTableName } from '../nameSanitizer';
import { getPgConnectionEnv } from './_helpers';

// ============================================================
// Generate delta export script (Python)
// Handles inserts, updates AND deletes.
// ============================================================
export const generateDeltaScript = (
  model: DataModel,
  source: SourceConnection
): string => {
  // If the source is already a GeoPackage, no python extraction script is needed!
  if (source.type === 'geopackage') {
    return `# No Python extraction script required for direct GeoPackage sources.\n`;
  }

  const modelFilename = model.name.replace(/\s/g, '_') || 'modell';
  const isPg = source.type === 'postgis' || source.type === 'supabase';
  const srid = model.crs?.split(':')[1] || '4326';

  // ---- Shared header ----
  let script = `#!/usr/bin/env python3
"""
Delta GeoPackage exporter for ${model.name}
Generated: ${new Date().toISOString()}
Source type: ${source.type}

Handles inserts, updates AND deletes automatically.
Delete detection works via FID diff — no changes to your database needed.

Usage:
  python delta_export.py                    # Full export (resets state)
  python delta_export.py --since last       # Delta since last run
  python delta_export.py --since 2024-01-01 # Delta since specific date

Requires: psycopg2 (pip install psycopg2-binary)
"""
import os
import sys
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

OUTPUT_DIR = os.environ.get("OUTPUT_DIR", "/data/output")
STATE_FILE = os.path.join(OUTPUT_DIR, ".delta_state.json")
MODEL_NAME = "${modelFilename}"


# ============================================================
# State management
# State stores per layer: last_sync timestamp + set of known FIDs
# ============================================================

def load_state():
    if Path(STATE_FILE).exists():
        with open(STATE_FILE) as f:
            return json.load(f)
    return {}


def save_state(state):
    Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


def get_since(args, layer_id):
    """Resolve the --since argument."""
    if "--since" not in args:
        return None  # full export
    idx = args.index("--since")
    val = args[idx + 1] if idx + 1 < len(args) else "last"
    if val == "last":
        state = load_state()
        return state.get(layer_id, {}).get("last_sync")
    return val

`;

  // ---- PG connection helper ----
  if (isPg) {
    const pgEnv = getPgConnectionEnv(source)!;
    script += `
# ============================================================
# Database connection
# ============================================================

def get_pg_conn_string():
    """OGR connection string for ogr2ogr."""
    host = os.environ.get("POSTGRES_HOST", "${pgEnv.POSTGRES_HOST}")
    port = os.environ.get("POSTGRES_PORT", "${pgEnv.POSTGRES_PORT}")
    dbname = os.environ.get("POSTGRES_DB", "${pgEnv.POSTGRES_DB}")
    user = os.environ.get("POSTGRES_USER", "${pgEnv.POSTGRES_USER}")
    password = os.environ.get("POSTGRES_PASSWORD", "${pgEnv.POSTGRES_PASSWORD}")
    schema = os.environ.get("POSTGRES_SCHEMA", "${pgEnv.POSTGRES_SCHEMA}")
    return f"PG:host={host} port={port} dbname={dbname} user={user} password={password} schemas={schema}"

PG_CONN = get_pg_conn_string()


def pg_connect():
    """Direct psycopg2 connection for FID queries."""
    import psycopg2
    return psycopg2.connect(
        host=os.environ.get("POSTGRES_HOST", "${pgEnv.POSTGRES_HOST}"),
        port=int(os.environ.get("POSTGRES_PORT", "${pgEnv.POSTGRES_PORT}")),
        dbname=os.environ.get("POSTGRES_DB", "${pgEnv.POSTGRES_DB}"),
        user=os.environ.get("POSTGRES_USER", "${pgEnv.POSTGRES_USER}"),
        password=os.environ.get("POSTGRES_PASSWORD", "${pgEnv.POSTGRES_PASSWORD}"),
        options=f"-c search_path={os.environ.get('POSTGRES_SCHEMA', '${pgEnv.POSTGRES_SCHEMA}')}"
    )


def fetch_current_pks(table, pk_col="fid"):
    """Get the set of all current primary keys from a table. Fast — just a PK index scan."""
    conn = pg_connect()
    try:
        cur = conn.cursor()
        cur.execute(f'SELECT "{pk_col}" FROM "{table}"')
        pks = {row[0] for row in cur.fetchall()}
        cur.close()
        return pks
    finally:
        conn.close()

`;
  }

  // ---- Per-layer export functions ----
  model.layers.forEach(layer => {
    const mapping = source.layerMappings?.[layer.id];
    if (!mapping) return;

    const tbl = toTableName(layer.name);
    const sourceTable = mapping.sourceTable || tbl;
    const tsCol = mapping.timestampColumn;
    const geomCol = layer.geometryColumnName || 'geom';
    const pkCol = mapping.primaryKeyColumn || 'fid';

    if (isPg) {
      script += `
# ============================================================
# ${layer.name}
# Source table: ${sourceTable}
# Primary key: ${pkCol}
# Timestamp column: ${tsCol || '(none — full diff for updates)'}
# Delete detection: automatic PK diff
# ============================================================

def export_${tbl}(since=None):
    now = datetime.now(timezone.utc).isoformat()
    state = load_state()
    layer_state = state.get("${layer.id}", {})
    previous_pks = set(layer_state.get("pks", []))

    # --- Step 1: Get current PKs from source ---
    current_pks = fetch_current_pks("${sourceTable}", "${pkCol}")
    print(f"  [${tbl}] {len(current_pks)} features in source, {len(previous_pks)} in previous state")

    if since is None:
        # --- FULL EXPORT (no delta, reset state) ---
        output = os.path.join(OUTPUT_DIR, f"${tbl}_full.gpkg")
        cmd = [
            "ogr2ogr", "-f", "GPKG", output,
            PG_CONN, "${sourceTable}",
            "-nln", "${tbl}",
            "-a_srs", "EPSG:${srid}",
            "-overwrite"
        ]
        print(f"  [${tbl}] Full export → {output}")
        subprocess.run(cmd, check=True)

        # Save state: timestamp + all PKs
        state["${layer.id}"] = {
            "last_sync": now,
            "pks": sorted(current_pks),
            "output": output
        }
        save_state(state)
        return output

    # --- DELTA EXPORT ---
    output = os.path.join(OUTPUT_DIR, f"${tbl}_delta_{now[:10]}.gpkg")

    # Step 2: Detect deletes (PKs that disappeared)
    deleted_pks = previous_pks - current_pks
    if deleted_pks:
        print(f"  [${tbl}] {len(deleted_pks)} deletes detected")

    # Step 3: Detect inserts (PKs that are new)
    inserted_pks = current_pks - previous_pks
    if inserted_pks:
        print(f"  [${tbl}] {len(inserted_pks)} new features detected")

`;

      if (tsCol) {
        script += `    # Step 4: Export inserts + updates (timestamp-based)
    if inserted_pks:
        pk_csv = ','.join(str(f) for f in sorted(inserted_pks))
        change_type_expr = f'CASE WHEN "${pkCol}" IN ({pk_csv}) THEN \\'insert\\' ELSE \\'update\\' END'
        pk_filter = f'OR "${pkCol}" IN ({pk_csv})'
    else:
        change_type_expr = "'update'"
        pk_filter = ""

    sql_changes = f"""
        SELECT *, {change_type_expr} as _change_type
        FROM "${sourceTable}"
        WHERE "${tsCol}" > '{since}'
           {pk_filter}
    """ if since else None

    has_changes = False

    if sql_changes:
        cmd = [
            "ogr2ogr", "-f", "GPKG", output,
            PG_CONN, "-sql", sql_changes,
            "-nln", "${tbl}",
            "-a_srs", "EPSG:${srid}"
        ]
        subprocess.run(cmd, check=True)
        has_changes = True

`;
      } else {
        script += `    # Step 4: Export inserts (PK-based, no timestamp available)
    # NOTE: Without a timestamp column, updates to existing features
    # cannot be detected. Only inserts and deletes are tracked.
    has_changes = False

    if inserted_pks:
        pk_list = ','.join(str(f) for f in inserted_pks)
        sql_inserts = f"""
            SELECT *, 'insert' as _change_type
            FROM "${sourceTable}"
            WHERE "${pkCol}" IN ({pk_list})
        """
        cmd = [
            "ogr2ogr", "-f", "GPKG", output,
            PG_CONN, "-sql", sql_inserts,
            "-nln", "${tbl}",
            "-a_srs", "EPSG:${srid}"
        ]
        subprocess.run(cmd, check=True)
        has_changes = True

`;
      }

      // Common delete-handling + state saving for PG layers
      script += `    # Step 5: Append deletes to the delta GeoPackage
    # Deletes are stored as rows with only the PK + _change_type = 'delete'
    if deleted_pks:
        import tempfile
        delete_geojson = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {"${pkCol}": pk, "_change_type": "delete"},
                    "geometry": None
                }
                for pk in sorted(deleted_pks)
            ]
        }
        with tempfile.NamedTemporaryFile(mode="w", suffix=".geojson", delete=False) as f:
            json.dump(delete_geojson, f)
            tmp_path = f.name

        append_flag = ["-append"] if has_changes else []
        cmd = [
            "ogr2ogr", "-f", "GPKG", output,
            tmp_path,
            "-nln", "${tbl}_deletes",
            *append_flag
        ]
        subprocess.run(cmd, check=True)
        os.unlink(tmp_path)
        has_changes = True

    if not has_changes:
        print(f"  [${tbl}] No changes detected")
    else:
        print(f"  [${tbl}] Delta → {output}")

    # Step 6: Update state with current PKs
    state["${layer.id}"] = {
        "last_sync": now,
        "pks": sorted(current_pks),
        "output": output
    }
    save_state(state)
    return output if has_changes else None

`;
    } else {
      // ---- Databricks path ----
      script += `
# ============================================================
# ${layer.name} (Databricks)
# Source table: ${(source.config as DatabricksConfig).catalog}.${(source.config as DatabricksConfig).schema}.${sourceTable}
# Primary key: ${pkCol}
# ============================================================

def export_${tbl}(since=None):
    from databricks import sql as dbsql
    import geopandas as gpd
    import pandas as pd
    from shapely import wkt

    now = datetime.now(timezone.utc).isoformat()
    state = load_state()
    layer_state = state.get("${layer.id}", {})
    previous_pks = set(layer_state.get("pks", []))

    conn = dbsql.connect(
        server_hostname="${(source.config as DatabricksConfig).host}",
        http_path="${(source.config as DatabricksConfig).httpPath}",
        access_token=os.environ.get("DATABRICKS_TOKEN", "${(source.config as DatabricksConfig).token}")
    )
    cursor = conn.cursor()
    full_table = "${(source.config as DatabricksConfig).catalog}.${(source.config as DatabricksConfig).schema}.${sourceTable}"

    # Get all current PKs
    cursor.execute(f"SELECT ${pkCol} FROM {full_table}")
    current_pks = {row[0] for row in cursor.fetchall()}
    print(f"  [${tbl}] {len(current_pks)} features in source, {len(previous_pks)} in previous state")

    # Detect deletes
    deleted_pks = previous_pks - current_pks
    inserted_pks = current_pks - previous_pks
    if deleted_pks:
        print(f"  [${tbl}] {len(deleted_pks)} deletes detected")
    if inserted_pks:
        print(f"  [${tbl}] {len(inserted_pks)} new features detected")

    if since is None:
        # Full export
        cursor.execute(f"SELECT * FROM {full_table}")
    else:
`;

      if (tsCol) {
        script += `        # Changed + new features
        if inserted_pks:
            pk_csv = ','.join(str(f) for f in sorted(inserted_pks))
            pk_filter = f'OR ${pkCol} IN ({pk_csv})'
        else:
            pk_filter = ""
        cursor.execute(f"""
            SELECT * FROM {full_table}
            WHERE ${tsCol} > '{since}' {pk_filter}
        """)
`;
      } else {
        script += `        # No timestamp — only new features
        if inserted_pks:
            pk_csv = ','.join(str(f) for f in inserted_pks)
            cursor.execute(f"SELECT * FROM {full_table} WHERE ${pkCol} IN ({pk_csv})")
        else:
            cursor.execute(f"SELECT * FROM {full_table} WHERE 1=0")  # empty result
`;
      }

      script += `
    rows = cursor.fetchall()
    columns = [desc[0] for desc in cursor.description]
    conn.close()

    output = os.path.join(OUTPUT_DIR, f"${tbl}_{'full' if since is None else 'delta_' + now[:10]}.gpkg")

    if rows:
        df = pd.DataFrame(rows, columns=columns)
        if "${geomCol}" in df.columns:
            gdf = gpd.GeoDataFrame(df, geometry=gpd.GeoSeries.from_wkt(df["${geomCol}"]), crs="EPSG:${srid}")
        else:
            gdf = gpd.GeoDataFrame(df)
        if since is not None:
            gdf["_change_type"] = gdf["${pkCol}"].apply(lambda f: "insert" if f in inserted_pks else "update")
        gdf.to_file(output, driver="GPKG", layer="${tbl}")

    # Append deletes
    if deleted_pks and since is not None:
        delete_df = pd.DataFrame([
            {"${pkCol}": pk, "_change_type": "delete"} for pk in sorted(deleted_pks)
        ])
        delete_gdf = gpd.GeoDataFrame(delete_df)
        delete_gdf.to_file(output, driver="GPKG", layer="${tbl}_deletes", mode="a" if rows else "w")

    has_changes = bool(rows) or bool(deleted_pks)
    if has_changes:
        print(f"  [${tbl}] {'Full' if since is None else 'Delta'} → {output}")
    else:
        print(f"  [${tbl}] No changes detected")

    # Update state
    state["${layer.id}"] = {
        "last_sync": now,
        "pks": sorted(current_pks),
        "output": output
    }
    save_state(state)
    return output if has_changes else None

`;
    }
  });

  // ---- Main function ----
  script += `
# ============================================================
# Main
# ============================================================

def main():
    is_delta = "--since" in sys.argv
    mode = "DELTA" if is_delta else "FULL"
    print(f"=== {mode} export for ${model.name} ===")
    print(f"    Time: {datetime.now(timezone.utc).isoformat()}")
    Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)

    results = {}
`;

  model.layers.forEach(layer => {
    const mapping = source.layerMappings?.[layer.id];
    if (!mapping) return;
    const tbl = toTableName(layer.name);

    script += `
    since_${tbl} = get_since(sys.argv, "${layer.id}")
    results["${tbl}"] = export_${tbl}(since=since_${tbl})
`;
  });

  script += `
    # Summary
    print()
    print("=== Summary ===")
    for layer, output in results.items():
        status = f"→ {output}" if output else "(no changes)"
        print(f"  {layer}: {status}")
    print("=== Done ===")


if __name__ == "__main__":
    main()
`;

  return script;
};
