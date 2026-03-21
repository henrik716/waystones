import { DataModel, Layer, Field, FieldType, GeometryType, PropertyConstraints, ImportWarning, ImportError, ImportValidationResult } from '../types';
import { createEmptyModel, createEmptyField, createEmptyLayer } from '../constants';
import { normalizeGeometryType } from './geomUtils';
import { mapSqlTypeToFieldType } from './typeMapUtils';
import { sanitizeTechnicalName } from './nameSanitizer';
import yaml from 'js-yaml';

export { normalizeGeometryType } from './geomUtils';
export { mapSqlTypeToFieldType } from './typeMapUtils';

declare var initSqlJs: any;

/** Helper: infer a FieldType from a JS value */
const inferFieldType = (value: any): FieldType => {
  if (typeof value === 'number') {
    return { kind: 'primitive', baseType: Number.isInteger(value) ? 'integer' : 'number' };
  }
  if (typeof value === 'boolean') return { kind: 'primitive', baseType: 'boolean' };
  return { kind: 'primitive', baseType: 'string' };
};

export const processGeoJsonToModel = (json: any, name: string): DataModel => {
  const newModel = createEmptyModel();
  newModel.name = name.replace(/\.[^/.]+$/, "");
  const features = json.features || (Array.isArray(json) ? json : []);
  if (features.length > 0) {
    const firstFeature = features[0];
    if (firstFeature.geometry && firstFeature.geometry.type) {
      newModel.layers[0].geometryType = normalizeGeometryType(firstFeature.geometry.type);
    }
    const p = firstFeature.properties || firstFeature;
    const newProperties: Field[] = Object.keys(p).map(key => ({
      ...createEmptyField(),
      name: sanitizeTechnicalName(key),
      title: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
      fieldType: inferFieldType(p[key]),
      constraints: {}
    }));
    newModel.layers[0].properties = newProperties;
    newModel.layers[0].name = newModel.name;
  }
  return newModel;
};

export const processOpenApiToModel = (json: any, name: string): DataModel => {
  const newModel = createEmptyModel();
  newModel.name = name.replace(/\.[^/.]+$/, "") || "API Model";
  const layers: Layer[] = [];

  const schemas = json.components?.schemas || json.definitions || {};

  const ignoreList = [
    'Link', 'Geometry', 'Point', 'MultiPoint', 'Polygon', 'MultiPolygon',
    'LineString', 'MultiLineString', 'GeometryCollection', 'Feature',
    'FeatureCollection', 'Extent', 'Collection', 'ConfClasses', 'Exception'
  ];

  for (const [tableName, schema] of Object.entries(schemas)) {
    if (ignoreList.includes(tableName)) continue;

    const props = (schema as any).properties;
    if (!props) continue;

    const properties: Field[] = [];
    const requiredProps = (schema as any).required || [];

    let geometryColumnName = '';
    let geometryType: GeometryType = 'Polygon';

    for (const [propName, propDef] of Object.entries(props)) {
      const pDef = propDef as any;
      const rawType = pDef.format || pDef.type || 'string';
      const description = pDef.description?.toLowerCase() || '';

      let fieldType: FieldType = { kind: 'primitive', baseType: 'string' };

      if (rawType.includes('int')) fieldType = { kind: 'primitive', baseType: 'integer' };
      else if (rawType.includes('numeric') || rawType === 'number' || rawType.includes('float')) fieldType = { kind: 'primitive', baseType: 'number' };
      else if (rawType === 'boolean') fieldType = { kind: 'primitive', baseType: 'boolean' };
      else if (rawType.includes('date') || rawType.includes('timestamp')) fieldType = { kind: 'primitive', baseType: 'date' };

      if (description.includes('geometry') || rawType.includes('geometry') || rawType.includes('geography')) {
        fieldType = { kind: 'geometry', geometryType: normalizeGeometryType(rawType + " " + description) };
        geometryColumnName = sanitizeTechnicalName(propName);
        geometryType = normalizeGeometryType(rawType + " " + description);
      }

      properties.push({
        ...createEmptyField(),
        name: sanitizeTechnicalName(propName),
        title: propName.charAt(0).toUpperCase() + propName.slice(1).replace(/_/g, ' '),
        fieldType,
        multiplicity: requiredProps.includes(propName) ? '1..1' : '0..1',
        defaultValue: pDef.default ? String(pDef.default) : '',
        constraints: {}
      });
    }

    layers.push({
      ...createEmptyLayer(tableName),
      properties,
      geometryColumnName,
      geometryType
    });
  }

  newModel.layers = layers.length > 0 ? layers : [createEmptyLayer()];
  return newModel;
};

