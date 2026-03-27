/**
 * gdalService.ts — Browser-side GDAL via gdal3.js (WebAssembly)
 * 
 * Provides high-level functions for inspecting, converting, and validating
 * geospatial files entirely in the browser. Lazy-loads the ~15MB WASM bundle
 * on first use so it doesn't affect initial page load.
 * 
 * Supported input formats (via GDAL drivers):
 *   Vector: GeoPackage, Shapefile, GeoJSON, GML, KML, FlatGeobuf, MapInfo TAB,
 *           CSV (with geometry), FileGDB, SQLite/SpatiaLite, GPX, ...
 *   Raster: GeoTIFF, PNG, JPEG, WebP, MBTiles (only for info; not converted)
 */

import {
  DataModel, Layer, Field, FieldType, GeometryType, PropertyConstraints, ImportValidationResult, ImportWarning, ImportError
} from '../types';
import { createEmptyModel, createEmptyField, createEmptyLayer } from '../constants';
import type { Translations } from '../i18n/index';
import { normalizeGeometryType } from './geomUtils';
import { InferredDataSummary, InferredLayerSummary } from './importUtils';
import { sanitizeTechnicalName } from './nameSanitizer';

// ============================================================
// GDAL instance — lazy loaded, singleton
// ============================================================
let gdalInstance: any = null;
let gdalLoadingPromise: Promise<any> | null = null;

const GDAL_CDN_PATH = 'https://cdn.jsdelivr.net/npm/gdal3.js@2.8.1/dist/package';

/**
 * Lazy-load gdal3.js WASM. Returns the Gdal API object.
 * Subsequent calls return the cached instance immediately.
 */
export const getGdal = async (): Promise<any> => {
  if (gdalInstance) return gdalInstance;
  if (gdalLoadingPromise) return gdalLoadingPromise;

  gdalLoadingPromise = (async () => {
    let initFn: any = null;

    // 1. Forsøk å laste inn via Vite
    try {
      const mod = await import('gdal3.js');
      initFn = typeof mod === 'function' ? mod :
        typeof mod.default === 'function' ? mod.default :
          typeof (mod as any).initGdalJs === 'function' ? (mod as any).initGdalJs : null;
    } catch (e) {
      console.warn("Lokal import feilet, går over til script-fallback.");
    }

    // 2. Fallback til <script>-metoden din
    if (typeof initFn !== 'function') {
      if (!(window as any).initGdalJs) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = `${GDAL_CDN_PATH}/gdal3.js`;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load gdal3.js from CDN'));
          document.head.appendChild(script);
        });
      }
      initFn = (window as any).initGdalJs;
    }

    if (typeof initFn !== 'function') {
      throw new Error('Kritisk feil: Fant modulen, men ingen startfunksjon.');
    }

    // 3. MAGIEN: Vi dropper Worker fullstendig i AI Studio!
    // Dette omgår alle CORS-feil fordi alt kjøres i hovedtråden.
    gdalInstance = await initFn({
      path: GDAL_CDN_PATH,
      useWorker: false // <--- Dette fikser alt
    });

    return gdalInstance;
  })();

  return gdalLoadingPromise;
};

/**
 * Check if gdal3.js is available (already loaded).
 */
export const isGdalReady = (): boolean => gdalInstance !== null;

// ============================================================
// Supported file extensions for auto-detection
// ============================================================
const VECTOR_EXTENSIONS = new Set([
  'gpkg', 'shp', 'geojson', 'json', 'gml', 'kml', 'kmz',
  'fgb', 'parquet', 'tab', 'mif', 'gdb', 'sqlite', 'csv', 'tsv',
  'gpx', 'ods', 'xlsx', 'dxf', 'dgn', 'pbf', 'osm',
]);

const SHAPEFILE_SIDECARS = new Set(['shx', 'dbf', 'prj', 'cpg', 'sbn', 'sbx', 'qix']);

/**
 * Check if a file (or set of files) is a supported vector format.
 */
export const isSupportedVectorFile = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return VECTOR_EXTENSIONS.has(ext) || SHAPEFILE_SIDECARS.has(ext);
};

