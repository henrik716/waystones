import { describe, it, expect } from 'vitest';
import { generateReadmeForTarget, generateWorkflowForTarget } from './readme';
import type { DataModel, Layer, SourceConnection, S3StorageConfig } from '../../types';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let _id = 0;
const uid = () => `rm-${++_id}`;

const makeLayer = (name: string, overrides: Partial<Layer> = {}): Layer => ({
  id: uid(),
  name,
  description: '',
  properties: [],
  geometryType: 'None',
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

const makeGpkgSourceNoS3 = (): SourceConnection => ({
  type: 'geopackage',
  config: { filename: 'data.gpkg' },
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

const makePostgisSource = (): SourceConnection => ({
  type: 'postgis',
  config: {
    host: 'db.example.com',
    port: '5432',
    dbname: 'mydb',
    user: 'alice',
    password: 'real-secret',
    schema: 'public',
  },
  layerMappings: {},
});

// ---------------------------------------------------------------------------
// generateReadmeForTarget — codespaces target
// ---------------------------------------------------------------------------

describe('generateReadmeForTarget (codespaces target)', () => {
  it('labels the deploy target as GitHub Codespaces', () => {
    const readme = generateReadmeForTarget(makeModel(), makeGpkgSourceNoS3(), 'codespaces', 'en');
    expect(readme).toContain('GitHub Codespaces');
  });

  it('describes the notebook-driven getting-started flow, not a single `docker compose up -d`', () => {
    const readme = generateReadmeForTarget(makeModel(), makeGpkgSourceNoS3(), 'codespaces', 'en');
    expect(readme).toContain('quickstart.ipynb');
  });

  it('lists the STAC catalog component for codespaces — it is always available there, running it is optional', () => {
    const readme = generateReadmeForTarget(makeModel(), makeGpkgSourceNoS3(), 'codespaces', 'en');
    expect(readme).toContain('worker-stac');
  });

  it('never mentions worker-stac for the docker-compose target', () => {
    const readme = generateReadmeForTarget(makeModel(), makeGpkgSourceNoS3(), 'docker-compose', 'en');
    expect(readme).not.toContain('worker-stac');
  });
});

// ---------------------------------------------------------------------------
// generateReadmeForTarget — codespaces target: .env setup honesty for
// non-local sources (PostGIS / S3 GeoPackage)
// ---------------------------------------------------------------------------

describe('generateReadmeForTarget (codespaces target, non-local sources)', () => {
  it('local GeoPackage: tells the user to add the file, not to set up .env', () => {
    // Note: .env.template is always listed in the "Kit Contents" file table regardless of
    // target, so assert on the getting-started instruction specifically, not the whole doc.
    const readme = generateReadmeForTarget(makeModel(), makeGpkgSourceNoS3(), 'codespaces', 'en');
    expect(readme).toContain('data.gpkg');
    expect(readme).not.toContain('Copy `.env.template` to `.env`');
  });

  it('PostGIS: tells the user to copy .env.template and fill in real DB credentials', () => {
    const readme = generateReadmeForTarget(makeModel(), makePostgisSource(), 'codespaces', 'en');
    expect(readme).toContain('.env.template');
    expect(readme).toContain('PostGIS connection details');
  });

  it('PostGIS: warns that an already-running, externally-reachable database is required', () => {
    const readme = generateReadmeForTarget(makeModel(), makePostgisSource(), 'codespaces', 'en');
    expect(readme).toContain('externally-reachable database');
    expect(readme).toContain('localhost'); // singles out localhost as specifically insufficient
  });

  it('does not show the PostGIS database warning for GeoPackage sources', () => {
    const readme = generateReadmeForTarget(makeModel(), makeGpkgSourceNoS3(), 'codespaces', 'en');
    expect(readme).not.toContain('externally-reachable database');
  });

  it('S3 GeoPackage: tells the user to copy .env.template and fill in real S3/R2 credentials', () => {
    const readme = generateReadmeForTarget(makeModel(), makeGpkgSourceWithS3(), 'codespaces', 'en');
    expect(readme).toContain('.env.template');
    expect(readme).toContain('S3/R2 access key');
  });

  it('no longer claims source data is "fetched automatically" with no setup (the old misleading text)', () => {
    const pgReadme = generateReadmeForTarget(makeModel(), makePostgisSource(), 'codespaces', 'en');
    const s3Readme = generateReadmeForTarget(makeModel(), makeGpkgSourceWithS3(), 'codespaces', 'en');
    expect(pgReadme).not.toContain('fetched automatically');
    expect(s3Readme).not.toContain('fetched automatically');
  });

  it('documents how to update an already-running Codespace after a re-publish, including the notebook checkout gotcha', () => {
    const readme = generateReadmeForTarget(makeModel(), makeGpkgSourceNoS3(), 'codespaces', 'en');
    expect(readme).toContain('Updating this Codespace after a re-publish');
    expect(readme).toContain('git checkout -- quickstart.ipynb');
    expect(readme).toContain('git pull');
    expect(readme).toContain('writes outputs/execution counts');
  });

  it('does not show the Codespaces update section for other targets', () => {
    const dcReadme = generateReadmeForTarget(makeModel(), makeGpkgSourceNoS3(), 'docker-compose', 'en');
    expect(dcReadme).not.toContain('Updating this Codespace');
  });
});

// ---------------------------------------------------------------------------
// generateReadmeForTarget — docker-compose target: PMTiles/STAC honesty
// ---------------------------------------------------------------------------

describe('generateReadmeForTarget (docker-compose target)', () => {
  it('does not claim Vector Tile Service / STAC Service are available (they are not wired in automatically)', () => {
    const readme = generateReadmeForTarget(makeModel(), makeGpkgSourceNoS3(), 'docker-compose', 'en');
    expect(readme).not.toContain('Vector Tile Service');
    expect(readme).not.toContain('STAC Service');
  });

  it('documents a manual runbook for generating PMTiles and a STAC catalog on demand', () => {
    const readme = generateReadmeForTarget(makeModel(), makeGpkgSourceNoS3(), 'docker-compose', 'en');
    expect(readme).toContain('Optional: PMTiles & STAC Catalog');
    expect(readme).toContain('docker compose run --rm -e TASK_TYPE=tiles');
    expect(readme).toContain('docker compose run --rm -e TASK_TYPE=stac');
    expect(readme).toContain('STRATEGY=custom_column');
    expect(readme).toContain('localhost:19001');
  });

  it('still lists Vector Tile Service for codespaces, since it is wired in automatically there', () => {
    const readme = generateReadmeForTarget(makeModel(), makeGpkgSourceNoS3(), 'codespaces', 'en');
    expect(readme).toContain('Vector Tile Service');
  });

  it('does not render the manual extras section for codespaces or railway', () => {
    const codespacesReadme = generateReadmeForTarget(makeModel(), makeGpkgSourceNoS3(), 'codespaces', 'en');
    const railwayReadme = generateReadmeForTarget(makeModel(), makeGpkgSourceNoS3(), 'railway', 'en');
    expect(codespacesReadme).not.toContain('Optional: PMTiles & STAC Catalog');
    expect(railwayReadme).not.toContain('Optional: PMTiles & STAC Catalog');
  });
});

// ---------------------------------------------------------------------------
// generateWorkflowForTarget — codespaces target
// ---------------------------------------------------------------------------

describe('generateWorkflowForTarget (codespaces target)', () => {
  it('validates config instead of SSH-deploying (no production host for an ephemeral demo)', () => {
    const workflow = generateWorkflowForTarget(makeModel(), makeGpkgSourceNoS3(), 'codespaces');
    expect(workflow).not.toContain('ssh-action');
    expect(workflow).toContain('Validate oapif-go config');
  });

  it('still SSH-deploys for the plain docker-compose target (unchanged behavior)', () => {
    const workflow = generateWorkflowForTarget(makeModel(), makeGpkgSourceNoS3(), 'docker-compose');
    expect(workflow).toContain('ssh-action');
  });
});
