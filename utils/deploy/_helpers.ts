import {
  DataModel, SourceConnection,
  PostgresConfig, SupabaseConfig, GeopackageConfig
} from '../../types';

// ============================================================
// Helper: get Geopackage filename
// ============================================================
export const getGpkgFilename = (model: DataModel, source?: SourceConnection): string => {
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
export const getPgConnectionEnv = (source: SourceConnection): Record<string, string> | null => {
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
