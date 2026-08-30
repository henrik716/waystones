import { describe, it, expect } from 'vitest';
import { generateReadmeForTarget, generateWorkflowForTarget } from './readme';
import type { DataModel, Layer, SourceConnection } from '../../types';

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
    expect(readme).toContain('demo.ipynb');
  });

  it('does not mention worker-stac when stac is not enabled', () => {
    // Note: the generic architecture diagram always mentions "STAC Catalog" as a conceptual
    // pipeline output regardless of target, so assert on the actual worker-stac row instead.
    const readme = generateReadmeForTarget(makeModel(), makeGpkgSourceNoS3(), 'codespaces', 'en');
    expect(readme).not.toContain('worker-stac');
  });

  it('lists the STAC catalog component when stac.enabled is true', () => {
    const readme = generateReadmeForTarget(makeModel(), makeGpkgSourceNoS3(), 'codespaces', 'en', {
      stac: { enabled: true },
    });
    expect(readme).toContain('worker-stac');
  });

  it('does not enable STAC for the docker-compose target even if codespacesOptions.stac is passed', () => {
    const readme = generateReadmeForTarget(makeModel(), makeGpkgSourceNoS3(), 'docker-compose', 'en', {
      stac: { enabled: true },
    });
    expect(readme).not.toContain('worker-stac');
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
    expect(readme).toContain('localhost:9001');
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
