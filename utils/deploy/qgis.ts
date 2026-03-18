import {
  DataModel, Layer, SourceConnection
} from '../../types';
import { hexToRgb } from '../colorUtils';
import { toTableName } from '../nameSanitizer';
import { getGpkgFilename, getPgConnectionEnv } from './_helpers';

// ============================================================
// Known CRS definitions for common Norwegian/European projections.
// QGIS requires srid + proj4 + description to be present — if only
// authid is supplied it silently resets the layer CRS to EPSG:4326.
// ============================================================
export const CRS_DEFINITIONS: Record<string, { srid: number; description: string; proj4: string; geographicflag: boolean }> = {
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
export const buildSpatialRefSys = (authid: string): string => {
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
      const tbl = toTableName(layer.name);
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
// Generate QGIS Dockerfile
// ============================================================
export const generateQgisDockerfile = (
  model: DataModel,
  source: SourceConnection
): string => {
  const isGpkg = source.type === 'geopackage';
  return `FROM qgis/qgis-server:ltr

COPY project.qgs /data/project.qgs
${isGpkg ? 'COPY data/ /data/' : ''}
RUN chmod -R 777 /data

ENV QGIS_PROJECT_FILE=/data/project.qgs

# QGIS_SERVER_SERVICE_URL is set at runtime via .env / Railway / Fly variables
ENV QGIS_SERVER_SERVICE_URL=
EXPOSE 80
`;
};

// ============================================================
// Generate QGIS Fly.io configuration
// ============================================================
export const generateFlyQgisToml = (
  model: DataModel,
  source: SourceConnection
): string => {
  const slug = model.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `app = "${slug}-qgis"
primary_region = "ams"

[build]
  dockerfile = "Dockerfile.qgis"

[env]
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
${source.type === 'geopackage' ? `
[mounts]
  source = "geodata"
  destination = "/data"
` : ''}`;
};

// ============================================================
// Generate QGIS Railway configuration
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
