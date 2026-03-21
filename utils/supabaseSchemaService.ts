import { processOpenApiToModel } from './importUtils';
import { DataModel } from '../types';

/**
 * Import schema from a Supabase project via its PostgREST OpenAPI spec.
 *
 * No setup required — uses the anonymous key to fetch the OpenAPI spec
 * which contains every table and column definition.
 *
 * @param projectUrl - Supabase project URL (e.g., "https://myproject.supabase.co")
 * @param anonKey - Supabase anonymous key (public, safe for browser)
 * @param schema - PostgreSQL schema name (default: 'public', currently unused but kept for API compatibility)
 * @returns A DataModel with one Layer per table
 */
export const processSupabaseSchemaToModel = async (
  projectUrl: string,
  anonKey: string,
  schema: string = 'public'
): Promise<DataModel> => {
  if (!projectUrl || !anonKey) {
    throw new Error('projectUrl and anonKey are required');
  }

  // Fetch the OpenAPI/Swagger spec from PostgREST
  const specUrl = `${projectUrl.replace(/\/$/, '')}/rest/v1/`;
  const res = await fetch(specUrl, {
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Could not connect to Supabase: ${res.status} ${res.statusText}`);
  }

  const openApiSpec = await res.json();

  // Reuse the existing OpenAPI parser
  const projectName = projectUrl.split('.')[0].replace('https://', '');
  const model = processOpenApiToModel(openApiSpec, projectName);

  // Set a sensible default CRS
  model.crs = 'EPSG:25833';

  return model;
};
