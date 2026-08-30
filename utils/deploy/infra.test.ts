import { describe, it, expect } from 'vitest';
import { generateEnvFile, generateDockerCompose } from './infra';
import type { SourceConnection, S3StorageConfig, DataModel, Layer } from '../../types';

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

let _id = 0;
const uid = () => `infra-${++_id}`;

const makeLayer = (name: string, overrides: Partial<Layer> = {}): Layer => ({
  id: uid(),
  name,
  description: '',
  properties: [],
  geometryType: 'Polygon',
  geometryColumnName: 'geom',
  style: { type: 'simple', simpleColor: '#000' } as any,
  ...overrides,
});

const makeModel = (overrides: Partial<DataModel> = {}): DataModel => ({
  id: uid(),
  name: 'My Model',
  namespace: 'test',
  description: '',
  version: '1.0.0',
  layers: [makeLayer('Roads')],
  sharedTypes: [],
  sharedEnums: [],
  crs: 'EPSG:4326',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
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

// ---------------------------------------------------------------------------
// generateDockerCompose
// ---------------------------------------------------------------------------

describe('generateDockerCompose', () => {
  it('sets S3_BUCKET_NAME on the worker service (required by gpkg-converter.py for S3 output)', () => {
    const compose = generateDockerCompose(makeModel(), makeGpkgSourceNoS3());
    expect(compose).toContain('S3_BUCKET_NAME: waystones-data');
  });

  it('overrides the worker entrypoint so it runs the conversion instead of the idle FastAPI wrapper', () => {
    // docker/worker/Dockerfile's default ENTRYPOINT is server_wrapper.py, which just waits
    // for an HTTP request and never exits — without this override `docker compose up`
    // would hang forever waiting for the worker to "complete".
    const compose = generateDockerCompose(makeModel(), makeGpkgSourceNoS3());
    const workerSection = compose.slice(compose.indexOf('  worker:'), compose.indexOf('  # --- OGC API'));
    expect(workerSection).toContain('entrypoint: ["python3", "/app/main.py"]');
  });

  it('does not include the tiles/viewer pipeline by default', () => {
    const compose = generateDockerCompose(makeModel(), makeGpkgSourceNoS3());
    expect(compose).not.toContain('worker-tiles:');
    expect(compose).not.toContain('tiles-sync:');
    expect(compose).not.toContain('viewer:');
    expect(compose).not.toContain('viewer_www:');
  });

  describe('with includeTiles: true', () => {
    it('adds worker-tiles, tiles-sync, and viewer services', () => {
      const compose = generateDockerCompose(makeModel(), makeGpkgSourceNoS3(), { includeTiles: true });
      expect(compose).toContain('worker-tiles:');
      expect(compose).toContain('tiles-sync:');
      expect(compose).toContain('viewer:');
    });

    it('mounts the local GeoPackage into worker-tiles the same way as worker', () => {
      const compose = generateDockerCompose(makeModel(), makeGpkgSourceNoS3(), { includeTiles: true });
      const tilesSection = compose.slice(compose.indexOf('worker-tiles:'));
      expect(tilesSection).toContain('./data.gpkg:/input/data.gpkg:ro');
      expect(tilesSection).toContain('TASK_TYPE: tiles');
    });

    it('sets PROJECT_NAME from a sanitized model name', () => {
      const compose = generateDockerCompose(makeModel({ name: 'My Cool Model!' }), makeGpkgSourceNoS3(), { includeTiles: true });
      expect(compose).toContain('PROJECT_NAME: my_cool_model');
    });

    it('adds the viewer_www volume', () => {
      const compose = generateDockerCompose(makeModel(), makeGpkgSourceNoS3(), { includeTiles: true });
      expect(compose).toMatch(/^\s*viewer_www:\s*$/m);
    });

    it('exposes the viewer on port 8081', () => {
      const compose = generateDockerCompose(makeModel(), makeGpkgSourceNoS3(), { includeTiles: true });
      expect(compose).toContain('"8081:80"');
    });

    it('overrides the worker-tiles entrypoint too', () => {
      const compose = generateDockerCompose(makeModel(), makeGpkgSourceNoS3(), { includeTiles: true });
      const tilesSection = compose.slice(compose.indexOf('worker-tiles:'), compose.indexOf('tiles-sync:'));
      expect(tilesSection).toContain('entrypoint: ["python3", "/app/main.py"]');
    });

    it('mounts the whole viewer_www volume at the nginx docroot (not just a tiles/ subpath)', () => {
      const compose = generateDockerCompose(makeModel(), makeGpkgSourceNoS3(), { includeTiles: true });
      expect(compose).toContain('viewer_www:/usr/share/nginx/html:ro');
    });

    it('does not add STAC services when stac.enabled is not set', () => {
      const compose = generateDockerCompose(makeModel(), makeGpkgSourceNoS3(), { includeTiles: true });
      expect(compose).not.toContain('worker-stac:');
      expect(compose).not.toContain('stac-sync:');
    });
  });

  describe('with stac.enabled: true', () => {
    it('is a no-op without includeTiles (STAC shares the tiles viewer/volume)', () => {
      const compose = generateDockerCompose(makeModel(), makeGpkgSourceNoS3(), { stac: { enabled: true } });
      expect(compose).not.toContain('worker-stac:');
      expect(compose).not.toContain('stac-sync:');
    });

    it('adds worker-stac and stac-sync alongside the tiles pipeline', () => {
      const compose = generateDockerCompose(makeModel(), makeGpkgSourceNoS3(), {
        includeTiles: true,
        stac: { enabled: true },
      });
      expect(compose).toContain('worker-stac:');
      expect(compose).toContain('stac-sync:');
      expect(compose).toContain('entrypoint: ["python3", "/app/main.py"]');
      expect(compose).toContain('TASK_TYPE: stac');
    });

    it('bakes in STRATEGY: none with no COLUMN — partitioning is a runtime choice, not a build-time one', () => {
      // See demo.ipynb: partitioning is done via `docker compose run --rm -e STRATEGY=custom_column
      // -e COLUMN=<col> worker-stac` so the user can try different columns without regenerating the kit.
      const compose = generateDockerCompose(makeModel(), makeGpkgSourceNoS3(), {
        includeTiles: true,
        stac: { enabled: true },
      });
      const stacSection = compose.slice(compose.indexOf('worker-stac:'), compose.indexOf('stac-sync:'));
      expect(stacSection).toContain('STRATEGY: none');
      expect(stacSection).not.toContain('COLUMN:');
    });

    it('embeds a UTF-8-safe base64 MODEL_B64 that decodes back to the model JSON', () => {
      const model = makeModel({ name: 'Kystlinje æøå' });
      const compose = generateDockerCompose(model, makeGpkgSourceNoS3(), {
        includeTiles: true,
        stac: { enabled: true },
      });
      const match = compose.match(/MODEL_B64: (\S+)/);
      expect(match).not.toBeNull();
      const decoded = decodeURIComponent(escape(atob(match![1])));
      const parsed = JSON.parse(decoded);
      expect(parsed.name).toBe('Kystlinje æøå');
    });

    it('makes the viewer wait on stac-sync in addition to tiles-sync', () => {
      const compose = generateDockerCompose(makeModel(), makeGpkgSourceNoS3(), {
        includeTiles: true,
        stac: { enabled: true },
      });
      const viewerSection = compose.slice(compose.indexOf('  viewer:'));
      expect(viewerSection).toContain('tiles-sync:');
      expect(viewerSection).toContain('stac-sync:');
    });
  });
});
