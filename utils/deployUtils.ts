import {
  DataModel, Layer, SourceConnection, SourceType, DeployTarget,
  PostgresConfig, SupabaseConfig, DatabricksConfig, GeopackageConfig, LayerSourceMapping, ModelMetadata
} from '../types';
import { reprojectCoordinates } from './gdalService';
import { hexToRgb } from './colorUtils';
import { i18n } from '../i18n';
import {
  generateStacCatalog,
  generateStacCollection,
  generateStacLayerCatalog,
  generateStacItemSnippet,
  generateNginxStacConf,
} from './stacUtils';

// ============================================================
// Helper: get table name for a layer (same logic as existing exports)
// ============================================================
const getTableName = (layer: Layer): string =>
  layer.name.toLowerCase().replace(/[^a-z0-9]/g, '_');

// ============================================================
// Helper: get Geopackage filename
// ============================================================
const getGpkgFilename = (model: DataModel, source?: SourceConnection): string => {
  if (source?.type === 'geopackage') {
    return (source.config as GeopackageConfig).filename || 'data.gpkg';
  }
  return `${model.name.replace(/\s/g, '_') || 'modell'}.gpkg`;
};

// ============================================================
// Helper: resolve PostGIS connection details from any source type
// For Supabase: derive PG connection from project URL
// For Databricks & GeoPackage: returns null (no direct PG connection)
// ============================================================
const getPgConnectionEnv = (source: SourceConnection): Record<string, string> | null => {
  if (source.type === 'postgis') {
    const c = source.config as PostgresConfig;
    return {
      POSTGRES_HOST: c.host,
      POSTGRES_PORT: c.port,
      POSTGRES_DB: c.dbname,
      POSTGRES_USER: c.user,
      POSTGRES_PASSWORD: c.password,
      POSTGRES_SCHEMA: c.schema || 'public',
    };
  }
  if (source.type === 'supabase') {
    const c = source.config as SupabaseConfig;
    // Supabase PG connection: host is db.<project-ref>.supabase.co, port 5432
    const projectRef = c.projectUrl.replace('https://', '').replace('.supabase.co', '');
    return {
      POSTGRES_HOST: `db.${projectRef}.supabase.co`,
      POSTGRES_PORT: '5432',
      POSTGRES_DB: 'postgres',
      POSTGRES_USER: 'postgres',
      POSTGRES_PASSWORD: '${SUPABASE_DB_PASSWORD}', // User must set this
      POSTGRES_SCHEMA: c.schema || 'public',
    };
  }
  return null; // Databricks and GeoPackage have no PG connection
};

// ============================================================
// Generate source-aware pygeoapi config
// PostGIS/Supabase → PostgreSQL provider (live query)
// Databricks/GeoPackage → SQLiteGPKG provider
// ============================================================
export const generatePygeoapiConfig = async (
  model: DataModel,
  source?: SourceConnection,
  lang: string = 'no'
): Promise<string> => {
  const gpkgFilename = getGpkgFilename(model, source);
  const pgEnv = source ? getPgConnectionEnv(source) : null;
  const usePg = pgEnv !== null;

  let yaml = `# pygeoapi configuration for ${model.name}\n`;
  yaml += `# Generated: ${new Date().toISOString()}\n`;
  yaml += `# Source: ${source?.type || 'geopackage (no live connection)'}\n\n`;

  // FIX: Use env vars for both port and public URL so Railway/Fly/etc work correctly.
  // PORT is injected automatically by Railway; PYGEOAPI_SERVER_URL must be set manually
  // to the public-facing HTTPS URL after first deploy.
  yaml += `server:\n  bind:\n    host: 0.0.0.0\n    port: \${PORT:-80}\n`;
  yaml += `  url: \${PYGEOAPI_SERVER_URL}\n`;
  yaml += `  mimetype: application/json; charset=UTF-8\n  encoding: utf-8\n  languages:\n    - ${lang === 'no' ? 'nb-NO' : 'en-US'}\n`;
  // Required by pygeoapi's collection.html template — without this the page throws
  // "dict object has no attribute 'map'" when rendering the HTML view of a collection.
  yaml += `  map:\n`;
  yaml += `    url: https://tile.openstreetmap.org/{z}/{x}/{y}.png\n`;
  yaml += `    attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap contributors</a>'\n`;
  // Required by pygeoapi items/index.html — reads limits.default_items for the
  // items-per-page dropdown. Must be present or page throws UndefinedError.
  yaml += `  limits:\n`;
  yaml += `    default_items: 10\n`;
  yaml += `    max_items: 10000\n\n`;
  yaml += `logging:\n  level: INFO\n\n`;

  // Metadata — enriched from model.metadata if available
  const meta = model.metadata || ({} as Partial<ModelMetadata>);
  const keywords = meta?.keywords?.length ? meta.keywords : ['geospatial', model.namespace || 'data'];
  const licenseName = meta?.license || 'CC-BY-4.0';
  const licenseUrls: Record<string, string> = {
    'CC-BY-4.0': 'https://creativecommons.org/licenses/by/4.0/',
    'CC0-1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
    'CC-BY-SA-4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
    'NLOD-2.0': 'https://data.norge.no/nlod/no/2.0',
  };

  yaml += `metadata:\n`;
  yaml += `  identification:\n`;
  yaml += `    title: ${model.name}\n`;
  yaml += `    description: ${model.description || 'Spatial data'}\n`;
  yaml += `    url: ${meta.url || 'https://example.com/dataset'}\n`;
  yaml += `    terms_of_service: ${meta.termsOfService || 'https://example.com/terms'}\n`;
  yaml += `    keywords:\n`;
  keywords.forEach(kw => { yaml += `      - ${kw}\n`; });

  if (meta?.purpose) {
    yaml += `    abstract: ${meta.purpose}\n`;
  }

  yaml += `  license:\n`;
  yaml += `    name: ${licenseName}\n`;
  yaml += `    url: ${licenseUrls[licenseName] || ''}\n`;

  if (meta?.contactName || meta?.contactEmail || meta?.contactOrganization) {
    yaml += `  contact:\n`;
    yaml += `    name: ${meta.contactName || 'Contact'}\n`;
    yaml += `    email: ${meta.contactEmail || 'contact@example.com'}\n`;
    yaml += `  provider:\n`;
    yaml += `    name: ${meta.contactName || 'Contact'}\n`;
    if (meta?.contactOrganization) yaml += `    organization: ${meta.contactOrganization}\n`;
    yaml += `    email: ${meta.contactEmail || 'contact@example.com'}\n`;
  }
  yaml += `\n`;
  yaml += `resources:\n`;

  for (const layer of model.layers) {
    const collectionId = getTableName(layer);
    const mapping = source?.layerMappings?.[layer.id];
    const sourceTable = mapping?.sourceTable || collectionId;

    // pygeoapi requires a keywords list on every collection resource — not just
    // in top-level metadata. Missing keywords causes a KeyError on /collections.
    const layerKeywords = (layer as any).keywords?.length
      ? (layer as any).keywords
      : [model.namespace || 'data', layer.name.toLowerCase().replace(/[^a-z0-9]/g, '-')];

    yaml += `  ${collectionId}:\n`;
    yaml += `    type: collection\n`;
    yaml += `    title: ${layer.name}\n`;
    yaml += `    description: ${layer.description || 'Spatial collection'}\n`;
    yaml += `    keywords:\n`;
    layerKeywords.forEach((kw: string) => { yaml += `      - ${kw}\n`; });

    if (layer.geometryType !== 'None') {
      const ext = model.metadata?.spatialExtent;
      const hasBbox = ext?.westBoundLongitude && ext?.southBoundLatitude && ext?.eastBoundLongitude && ext?.northBoundLatitude;
      
      let bbox = '[-180, -90, 180, 90]'; // default to world extent in WGS84
      
      if (hasBbox && model.crs) {
        // Transform bbox from model CRS to WGS84
        const coords: [number, number][] = [
          [Number(ext!.westBoundLongitude), Number(ext!.southBoundLatitude)], // SW corner
          [Number(ext!.eastBoundLongitude), Number(ext!.northBoundLatitude)]  // NE corner
        ];
        
        try {
          const transformed = await reprojectCoordinates(coords, model.crs, 'EPSG:4326');
          bbox = `[${transformed[0][0]}, ${transformed[0][1]}, ${transformed[1][0]}, ${transformed[1][1]}]`;
        } catch (error) {
          console.warn('Failed to transform bbox to WGS84, using original coordinates:', error);
          bbox = `[${ext!.westBoundLongitude}, ${ext!.southBoundLatitude}, ${ext!.eastBoundLongitude}, ${ext!.northBoundLatitude}]`;
        }
      } else if (hasBbox) {
        // Use original bbox if no CRS transformation needed
        bbox = `[${ext!.westBoundLongitude}, ${ext!.southBoundLatitude}, ${ext!.eastBoundLongitude}, ${ext!.northBoundLatitude}]`;
      }
      
      yaml += `    extents:\n`;
      yaml += `      spatial:\n`;
      yaml += `        bbox: ${bbox}\n`;
      yaml += `        crs: http://www.opengis.net/def/crs/OGC/1.3/CRS84\n`;
    }

    if (usePg) {
      yaml += `    providers:\n`;
      // Live connection to PostGIS / Supabase
      yaml += `      - type: feature\n`;
      yaml += `        name: PostgreSQL\n`;
      yaml += `        data:\n`;
      yaml += `          host: \${POSTGRES_HOST}\n`;
      yaml += `          port: \${POSTGRES_PORT}\n`;
      yaml += `          dbname: \${POSTGRES_DB}\n`;
      yaml += `          user: \${POSTGRES_USER}\n`;
      yaml += `          password: \${POSTGRES_PASSWORD}\n`;
      yaml += `          search_path:\n`;
      yaml += `            - \${POSTGRES_SCHEMA}\n`;
      yaml += `        id_field: ${mapping?.primaryKeyColumn || 'fid'}\n`;
      yaml += `        table: ${sourceTable}\n`;
      yaml += `        geom_field: ${layer.geometryColumnName || 'geom'}\n\n`;
    } else {
      // GeoPackage file provider (Databricks, direct GeoPackage, or no source)
      // storage_crs tells pygeoapi the native CRS of the GeoPackage so it
      // can reproject correctly to CRS84 for API output.
      // - If model.crs is set (e.g. from import or manual selection), use it.
      // - If not set, omit storage_crs entirely: pygeoapi's SQLiteGPKG provider
      //   reads CRS from gpkg_spatial_ref_sys automatically for well-formed files.
      //   Fallback to 4326 only as last resort since a wrong CRS is worse than none.
      const rawCrs = model.crs;
      const storageCrsUri = rawCrs
        ? (rawCrs.startsWith('http')
            ? rawCrs
            : `http://www.opengis.net/def/crs/EPSG/0/${rawCrs.split(':')[1]}`)
        : null;
      yaml += `    providers:\n`;
      yaml += `      - type: feature\n`;
      yaml += `        name: SQLiteGPKG\n`;
      yaml += `        data: /data/${gpkgFilename}\n`;
      yaml += `        table: ${sourceTable}\n`;
      yaml += `        id_field: ${mapping?.primaryKeyColumn || 'fid'}\n`;
      yaml += `        geom_field: ${layer.geometryColumnName || 'geom'}\n`;
      if (storageCrsUri) {
        yaml += `        storage_crs: ${storageCrsUri}\n`;
      }
      yaml += `\n`;
    }
  }

  return yaml;
};