/**
 * Group files by dataset. Shapefiles need .shp + .shx + .dbf + optional .prj etc.
 * Returns the "main" files that should be opened (e.g., the .shp, not the .dbf).
 */
export const groupFilesByDataset = (files: File[]): File[][] => {
  const byBaseName: Record<string, File[]> = {};

  for (const f of files) {
    const name = f.name;
    const dotIdx = name.lastIndexOf('.');
    const base = dotIdx > 0 ? name.substring(0, dotIdx) : name;
    const ext = dotIdx > 0 ? name.substring(dotIdx + 1).toLowerCase() : '';

    if (!byBaseName[base]) byBaseName[base] = [];
    byBaseName[base].push(f);
  }

  // For shapefiles, all sidecars are one group.
  // For everything else, each file is its own group.
  const groups: File[][] = [];
  const processedBases = new Set<string>();

  for (const [base, group] of Object.entries(byBaseName)) {
    if (processedBases.has(base)) continue;
    const exts = group.map(f => f.name.split('.').pop()?.toLowerCase() || '');
    const hasShp = exts.includes('shp');

    if (hasShp) {
      // Shapefile group — include all sidecars
      groups.push(group);
      processedBases.add(base);
    } else {
      // Each non-sidecar file is its own dataset
      for (const f of group) {
        const ext = f.name.split('.').pop()?.toLowerCase() || '';
        if (!SHAPEFILE_SIDECARS.has(ext)) {
          groups.push([f]);
        }
      }
      processedBases.add(base);
    }
  }

  return groups;
};

// ============================================================
// Types for GDAL introspection results
// ============================================================

export interface GdalFieldInfo {
  name: string;
  type: string;       // GDAL type: String, Integer, Integer64, Real, Date, DateTime, Binary, ...
  width?: number;
  precision?: number;
  nullable?: boolean;
  uniqueConstraint?: boolean;
}

export interface GdalGeometryFieldInfo {
  name: string;
  type: string;       // Point, LineString, Polygon, MultiPolygon, etc.
  srs?: {
    wkt?: string;
    projjson?: any;
    dataAxisToSRSAxisMapping?: number[];
  };
  extent?: [number, number, number, number]; // [xmin, ymin, xmax, ymax]
}

export interface GdalLayerInfo {
  name: string;
  featureCount: number;
  geometryFields: GdalGeometryFieldInfo[];
  fields: GdalFieldInfo[];
}

export interface GdalDatasetInfo {
  driverName: string;
  filename: string;
  layers: GdalLayerInfo[];
}

// ============================================================
// Core functions
// ============================================================

/**
 * Open files with GDAL and return structured dataset info.
 * This is the primary entry point for introspecting any geospatial file.
 */
export const inspectFiles = async (files: File[]): Promise<GdalDatasetInfo[]> => {
  const Gdal = await getGdal();
  const datasets: GdalDatasetInfo[] = [];
  const fileGroups = groupFilesByDataset(files);

  for (const group of fileGroups) {
    try {
      const filenames = group.map(f => f.name);
      const result = await Gdal.open(group);

      if (!result.datasets || result.datasets.length === 0) continue;

      for (const ds of result.datasets) {
        const info = await getDatasetInfoJson(Gdal, ds);
        if (info) {
          datasets.push(info);
        }
        Gdal.close(ds);
      }
    } catch (err) {
      console.warn(`GDAL could not open: ${group.map(f => f.name).join(', ')}`, err);
    }
  }

  return datasets;
};

/**
 * Run ogrinfo -json -al -so on a dataset and parse the structured output.
 * Falls back to getInfo() + text-based ogrinfo if -json is not supported.
 */
/**
 * Run ogrinfo -json -al -so on a dataset and parse the structured output.
 * Falls back to getInfo() + text-based ogrinfo if -json is not supported.
 */
