import {
  DataModel, SourceConnection,
  PostgresConfig, SupabaseConfig, GeopackageConfig, S3StorageConfig
} from '../../types';

// ============================================================
// Helper: parse a PostgreSQL connection string into PostgresConfig
// Supports URL format: postgresql://user:pass@host:5432/dbname
// and key=value format: host=H port=P dbname=D user=U password=P
// ============================================================
export const parsePostgresConnectionString = (connStr: string, schema = 'public'): PostgresConfig => {
  // URL format: postgres[ql]://[user[:pass]@]host[:port]/dbname[?...]
  const urlMatch = connStr.match(/^postgres(?:ql)?:\/\/([^:@]*)(?::([^@]*))?@([^:/]+)(?::(\d+))?\/([^?]*)/);
  if (urlMatch) {
    return {
      user: decodeURIComponent(urlMatch[1] || ''),
      password: decodeURIComponent(urlMatch[2] || ''),
      host: urlMatch[3],
      port: urlMatch[4] || '5432',
      dbname: urlMatch[5],
      schema,
    };
  }
  // Key=value format
  const get = (key: string) => connStr.match(new RegExp(`(?:^|\\s)${key}=([^\\s]+)`))?.[1] || '';
  return {
    host: get('host') || 'localhost',
    port: get('port') || '5432',
    dbname: get('dbname'),
    user: get('user'),
    password: get('password'),
    schema: get('schema') || schema,
  };
};

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
// Helper: check if S3-compatible storage is configured
// ============================================================
export const hasS3Config = (source: SourceConnection): boolean =>
  !!(source.s3?.bucketName && source.s3?.objectKey);

// ============================================================
// Helper: build S3 base URL for STAC catalog asset links
// ============================================================
export const buildS3BaseUrl = (s3: S3StorageConfig): string => {
  const prefix = s3.objectKey.replace(/\/[^/]*\.gpkg$/, '').replace(/\/$/, '');
  if (s3.endpointUrl) {
    return `${s3.endpointUrl.replace(/\/$/, '')}/${s3.bucketName}/${prefix}`;
  }
  return `https://s3.${s3.region}.amazonaws.com/${s3.bucketName}/${prefix}`;
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