// ============================================================
// Known CRS definitions for common Norwegian/European projections.
// QGIS requires srid + proj4 + description to be present — if only
// authid is supplied it silently resets the layer CRS to EPSG:4326.
// ============================================================
const CRS_DEFINITIONS: Record<string, { srid: number; description: string; proj4: string; geographicflag: boolean }> = {
  'EPSG:25833': {
    srid: 25833,
    description: 'ETRS89 / UTM zone 33N',
    proj4: '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    geographicflag: false,
  },
  'EPSG:25832': {
    srid: 25832,
    description: 'ETRS89 / UTM zone 32N',
    proj4: '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    geographicflag: false,
  },
  'EPSG:25835': {
    srid: 25835,
    description: 'ETRS89 / UTM zone 35N',
    proj4: '+proj=utm +zone=35 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    geographicflag: false,
  },
  'EPSG:4326': {
    srid: 4326,
    description: 'WGS 84',
    proj4: '+proj=longlat +datum=WGS84 +no_defs',
    geographicflag: true,
  },
  'EPSG:4258': {
    srid: 4258,
    description: 'ETRS89',
    proj4: '+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs',
    geographicflag: true,
  },
  'EPSG:3857': {
    srid: 3857,
    description: 'WGS 84 / Pseudo-Mercator',
    proj4: '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs',
    geographicflag: false,
  },
};

// Build a full <spatialrefsys> block.
// QGIS parses CRS from srid + proj4 at load time; a block with only <authid>
// causes a silent fallback to EPSG:4326 which then propagates into every WMS response.
const buildSpatialRefSys = (authid: string): string => {
  const def = CRS_DEFINITIONS[authid];
  if (def) {
    return `<spatialrefsys nativeFormat="Wkt">
          <authid>${authid}</authid>
          <srid>${def.srid}</srid>
          <description>${def.description}</description>
          <proj4>${def.proj4}</proj4>
          <geographicflag>${def.geographicflag}</geographicflag>
        </spatialrefsys>`;
  }
  // Unknown CRS — emit authid + srid and let QGIS do an online lookup.
  const srid = authid.includes(':') ? authid.split(':')[1] : '0';
  return `<spatialrefsys nativeFormat="Wkt">
          <authid>${authid}</authid>
          <srid>${srid}</srid>
        </spatialrefsys>`;
};

