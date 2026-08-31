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
    expect(parsed.forwardPorts).toEqual([5000, 8081, 19001]);
  });

  it('does not auto-open a VS Code "Simple Browser" tab for the viewer port — the notebook already displays it inline', () => {
    const parsed = JSON.parse(devcontainerJson);
    expect(parsed.portsAttributes['8081'].onAutoForward).toBe('notify');
  });

  it('includes the Jupyter extension so quickstart.ipynb runs out of the box', () => {
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

  it('materializes .env from .env.template on create — docker compose only auto-loads .env, never .env.template', () => {
    const parsed = JSON.parse(devcontainerJson);
    expect(parsed.postCreateCommand).toContain('cp -n .env.template .env');
  });

  it('prefetches images synchronously in postCreateCommand — postAttachCommand does not reliably fire in GitHub Codespaces (confirmed live: no /tmp log file ever got created)', () => {
    const parsed = JSON.parse(devcontainerJson);
    expect(parsed.postCreateCommand).toContain('docker compose pull');
    expect(parsed.postAttachCommand).toBeUndefined();
  });

  it('does not let a failed prefetch block codespace setup entirely', () => {
    const parsed = JSON.parse(devcontainerJson);
    expect(parsed.postCreateCommand).toMatch(/docker compose pull \|\| true/);
  });

  it('still prints the final "open the notebook" message even if the prefetch fails', () => {
    const parsed = JSON.parse(devcontainerJson);
    const pullIndex = parsed.postCreateCommand.indexOf('docker compose pull');
    const echoIndex = parsed.postCreateCommand.indexOf('echo ');
    expect(pullIndex).toBeGreaterThan(-1);
    expect(echoIndex).toBeGreaterThan(pullIndex);
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

  it('loads a real basemap instead of a flat background fill', () => {
    expect(viewerIndexHtml).toContain('tiles.openfreemap.org/styles/positron');
    expect(viewerIndexHtml).not.toContain('"background-color"');
  });

  it('fetches model.json and matches layers by the same safe-name scheme the worker and Waystones Cloud use', () => {
    expect(viewerIndexHtml).toContain('fetch("model.json"');
    expect(viewerIndexHtml).toContain('function toSafeName(name)');
  });

  it('translates model layer styles the same way lib/provisioner/style-generator.ts does, with a fallback for unstyled layers', () => {
    expect(viewerIndexHtml).toContain('function modelLayerToGLLayers(layer, sourceLayer)');
    expect(viewerIndexHtml).toContain('"fill-color": glColorExpr(style, "simpleColor")');
    expect(viewerIndexHtml).toContain('function fallbackGLLayers(sourceLayer, color)');
  });

  it('embeds syntactically valid JavaScript in the inline <script> block', () => {
    // Only the last (src-less) <script> tag is the inline viewer logic — the earlier
    // ones load maplibre-gl/pmtiles from CDN via a src attribute.
    const scripts = [...viewerIndexHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    expect(scripts.length).toBeGreaterThan(0);
    const inlineJs = scripts[scripts.length - 1][1];
    expect(() => new Function(inlineJs)).not.toThrow();
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
    const iWorker = code.indexOf('run_compose("up", "worker")');
    const iTiles = code.indexOf('run_compose("up", "worker-tiles")');
    const iOapif = code.indexOf('run_compose("up", "-d", "oapif")');
    const iViewer = code.indexOf('run_compose("up", "-d", "viewer")');
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
    const iTiles = code.indexOf('run_compose("up", "worker-tiles")');
    const iStac = code.indexOf('run_compose("up", "worker-stac", "stac-sync")');
    const iOapif = code.indexOf('run_compose("up", "-d", "oapif")');
    expect(iStac).toBeGreaterThan(iTiles);
    expect(iOapif).toBeGreaterThan(iStac);
  });

  it('syncs the STAC catalog in the same cell so it actually lands in the viewer', () => {
    const nb = JSON.parse(generateNotebook(makeModel(), makeGpkgSourceNoS3()));
    const code = nb.cells.filter((c: any) => c.cell_type === 'code').map((c: any) => c.source.join(''));
    expect(code.some((c: string) => c.includes('run_compose("up", "worker-stac", "stac-sync")'))).toBe(true);
  });

  it('offers an editable runtime override for partitioning instead of baking a column in, syncing after', () => {
    const nb = JSON.parse(generateNotebook(makeModel(), makeGpkgSourceNoS3()));
    const code = nb.cells.filter((c: any) => c.cell_type === 'code').map((c: any) => c.source.join(''));
    expect(code.some((c: string) => c.includes('STRATEGY=custom_column') && c.includes('COLUMN='))).toBe(true);
    expect(code.some((c: string) => c.includes('docker compose --progress plain up stac-sync'))).toBe(true);
  });

  it('mentions the STAC catalog in the final link cell', () => {
    const nb = JSON.parse(generateNotebook(makeModel(), makeGpkgSourceNoS3()));
    const code = nb.cells.filter((c: any) => c.cell_type === 'code').map((c: any) => c.source.join(''));
    expect(code.some((c: string) => c.toLowerCase().includes('stac catalog'))).toBe(true);
  });

  it('offers an editable runtime override for zoom/simplification/excludes on the tiles step, same pattern as STAC partitioning', () => {
    // main.py already reads MIN_ZOOM/MAX_ZOOM/AUTO_ZOOM/SIMPLIFICATION and
    // vector-tile-generator.py reads EXCLUDE_LAYERS/EXCLUDE_ATTRIBUTES — this just
    // has to surface them, not add new plumbing.
    const nb = JSON.parse(generateNotebook(makeModel(), makeGpkgSourceNoS3()));
    const code = nb.cells.filter((c: any) => c.cell_type === 'code').map((c: any) => c.source.join(''));
    const tilesCell = code.find((c: string) => c.includes('run_compose("up", "worker-tiles")'))!;
    expect(tilesCell).toContain('MIN_ZOOM=');
    expect(tilesCell).toContain('MAX_ZOOM=');
    expect(tilesCell).toContain('SIMPLIFICATION=');
    expect(tilesCell).toContain('AUTO_ZOOM=true');
    expect(tilesCell).toContain('EXCLUDE_LAYERS=');
    expect(tilesCell).toContain('EXCLUDE_ATTRIBUTES=');
  });

  it('defines a run_compose helper that avoids the garbled TUI and stops the notebook on a failed step', () => {
    const nb = JSON.parse(generateNotebook(makeModel(), makeGpkgSourceNoS3()));
    const code = nb.cells.filter((c: any) => c.cell_type === 'code').map((c: any) => c.source.join(''));
    const helperCell = code.find((c: string) => c.includes('def run_compose('))!;
    expect(helperCell).toBeDefined();
    expect(helperCell).toContain('--progress');
    expect(helperCell).toContain('plain');
    expect(helperCell).toContain('subprocess.run');
    expect(helperCell).toContain('returncode');
    expect(helperCell).toMatch(/raise SystemExit/);
  });

  it('uses run_compose for every pipeline step instead of a bare "!docker compose" shell-out', () => {
    // A bare `!docker compose ...` cell silently continues to the next cell on failure —
    // run_compose stops the notebook immediately with a clear error instead.
    const nb = JSON.parse(generateNotebook(makeModel(), makeGpkgSourceNoS3()));
    const code = nb.cells.filter((c: any) => c.cell_type === 'code').map((c: any) => c.source.join(''));
    const directInvocations = code.filter((c: string) => /^!docker compose (up|run)\b/m.test(c));
    expect(directInvocations).toEqual([]);
  });

  it('shows interim progress while polling for oapif-go readiness instead of a silent wait', () => {
    const nb = JSON.parse(generateNotebook(makeModel(), makeGpkgSourceNoS3()));
    const code = nb.cells.filter((c: any) => c.cell_type === 'code').map((c: any) => c.source.join(''));
    const pollCell = code.find((c: string) => c.includes('for _ in range(30):'))!;
    expect(pollCell).toContain('Waiting for oapif-go');
    expect(pollCell).toContain('flush=True');
  });
});
