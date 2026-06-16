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

  const wmsCrsList = [
    authid,
    ...(model.supportedCRS || []).map(c => c.startsWith('EPSG:') ? c : `EPSG:${c}`),
    'EPSG:4326', 'EPSG:4258', 'EPSG:3857', 'CRS:84'
  ]
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

      // Snapshot Architecture: Ensure QGIS reads the processed FlatGeobuf dataset
      const safeLayerName = toTableName(layer.name);
      const datasource = `/data/${safeLayerName}.fgb|layername=${safeLayerName}`;
      const providerKey = 'ogr';

      const isPoint = layer.geometryType.includes('Point');
      const isLine = layer.geometryType.includes('LineString');
      const isPolygon = !isPoint && !isLine;

      const buildSymbolXml = (symbolStyle: any, name: string = "0") => {
        const opacity = symbolStyle.fillOpacity !== undefined ? symbolStyle.fillOpacity : 1;
        const colorHex = symbolStyle.color || symbolStyle.simpleColor || '#3b82f6';
        const rgb = hexToRgb(colorHex);
        const qColor = `${rgb.r},${rgb.g},${rgb.b},255`;
        const qOutlineColor = `${rgb.r},${rgb.g},${rgb.b},255`;

        const qLineStyle: Record<string, string> = {
          solid: 'solid', dashed: 'dash', dotted: 'dot',
          'dash-dot': 'dash dot', 'dash-dot-dot': 'dash dot dot', 'long-dash': 'dash',
        };
        const styleLineDash = symbolStyle.lineDash || layer.style.lineDash || 'solid';
        const lineStyle = qLineStyle[styleLineDash] || 'solid';
        const lineWidth = symbolStyle.lineWidth ?? layer.style.lineWidth ?? 2;

        const qMarkerName: Record<string, string> = {
          circle: 'circle', square: 'square', triangle: 'triangle', star: 'star',
        };
        const stylePointIcon = symbolStyle.pointIcon || layer.style.pointIcon || 'circle';
        const markerName = qMarkerName[stylePointIcon] || 'circle';

        const hatchStyle = symbolStyle.hatchStyle || layer.style.hatchStyle || 'solid';
        const hatchSpacing = symbolStyle.hatchSpacing ?? layer.style.hatchSpacing ?? 6;
        const hatchThickness = symbolStyle.hatchThickness ?? layer.style.hatchThickness ?? 1;
        
        const hasCustomHatching = hatchStyle !== 'solid' &&
          (hatchSpacing !== undefined || hatchThickness !== undefined);

        const qHatchStyles: Record<string, string> = {
          solid: 'solid', horizontal: 'horiz', vertical: 'vert', cross: 'cross',
          b_diagonal: 'bdiag', f_diagonal: 'fdiag', diagonal_x: 'diag_x',
        };
        const fillStyle = qHatchStyles[hatchStyle] || 'solid';

        if (isPoint) {
          return `<symbol alpha="${opacity}" type="marker" name="${name}">
            <layer class="SimpleMarker">
              <prop k="name" v="${markerName}"/>
              <prop k="color" v="${qColor}"/>
              <prop k="size" v="${symbolStyle.pointSize ?? layer.style.pointSize ?? 8}"/>
              <prop k="size_unit" v="Point"/>
              <prop k="outline_color" v="${qOutlineColor}"/>
              <prop k="outline_width" v="0"/>
            </layer>
          </symbol>`;
        } else if (isLine) {
          return `<symbol alpha="${opacity}" type="line" name="${name}">
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
          const createPatternLayer = (angle: number, distance: number, thickness: number) => `
            <layer class="LinePatternFill">
              <prop k="angle" v="${angle}"/>
              <prop k="distance" v="${distance}"/>
              <prop k="distance_unit" v="Point"/>
              <symbol type="line" name="@${name}@0">
                <layer class="SimpleLine">
                  <prop k="line_color" v="${qColor}"/>
                  <prop k="line_width" v="${thickness}"/>
                  <prop k="line_width_unit" v="Point"/>
                  <prop k="line_style" v="solid"/>
                </layer>
              </symbol>
            </layer>`;

          const polygonOutlineLayer = `
            <layer class="SimpleLine">
              <prop k="line_color" v="${qOutlineColor}"/>
              <prop k="line_width" v="${lineWidth}"/>
              <prop k="line_width_unit" v="Point"/>
              <prop k="line_style" v="${lineStyle}"/>
              <prop k="joinstyle" v="round"/>
            </layer>`;

          if (hasCustomHatching) {
            let patternLayers = '';
            if (hatchStyle === 'cross') {
              patternLayers = createPatternLayer(0, hatchSpacing, hatchThickness) + createPatternLayer(90, hatchSpacing, hatchThickness);
            } else if (hatchStyle === 'diagonal_x') {
              patternLayers = createPatternLayer(45, hatchSpacing, hatchThickness) + createPatternLayer(-45, hatchSpacing, hatchThickness);
            } else {
              const hatchAngles: Record<string, number> = {
                horizontal: 0, vertical: 90, b_diagonal: 45, f_diagonal: -45,
              };
              const angle = hatchAngles[hatchStyle] || 0;
              patternLayers = createPatternLayer(angle, hatchSpacing, hatchThickness);
            }

            return `<symbol alpha="${opacity}" type="fill" name="${name}">
              ${patternLayers}
              ${polygonOutlineLayer}
            </symbol>`;
          } else {
            return `<symbol alpha="${opacity}" type="fill" name="${name}">
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
      };


      let rendererXml = '';
      if (layer.style.type === 'categorized' && layer.style.propertyId) {
        const attrProperty = layer.properties.find(p => p.id === layer.style.propertyId);
        const attrName = attrProperty ? attrProperty.name : '';
        const sp = attrProperty;
        const vals = sp?.fieldType.kind === 'codelist' && sp.fieldType.mode === 'inline' ? sp.fieldType.values : [];

        const categories: string[] = [];
        const symbols: string[] = [];

        vals.forEach((v, vIndex) => {
          const catSettings = layer.style.categorizedSettings?.[v.code];
          const legacyColor = layer.style.categorizedColors?.[v.code];
          
          const symbolStyle = {
            ...catSettings,
            color: catSettings?.color || legacyColor || layer.style.simpleColor
          };

          categories.push(`            <category render="true" symbol="${vIndex}" value="${v.code}" label="${v.label || v.code}"/>`);
          symbols.push(buildSymbolXml(symbolStyle, vIndex.toString()));
        });

        rendererXml = `<renderer-v2 attr="${attrName}" type="categorizedSymbol" enableorderby="0" forceraster="0">
          <categories>
${categories.join('\n')}
          </categories>
          <symbols>
${symbols.join('\n')}
          </symbols>
        </renderer-v2>`;
      } else {
        rendererXml = `<renderer-v2 type="singleSymbol" enableorderby="0" forceraster="0">
          <symbols>
            ${buildSymbolXml(layer.style)}
          </symbols>
        </renderer-v2>`;
      }

      const buildLabelingXml = (layer: Layer) => {
        const ls = layer.style.labelSettings;
        if (!ls || !ls.enabled || !ls.propertyId) return '<labeling type="no-label"/>';

        const prop = layer.properties.find(p => p.id === ls.propertyId);
        const fieldName = prop ? prop.name : '';
        if (!fieldName) return '<labeling type="no-label"/>';

        const rgb = hexToRgb(ls.color || '#000000');
        const qColor = `${rgb.r},${rgb.g},${rgb.b},255`;
        
        const haloRgb = hexToRgb(ls.haloColor || '#ffffff');
        const qHaloColor = `${haloRgb.r},${haloRgb.g},${haloRgb.b},255`;

        const isPoint = layer.geometryType.includes('Point');
        const isLine = layer.geometryType.includes('LineString');
        
        const mode = ls.placement || 'around';
        let placement = "0"; 
        if (isPoint) {
          placement = mode === 'over' ? "1" : "0";
        } else if (isLine) {
          placement = mode === 'curved' ? "3" : "2";
        } else if (isPolygon) {
          placement = mode === 'horizontal' ? "1" : "0";
        }

        return `<labeling type="simple">
        <settings calloutType="simple">
          <text-style
            fontFamily="${ls.fontFamily || 'Arial'}"
            fontSize="${ls.fontSize || 10}"
            fontSizeUnit="Point"
            textColor="${qColor}"
            fieldName="${fieldName}"
            fontWeight="50"
            fontItalic="0"
            fontUnderline="0"
            fontStrikeout="0"
          />
          <text-buffer
            bufferDraw="${ls.haloEnabled ? '1' : '0'}"
            bufferSize="${ls.haloSize || 1}"
            bufferSizeUnits="Point"
            bufferColor="${qHaloColor}"
            bufferOpacity="1"
          />
          <placement 
            placement="${placement}" 
            dist="0" 
            priority="5"
          />
          <rendering 
            fontMinPixelSize="3" 
            scaleVisibility="0" 
            maxNumLabels="2000"
          />
        </settings>
      </labeling>`;
      };

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
        ${rendererXml}
        ${buildLabelingXml(layer)}
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
// Generate QGIS Railway configuration
// Deploys from the pre-built GHCR image — no Dockerfile needed.
// ============================================================
export const generateRailwayQgisJson = (
  _model: DataModel,
  _source: SourceConnection
): string => {
  const config = {
    "$schema": "https://railway.com/railway.schema.json",
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "docker/railway/Dockerfile.qgis",
    },
    deploy: {
      healthcheckPath: "/ows/?SERVICE=WMS&REQUEST=GetCapabilities",
      healthcheckTimeout: 300,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 10,
    },
  };

  return JSON.stringify(config, null, 2);
};