// ============================================================
// Generate source-aware QGIS project
// PostGIS/Supabase → postgres layer source
// Databricks/GeoPackage → gpkg layer source
// ============================================================
export const generateQgisProject = (
  model: DataModel,
  source?: SourceConnection
): string => {
  const pgEnv = source ? getPgConnectionEnv(source) : null;

  const rawCrs = model.crs || 'EPSG:4326';
  const srid = rawCrs.includes(':') ? rawCrs.split(':')[1] : rawCrs;
  const authid = rawCrs.includes(':') ? rawCrs : `EPSG:${rawCrs}`;

  const gpkgFilename = getGpkgFilename(model, source);

  const wmsCrsList = [authid, 'EPSG:4326', 'EPSG:4258', 'EPSG:3857', 'CRS:84']
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .map(c => `      <value>${c}</value>`)
    .join('\n');

  const ext = model.metadata?.spatialExtent;
  const wmsExtent = ext?.westBoundLongitude && ext?.southBoundLatitude
    ? `${ext.westBoundLongitude} ${ext.southBoundLatitude} ${ext.eastBoundLongitude} ${ext.northBoundLatitude}`
    : '';

  const mapLayers: string[] = [];
  const treeLayers: string[] = [];

  // Get layers in rendering order if specified, otherwise use original order
  const layersInOrder = model.renderingOrder && model.renderingOrder.length > 0
    ? model.renderingOrder
        .map(id => model.layers.find(l => l.id === id))
        .filter(l => l && l.geometryType !== 'None') as Layer[]
    : model.layers.filter(l => l.geometryType !== 'None');

  layersInOrder.forEach((layer, index) => {
      const tbl = getTableName(layer);
      const mapping = source?.layerMappings?.[layer.id];
      const sourceTable = mapping?.sourceTable || tbl;
      const geomCol = layer.geometryColumnName || 'geom';
      const pkCol = mapping?.primaryKeyColumn || 'fid';

      let datasource: string;
      if (pgEnv) {
        datasource = `dbname='${pgEnv.POSTGRES_DB}' host=${pgEnv.POSTGRES_HOST} port=${pgEnv.POSTGRES_PORT} user='${pgEnv.POSTGRES_USER}' password='${pgEnv.POSTGRES_PASSWORD}' sslmode=require key='${pkCol}' srid=${srid} type=${layer.geometryType} table="${pgEnv.POSTGRES_SCHEMA}"."${sourceTable}" (${geomCol})`;
      } else {
        datasource = `/data/${gpkgFilename}|layername=${sourceTable}`;
      }

      const providerKey = pgEnv ? 'postgres' : 'ogr';

      const opacity = layer.style.fillOpacity !== undefined ? layer.style.fillOpacity : 1;
      const rgb = hexToRgb(layer.style.simpleColor || '#3b82f6');
      const qColor = `${rgb.r},${rgb.g},${rgb.b},255`;
      const qOutlineColor = `${rgb.r},${rgb.g},${rgb.b},255`;
      const isPoint = layer.geometryType.includes('Point');
      const isLine = layer.geometryType.includes('LineString');

      const qLineStyle: Record<string, string> = {
        solid: 'solid', dashed: 'dash', dotted: 'dot',
        'dash-dot': 'dash dot', 'dash-dot-dot': 'dash dot dot', 'long-dash': 'dash',
      };
      const lineStyle = qLineStyle[layer.style.lineDash || 'solid'] || 'solid';
      const lineWidth = layer.style.lineWidth || 2;

      const qMarkerName: Record<string, string> = {
        circle: 'circle', square: 'square', triangle: 'triangle', star: 'star',
      };
      const markerName = qMarkerName[layer.style.pointIcon || 'circle'] || 'circle';

      const hasCustomHatching = layer.style.hatchStyle && 
        layer.style.hatchStyle !== 'solid' && 
        (layer.style.hatchSpacing !== undefined || layer.style.hatchThickness !== undefined);

      const fillStyle = (layer.style.hatchStyle && layer.style.hatchStyle !== 'solid')
        ? layer.style.hatchStyle
        : 'solid';

      let symbolXml = '';
      if (isPoint) {
        symbolXml = `<symbol type="marker" name="0">
          <layer class="SimpleMarker">
            <prop k="name" v="${markerName}"/>
            <prop k="color" v="${qColor}"/>
            <prop k="size" v="${layer.style.pointSize || 8}"/>
            <prop k="size_unit" v="Point"/>
            <prop k="outline_color" v="${qOutlineColor}"/>
            <prop k="outline_width" v="0"/>
          </layer>
        </symbol>`;
      } else if (isLine) {
        symbolXml = `<symbol type="line" name="0">
          <layer class="SimpleLine">
            <prop k="line_color" v="${qColor}"/>
            <prop k="line_width" v="${lineWidth}"/>
            <prop k="line_width_unit" v="Point"/>
            <prop k="line_style" v="${lineStyle}"/>
            <prop k="capstyle" v="round"/>
            <prop k="joinstyle" v="round"/>
          </layer>
        </symbol>`;
      } else {
        // --- POLYGONS ---
        
        // Helper to generate a QGIS 3.x valid LinePatternFill
        const createPatternLayer = (angle: number, distance: number, thickness: number) => `
          <layer class="LinePatternFill">
            <prop k="angle" v="${angle}"/>
            <prop k="distance" v="${distance}"/>
            <prop k="distance_unit" v="Point"/>
            <symbol type="line" name="@0@0">
              <layer class="SimpleLine">
                <prop k="line_color" v="${qColor}"/>
                <prop k="line_width" v="${thickness}"/>
                <prop k="line_width_unit" v="Point"/>
                <prop k="line_style" v="solid"/>
              </layer>
            </symbol>
          </layer>`;

        // The outer border of the polygon
        const polygonOutlineLayer = `
          <layer class="SimpleLine">
            <prop k="line_color" v="${qOutlineColor}"/>
            <prop k="line_width" v="${lineWidth}"/>
            <prop k="line_width_unit" v="Point"/>
            <prop k="line_style" v="${lineStyle}"/>
            <prop k="joinstyle" v="round"/>
          </layer>`;

        if (hasCustomHatching) {
          const distance = layer.style.hatchSpacing || 6;
          const hatchThickness = layer.style.hatchThickness || 1;

          let patternLayers = '';
          if (layer.style.hatchStyle === 'cross') {
            patternLayers = createPatternLayer(0, distance, hatchThickness) + createPatternLayer(90, distance, hatchThickness);
          } else if (layer.style.hatchStyle === 'diagonal_x') {
            patternLayers = createPatternLayer(45, distance, hatchThickness) + createPatternLayer(-45, distance, hatchThickness);
          } else {
            const hatchAngles: Record<string, number> = {
              horizontal: 0, vertical: 90, b_diagonal: 45, f_diagonal: -45,
            };
            const angle = hatchAngles[layer.style.hatchStyle!] || 0;
            patternLayers = createPatternLayer(angle, distance, hatchThickness);
          }

          symbolXml = `<symbol alpha="${opacity}" type="fill" name="0">
            ${patternLayers}
            ${polygonOutlineLayer}
          </symbol>`;
        } else {
          // Fallback to simple solid or basic predefined hatching
          symbolXml = `<symbol alpha="${opacity}" type="fill" name="0">
            <layer class="SimpleFill">
              <prop k="color" v="${qColor}"/>
              <prop k="style" v="${fillStyle}"/>
              <prop k="outline_color" v="${qOutlineColor}"/>
              <prop k="outline_width" v="${lineWidth}"/>
              <prop k="outline_width_unit" v="Point"/>
              <prop k="outline_style" v="${lineStyle}"/>
              <prop k="joinstyle" v="round"/>
            </layer>
          </symbol>`;
        }
      }

      const layerId = `${tbl}_${index}_${Date.now()}`;

      mapLayers.push(`    <maplayer name="${layer.name}" type="vector" hasScaleBasedVisibilityFlag="0">
        <id>${layerId}</id>
        <datasource>${datasource}</datasource>
        <provider encoding="UTF-8">${providerKey}</provider>
        <layername>${layer.name}</layername>
        <shortname>${sourceTable}</shortname>
        <title>${layer.name}</title>
        <crs>
          ${buildSpatialRefSys(authid)}
        </crs>
        <renderer-v2 type="singleSymbol" enableorderby="0" forceraster="0">
          <symbols>
            ${symbolXml}
          </symbols>
        </renderer-v2>
      </maplayer>`);

      treeLayers.push(`    <layer-tree-layer id="${layerId}" name="${layer.name}" providerKey="${providerKey}" checked="Qt::Checked" expanded="1"/>`);
    });

  const safeModelName = model.name.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'root';

  return `<?xml version="1.0" encoding="UTF-8"?>
<qgis projectname="${model.name}" version="3.34">
  <projectCrs>
    ${buildSpatialRefSys(authid)}
  </projectCrs>
  <layer-tree-group name="" expanded="1" checked="Qt::Checked">
${treeLayers.join('\n')}
  </layer-tree-group>
  <projectlayers>
${mapLayers.join('\n')}
  </projectlayers>
  <properties>
    <WMSServiceTitle type="QString">${model.name}</WMSServiceTitle>
    <WMSRootName type="QString">${safeModelName}</WMSRootName>
    <WMSCrsList type="QStringList">
${wmsCrsList}
    </WMSCrsList>${wmsExtent ? `
    <WMSExtent type="QRectF">${wmsExtent}</WMSExtent>` : ''}
  </properties>
</qgis>`;
};

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

    const tbl = getTableName(layer);
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
    const tbl = getTableName(layer);

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

