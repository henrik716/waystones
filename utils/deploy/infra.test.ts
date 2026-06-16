import { describe, it, expect } from 'vitest';
import { generateEnvFile } from './infra';
import type { SourceConnection, S3StorageConfig } from '../../types';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const makePostgisSource = (): SourceConnection => ({
  type: 'postgis',
  config: {
    host: 'db.example.com',
    port: '5432',
    dbname: 'mydb',
    user: 'alice',
    password: 'real-secret',
    schema: 'roads',
  },
  layerMappings: {},
});

const s3: S3StorageConfig = {
  provider: 'r2',
  endpointUrl: 'https://abc.r2.cloudflarestorage.com',
  bucketName: 'my-bucket',
  objectKey: 'datasets/data.gpkg',
  region: 'auto',
};

const makeGpkgSourceWithS3 = (): SourceConnection => ({
  type: 'geopackage',
  config: { filename: 'data.gpkg' },
  layerMappings: {},
  s3,
});

const makeGpkgSourceNoS3 = (): SourceConnection => ({
  type: 'geopackage',
  config: { filename: 'data.gpkg' },
  layerMappings: {},
});

// ---------------------------------------------------------------------------
// generateEnvFile
// ---------------------------------------------------------------------------

describe('generateEnvFile', () => {
  it('starts with the expected header comment', () => {
    const env = generateEnvFile(makePostgisSource());
    expect(env.startsWith('# Environment variables for deploy kit')).toBe(true);
  });

  describe('PostGIS source', () => {
    it('contains POSTGRES_HOST', () => {
      expect(generateEnvFile(makePostgisSource())).toContain('POSTGRES_HOST=db.example.com');
    });

    it('contains POSTGRES_PORT', () => {
      expect(generateEnvFile(makePostgisSource())).toContain('POSTGRES_PORT=5432');
    });

    it('contains POSTGRES_DB', () => {
      expect(generateEnvFile(makePostgisSource())).toContain('POSTGRES_DB=mydb');
    });

    it('contains POSTGRES_USER', () => {
      expect(generateEnvFile(makePostgisSource())).toContain('POSTGRES_USER=alice');
    });

    it('contains POSTGRES_SCHEMA', () => {
      expect(generateEnvFile(makePostgisSource())).toContain('POSTGRES_SCHEMA=roads');
    });

    it('uses a placeholder for the password — never the real value', () => {
      const env = generateEnvFile(makePostgisSource());
      expect(env).not.toContain('real-secret');
      expect(env).toContain('YOUR_DATABASE_PASSWORD_HERE');
    });

    it('does not contain AWS_ vars', () => {
      const env = generateEnvFile(makePostgisSource());
      expect(env).not.toContain('AWS_ACCESS_KEY_ID');
      expect(env).not.toContain('S3_BUCKET_NAME');
    });
  });

  describe('GeoPackage source with S3', () => {
    it('contains S3_BUCKET_NAME', () => {
      expect(generateEnvFile(makeGpkgSourceWithS3())).toContain('S3_BUCKET_NAME=my-bucket');
    });

    it('contains S3_OBJECT_KEY', () => {
      expect(generateEnvFile(makeGpkgSourceWithS3())).toContain('S3_OBJECT_KEY=datasets/data.gpkg');
    });

    it('contains AWS_ENDPOINT_URL', () => {
      expect(generateEnvFile(makeGpkgSourceWithS3())).toContain('AWS_ENDPOINT_URL=https://abc.r2.cloudflarestorage.com');
    });

    it('uses placeholder for AWS credentials', () => {
      const env = generateEnvFile(makeGpkgSourceWithS3());
      expect(env).toContain('your-access-key-id');
      expect(env).toContain('your-secret-access-key');
    });
  });

  describe('GeoPackage source without S3', () => {
    it('does not contain S3_BUCKET_NAME', () => {
      const env = generateEnvFile(makeGpkgSourceNoS3());
      expect(env).not.toContain('S3_BUCKET_NAME');
    });

    it('does not contain AWS_ credential vars', () => {
      const env = generateEnvFile(makeGpkgSourceNoS3());
      expect(env).not.toContain('AWS_ACCESS_KEY_ID');
    });
  });
});