const getDatasetInfoJson = async (Gdal: any, dataset: any): Promise<GdalDatasetInfo | null> => {
  try {
    // 1. Prøv JSON-output først
    const jsonOutput = await Gdal.ogrinfo(dataset, ['-json', '-al', '-so']);

    // SIKRING: Hvis gdal3.js allerede har gjort det om til et objekt, bruk det. 
    // Hvis det er en tekststreng, bruker vi JSON.parse.
    const parsed = typeof jsonOutput === 'string' ? JSON.parse(jsonOutput) : jsonOutput;

    if (parsed && parsed.layers) {
      return {
        driverName: parsed.driverShortName || parsed.driverName || 'unknown',
        filename: parsed.description || dataset.name || '',
        layers: parsed.layers.map((l: any) => ({
          name: l.name,
          featureCount: l.featureCount ?? 0,
          geometryFields: (l.geometryFields || []).map((g: any) => ({
            name: g.name || 'geometry',
            type: g.type || 'Unknown',
            srs: g.coordinateSystem ? {
              wkt: g.coordinateSystem.wkt,
              projjson: g.coordinateSystem.projjson,
              dataAxisToSRSAxisMapping: g.coordinateSystem.dataAxisToSRSAxisMapping,
            } : undefined,
            extent: g.extent ? [g.extent[0], g.extent[1], g.extent[2], g.extent[3]] : undefined,
          })),
          fields: (l.fields || []).map((f: any) => ({
            name: f.name,
            type: f.type || 'String',
            width: f.width,
            precision: f.precision,
            nullable: f.nullable,
            uniqueConstraint: f.uniqueConstraint,
          })),
        })),
      };
    }
  } catch (err) {
    // Ignorer feil her, vi lar den gå til fallback
  }

  // 2. Fallback: Bruk getInfo() for basic metadata + tekst ogrinfo for field details
  try {
    const basicInfo = await Gdal.getInfo(dataset);
    if (basicInfo.type !== 'vector') return null;

    const textOutput = await Gdal.ogrinfo(dataset, ['-al', '-so']);

    // SIKRING: Hent ut selve tekststrengen uansett hva slags format Gdal returnerer
    const textStr = typeof textOutput === 'string' ? textOutput :
      (textOutput && textOutput.stdout) ? textOutput.stdout :
        (textOutput && textOutput.text) ? textOutput.text :
          String(textOutput);

    const layers = parseOgrinfoText(textStr, basicInfo);

    return {
      driverName: basicInfo.driverName || 'unknown',
      filename: basicInfo.dsName || '',
      layers,
    };
  } catch (err) {
    console.warn('GDAL fallback inspection failed', err);
    return null;
  }
};

/**
 * Parse the text output of ogrinfo -al -so into structured layer info.
 * This is the fallback when -json is not available.
 */
const parseOgrinfoText = (text: string, basicInfo: any): GdalLayerInfo[] => {
  const layers: GdalLayerInfo[] = [];
  // Split by "Layer name:" sections
  const layerBlocks = text.split(/^Layer name:/m).slice(1);

  for (const block of layerBlocks) {
    const lines = block.split('\n');
    const name = lines[0]?.trim() || 'unknown';

    let geometryType = 'Unknown';
    let featureCount = 0;
    let srsWkt = '';
    const fields: GdalFieldInfo[] = [];
    const extent: number[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('Geometry:')) {
        geometryType = trimmed.replace('Geometry:', '').trim();
      }
      if (trimmed.startsWith('Feature Count:')) {
        featureCount = parseInt(trimmed.replace('Feature Count:', '').trim()) || 0;
      }
      if (trimmed.startsWith('Extent:')) {
        const match = trimmed.match(/\(([^)]+)\)\s*-\s*\(([^)]+)\)/);
        if (match) {
          const [x1, y1] = match[1].split(',').map(Number);
          const [x2, y2] = match[2].split(',').map(Number);
          extent.push(x1, y1, x2, y2);
        }
      }
      // Field lines look like: "fieldname: Type (width.precision)"
      const fieldMatch = trimmed.match(/^(\w[\w\s]*\w|\w+):\s+(\w+)\s*(?:\((\d+)(?:\.(\d+))?\))?/);
      if (fieldMatch && !trimmed.startsWith('Geometry:') && !trimmed.startsWith('Feature Count:')
        && !trimmed.startsWith('Extent:') && !trimmed.startsWith('Layer name:')
        && !trimmed.startsWith('Layer SRS')) {
        fields.push({
          name: fieldMatch[1].trim(),
          type: fieldMatch[2],
          width: fieldMatch[3] ? parseInt(fieldMatch[3]) : undefined,
          precision: fieldMatch[4] ? parseInt(fieldMatch[4]) : undefined,
        });
      }
    }

    layers.push({
      name,
      featureCount,
      geometryFields: [{
        name: 'geometry',
        type: geometryType,
        extent: extent.length === 4 ? extent as [number, number, number, number] : undefined,
      }],
      fields,
    });
  }

  // If text parsing yielded nothing, use basicInfo
  if (layers.length === 0 && basicInfo.layers) {
    for (const l of basicInfo.layers) {
      layers.push({
        name: l.name,
        featureCount: l.featureCount || 0,
        geometryFields: [{ name: 'geometry', type: 'Unknown' }],
        fields: [],
      });
    }
  }

  return layers;
};