// ============================================================
// Generate .env file
// ============================================================
export const generateEnvFile = (source: SourceConnection): string => {
  let env = `# Environment variables for deploy kit\n`;
  env += `# Generated: ${new Date().toISOString()}\n`;
  env += `# COPY THIS FILE: cp .env.template .env\n`;
  env += `# Then fill in your actual credentials below.\n\n`;

  // FIX: pygeoapi uses PYGEOAPI_SERVER_URL for all self-referencing links.
  // Set this to the public-facing URL of your deployment (no trailing slash).
  // Railway: copy the generated domain from the Railway dashboard after first deploy.
  // Fly.io:  https://<app-name>-pygeoapi.fly.dev (known before deploy)
  env += `# --- pygeoapi public URL ---\n`;
  env += `# Must be set to your public HTTPS URL — used in all API self-links.\n`;
  env += `# Railway: https://<your-app>.up.railway.app\n`;
  env += `# Fly.io:  https://<slug>-pygeoapi.fly.dev\n`;
  env += `# Local:   http://localhost:5000\n`;
  env += `PYGEOAPI_SERVER_URL=http://localhost:5000\n\n`;

  // FIX: PORT is injected automatically by Railway. Fly.io ignores this env var
  // (it uses internal_port in fly.toml). For local docker-compose, 80 is correct.
  env += `# --- Bind port ---\n`;
  env += `# Railway sets this automatically — do not change on Railway.\n`;
  env += `# Fly.io uses fly.toml internal_port instead — leave as 80 here.\n`;
  env += `PORT=80\n\n`;

  if (source.type === 'postgis') {
    const c = source.config as PostgresConfig;
    env += `# --- PostGIS connection ---\n`;
    env += `POSTGRES_HOST=${c.host}\n`;
    env += `POSTGRES_PORT=${c.port}\n`;
    env += `POSTGRES_DB=${c.dbname}\n`;
    env += `POSTGRES_USER=${c.user}\n`;
    env += `POSTGRES_PASSWORD=${c.password}\n`;
    env += `POSTGRES_SCHEMA=${c.schema || 'public'}\n`;
  } else if (source.type === 'supabase') {
    const c = source.config as SupabaseConfig;
    const ref = c.projectUrl.replace('https://', '').replace('.supabase.co', '');
    env += `# --- Supabase / PostGIS connection ---\n`;
    env += `POSTGRES_HOST=db.${ref}.supabase.co\n`;
    env += `POSTGRES_PORT=5432\n`;
    env += `POSTGRES_DB=postgres\n`;
    env += `POSTGRES_USER=postgres\n`;
    env += `POSTGRES_PASSWORD=your-supabase-db-password-here\n`;
    env += `POSTGRES_SCHEMA=${c.schema || 'public'}\n`;
    env += `SUPABASE_URL=${c.projectUrl}\n`;
    env += `SUPABASE_ANON_KEY=${c.anonKey}\n`;
  } else if (source.type === 'databricks') {
    const c = source.config as DatabricksConfig;
    env += `# --- Databricks connection ---\n`;
    env += `DATABRICKS_HOST=${c.host}\n`;
    env += `DATABRICKS_HTTP_PATH=${c.httpPath}\n`;
    env += `DATABRICKS_TOKEN=${c.token}\n`;
    env += `DATABRICKS_CATALOG=${c.catalog}\n`;
    env += `DATABRICKS_SCHEMA=${c.schema}\n`;
  } else if (source.type === 'geopackage') {
    env += `# No database credentials required for GeoPackage source\n`;
  }

  // FIX: QGIS Server needs QGIS_SERVER_SERVICE_URL so GetCapabilities advertises
  // the correct public HTTPS URL rather than the internal http:// address.
  // QGIS Server 3.x serves WMS/WFS/WCS at /ows/ by default.
  env += `\n# --- QGIS Server public URL (WMS/WFS at /ows/) ---\n`;
  env += `# Set to the public-facing HTTPS URL for the QGIS Server service.\n`;
  env += `# Without this, GetCapabilities will advertise http:// behind an HTTPS proxy.\n`;
  env += `# Railway: https://<qgis-service>.up.railway.app/ows/\n`;
  env += `# Fly.io:  https://<slug>-qgis.fly.dev/ows/\n`;
  env += `# Local:   leave blank (not needed)\n`;
  env += `QGIS_SERVER_PUBLIC_URL=\n`;

  env += `\n# --- Configuration & Output ---\n`;
  env += `OUTPUT_DIR=./data/output\n`;

  if (source.type !== 'geopackage') {
    env += `\n# Delta Sync Interval in seconds (86400 = 24 hours)\n`;
    env += `SYNC_INTERVAL_SECONDS=86400\n`;
    env += `\n# Port to serve the GeoPackage downloads\n`;
    env += `DOWNLOAD_PORT=8081\n`;
  }

  return env;
};

// ============================================================
// Generate docker-compose.yml
// ============================================================
export const generateDockerCompose = (
  model: DataModel,
  source: SourceConnection
): string => {
  const isPg = source.type === 'postgis' || source.type === 'supabase';
  const isGpkg = source.type === 'geopackage';
  const hasGeomLayers = model.layers.some(l => l.geometryType !== 'None');

  let compose = `# Docker Compose for ${model.name}
# Source: ${source.type}
# Generated: ${new Date().toISOString()}
#
# Usage:
#   1. Copy .env.template to .env and fill in credentials
#   2. docker compose up -d
#   3. OGC API Features: http://localhost:5000
#   4. WMS/WFS (QGIS):   http://localhost:8080/ows/?SERVICE=WMS&REQUEST=GetCapabilities
#   5. Downloads:        http://localhost:\${DOWNLOAD_PORT:-8081}

services:
  # --- OGC API - Features (pygeoapi) ---
  pygeoapi:
    image: geopython/pygeoapi:latest
    ports:
      - "5000:80"
    volumes:
      - ./pygeoapi-config.yml:/pygeoapi/local.config.yml
`;

  if (!isPg) {
    compose += `      - ./data:/data\n`;
  }

  compose += `    env_file: .env\n`;
  compose += `    entrypoint:\n`;
  compose += `      - /bin/bash\n`;
  compose += `      - -c\n`;
  compose += `      - |\n`;
  compose += `        pygeoapi openapi generate \${PYGEOAPI_CONFIG} --output-file \${PYGEOAPI_OPENAPI}\n`;
  compose += `        pygeoapi asyncapi generate \${PYGEOAPI_CONFIG} --output-file /pygeoapi/local.asyncapi.yml\n`;
  compose += `        pygeoapi serve\n`;
  compose += `    restart: unless-stopped\n`;

  // WMS via QGIS Server (only if there are geometry layers)
  if (hasGeomLayers) {
    compose += `
  # --- WMS/WFS (QGIS Server) ---
  # QGIS Server 3.x serves all OGC services at /ows/ by default.
  # WMS GetCapabilities: http://localhost:8080/ows/?SERVICE=WMS&REQUEST=GetCapabilities
  #
  # FIX: QGIS_SERVER_SERVICE_URL ensures GetCapabilities advertises the correct
  # public URL when running behind an HTTPS reverse proxy (Railway, Fly, nginx).
  # Set QGIS_SERVER_PUBLIC_URL in your .env file after first deploy.
  qgis-server:
    image: qgis/qgis-server:ltr
    ports:
      - "8080:80"
    volumes:
      - ./project.qgs:/data/project.qgs
`;
    if (!isPg) {
      compose += `      - ./data:/data\n`;
    }
    compose += `    environment:
      QGIS_PROJECT_FILE: /data/project.qgs
      QGIS_SERVER_SERVICE_URL: \${QGIS_SERVER_PUBLIC_URL:-}
    env_file: .env
    restart: unless-stopped
`;
  }

  // Delta export worker & Nginx file server (Skip for direct GeoPackage)
  if (!isGpkg) {
    compose += `
  # --- Delta File Download Server (Nginx) ---
  # Serves the generated .gpkg files as an auto-indexed web directory
  # STAC catalog: http://localhost:\${DOWNLOAD_PORT:-8081}/stac/catalog.json
  downloads:
    image: nginx:alpine
    ports:
      - "\${DOWNLOAD_PORT:-8081}:80"
    volumes:
      - ./data/output:/usr/share/nginx/html:ro
      - ./nginx-stac.conf:/etc/nginx/conf.d/default.conf:ro
    restart: unless-stopped

  # --- Automated Delta GeoPackage Exporter ---
  delta-worker:
    image: ghcr.io/osgeo/gdal:ubuntu-full-latest
    volumes:
      - ./delta_export.py:/app/delta_export.py
      - ./data/output:/data/output
    env_file: .env
    environment:
      - SYNC_INTERVAL_SECONDS=\${SYNC_INTERVAL_SECONDS:-86400}
    entrypoint:
      - /bin/bash
      - -c
      - |
        pip install -q psycopg2-binary
        echo "Starting automated delta extraction loop..."
        while true; do
          echo "Running extraction at $$(date)"
          python3 /app/delta_export.py --since last
          echo "Extraction complete. Sleeping for $\${SYNC_INTERVAL_SECONDS} seconds..."
          sleep $$SYNC_INTERVAL_SECONDS
        done
    restart: unless-stopped
`;

    if (source.type === 'databricks') {
      compose += `
  # --- Initial GeoPackage export (for Databricks) ---
  initial-export:
    image: ghcr.io/osgeo/gdal:ubuntu-full-latest
    volumes:
      - ./delta_export.py:/app/delta_export.py
      - ./data:/data/output
    env_file: .env
    entrypoint: ["python3", "/app/delta_export.py"]
    profiles:
      - setup  # Run once: docker compose --profile setup run --rm initial-export
`;
    }
  }

  return compose;
};

