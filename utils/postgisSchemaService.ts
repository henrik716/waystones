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
  is_nullable: boolean;
  column_default?: string;
  constraint_type?: string;
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
  model.name = connectionString.split('/').pop() || 'postgis_model';
  model.crs = 'EPSG:25833'; // default; could be inferred from server response
  model.layers = [];

  // Group rows by table
  const tableMap: Record<string, SchemaRow[]> = {};
  for (const row of result.layers) {
    if (!tableMap[row.table_name]) {
      tableMap[row.table_name] = [];
    }
    tableMap[row.table_name].push(row);
  }

  for (const [tableName, rows] of Object.entries(tableMap)) {
    const layer = createEmptyLayer(tableName);
    layer.name = tableName;

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

      properties.push({
        ...createEmptyField(),
        name: sanitizeTechnicalName(colName),
        title: colName.charAt(0).toUpperCase() + colName.slice(1).replace(/_/g, ' '),
        fieldType,
        multiplicity: row.is_nullable ? '0..1' : '1..1',
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