// ============================================================
// Mapping GDAL types to Waystones FieldType
// ============================================================

const gdalTypeToFieldType = (gdalType: string): FieldType => {
  const t = gdalType.toLowerCase();
  if (t === 'integer' || t === 'integer64') return { kind: 'primitive', baseType: 'integer' };
  if (t === 'real' || t === 'float') return { kind: 'primitive', baseType: 'number' };
  if (t === 'date' || t === 'datetime' || t === 'time') return { kind: 'primitive', baseType: 'date' };
  if (t === 'binary') return { kind: 'primitive', baseType: 'string' }; // fallback
  return { kind: 'primitive', baseType: 'string' };
};

/**
 * Extract EPSG code from a GDAL SRS object.
 * Tries projjson first, then WKT parsing.
 */
const extractEpsgFromSrs = (srs?: GdalGeometryFieldInfo['srs']): number | null => {
  if (!srs) return null;

  // Try projjson → id.code
  if (srs.projjson?.id?.code) {
    return Number(srs.projjson.id.code);
  }

  // Try WKT: look for AUTHORITY["EPSG","25833"]
  if (srs.wkt) {
    const match = srs.wkt.match(/AUTHORITY\["EPSG","(\d+)"\]/);
    if (match) return parseInt(match[1]);
    // Also try ID["EPSG",25833] (WKT2 format)
    const match2 = srs.wkt.match(/ID\["EPSG",\s*(\d+)\]/);
    if (match2) return parseInt(match2[1]);
  }

  return null;
};

// ============================================================
// Convert GDAL inspection results to Waystones DataModel
// ============================================================

/**
 * Split GeoJSON features by geometry type into separate FeatureCollections.
 * This allows mixed-geometry GeoJSON files (e.g., from Overpass Turbo) to be
 * properly organized into separate layers by geometry type.
 */
const splitGeoJsonByGeometryType = (geojson: any): Record<string, any> => {
  const features = geojson.features || (Array.isArray(geojson) ? geojson : []);
  const byGeometryType: Record<string, any[]> = {};

  features.forEach((feature: any) => {
    const geomType = feature.geometry?.type || 'Unknown';
    if (!byGeometryType[geomType]) {
      byGeometryType[geomType] = [];
    }
    byGeometryType[geomType].push(feature);
  });

  const result: Record<string, any> = {};
  Object.entries(byGeometryType).forEach(([geomType, feats]) => {
    result[geomType] = {
      type: 'FeatureCollection',
      features: feats,
    };
  });

  return result;
};

/**
 * Convert GdalDatasetInfo to a Waystones DataModel + InferredDataSummary.
 * This is the main bridge between GDAL output and the existing Waystones types.
 */