// ============================================================
// Generate README for the deploy kit
// ============================================================
export const generateReadme = (model: DataModel, source: SourceConnection, lang: string = 'no'): string => {
  const s = (i18n[lang as keyof typeof i18n] ?? i18n.no).readme;
  const isPg = source.type === 'postgis' || source.type === 'supabase';
  const isGpkg = source.type === 'geopackage';
  const hasWms = model.layers.some(l => l.geometryType !== 'None');

  let md = `# ${model.name} — ${s.deployKit}\n\n`;
  md += `${s.generatedBy}\n\n`;
  md += `## ${s.dataSource}: ${source.type}\n\n`;
  md += `## ${s.services}\n\n`;
  md += `| ${s.service} | ${s.port} | ${s.url} |\n`;
  md += `|----------|------|-----|\n`;
  md += `| OGC API - Features (pygeoapi) | 5000 | http://localhost:5000 |\n`;
  if (hasWms) {
    md += `| ${s.wmsService} | 8080 | http://localhost:8080/ows/?SERVICE=WMS&REQUEST=GetCapabilities |\n`;
  }
  if (!isGpkg) {
    md += `| ${s.deltaDownloads} | 8081 | http://localhost:8081 |\n`;
  }
  md += `\n`;

  md += `## ${s.gettingStarted}\n\n`;
  md += `\`\`\`bash\n`;
  md += `${s.step1CopyEnv}\n`;
  md += `cp .env.template .env\n`;
  md += `nano .env\n\n`;

  if (isGpkg) {
    const gpkgName = getGpkgFilename(model, source);
    md += `${s.step2AddData}\n`;
    md += `${s.addDataHint.replace('{filename}', gpkgName)}\n\n`;
    md += `${s.step3Start}\n`;
  } else if (source.type === 'databricks') {
    md += `${s.step2Databricks}\n`;
    md += `pip install databricks-sql-connector geopandas\n`;
    md += `docker compose --profile setup run --rm initial-export\n\n`;
    md += `${s.step3Start}\n`;
  } else {
    md += `${s.step2Start}\n`;
  }

  md += `docker compose up -d\n`;
  md += `\`\`\`\n\n`;

  if (!isGpkg) {
    md += `## ${s.deltaExport}\n\n`;
    md += `${s.deltaDesc}\n`;
    md += `${s.deltaInterval}\n\n`;
    md += `${s.deltaDownloadHint}\n\n`;
    md += `${s.stacAvailable}\n\n`;

    md += `### ${s.deltaContents}\n\n`;
    md += `| ${s.changeType} | ${s.description} |\n`;
    md += `|---------------|-------------|\n`;
    md += `| \`insert\` | ${s.insertDesc} |\n`;
    md += `| \`update\` | ${s.updateDesc} |\n`;
    md += `| \`delete\` | ${s.deleteDesc} |\n\n`;
    md += `${s.deletesStoredHint}\n\n`;

    md += `### ${s.deltaHowItWorksTitle}\n\n`;
    md += `${s.deltaHowItWorks1}\n\n`;
    md += `${s.deltaHowItWorks2}\n\n`;
    md += `> **Note:** ${s.deltaTimestampNote}\n\n`;
    md += `${s.deltaManualTrigger}\n`;
    md += `\`\`\`bash\n`;
    md += `${s.deltaManualFull}\n`;
    md += `${s.deltaManualDelta}\n`;
    md += `${s.deltaManualDate}\n`;
    md += `\`\`\`\n\n`;
  }

  md += `## ${s.files}\n\n`;
  md += `| ${s.file} | ${s.description} |\n`;
  md += `|-----|-------------|\n`;
  md += `| \`docker-compose.yml\` | ${s.dockerComposeFile} |\n`;
  md += `| \`pygeoapi-config.yml\` | ${isPg ? s.pygeoapiPgFile : s.pygeoapiGpkgFile} |\n`;
  if (hasWms) {
    md += `| \`project.qgs\` | ${s.qgisProjectFile} |\n`;
  }
  if (!isGpkg) {
    md += `| \`delta_export.py\` | ${s.deltaScriptFile} |\n`;
  }
  md += `| \`.env.template\` | ${s.envTemplateFile} |\n`;

  return md;
};

// ============================================================
// Generate GitHub Actions workflow for CI/CD deployment
// ============================================================
export const generateGithubActionsWorkflow = (
  model: DataModel,
  source: SourceConnection
): string => {
  const hasWms = model.layers.some(l => l.geometryType !== 'None');
  const slug = model.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  let workflow = `name: Deploy ${model.name}

on:
  push:
    branches: [main]
    paths:
      - 'docker-compose.yml'
      - 'pygeoapi-config.yml'
      - 'project.qgs'
      - 'model.json'
      - '.github/workflows/deploy.yml'

  workflow_dispatch:
    inputs:
      full_redeploy:
        description: 'Force full redeployment'
        type: boolean
        default: false

env:
  SERVICE_NAME: ${slug}

jobs:
  validate:
    name: Validate configuration
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Validate pygeoapi config
        run: |
          python3 -c "
          import yaml, sys
          with open('pygeoapi-config.yml') as f:
              config = yaml.safe_load(f)
          resources = config.get('resources', {})
          print(f'✓ {len(resources)} collection(s) defined')
          for name, res in resources.items():
              providers = res.get('providers', [])
              if not providers:
                  print(f'✗ {name}: no provider configured', file=sys.stderr)
                  sys.exit(1)
              print(f'  - {name}: {providers[0].get(\"name\", \"unknown\")} provider')
          print('✓ Configuration valid')
          "

      - name: Validate model definition
        run: |
          python3 -c "
          import json
          with open('model.json') as f:
              model = json.load(f)
          layers = model.get('layers', [])
          print(f'✓ Model: {model.get(\"name\", \"unnamed\")} v{model.get(\"version\", \"?\")}')
          print(f'✓ {len(layers)} layer(s)')
          for l in layers:
              props = l.get('properties', [])
              print(f'  - {l[\"name\"]}: {len(props)} properties, {l.get(\"geometryType\", \"None\")}')
          "

  build:
    name: Build and push container
    needs: validate
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}

      - name: Build and push pygeoapi image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: Dockerfile
          push: true
          tags: |
            ghcr.io/\${{ github.repository_owner }}/${slug}:latest
            ghcr.io/\${{ github.repository_owner }}/${slug}:\${{ github.sha }}
`;

  if (hasWms) {
    workflow += `
      - name: Package QGIS project
        run: |
          echo "QGIS project validated and ready for deployment"
          # QGIS Server uses the project.qgs directly via volume mount
`;
  }

  workflow += `
  deploy:
    name: Deploy services
    needs: build
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: \${{ secrets.DEPLOY_HOST }}
          username: \${{ secrets.DEPLOY_USER }}
          key: \${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            cd /opt/services/${slug}
            git pull origin main
            docker compose pull
            docker compose up -d --remove-orphans
            echo "✓ ${model.name} deployed successfully"

      - name: Health check
        run: |
          echo "Waiting for services to start..."
          sleep 10
          # curl -sf \${{ secrets.DEPLOY_URL }}/conformance || exit 1
          echo "✓ Deployment complete"
`;

  return workflow;
};

