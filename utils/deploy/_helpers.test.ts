import { describe, it, expect } from 'vitest';
import {
  parsePostgresConnectionString,
  getGpkgFilename,
  hasS3Config,
  buildS3BaseUrl,
  getPgConnectionEnv,
} from './_helpers';
import type { DataModel, SourceConnection, S3StorageConfig } from '../../types';

// ---------------------------------------------------------------------------
// Minimal fixture factories
// ---------------------------------------------------------------------------

const makeModel = (name = 'My Model'): DataModel => ({
  id: 'test-id',
  name,
  namespace: 'test',
  description: '',
  version: '1.0.0',
  layers: [],
  crs: 'EPSG:4326',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const makePostgisSource = (overrides = {}): SourceConnection => ({
  type: 'postgis',
  config: {
    host: 'db.example.com',
    port: '5432',
    dbname: 'mydb',
    user: 'alice',
    password: 'secret',
    schema: 'public',
  },
  layerMappings: {},
  ...overrides,
});

const makeGpkgSource = (filename = 'data.gpkg', s3?: any): SourceConnection => ({
  type: 'geopackage',
  config: { filename },
  layerMappings: {},
  ...(s3 ? { s3 } : {}),
});

// ---------------------------------------------------------------------------
// parsePostgresConnectionString
// ---------------------------------------------------------------------------

describe('parsePostgresConnectionString', () => {
  it('parses postgresql:// URL format', () => {
    const result = parsePostgresConnectionString('postgresql://alice:secret@db.example.com:5432/mydb');
    expect(result.host).toBe('db.example.com');
    expect(result.port).toBe('5432');
    expect(result.dbname).toBe('mydb');
    expect(result.user).toBe('alice');
    expect(result.password).toBe('secret');
    expect(result.schema).toBe('public');
  });

  it('accepts postgres:// scheme alias', () => {
    const result = parsePostgresConnectionString('postgres://u:p@host/db');
    expect(result.host).toBe('host');
    expect(result.dbname).toBe('db');
  });

  it('defaults port to 5432 when absent in URL', () => {
    const result = parsePostgresConnectionString('postgresql://u:p@host/db');
    expect(result.port).toBe('5432');
  });

  it('respects custom schema parameter', () => {
    const result = parsePostgresConnectionString('postgresql://u:p@host/db', 'myschema');
    expect(result.schema).toBe('myschema');
  });

  it('decodes percent-encoded characters in password', () => {
    // %40 is @
    const result = parsePostgresConnectionString('postgresql://user:p%40ss@host/db');
    expect(result.password).toBe('p@ss');
  });

  it('parses key=value format', () => {
    const result = parsePostgresConnectionString('host=db.example.com port=5432 dbname=mydb user=alice password=secret');
    expect(result.host).toBe('db.example.com');
    expect(result.port).toBe('5432');
    expect(result.dbname).toBe('mydb');
    expect(result.user).toBe('alice');
    expect(result.password).toBe('secret');
  });

  it('defaults host to localhost in key=value format', () => {
    const result = parsePostgresConnectionString('dbname=mydb user=alice password=secret');
    expect(result.host).toBe('localhost');
  });

  it('defaults port to 5432 in key=value format when absent', () => {
    const result = parsePostgresConnectionString('host=h dbname=d user=u password=p');
    expect(result.port).toBe('5432');
  });
});

// ---------------------------------------------------------------------------
// getGpkgFilename
// ---------------------------------------------------------------------------

describe('getGpkgFilename', () => {
  it('returns filename from geopackage source config', () => {
    const source = makeGpkgSource('mydata.gpkg');
    expect(getGpkgFilename(makeModel(), source)).toBe('mydata.gpkg');
  });

  it('falls back to data.gpkg when geopackage config has no filename', () => {
    const source: SourceConnection = { type: 'geopackage', config: { filename: '' }, layerMappings: {} };
    expect(getGpkgFilename(makeModel(), source)).toBe('data.gpkg');
  });

  it('uses model name when no source provided', () => {
    expect(getGpkgFilename(makeModel('My Roads'), undefined)).toBe('My_Roads.gpkg');
  });

  it('uses model name when source type is not geopackage', () => {
    expect(getGpkgFilename(makeModel('Roads'), makePostgisSource())).toBe('Roads.gpkg');
  });
});

// ---------------------------------------------------------------------------
// hasS3Config
// ---------------------------------------------------------------------------

describe('hasS3Config', () => {
  const s3: S3StorageConfig = {
    provider: 'r2',
    endpointUrl: 'https://example.r2.cloudflarestorage.com',
    bucketName: 'my-bucket',
    objectKey: 'datasets/data.gpkg',
    region: 'auto',
  };

  it('returns true when both bucketName and objectKey are present', () => {
    expect(hasS3Config({ ...makeGpkgSource(), s3 })).toBe(true);
  });

  it('returns false when bucketName is empty', () => {
    expect(hasS3Config({ ...makeGpkgSource(), s3: { ...s3, bucketName: '' } })).toBe(false);
  });

  it('returns false when objectKey is empty', () => {
    expect(hasS3Config({ ...makeGpkgSource(), s3: { ...s3, objectKey: '' } })).toBe(false);
  });

  it('returns false when s3 is undefined', () => {
    expect(hasS3Config(makeGpkgSource())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildS3BaseUrl
// ---------------------------------------------------------------------------

describe('buildS3BaseUrl', () => {
  it('uses standard AWS URL when no endpointUrl', () => {
    const s3: S3StorageConfig = {
      provider: 'aws',
      endpointUrl: '',
      bucketName: 'my-bucket',
      objectKey: 'datasets/data.gpkg',
      region: 'eu-west-1',
    };
    const url = buildS3BaseUrl(s3);
    expect(url).toBe('https://s3.eu-west-1.amazonaws.com/my-bucket/datasets');
  });

  it('uses custom endpoint URL when provided', () => {
    const s3: S3StorageConfig = {
      provider: 'r2',
      endpointUrl: 'https://abc.r2.cloudflarestorage.com',
      bucketName: 'my-bucket',
      objectKey: 'data/roads.gpkg',
      region: 'auto',
    };
    const url = buildS3BaseUrl(s3);
    expect(url).toBe('https://abc.r2.cloudflarestorage.com/my-bucket/data');
  });

  it('strips trailing slash from endpointUrl', () => {
    const s3: S3StorageConfig = {
      provider: 'custom',
      endpointUrl: 'https://minio.example.com/',
      bucketName: 'bucket',
      objectKey: 'folder/file.gpkg',
      region: 'us-east-1',
    };
    const url = buildS3BaseUrl(s3);
    expect(url).not.toContain('//bucket');
  });

  it('strips the gpkg filename from the path prefix', () => {
    const s3: S3StorageConfig = {
      provider: 'aws',
      endpointUrl: '',
      bucketName: 'bucket',
      objectKey: 'folder/subfolder/data.gpkg',
      region: 'us-east-1',
    };
    const url = buildS3BaseUrl(s3);
    expect(url).toContain('folder/subfolder');
    expect(url).not.toContain('data.gpkg');
  });
});

// ---------------------------------------------------------------------------
// getPgConnectionEnv
// ---------------------------------------------------------------------------

describe('getPgConnectionEnv', () => {
  it('returns PG env vars for postgis source', () => {
    const env = getPgConnectionEnv(makePostgisSource());
    expect(env).toEqual({
      POSTGRES_HOST: 'db.example.com',
      POSTGRES_PORT: '5432',
      POSTGRES_DB: 'mydb',
      POSTGRES_USER: 'alice',
      POSTGRES_PASSWORD: 'secret',
      POSTGRES_SCHEMA: 'public',
    });
  });

  it('returns PG env vars for supabase source (parses connection string)', () => {
    const source: SourceConnection = {
      type: 'supabase',
      config: {
        connectionString: 'postgresql://user:pass@db.supabase.co:5432/postgres',
        schema: 'public',
      },
      layerMappings: {},
    };
    const env = getPgConnectionEnv(source);
    expect(env?.POSTGRES_HOST).toBe('db.supabase.co');
    expect(env?.POSTGRES_DB).toBe('postgres');
  });

  it('returns null for geopackage source', () => {
    expect(getPgConnectionEnv(makeGpkgSource())).toBeNull();
  });

  it('defaults schema to public when not set', () => {
    const source = makePostgisSource();
    (source.config as any).schema = '';
    const env = getPgConnectionEnv(source);
    expect(env?.POSTGRES_SCHEMA).toBe('public');
  });
});