export const gdalInfoToModel = (
  info: GdalDatasetInfo,
  originalFilename: string
): { model: DataModel; summary: InferredDataSummary } => {
  const layers: Layer[] = [];
  const layerSummaries: InferredLayerSummary[] = [];
  let globalSrid = 25833; // default Norwegian CRS
  let globalBbox: { west: number; south: number; east: number; north: number } | undefined;

  for (const layerInfo of info.layers) {
    const geomField = layerInfo.geometryFields[0];
    const geometryType = geomField
      ? normalizeGeometryType(geomField.type)
      : 'Polygon' as GeometryType;
    const geometryColumnName = geomField?.name ? sanitizeTechnicalName(geomField.name) : 'geometry';

    // Extract CRS
    const srid = extractEpsgFromSrs(geomField?.srs);
    if (srid) globalSrid = srid;

    // Extract bbox
    if (geomField?.extent) {
      const [west, south, east, north] = geomField.extent;
      if (!isNaN(west) && !isNaN(south)) {
        if (!globalBbox) {
          globalBbox = { west, south, east, north };
        } else {
          globalBbox.west = Math.min(globalBbox.west, west);
          globalBbox.south = Math.min(globalBbox.south, south);
          globalBbox.east = Math.max(globalBbox.east, east);
          globalBbox.north = Math.max(globalBbox.north, north);
        }
      }
    }

    // Map fields to Waystones properties
    const properties: Field[] = layerInfo.fields
      .filter(f => f.name.toLowerCase() !== 'fid' && sanitizeTechnicalName(f.name).toLowerCase() !== geometryColumnName.toLowerCase())
      .map(f => {
        const constraints: PropertyConstraints = {};
        if (f.uniqueConstraint) constraints.isPrimaryKey = true;
        return {
          ...createEmptyField(),
          name: sanitizeTechnicalName(f.name),
          title: f.name.charAt(0).toUpperCase() + f.name.slice(1).replace(/_/g, ' '),
          fieldType: gdalTypeToFieldType(f.type),
          multiplicity: (f.nullable === false ? '1..1' : '0..1') as Field['multiplicity'],
          constraints,
        };
      });

    // Find primary key column
    let primaryKeyColumn = 'fid';
    const pkField = layerInfo.fields.find(f => f.uniqueConstraint);
    if (pkField) {
      primaryKeyColumn = sanitizeTechnicalName(pkField.name);
    }

    layers.push({
      ...createEmptyLayer(layerInfo.name),
      properties,
      geometryColumnName,
      geometryType,
      primaryKeyColumn,
    });

    layerSummaries.push({
      tableName: layerInfo.name,
      featureCount: layerInfo.featureCount,
      geometryType,
      columnCount: properties.length,
      srid: srid || globalSrid,
      primaryKeyColumn,
    });
  }

  const model: DataModel = {
    ...createEmptyModel(),
    name: originalFilename.replace(/\.[^/.]+$/, ''),
    crs: `EPSG:${globalSrid}`,
    layers: layers.length > 0 ? layers : [createEmptyLayer()],
  };

  const summary: InferredDataSummary = {
    filename: originalFilename,
    layers: layerSummaries,
    srid: globalSrid,
    bbox: globalBbox,
  };

  return { model, summary };
};

// ============================================================
// High-level convenience: inspect files → DataModel
// ============================================================

/**
 * Drop-in replacement for processGpkgFile that supports ANY format.
 * Opens files with GDAL, introspects, and returns a DataModel + summary.
 * Special handling: For GeoJSON with mixed geometry types, splits into separate layers.
 */