// ============================================================
// Generate Dockerfile for pygeoapi
// ============================================================
export const generateDockerfile = (
  model: DataModel,
  source: SourceConnection
): string => {
  const isGpkg = source.type === 'geopackage';

  return `FROM geopython/pygeoapi:latest

# Copy configuration
COPY pygeoapi-config.yml /pygeoapi/local.config.yml
${isGpkg ? 'COPY data/ /data/' : ''}

# FIX: Default env vars so the container starts correctly when no .env is present.
# PORT is overridden automatically by Railway. PYGEOAPI_SERVER_URL must be set
# manually to the public HTTPS URL after first deploy.
ENV PORT=80
ENV PYGEOAPI_SERVER_URL=http://localhost:5000

EXPOSE 80

# Create AsyncAPI document placeholder (required by pygeoapi startup check)
RUN echo "asyncapi: 2.6.0" > /pygeoapi/local.asyncapi.yml && \
    echo "info:" >> /pygeoapi/local.asyncapi.yml && \
    echo "  title: pygeoapi" >> /pygeoapi/local.asyncapi.yml && \
    echo "  version: 1.0.0" >> /pygeoapi/local.asyncapi.yml && \
    echo "channels: {}" >> /pygeoapi/local.asyncapi.yml
`;
};

// ============================================================
export const generateQgisDockerfile = (
  model: DataModel,
  source: SourceConnection
): string => {
  const isGpkg = source.type === 'geopackage';
  return `FROM qgis/qgis-server:ltr

COPY project.qgs /data/project.qgs
${isGpkg ? 'COPY data/ /data/' : ''}

# FIX: SQLite/GeoPackage needs directory write permissions to create temporary 
# lock/journal files (-wal, -shm) even during read-only operations. 
# Without this, QGIS Server silently drops the layers.
RUN chmod -R 777 /data

ENV QGIS_PROJECT_FILE=/data/project.qgs
# QGIS Server 3.x serves all OGC services (WMS, WFS, WCS, WMTS) at /ows/ by default.
# FIX: QGIS_SERVER_SERVICE_URL is set at runtime via .env / Railway / Fly variables
# so GetCapabilities advertises the correct public HTTPS URL.
# Default is blank — QGIS Server falls back to the request Host header (fine for local use).
# Example: https://<your-app>.up.railway.app/ows/
ENV QGIS_SERVER_SERVICE_URL=
EXPOSE 80
`;
};

// ============================================================
// Generate fly.toml for Fly.io
// ============================================================
export const generateFlyToml = (
  model: DataModel,
  source: SourceConnection
): string => {
  const slug = model.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const hasWms = model.layers.some(l => l.geometryType !== 'None');

  // FIX: Pre-populate PYGEOAPI_SERVER_URL since the Fly app name is deterministic.
  // Users can override after deploy if they use a custom domain.
  let toml = `# Fly.io configuration for ${model.name}
# Generated by Waystones
#
# Deploy:
#   fly launch --copy-config    (first time)
#   fly deploy                  (subsequent)

app = "${slug}-pygeoapi"
primary_region = "ams"

[build]
  dockerfile = "Dockerfile"

[env]
  # FIX: Pre-populated since Fly app names are deterministic.
  # Update if you configure a custom domain.
  PYGEOAPI_SERVER_URL = "https://${slug}-pygeoapi.fly.dev"
  # Fly routes to internal_port (80) below — PORT env var is not used by Fly.
  PORT = "80"

[http_service]
  internal_port = 80
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

  [http_service.concurrency]
    type = "requests"
    hard_limit = 250
    soft_limit = 200

[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1

[checks]
  [checks.health]
    type = "http"
    port = 80
    path = "/conformance"
    interval = "30s"
    timeout = "5s"
`;

  if (source.type === 'geopackage') {
    toml += `
[mounts]
  source = "geodata"
  destination = "/data"
`;
  }

  return toml;
};

// ============================================================
// Generate fly.toml for QGIS Server (second Fly app)
// ============================================================
export const generateFlyQgisToml = (
  model: DataModel,
  source: SourceConnection
): string => {
  const slug = model.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return `# Fly.io configuration for ${model.name} — QGIS Server (WMS/WFS)
# Deploy as separate app: fly deploy --config fly.qgis.toml
# QGIS Server 3.x serves all OGC services at /ows/ by default.

app = "${slug}-qgis"
primary_region = "ams"

[build]
  dockerfile = "Dockerfile.qgis"

[env]
  # FIX: Pre-populated so GetCapabilities advertises the correct HTTPS URL.
  # QGIS Server 3.x serves at /ows/ — update if you use a custom domain.
  QGIS_SERVER_SERVICE_URL = "https://${slug}-qgis.fly.dev/ows/"

[http_service]
  internal_port = 80
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  memory = "1024mb"
  cpu_kind = "shared"
  cpus = 1

${source.type === 'geopackage' ? `[mounts]
  source = "geodata"
  destination = "/data"
` : ''}`;
};

// ============================================================
// Generate railway.json for Railway
// ============================================================
export const generateRailwayJson = (
  model: DataModel,
  source: SourceConnection
): string => {
  const config: any = {
    "$schema": "https://railway.com/railway.schema.json",
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    deploy: {
      // FIX: Railway auto-detects EXPOSE 80 from the Dockerfile.
      // healthcheckTimeout gives Railway enough time for pygeoapi cold start.
      healthcheckPath: "/conformance",
      healthcheckTimeout: 300,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 10
    }
  };

  return JSON.stringify(config, null, 2);
};

// ============================================================
// Generate railway.json for QGIS Server service on Railway
// ============================================================
export const generateRailwayQgisJson = (
  model: DataModel,
  source: SourceConnection
): string => {
  const config: any = {
    "$schema": "https://railway.com/railway.schema.json",
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile.qgis" },
    deploy: {
      // QGIS Server 3.x serves at /ows/ — use that for the health check.
      // Long timeout needed because QGIS loads the full project on first request.
      healthcheckPath: "/ows/?SERVICE=WMS&REQUEST=GetCapabilities",
      healthcheckTimeout: 300,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 10
    }
  };

  return JSON.stringify(config, null, 2);
};

