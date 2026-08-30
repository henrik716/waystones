import { describe, it, expect } from 'vitest';
import { generateDeployFiles } from './entry-point';
import type { DataModel, Layer, SourceConnection } from '../../types';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let _id = 0;
const uid = () => `ep-${++_id}`;

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

// ---------------------------------------------------------------------------
// generateDeployFiles — target dispatch
// ---------------------------------------------------------------------------

describe('generateDeployFiles', () => {
  it('docker-compose target does not include Codespaces-only files', async () => {
    const files = await generateDeployFiles(makeModel(), makeGpkgSourceNoS3(), 'en', 'docker-compose');
    expect(files['docker-compose.yml']).toBeDefined();
    expect(files['.devcontainer/devcontainer.json']).toBeUndefined();
    expect(files['quickstart.ipynb']).toBeUndefined();
    expect(files['viewer/index.html']).toBeUndefined();
    expect(files['docker-compose.yml']).not.toContain('worker-tiles:');
  });

  it('codespaces target includes the devcontainer, notebook, and viewer', async () => {
    const files = await generateDeployFiles(makeModel(), makeGpkgSourceNoS3(), 'en', 'codespaces');
    expect(files['.devcontainer/devcontainer.json']).toBeDefined();
    expect(files['quickstart.ipynb']).toBeDefined();
    expect(files['viewer/index.html']).toBeDefined();
    expect(() => JSON.parse(files['.devcontainer/devcontainer.json'])).not.toThrow();
    expect(() => JSON.parse(files['quickstart.ipynb'])).not.toThrow();
  });

  it('codespaces target enables the tiles pipeline in docker-compose.yml', async () => {
    const files = await generateDeployFiles(makeModel(), makeGpkgSourceNoS3(), 'en', 'codespaces');
    expect(files['docker-compose.yml']).toContain('worker-tiles:');
    expect(files['docker-compose.yml']).toContain('viewer:');
  });

  it('codespaces target uses the minimal oapif-go image (no WMS layers, no need for gateway/Caddy)', async () => {
    const files = await generateDeployFiles(makeModel(), makeGpkgSourceNoS3(), 'en', 'codespaces');
    expect(files['docker-compose.yml']).toContain('oapif-go:minimal-latest');
  });

  it('docker-compose target still uses the gateway oapif-go image', async () => {
    const files = await generateDeployFiles(makeModel(), makeGpkgSourceNoS3(), 'en', 'docker-compose');
    expect(files['docker-compose.yml']).toContain('ghcr.io/waystones-nexus/oapif-go:latest');
    expect(files['docker-compose.yml']).not.toContain('oapif-go:minimal-latest');
  });

  it('codespaces target still produces a valid oapif-go-config.json', async () => {
    const files = await generateDeployFiles(makeModel(), makeGpkgSourceNoS3(), 'en', 'codespaces');
    const config = JSON.parse(files['oapif-go-config.json']);
    expect(config.collections.length).toBe(1);
  });

  it('codespaces target README documents the notebook-driven getting-started flow', async () => {
    const files = await generateDeployFiles(makeModel(), makeGpkgSourceNoS3(), 'en', 'codespaces');
    expect(files['README.md']).toContain('quickstart.ipynb');
    expect(files['README.md']).toContain('GitHub Codespaces');
  });

  it('codespaces workflow validates config instead of SSH-deploying (no production host to deploy to)', async () => {
    const files = await generateDeployFiles(makeModel(), makeGpkgSourceNoS3(), 'en', 'codespaces');
    expect(files['.github/workflows/deploy.yml']).not.toContain('ssh-action');
    expect(files['.github/workflows/deploy.yml']).toContain('Validate oapif-go config');
  });

  it('always includes STAC (worker-stac/stac-sync) for the codespaces target — running it is a notebook-time choice, not a Publish-step toggle', async () => {
    const files = await generateDeployFiles(makeModel(), makeGpkgSourceNoS3(), 'en', 'codespaces');
    expect(files['docker-compose.yml']).toContain('worker-stac:');
    expect(files['quickstart.ipynb']).toContain('worker-stac');
  });

  it('never includes STAC for the docker-compose target', async () => {
    const files = await generateDeployFiles(makeModel(), makeGpkgSourceNoS3(), 'en', 'docker-compose');
    expect(files['docker-compose.yml']).not.toContain('worker-stac:');
  });
});