export const processOgcCollectionsToModel = async (json: any, name: string, baseUrl: string): Promise<DataModel> => {
  const newModel = createEmptyModel();
  newModel.name = name.replace(/\.[^/.]+$/, "") || "OGC API Model";
  const layers: Layer[] = [];

  for (const collection of json.collections) {
    const collectionId = collection.id;
    let itemsUrl = '';

    const itemsLink = collection.links?.find((l: any) => l.rel === 'items');
    if (itemsLink) {
      itemsUrl = itemsLink.href;
      itemsUrl += itemsUrl.includes('?') ? '&limit=1&f=json' : '?limit=1&f=json';
    } else {
      const base = baseUrl.split('?')[0].replace(/\/collections\/?$/, '');
      itemsUrl = `${base}/collections/${collectionId}/items?limit=1&f=json`;
    }

    try {
      const res = await fetch(itemsUrl);
      if (!res.ok) continue;
      const itemsJson = await res.json();

      const properties: Field[] = [];
      let geometryColumnName = 'geometry';
      let geometryType: GeometryType = 'Polygon';

      const features = itemsJson.features || [];
      if (features.length > 0) {
        const firstFeature = features[0];

        if (firstFeature.geometry && firstFeature.geometry.type) {
          geometryType = normalizeGeometryType(firstFeature.geometry.type);
        }

        const p = firstFeature.properties || {};
        Object.keys(p).forEach(key => {
          properties.push({
            ...createEmptyField(),
            name: sanitizeTechnicalName(key),
            title: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
            fieldType: inferFieldType(p[key]),
            constraints: {}
          });
        });
      }

      layers.push({
        ...createEmptyLayer(collectionId),
        name: collection.title || collectionId,
        properties,
        geometryColumnName,
        geometryType
      });

    } catch (e) {
      console.warn(`Could not fetch items for layer: ${collectionId}`, e);
    }
  }

  newModel.layers = layers.length > 0 ? layers : [createEmptyLayer()];
  return newModel;
};