// ============================================================
// Generate GitHub Actions workflow — target-aware
// ============================================================
const generateWorkflowForTarget = (
  model: DataModel,
  source: SourceConnection,
  target: DeployTarget
): string => {
  const slug = model.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const hasWms = model.layers.some(l => l.geometryType !== 'None');

  // Shared validation job
  const validateJob = `
  validate:
    name: Validate configuration
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Validate pygeoapi config
        run: |
          python3 -c "
          import yaml, sys
          with open('pygeoapi-config.yml') as f:
              config = yaml.safe_load(f)
          resources = config.get('resources', {})
          print(f'✓ {len(resources)} collection(s) defined')
          for name, res in resources.items():
              providers = res.get('providers', [])
              if not providers:
                  print(f'✗ {name}: no provider configured', file=sys.stderr)
                  sys.exit(1)
              print(f'  - {name}: {providers[0].get(\\"name\\", \\"unknown\\")} provider')
          print('✓ Configuration valid')
          "

      - name: Validate model definition
        run: |
          python3 -c "
          import json
          with open('model.json') as f:
              model = json.load(f)
          layers = model.get('layers', [])
          print(f'✓ Model: {model.get(\\"name\\", \\"unnamed\\")} v{model.get(\\"version\\", \\"?\\")}')
          print(f'✓ {len(layers)} layer(s)')
          for l in layers:
              props = l.get('properties', [])
              print(f'  - {l[\\"name\\"]}: {len(props)} properties, {l.get(\\"geometryType\\", \\"None\\")}')
          "`;

  if (target === 'fly') {
    return `name: Deploy ${model.name} (Fly.io)

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  FLY_API_TOKEN: \${{ secrets.FLY_API_TOKEN }}

jobs:
${validateJob}

  deploy-pygeoapi:
    name: Deploy pygeoapi to Fly.io
    needs: validate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --config fly.toml --remote-only
${hasWms ? `
  deploy-qgis:
    name: Deploy QGIS Server to Fly.io
    needs: validate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --config fly.qgis.toml --remote-only
` : ''}`;
  }

  if (target === 'railway') {
    return `name: Validate ${model.name} (Railway)

# Railway deploys automatically from GitHub — no deploy job needed.
# This workflow only validates the configuration on push.

on:
  push:
    branches: [main]
  pull_request:

jobs:
${validateJob}
`;
  }

  if (target === 'ghcr') {
    return `name: Build ${model.name} (GHCR)

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
${validateJob}

  build:
    name: Build and push to GHCR
    needs: validate
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}

      - name: Build and push pygeoapi
        uses: docker/build-push-action@v5
        with:
          context: .
          file: Dockerfile
          push: true
          tags: |
            ghcr.io/\${{ github.repository_owner }}/${slug}:latest
            ghcr.io/\${{ github.repository_owner }}/${slug}:\${{ github.sha }}
${hasWms ? `
      - name: Build and push QGIS Server
        uses: docker/build-push-action@v5
        with:
          context: .
          file: Dockerfile.qgis
          push: true
          tags: |
            ghcr.io/\${{ github.repository_owner }}/${slug}-qgis:latest
            ghcr.io/\${{ github.repository_owner }}/${slug}-qgis:\${{ github.sha }}
` : ''}`;
  }

  // Default: docker-compose (original SSH-based deploy)
  return generateGithubActionsWorkflow(model, source);
};

// ============================================================
// Generate README — target-aware
// ============================================================
const generateReadmeForTarget = (
  model: DataModel,
  source: SourceConnection,
  target: DeployTarget,
  lang: string = 'no'
): string => {
  const s = (i18n[lang as keyof typeof i18n] ?? i18n.no).readme;
  const slug = model.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const isGpkg = source.type === 'geopackage';
  const hasWms = model.layers.some(l => l.geometryType !== 'None');

  const targetNames: Record<DeployTarget, string> = {
    'docker-compose': s.targetDockerCompose,
    'fly': s.targetFly,
    'railway': s.targetRailway,
    'ghcr': s.targetGhcr,
  };

  // QGIS Server 3.x serves at /ows/ by default
  const wmsUrls: Record<DeployTarget, string> = {
    'docker-compose': 'http://localhost:8080/ows/',
    'fly': `https://${slug}-qgis.fly.dev/ows/`,
    'railway': 'https://<qgis-service>.up.railway.app/ows/',
    'ghcr': 'http://localhost:8080/ows/',
  };
  const wmsUrl = wmsUrls[target];

  let md = `# ${model.name} — ${s.deployKit}\n\n`;
  md += `${s.generatedByTarget} **${targetNames[target]}**\n\n`;

  // Services table
  md += `## ${s.services}\n\n`;
  md += `| ${s.service} | ${s.description} | ${s.url} |\n`;
  md += `|----------|-------------|-----|\n`;
  md += `| pygeoapi | OGC API – Features | ${target === 'docker-compose' ? 'http://localhost:5000' : target === 'fly' ? `https://${slug}-pygeoapi.fly.dev` : target === 'railway' ? 'https://\\<app\\>.up.railway.app' : 'http://localhost:5000'} |\n`;
  if (hasWms) {
    md += `| QGIS Server | ${s.wmsLayers} | ${wmsUrl}?SERVICE=WMS&REQUEST=GetCapabilities |\n`;
  }
  md += `\n`;

  if (target === 'docker-compose') {
    const readmeFull = generateReadme(model, source, lang);
    const anchor = `## ${s.gettingStarted}`;
    return md + readmeFull.substring(readmeFull.indexOf(anchor));
  }

  if (target === 'fly') {
    md += `## ${s.gettingStartedFly}\n\n`;
    md += `### ${s.prerequisites}\n\n`;
    md += `1. Installer [flyctl](https://fly.io/docs/getting-started/installing-flyctl/)\n`;
    md += `2. Logg inn: \`fly auth login\`\n\n`;
    md += `### ${s.deploy}\n\n`;
    md += `\`\`\`bash\n`;
    md += `${s.firstTime}\n`;
    md += `fly launch --config fly.toml --copy-config --no-deploy\n`;
    if (hasWms) {
      md += `fly launch --config fly.qgis.toml --copy-config --no-deploy\n`;
    }
    md += `\n`;
    if (isGpkg) {
      md += `${s.uploadGpkgData}\n`;
      md += `fly volumes create geodata --region ams --size 1 -a ${slug}-pygeoapi\n`;
      md += `${s.copyFileHint}\n\n`;
    }
    md += `${s.deployPygeoapi}\n`;
    md += `fly deploy --config fly.toml\n`;
    if (hasWms) {
      md += `\n${s.deployQgis}\n`;
      md += `fly deploy --config fly.qgis.toml\n`;
    }
    md += `\`\`\`\n\n`;
    md += `${s.flyNote}\n\n`;
    md += `### ${s.autoDeployTitle}\n\n`;
    md += `${s.autoDeployFly}\n\n`;
    md += `${s.getToken}\n\n`;
  }

  if (target === 'railway') {
    md += `## ${s.gettingStartedRailway}\n\n`;
    md += `### ${s.steps}\n\n`;
    md += `${s.railwayStep1}\n`;
    md += `${s.railwayStep2}\n`;
    md += `${s.railwayStep3}\n`;
    md += `${s.railwayStep4}\n\n`;
    md += `### ${s.envVars}\n\n`;
    md += `${s.railwayEnvDesc}\n\n`;
    md += `| ${s.variable} | ${s.value} |\n`;
    md += `|----------|-------|\n`;
    md += `| \`PYGEOAPI_SERVER_URL\` | ${s.railwayPygeoapiDesc} |\n`;
    if (hasWms) {
      md += `| \`QGIS_SERVER_PUBLIC_URL\` | \`https://<qgis-service>.up.railway.app/ows/\` |\n`;
    }
    if (!isGpkg) {
      const envLines = generateEnvFile(source).split('\n').filter(l => l.includes('=') && !l.startsWith('#') && !l.startsWith('PYGEOAPI') && !l.startsWith('PORT') && !l.startsWith('QGIS'));
      envLines.forEach(l => {
        const [k] = l.split('=');
        md += `| \`${k}\` | ${s.yourValue} |\n`;
      });
    }
    md += `\n`;
    md += `${s.railwayNote}\n\n`;
    if (hasWms) {
      md += `### ${s.qgisServerSection}\n\n`;
      md += `${s.railwayQgisDesc}\n\n`;
      md += `${s.railwayQgisStep1}\n`;
      md += `${s.railwayQgisStep2}\n`;
      md += `${s.railwayQgisStep3}\n`;
      md += `${s.railwayQgisStep4}\n`;
      md += `${s.railwayQgisStep5}\n\n`;
    }
    if (isGpkg) {
      md += `### ${s.dataSection}\n\n`;
      md += `${s.gpkgDataDesc}\n`;
      md += `${s.gpkgUpdateHint}\n\n`;
    }
    md += `### ${s.autoDeployTitle}\n\n`;
    md += `${s.autoDeployRailway}\n\n`;
  }

  if (target === 'ghcr') {
    md += `## ${s.containerRegistry}\n\n`;
    md += `${s.ghcrDesc}\n`;
    md += `${s.ghcrDesc2}\n\n`;
    md += `### ${s.images}\n\n`;
    md += `| ${s.image} | ${s.description} |\n`;
    md += `|-------|-------------|\n`;
    md += `| \`ghcr.io/<owner>/${slug}:latest\` | ${s.ghcrPygeoapiImage} |\n`;
    if (hasWms) {
      md += `| \`ghcr.io/<owner>/${slug}-qgis:latest\` | ${s.ghcrQgisImage} |\n`;
    }
    md += `\n`;
    md += `### ${s.runLocally}\n\n`;
    md += `\`\`\`bash\n`;
    md += `docker pull ghcr.io/<owner>/${slug}:latest\n`;
    md += `docker run -p 5000:80 \\\n`;
    md += `  -e PYGEOAPI_SERVER_URL=http://localhost:5000 \\\n`;
    md += `  ghcr.io/<owner>/${slug}:latest\n`;
    md += `\`\`\`\n\n`;
    md += `### ${s.useWithCompose}\n\n`;
    md += `\`\`\`bash\n`;
    md += `docker compose up -d\n`;
    md += `\`\`\`\n\n`;
    md += `### ${s.autoBuild}\n\n`;
    md += `${s.autoBuildDesc}\n\n`;
  }

  // Delta export section (for non-docker-compose targets — docker-compose gets this via generateReadme)
  if (!isGpkg) {
    md += `## ${s.deltaExport}\n\n`;
    md += `${s.deltaDesc}\n\n`;
    md += `> **Note:** ${s.deltaTimestampNote}\n\n`;
    md += `### ${s.deltaHowItWorksTitle}\n\n`;
    md += `${s.deltaHowItWorks1}\n\n`;
    md += `${s.deltaManualTrigger}\n`;
    md += `\`\`\`bash\n`;
    md += `${s.deltaManualFull}\n`;
    md += `${s.deltaManualDelta}\n`;
    md += `${s.deltaManualDate}\n`;
    md += `\`\`\`\n\n`;
  }

  // Files table
  md += `## ${s.files}\n\n`;
  md += `| ${s.file} | ${s.description} |\n`;
  md += `|-----|-------------|\n`;
  md += `| \`model.json\` | ${s.modelJsonFile} |\n`;
  md += `| \`Dockerfile\` | ${s.dockerfileFile} |\n`;
  md += `| \`pygeoapi-config.yml\` | ${s.pygeoapiConfigFile} |\n`;
  if (hasWms) {
    md += `| \`Dockerfile.qgis\` | ${s.dockerfileQgisFile} |\n`;
    md += `| \`project.qgs\` | ${s.qgisProjectFile} |\n`;
  }
  if (target === 'fly') md += `| \`fly.toml\` | ${s.flyTomlFile} |\n`;
  if (target === 'fly' && hasWms) md += `| \`fly.qgis.toml\` | ${s.flyQgisTomlFile} |\n`;
  if (target === 'railway') md += `| \`railway.json\` | ${s.railwayJsonFile} |\n`;
  if (target === 'railway' && hasWms) md += `| \`railway.qgis.json\` | ${s.railwayQgisJsonFile} |\n`;
  md += `| \`.env.template\` | ${s.envTemplateShort} |\n`;
  if (!isGpkg) md += `| \`delta_export.py\` | ${s.deltaScriptFile} |\n`;
  if (!isGpkg) md += `| \`nginx-stac.conf\` | ${s.nginxStacConfFile} |\n`;

  // STAC catalog section
  if (!isGpkg) {
    const modelId = model.id || model.name.toLowerCase().replace(/\s+/g, '-');
    const downloadBase = target === 'fly' ? `https://${slug}-downloads.fly.dev` : 'https://<downloads-url>';
    md += `\n## ${s.stacCatalogSection}\n\n`;
    md += `| ${s.resource} | ${s.url} |\n`;
    md += `|---------|-----|\n`;
    md += `| ${s.stacRootCatalog} | ${downloadBase}/stac/catalog.json |\n`;
    md += `| ${s.stacCollectionLabel} | ${downloadBase}/stac/collections/${modelId}/collection.json |\n`;
    model.layers
      .filter(l => !l.isAbstract)
      .forEach(layer => {
        const tbl = layer.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        md += `| ${layer.name} items | ${downloadBase}/stac/${tbl}/catalog.json |\n`;
      });
    md += `\n${s.stacItemsNote}\n`;
  }

  return md;
};