export const processFilesWithGdal = async (
  files: File | File[]
): Promise<{ model: DataModel; summary: InferredDataSummary; validation: ImportValidationResult }> => {
  const fileArray = Array.isArray(files) ? files : [files];
  const mainFile = fileArray[0];

  // Special handling for GeoJSON files with mixed geometry types
  const isGeoJson = mainFile.name.endsWith('.geojson') || mainFile.name.endsWith('.json');
  let filesToProcess = fileArray;

  if (isGeoJson) {
    try {
      const text = await mainFile.text();
      const geojson = JSON.parse(text);
      const features = geojson.features || (Array.isArray(geojson) ? geojson : []);

      // Check if we have mixed geometry types
      const geometryTypes = new Set(features.map((f: any) => f.geometry?.type));

      if (geometryTypes.size > 1) {
        // Split by geometry type and create separate files
        const splitByType = splitGeoJsonByGeometryType(geojson);
        filesToProcess = [];

        for (const [geomType, geojsonData] of Object.entries(splitByType)) {
          const splitJson = JSON.stringify(geojsonData);
          const blob = new Blob([splitJson], { type: 'application/json' });
          const layerName = geomType.toLowerCase();
          const splitFile = new File([blob], `${layerName}.geojson`, { type: 'application/json' });
          filesToProcess.push(splitFile);
        }
      }
    } catch (err) {
      console.warn('Could not pre-process GeoJSON for geometry splitting, continuing with normal flow:', err);
    }
  }

  const datasets = await inspectFiles(filesToProcess);
  if (datasets.length === 0) {
    throw new Error(`GDAL could not read: ${mainFile.name}`);
  }

  // Merge all datasets into one model (typically there's just one)
  const firstDs = datasets[0];
  const result = gdalInfoToModel(firstDs, mainFile.name);

  // If multiple datasets, merge layers from subsequent ones
  for (let i = 1; i < datasets.length; i++) {
    const extra = gdalInfoToModel(datasets[i], datasets[i].filename);
    result.model.layers.push(...extra.model.layers);
    result.summary.layers.push(...extra.summary.layers);
  }

  // Validate ID fields for all layers
  const warnings: ImportWarning[] = [];
  const errors: ImportError[] = [];

  for (const layerSummary of result.summary.layers) {

    // Find the corresponding model layer to check properties (like DeployPanel does)
    const modelLayer = result.model.layers.find(l => l.name === layerSummary.tableName);

    const hasIdField = !!modelLayer?.primaryKeyColumn;

    if (!hasIdField) {
      warnings.push({
        type: 'no_primary_key',
        layerName: layerSummary.tableName,
        columnName: 'none',
        message: `Layer '${layerSummary.tableName}' has no primary key defined.`,
        suggestion: "Set a primary key column in the layer editor before deploying",
        severity: 'error'
      });
    }
  }

  const validation: ImportValidationResult = {
    warnings,
    errors,
    isValid: errors.length === 0 && warnings.filter(w => w.severity === 'error').length === 0,
    canProceed: errors.length === 0
  };

  return { ...result, validation };
};

// ============================================================
// Format conversion
// ============================================================

/**
 * Convert any supported file to GeoPackage, entirely in the browser.
 * Returns a Blob of the resulting .gpkg file.
 */
export const convertToGeoPackage = async (
  files: File | File[],
  options?: {
    targetCrs?: string;    // e.g., 'EPSG:25833'
    layerName?: string;    // override output layer name
  }
): Promise<Blob> => {
  const Gdal = await getGdal();
  const fileArray = Array.isArray(files) ? files : [files];
  const result = await Gdal.open(fileArray);

  if (!result.datasets || result.datasets.length === 0) {
    throw new Error('GDAL could not open the input file(s)');
  }

  const dataset = result.datasets[0];

  const ogr2ogrOpts: string[] = ['-f', 'GPKG'];
  if (options?.targetCrs) {
    ogr2ogrOpts.push('-t_srs', options.targetCrs);
  }
  if (options?.layerName) {
    ogr2ogrOpts.push('-nln', options.layerName);
  }

  const output = await Gdal.ogr2ogr(dataset, ogr2ogrOpts);
  const bytes = await Gdal.getFileBytes(output);

  Gdal.close(dataset);

  return new Blob([bytes], { type: 'application/geopackage+sqlite3' });
};

/**
 * Convert any file to GeoJSON (useful for preview/validation).
 * Returns a parsed GeoJSON object.
 */
export const convertToGeoJson = async (
  files: File | File[],
  options?: {
    targetCrs?: string;
    maxFeatures?: number;
  }
): Promise<any> => {
  const Gdal = await getGdal();
  const fileArray = Array.isArray(files) ? files : [files];
  const result = await Gdal.open(fileArray);

  if (!result.datasets || result.datasets.length === 0) {
    throw new Error('GDAL could not open the input file(s)');
  }

  const dataset = result.datasets[0];

  const opts: string[] = ['-f', 'GeoJSON'];
  if (options?.targetCrs) opts.push('-t_srs', options.targetCrs);
  if (options?.maxFeatures) opts.push('-limit', String(options.maxFeatures));

  const output = await Gdal.ogr2ogr(dataset, opts);
  const bytes = await Gdal.getFileBytes(output);

  Gdal.close(dataset);

  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text);
};

// ============================================================
// Coordinate system operations
// ============================================================

