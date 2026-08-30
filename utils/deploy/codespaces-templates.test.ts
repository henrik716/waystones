import { describe, it, expect } from 'vitest';
import { devcontainerJson, viewerIndexHtml, generateNotebook } from './codespaces-templates';
import type { DataModel, Layer, SourceConnection, S3StorageConfig } from '../../types';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let _id = 0;
const uid = () => `cst-${++_id}`;

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

// ---------------------------------------------------------------------------
// devcontainerJson
// ---------------------------------------------------------------------------

describe('devcontainerJson', () => {
  it('is valid JSON', () => {
    expect(() => JSON.parse(devcontainerJson)).not.toThrow();
  });

  it('enables the docker-in-docker feature', () => {
    const parsed = JSON.parse(devcontainerJson);
    expect(Object.keys(parsed.features)).toContain('ghcr.io/devcontainers/features/docker-in-docker:2');
  });

  it('forwards the OGC API, viewer, and MinIO console ports', () => {
    const parsed = JSON.parse(devcontainerJson);
    expect(parsed.forwardPorts).toEqual([5000, 8081, 9001]);
  });

  it('includes the Jupyter extension so demo.ipynb runs out of the box', () => {
    const parsed = JSON.parse(devcontainerJson);
    expect(parsed.customizations.vscode.extensions).toContain('ms-toolsai.jupyter');
  });

  it('installs a Python interpreter — the base image alone does not guarantee one', () => {
    const parsed = JSON.parse(devcontainerJson);
    expect(Object.keys(parsed.features)).toContain('ghcr.io/devcontainers/features/python:1');
  });

  it('pre-installs ipykernel so the notebook has no kernel-selection prompt to run cells', () => {
    const parsed = JSON.parse(devcontainerJson);
    expect(parsed.postCreateCommand).toContain('pip3 install --user ipykernel');
  });
});

// ---------------------------------------------------------------------------
// viewerIndexHtml
// ---------------------------------------------------------------------------

