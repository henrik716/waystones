import {
  DataModel, Layer, Field, FieldType, GeometryType, PropertyConstraints
} from '../types';
import { createEmptyModel, createEmptyField, createEmptyLayer } from '../constants';
import { mapSqlTypeToFieldType } from './typeMapUtils';
import { normalizeGeometryType } from './geomUtils';
import { sanitizeTechnicalName } from './nameSanitizer';

/**
 * Schema row returned from the server's /api/pg-schema endpoint.
 */
interface SchemaRow {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name?: string;
  is_nullable: boolean | string;
  column_default?: string;
  constraint_type?: string;
}

/**
 * Validates that a row from the server has all required fields.
 */
function isValidSchemaRow(row: unknown): row is SchemaRow {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;
  return typeof r.table_name === 'string' && r.table_name.length > 0
    && typeof r.column_name === 'string' && r.column_name.length > 0
    && typeof r.data_type === 'string';
}

/**
 * Call the /api/pg-schema endpoint and convert the result to a DataModel.
 *
 * This is a browser-side client for the PostGIS proxy. Requires:
 * - A running Waystones server with POST /api/pg-schema endpoint
 * - Optional: SUPABASE_JWT_SECRET env var set on the server for auth
 *
 * @param connectionString - PostgreSQL connection string (e.g., "postgresql://user:pass@host:5432/db")
 * @param supabaseJwt - Optional Supabase JWT token (required if server has SUPABASE_JWT_SECRET set)
 * @param schema - PostgreSQL schema name (default: 'public')
 * @returns A DataModel with one Layer per table
 */
export const processPostgisSchemaToModel = async (
  connectionString: string,
  supabaseJwt?: string,
  schema: string = 'public'
): Promise<DataModel> => {
  if (!connectionString) {
    throw new Error('connectionString is required');
  }

  // Call the server endpoint
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (supabaseJwt) {
    headers['Authorization'] = `Bearer ${supabaseJwt}`;
  }

  const response = await fetch('/api/pg-schema', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      connectionString,
      schema,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`PostGIS schema fetch failed: ${response.status} ${error}`);
  }

  const result = await response.json();

  if (!result.layers || !Array.isArray(result.layers)) {
    throw new Error('Invalid response from PostGIS schema endpoint');
  }

  // Convert the response to a DataModel using the same logic as supabaseSchemaService
  const model = createEmptyModel();
  const rawDbName = connectionString.split('/').pop()?.split('?')[0] || 'postgis_model';
  model.name = sanitizeTechnicalName(rawDbName) || 'postgis_model';
  model.crs = 'EPSG:4326'; // WGS 84 - widely used geographic CRS; user can change if needed
  model.layers = [];

  // Group rows by table
  const tableMap: Record<string, SchemaRow[]> = {};
  for (const row of result.layers) {
    if (!isValidSchemaRow(row)) {
      console.warn('Skipping invalid schema row:', row);
      continue;
    }
    if (!tableMap[row.table_name]) {
      tableMap[row.table_name] = [];
    }
    tableMap[row.table_name].push(row);
  }

  for (const [tableName, rows] of Object.entries(tableMap)) {
    const layer = createEmptyLayer(tableName);
    layer.name = sanitizeTechnicalName(tableName);

    const properties: Field[] = [];
    let geometryColumnName = '';
    let geometryType: GeometryType = 'Polygon';

    for (const row of rows) {
      const colName = row.column_name;
      const dataType = row.data_type;
      const udtName = row.udt_name?.toLowerCase() || dataType.toLowerCase();

      // Skip geometry columns for now, track them separately
      if (udtName.includes('geometry') || udtName.includes('geography')) {
        geometryColumnName = sanitizeTechnicalName(colName);
        geometryType = normalizeGeometryType(udtName);
        continue;
      }

      const fieldType = mapSqlTypeToFieldType(dataType);

      const constraints: PropertyConstraints = {};
      if (row.constraint_type === 'PRIMARY KEY') {
        constraints.isPrimaryKey = true;
      }

      const sanitizedName = sanitizeTechnicalName(colName);
      properties.push({
        ...createEmptyField(),
        name: sanitizedName,
        title: sanitizedName.charAt(0).toUpperCase() + sanitizedName.slice(1).replace(/_/g, ' '),
        fieldType,
        multiplicity: (row.is_nullable === true || row.is_nullable === 'YES') ? '0..1' : '1..1',
        defaultValue: row.column_default ? String(row.column_default) : '',
        constraints,
      });
    }

    layer.properties = properties;
    layer.geometryColumnName = geometryColumnName;
    layer.geometryType = geometryType;

    model.layers.push(layer);
  }

  // Fallback to single empty layer if no tables found
  if (model.layers.length === 0) {
    model.layers = [createEmptyLayer()];
  }

  return model;
};