/**
 * Reproject coordinates using GDAL's gdaltransform.
 */
export const reprojectCoordinates = async (
  coords: [number, number][],
  sourceCrs: string,
  targetCrs: string
): Promise<[number, number][]> => {
  const Gdal = await getGdal();
  const result = await Gdal.gdaltransform(coords, [
    '-s_srs', sourceCrs,
    '-t_srs', targetCrs,
    '-output_xy',
  ]);
  return result;
};

// ============================================================
// Geometry validation
// ============================================================

export interface ValidationResult {
  layerName: string;
  totalFeatures: number;
  invalidCount: number;
  validPercent: number;
}

/**
 * Validate geometries in a dataset. Uses ogr2ogr with -makevalid
 * in a dry-run sense: converts to GeoJSON with validity check.
 * 
 * Note: Full validation requires iterating features, which may be
 * slow for large files. Consider using on a sample.
 */
export const validateGeometries = async (
  files: File | File[]
): Promise<ValidationResult[]> => {
  const Gdal = await getGdal();
  const fileArray = Array.isArray(files) ? files : [files];
  const results: ValidationResult[] = [];

  const openResult = await Gdal.open(fileArray);
  if (!openResult.datasets || openResult.datasets.length === 0) return results;

  for (const ds of openResult.datasets) {
    const info = await Gdal.getInfo(ds);
    if (info.type !== 'vector') continue;

    for (const layerMeta of (info.layers || [])) {
      // Use SQL to count invalid geometries
      // ogr2ogr with -dialect sqlite and ST_IsValid
      try {
        const sqlQuery = `SELECT COUNT(*) as total, SUM(CASE WHEN ST_IsValid(geometry) THEN 0 ELSE 1 END) as invalid FROM "${layerMeta.name}"`;
        const sqlOutput = await Gdal.ogrinfo(ds, ['-sql', sqlQuery, '-al']);

        // Parse the text output for total and invalid counts
        const totalMatch = sqlOutput.match(/total\s*\(Integer\)\s*=\s*(\d+)/);
        const invalidMatch = sqlOutput.match(/invalid\s*\(Integer\)\s*=\s*(\d+)/);

        const total = totalMatch ? parseInt(totalMatch[1]) : layerMeta.featureCount || 0;
        const invalid = invalidMatch ? parseInt(invalidMatch[1]) : 0;

        results.push({
          layerName: layerMeta.name,
          totalFeatures: total,
          invalidCount: invalid,
          validPercent: total > 0 ? Math.round(((total - invalid) / total) * 100) : 100,
        });
      } catch {
        // SpatiaLite SQL might not be available; skip validation for this layer
        results.push({
          layerName: layerMeta.name,
          totalFeatures: layerMeta.featureCount || 0,
          invalidCount: -1, // indicates "could not validate"
          validPercent: -1,
        });
      }
    }

    Gdal.close(ds);
  }

  return results;
};

/**
 * Repair invalid geometries and return as GeoPackage.
 */
export const repairGeometries = async (
  files: File | File[],
  targetCrs?: string
): Promise<Blob> => {
  const Gdal = await getGdal();
  const fileArray = Array.isArray(files) ? files : [files];
  const result = await Gdal.open(fileArray);

  if (!result.datasets || result.datasets.length === 0) {
    throw new Error('GDAL could not open the input file(s)');
  }

  const dataset = result.datasets[0];
  const opts: string[] = ['-f', 'GPKG', '-makevalid'];
  if (targetCrs) opts.push('-t_srs', targetCrs);

  const output = await Gdal.ogr2ogr(dataset, opts);
  const bytes = await Gdal.getFileBytes(output);

  Gdal.close(dataset);
  return new Blob([bytes], { type: 'application/geopackage+sqlite3' });
};

// ============================================================
// Utility: get list of available GDAL drivers
// ============================================================

export const getAvailableDrivers = async (): Promise<{
  vector: string[];
  raster: string[];
}> => {
  const Gdal = await getGdal();
  return {
    vector: Object.keys(Gdal.drivers?.vector || {}),
    raster: Object.keys(Gdal.drivers?.raster || {}),
  };
};