describe('viewerIndexHtml', () => {
  it('discovers the pmtiles filename from the same-origin tiles manifest (no hardcoded name)', () => {
    expect(viewerIndexHtml).toContain('tiles/.tiles.json');
    expect(viewerIndexHtml).not.toMatch(/tiles\/[a-z0-9_-]+\.pmtiles"/i);
  });

  it('loads maplibre-gl and pmtiles from CDN', () => {
    expect(viewerIndexHtml).toContain('maplibre-gl');
    expect(viewerIndexHtml).toContain('pmtiles.js');
  });

  it('registers the pmtiles:// protocol', () => {
    expect(viewerIndexHtml).toContain('addProtocol("pmtiles"');
  });
});

// ---------------------------------------------------------------------------
// generateNotebook
// ---------------------------------------------------------------------------

describe('generateNotebook', () => {
  it('returns a valid nbformat 4 notebook', () => {
    const nb = JSON.parse(generateNotebook(makeModel(), makeGpkgSourceNoS3()));
    expect(nb.nbformat).toBe(4);
    expect(Array.isArray(nb.cells)).toBe(true);
    expect(nb.cells.length).toBeGreaterThan(0);
  });

  it('runs the three pipeline steps in order: snapshot, tiles, oapif, viewer', () => {
    const nb = JSON.parse(generateNotebook(makeModel(), makeGpkgSourceNoS3()));
    const code = nb.cells
      .filter((c: any) => c.cell_type === 'code')
      .map((c: any) => c.source.join(''))
      .join('\n---\n');
    const iWorker = code.indexOf('docker compose up worker');
    const iTiles = code.indexOf('docker compose up worker-tiles');
    const iOapif = code.indexOf('docker compose up -d oapif');
    const iViewer = code.indexOf('docker compose up -d viewer');
    expect(iWorker).toBeGreaterThan(-1);
    expect(iTiles).toBeGreaterThan(iWorker);
    expect(iOapif).toBeGreaterThan(iTiles);
    expect(iViewer).toBeGreaterThan(iOapif);
  });

  it('checks for a local data.gpkg when the source is a local GeoPackage', () => {
    const nb = JSON.parse(generateNotebook(makeModel(), makeGpkgSourceNoS3()));
    const code = nb.cells.filter((c: any) => c.cell_type === 'code').map((c: any) => c.source.join(''));
    expect(code.some((c: string) => c.includes('data.gpkg'))).toBe(true);
  });

  it('checks for the real filename, not a hardcoded "data.gpkg" — must match the compose mount', () => {
    const realSource: SourceConnection = { type: 'geopackage', config: { filename: 'Hospitals.gpkg' }, layerMappings: {} };
    const nb = JSON.parse(generateNotebook(makeModel(), realSource));
    const code = nb.cells.filter((c: any) => c.cell_type === 'code').map((c: any) => c.source.join(''));
    expect(code.some((c: string) => c.includes('os.path.exists("Hospitals.gpkg")'))).toBe(true);
  });

  it('does not require a local data.gpkg when the source is remote (S3)', () => {
    const nb = JSON.parse(generateNotebook(makeModel(), makeGpkgSourceWithS3()));
    const code = nb.cells.filter((c: any) => c.cell_type === 'code').map((c: any) => c.source.join(''));
    expect(code.some((c: string) => c.includes('os.path.exists("data.gpkg")'))).toBe(false);
  });

  it('interpolates the model name into the title', () => {
    const nb = JSON.parse(generateNotebook(makeModel({ name: 'Coastal Survey' }), makeGpkgSourceNoS3()));
    const firstCell = nb.cells[0].source.join('');
    expect(firstCell).toContain('Coastal Survey');
  });

  it('always includes the STAC step, but clearly marked as optional/skippable', () => {
    // STAC is available whenever this notebook exists (same as tiles) — whether to run
    // it is left to the reader, not a build-time flag from the Publish step.
    const nb = JSON.parse(generateNotebook(makeModel(), makeGpkgSourceNoS3()));
    const markdown = nb.cells.filter((c: any) => c.cell_type === 'markdown').map((c: any) => c.source.join(''));
    const code = nb.cells.filter((c: any) => c.cell_type === 'code').map((c: any) => c.source.join(''));
    expect(code.some((c: string) => c.includes('worker-stac'))).toBe(true);
    expect(markdown.some((m: string) => m.includes('optional') && /skip/i.test(m))).toBe(true);
  });

  it('inserts the STAC step between tiles and oapif', () => {
    const nb = JSON.parse(generateNotebook(makeModel(), makeGpkgSourceNoS3()));
    const code = nb.cells
      .filter((c: any) => c.cell_type === 'code')
      .map((c: any) => c.source.join(''))
      .join('\n---\n');
    const iTiles = code.indexOf('docker compose up worker-tiles');
    const iStac = code.indexOf('docker compose up worker-stac');
    const iOapif = code.indexOf('docker compose up -d oapif');
    expect(iStac).toBeGreaterThan(iTiles);
    expect(iOapif).toBeGreaterThan(iStac);
  });

  it('syncs the STAC catalog in the same cell so it actually lands in the viewer', () => {
    const nb = JSON.parse(generateNotebook(makeModel(), makeGpkgSourceNoS3()));
    const code = nb.cells.filter((c: any) => c.cell_type === 'code').map((c: any) => c.source.join(''));
    expect(code.some((c: string) => c.includes('docker compose up worker-stac stac-sync'))).toBe(true);
  });

  it('offers an editable runtime override for partitioning instead of baking a column in, syncing after', () => {
    const nb = JSON.parse(generateNotebook(makeModel(), makeGpkgSourceNoS3()));
    const code = nb.cells.filter((c: any) => c.cell_type === 'code').map((c: any) => c.source.join(''));
    expect(code.some((c: string) => c.includes('STRATEGY=custom_column') && c.includes('COLUMN='))).toBe(true);
    expect(code.some((c: string) => c.includes('docker compose up stac-sync'))).toBe(true);
  });

  it('mentions the STAC catalog in the final link cell', () => {
    const nb = JSON.parse(generateNotebook(makeModel(), makeGpkgSourceNoS3()));
    const code = nb.cells.filter((c: any) => c.cell_type === 'code').map((c: any) => c.source.join(''));
    expect(code.some((c: string) => c.toLowerCase().includes('stac catalog'))).toBe(true);
  });
});