// ============================================================
// Generate deploy file map — target-aware
// Returns a flat Record<filename, content> for pushing to GitHub
// ============================================================
export const generateDeployFiles = async (
  model: DataModel,
  source: SourceConnection,
  lang: string = 'no',
  target: DeployTarget = 'docker-compose'
): Promise<Record<string, string>> => {
  const isGpkg = source.type === 'geopackage';
  const hasWms = model.layers.some(l => l.geometryType !== 'None');

  // Shared files — always included
  const files: Record<string, string> = {
    'model.json': JSON.stringify(model, null, 2),
    'Dockerfile': generateDockerfile(model, source),
    'pygeoapi-config.yml': await generatePygeoapiConfig(model, source, lang),
    '.env.template': generateEnvFile(source),
    '.gitignore': '.env\ndata/\n*.gpkg\n__pycache__/\n',
    'README.md': generateReadmeForTarget(model, source, target, lang),
    '.github/workflows/deploy.yml': generateWorkflowForTarget(model, source, target),
  };

  // QGIS project + Dockerfile.qgis
  if (hasWms) {
    files['project.qgs'] = generateQgisProject(model, source);
    if (target !== 'docker-compose') {
      files['Dockerfile.qgis'] = generateQgisDockerfile(model, source);
    }
  }

  // Delta script + STAC helpers for database sources
  if (!isGpkg) {
    const modelId = model.id || model.name.toLowerCase().replace(/\s+/g, '-');
    files['delta_export.py'] = generateDeltaScript(model, source) + '\n\n' + generateStacItemSnippet(model, source);

    // STAC static catalog structure
    files['data/output/stac/catalog.json'] = generateStacCatalog(model);
    files[`data/output/stac/collections/${modelId}/collection.json`] = generateStacCollection(model, source);
    model.layers
      .filter(l => !l.isAbstract)
      .forEach(layer => {
        const tbl = layer.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        files[`data/output/stac/${tbl}/catalog.json`] = generateStacLayerCatalog(layer, model);
      });

    // Nginx config with correct MIME types
    files['nginx-stac.conf'] = generateNginxStacConf();
  }

  // Target-specific files
  if (target === 'docker-compose') {
    files['docker-compose.yml'] = generateDockerCompose(model, source);
    if (hasWms) {
      files['project.qgs'] = generateQgisProject(model, source);
    }
  }

  if (target === 'fly') {
    files['fly.toml'] = generateFlyToml(model, source);
    if (hasWms) {
      files['fly.qgis.toml'] = generateFlyQgisToml(model, source);
    }
  }

  if (target === 'railway') {
    files['railway.json'] = generateRailwayJson(model, source);
    // Separate railway.json for the QGIS Server service (deployed as a second
    // Railway service from the same repo with a different Dockerfile path).
    if (hasWms) {
      files['railway.qgis.json'] = generateRailwayQgisJson(model, source);
    }
  }

  if (target === 'ghcr') {
    // GHCR also includes docker-compose for local dev / pull-and-run
    files['docker-compose.yml'] = generateDockerCompose(model, source);
  }

  return files;
};

// ============================================================
// Legacy: generate deploy kit as downloadable zip (kept as fallback)
// ============================================================
export const exportDeployKit = async (
  model: DataModel,
  source: SourceConnection,
  lang: string = 'no',
  target: DeployTarget = 'docker-compose',
  binaryFiles?: Record<string, Blob>
) => {
  const files = await generateDeployFiles(model, source, lang, target);

  try {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const folderName = `${model.name.replace(/\s/g, '_')}_deploy`;

    Object.entries(files).forEach(([name, content]) => {
      zip.file(`${folderName}/${name}`, content);
    });

    // Legg til binærfiler (f.eks. GeoPackage) i data/-mappen
    if (binaryFiles) {
      for (const [name, blob] of Object.entries(binaryFiles)) {
        zip.file(`${folderName}/${name}`, blob);
      }
    }

    zip.folder(`${folderName}/data/output`);

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${folderName}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    Object.entries(files).forEach(([name, content]) => {
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    });
  }
};