export const processSqlToModel = (sqlText: string, name: string): DataModel => {
  const newModel = createEmptyModel();
  newModel.name = name.replace(/\.[^/.]+$/, "");
  const layers: Layer[] = [];

  const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[\w"']+\.)?["']?([\w]+)["']?\s*\(([\s\S]*?)\)(?:;|\s*$)/gi;

  let match;
  while ((match = createTableRegex.exec(sqlText)) !== null) {
    const tableName = match[1];
    const columnsText = match[2];
    const properties: Field[] = [];

    const columnLines = columnsText.split(/,(?![^\(]*\))/);

    let geometryColumnName = '';
    let geometryType: GeometryType = 'Polygon';

    for (let line of columnLines) {
      line = line.trim();
      if (!line || line.toUpperCase().startsWith('PRIMARY KEY') || line.toUpperCase().startsWith('CONSTRAINT') || line.toUpperCase().startsWith('FOREIGN KEY')) {
        continue;
      }

      const colMatch = line.match(/^["']?([\w]+)["']?\s+([\w\(\)]+)/i);
      if (colMatch) {
        const colName = colMatch[1];
        const colType = colMatch[2];
        const fieldType = mapSqlTypeToFieldType(colType);

        if (fieldType.kind === 'geometry') {
          geometryColumnName = sanitizeTechnicalName(colName);
          geometryType = normalizeGeometryType(colType);
        }

        properties.push({
          ...createEmptyField(),
          name: sanitizeTechnicalName(colName),
          title: colName.charAt(0).toUpperCase() + colName.slice(1).replace(/_/g, ' '),
          fieldType,
          multiplicity: line.toUpperCase().includes('NOT NULL') ? '1..1' : '0..1',
        });
      }
    }

    layers.push({
      ...createEmptyLayer(tableName),
      properties,
      geometryColumnName,
      geometryType
    });
  }

  newModel.layers = layers.length > 0 ? layers : [createEmptyLayer()];
  return newModel;
};

export interface InferredLayerSummary {
  tableName: string;
  featureCount: number;
  geometryType: GeometryType;
  columnCount: number;
  srid: number;
  primaryKeyColumn: string;
}

export interface InferredDataSummary {
  filename: string;
  layers: InferredLayerSummary[];
  srid: number;
  bbox?: { west: number; south: number; east: number; north: number };
}

// Validation function for GeoPackage ID field issues
export const validateGeoPackageIdFields = async (
  db: any,
  tableName: string,
  primaryKeyColumn: string
): Promise<ImportWarning[]> => {
  const warnings: ImportWarning[] = [];

  const columnsRes = db.exec(`PRAGMA table_info("${tableName}")`);
  let foundPkColumn = false;
  let pkColumnType = '';
  let pkHasNulls = false;

  if (columnsRes.length > 0) {
    for (const col of columnsRes[0].values) {
      const name = col[1];
      const type = col[2];
      const notNull = col[3] === 1;
      const isPk = col[5] === 1;
      if (name === primaryKeyColumn) {
        foundPkColumn = isPk;
        pkColumnType = type.toLowerCase();
        try {
          const nullCheckRes = db.exec(`SELECT COUNT(*) FROM "${tableName}" WHERE "${primaryKeyColumn}" IS NULL`);
          if (nullCheckRes.length > 0 && Number(nullCheckRes[0].values[0][0]) > 0) {
            pkHasNulls = true;
          }
        } catch {
          // Ignore errors in NULL check
        }
        break;
      }
    }
  }

  if (!foundPkColumn || primaryKeyColumn === 'fid') {
    warnings.push({
      type: 'no_primary_key',
      layerName: tableName,
      columnName: primaryKeyColumn,
      message: `Table '${tableName}' has no proper primary key column.`,
      suggestion: "Add an INTEGER PRIMARY KEY column (e.g., 'id' or 'fid')",
      severity: 'error'
    });
  }

  if (foundPkColumn && !pkColumnType.includes('int')) {
    warnings.push({
      type: 'non_integer_pk',
      layerName: tableName,
      columnName: primaryKeyColumn,
      message: `Primary key column '${primaryKeyColumn}' in table '${tableName}' is not of type INTEGER.`,
      suggestion: "Change column type to INTEGER for best performance and compatibility",
      severity: 'warning'
    });
  }

  if (pkHasNulls) {
    warnings.push({
      type: 'null_pk',
      layerName: tableName,
      columnName: primaryKeyColumn,
      message: `Primary key column '${primaryKeyColumn}' in table '${tableName}' contains NULL values.`,
      suggestion: "Ensure all rows have values in the primary key column",
      severity: 'error'
    });
  }

  try {
    const duplicateCheckRes = db.exec(`SELECT "${primaryKeyColumn}", COUNT(*) as count FROM "${tableName}" GROUP BY "${primaryKeyColumn}" HAVING count > 1`);
    if (duplicateCheckRes.length > 0 && duplicateCheckRes[0].values.length > 0) {
      warnings.push({
        type: 'non_unique_pk',
        layerName: tableName,
        columnName: primaryKeyColumn,
        message: `Primary key column '${primaryKeyColumn}' in table '${tableName}' has duplicate values.`,
        suggestion: "Remove duplicate values or add a proper AUTOINCREMENT primary key",
        severity: 'error'
      });
    }
  } catch {
    // Ignore errors in duplicate check
  }

  return warnings;
};

export const processGpkgFile = async (file: File): Promise<{
  model: DataModel;
  summary: InferredDataSummary;
  validation: ImportValidationResult
}> => {
  const SQL = await initSqlJs({ locateFile: () => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/sql-wasm.wasm` });
  const arrayBuffer = await file.arrayBuffer();
  const db = new SQL.Database(new Uint8Array(arrayBuffer));
  const tablesRes = db.exec("SELECT table_name, data_type FROM gpkg_contents WHERE data_type = 'features'");
  const layers: Layer[] = [];
  const layerSummaries: InferredLayerSummary[] = [];
  let globalSrid = 25833;
  let globalBbox: { west: number; south: number; east: number; north: number } | undefined;

  if (tablesRes.length > 0) {
    const tableRows = tablesRes[0].values;
    for (const row of tableRows) {
      const tableName = String(row[0]);
      const columnsRes = db.exec(`PRAGMA table_info("${tableName}")`);
      const properties: Field[] = [];
      let geometryColumnName = 'geom';
      let geometryType: GeometryType = 'Polygon';
      let srid = 25833;

      // Geometry metadata + SRS
      const geomMetaRes = db.exec(`SELECT column_name, geometry_type_name, srs_id FROM gpkg_geometry_columns WHERE table_name = '${tableName}'`);
      if (geomMetaRes.length > 0 && geomMetaRes[0].values.length > 0) {
        geometryColumnName = sanitizeTechnicalName(String(geomMetaRes[0].values[0][0]));
        geometryType = normalizeGeometryType(String(geomMetaRes[0].values[0][1]));
        srid = Number(geomMetaRes[0].values[0][2]) || 25833;
        globalSrid = srid;
      }

      // Bbox from gpkg_contents
      try {
        const bboxRes = db.exec(`SELECT min_x, min_y, max_x, max_y FROM gpkg_contents WHERE table_name = '${tableName}'`);
        if (bboxRes.length > 0 && bboxRes[0].values.length > 0) {
          const [west, south, east, north] = bboxRes[0].values[0].map(Number);
          if (!isNaN(west) && !isNaN(south) && !isNaN(east) && !isNaN(north)) {
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
      } catch { /* bbox is optional */ }

      // Feature count
      let featureCount = 0;
      try {
        const countRes = db.exec(`SELECT COUNT(*) FROM "${tableName}"`);
        if (countRes.length > 0) featureCount = Number(countRes[0].values[0][0]);
      } catch { /* count is optional */ }

      // Find primary key column
      let primaryKeyColumn = 'fid';
      if (columnsRes.length > 0) {
        for (const col of columnsRes[0].values) {
          const name = col[1];
          const isPk = col[5] === 1;
          if (isPk) {
            primaryKeyColumn = name;
            break;
          }
        }
      }
      if (columnsRes.length > 0) {
        columnsRes[0].values.forEach((col: any) => {
          const name = col[1];
          const type = col[2];
          const notNull = col[3] === 1;
          const isPk = col[5] === 1;
          if (name !== geometryColumnName && name.toLowerCase() !== 'fid' && !(name.toLowerCase() === 'id' && isPk)) {
            const c: PropertyConstraints = {};
            if (isPk) c.isPrimaryKey = true;
            properties.push({
              ...createEmptyField(),
              name: sanitizeTechnicalName(name),
              title: name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' '),
              fieldType: mapSqlTypeToFieldType(type),
              multiplicity: notNull ? '1..1' : '0..1',
              constraints: c
            });
          }
        });
      }
      layers.push({
        ...createEmptyLayer(tableName),
        properties,
        geometryColumnName,
        geometryType
      });
      layerSummaries.push({
        tableName,
        featureCount,
        geometryType,
        columnCount: properties.length,
        srid,
        primaryKeyColumn,
      });
    }
  }

  // Run validation on all layers BEFORE closing the database
  const allWarnings: ImportWarning[] = [];
  const allErrors: ImportError[] = [];

  for (const layerSummary of layerSummaries) {
    try {
      const warnings = await validateGeoPackageIdFields(db, layerSummary.tableName, layerSummary.primaryKeyColumn);
      allWarnings.push(...warnings);
    } catch (error) {
      allErrors.push({
        type: 'critical',
        layerName: layerSummary.tableName,
        message: `Failed to validate layer '${layerSummary.tableName}'`,
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  const validation: ImportValidationResult = {
    warnings: allWarnings,
    errors: allErrors,
    isValid: allErrors.length === 0 && allWarnings.filter(w => w.severity === 'error').length === 0,
    canProceed: allErrors.length === 0
  };

  db.close();

  const model: DataModel = {
    ...createEmptyModel(),
    name: file.name.replace(/\.[^/.]+$/, ""),
    crs: `EPSG:${globalSrid}`,
    layers: layers.length > 0 ? layers : [createEmptyLayer()],
  };

  const summary: InferredDataSummary = {
    filename: file.name,
    layers: layerSummaries,
    srid: globalSrid,
    bbox: globalBbox,
  };

  return { model, summary, validation };
};

// ============================================================
// Unified file processor: tries GDAL first, falls back to sql.js
// Supports any vector format GDAL can read, not just GeoPackage.
// ============================================================

export const processAnyFile = async (
  files: File | File[]
): Promise<{ model: DataModel; summary: InferredDataSummary; validation: ImportValidationResult }> => {
  const fileArray = Array.isArray(files) ? files : [files];
  const mainFile = fileArray[0];
  const ext = mainFile.name.split('.').pop()?.toLowerCase() || '';

  // Try GDAL first (handles all formats)
  try {
    const { processFilesWithGdal } = await import('./gdalService');
    return await processFilesWithGdal(fileArray);
  } catch (gdalErr) {
    console.warn('GDAL processing failed, trying fallbacks:', gdalErr);
  }

  // Fallback: GeoPackage via sql.js
  if (ext === 'gpkg') {
    return processGpkgFile(mainFile);
  }

  throw new Error(`Unsupported file format: .${ext}. Supported formats: GeoPackage (.gpkg), Shapefile (.shp), GeoJSON, GML, KML, FlatGeobuf, and more (requires GDAL).`);
};

// ============================================================
// Model file detection and import
// ============================================================

/** Helper: Check if an object is a valid DataModel */
const isDataModel = (obj: unknown): obj is DataModel => {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'layers' in obj &&
    'namespace' in obj
  );
};

/** Import a .model.json file */
export const processModelJsonFile = async (file: File): Promise<DataModel> => {
  const text = await file.text();
  const parsed = JSON.parse(text);

  if (!isDataModel(parsed)) {
    throw new Error('File is not a valid Waystones model (missing id, layers, or namespace)');
  }

  return parsed;
};

/** Import a .model.yaml or .model.yml file */
export const processModelYamlFile = async (file: File): Promise<DataModel> => {
  const text = await file.text();
  const parsed = yaml.load(text);

  if (!isDataModel(parsed)) {
    throw new Error('File is not a valid Waystones model (missing id, layers, or namespace)');
  }

  return parsed as DataModel;
};
