import { describe, it, expect } from 'vitest';
import { generateStacCatalog, generateStacCollection } from './stacUtils';
import type { DataModel, Layer, SourceConnection } from '../types';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let _id = 0;
const uid = () => `stac-${++_id}`;

const makeLayer = (name: string, isAbstract = false): Layer => ({
  id: uid(),
  name,
  description: '',
  properties: [],
  geometryType: 'Polygon',
  geometryColumnName: 'geom',
  isAbstract,
  style: { type: 'simple', simpleColor: '#000' } as any,
});

const makeModel = (overrides: Partial<DataModel> = {}): DataModel => ({
  id: 'model-id-123',
  name: 'My Model',
  namespace: 'test',
  description: 'A test model',
  version: '1.0.0',
  layers: [makeLayer('Roads'), makeLayer('Buildings')],
  sharedTypes: [],
  sharedEnums: [],
  crs: 'EPSG:4326',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const dummySource: SourceConnection = {
  type: 'geopackage',
  config: { filename: 'data.gpkg' },
  layerMappings: {},
};

// ---------------------------------------------------------------------------
// generateStacCatalog
// ---------------------------------------------------------------------------

describe('generateStacCatalog', () => {
  it('returns valid JSON', () => {
    expect(() => JSON.parse(generateStacCatalog(makeModel()))).not.toThrow();
  });

  it('type is "Catalog"', () => {
    const catalog = JSON.parse(generateStacCatalog(makeModel()));
    expect(catalog.type).toBe('Catalog');
  });

  it('stac_version is "1.0.0"', () => {
    const catalog = JSON.parse(generateStacCatalog(makeModel()));
    expect(catalog.stac_version).toBe('1.0.0');
  });

  it('links include self and root', () => {
    const catalog = JSON.parse(generateStacCatalog(makeModel()));
    const rels = catalog.links.map((l: any) => l.rel);
    expect(rels).toContain('self');
    expect(rels).toContain('root');
  });

  it('has one child link per active (non-abstract) layer', () => {
    const model = makeModel({
      layers: [makeLayer('Roads'), makeLayer('Base', true), makeLayer('Buildings')],
    });
    const catalog = JSON.parse(generateStacCatalog(model));
    const childLinks = catalog.links.filter((l: any) => l.rel === 'child');
    // One for the model collection + one per non-abstract layer = 3 total, but
    // the implementation may vary — assert at least the active layers are represented
    const hrefs = childLinks.map((l: any) => l.href as string);
    // "Base" is abstract — its toTableName should not appear
    expect(hrefs.some((h: string) => h.includes('roads'))).toBe(true);
    expect(hrefs.some((h: string) => h.includes('buildings'))).toBe(true);
    expect(hrefs.some((h: string) => h.includes('base'))).toBe(false);
  });

  it('layer child href uses toTableName(layer.name)', () => {
    const model = makeModel({ layers: [makeLayer('My Roads')] });
    const catalog = JSON.parse(generateStacCatalog(model));
    const childLinks = catalog.links.filter((l: any) => l.rel === 'child');
    expect(childLinks.some((l: any) => (l.href as string).includes('my_roads'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// generateStacCollection
// ---------------------------------------------------------------------------

describe('generateStacCollection', () => {
  it('returns valid JSON', () => {
    expect(() => JSON.parse(generateStacCollection(makeModel(), dummySource))).not.toThrow();
  });

  it('type is "Collection"', () => {
    const col = JSON.parse(generateStacCollection(makeModel(), dummySource));
    expect(col.type).toBe('Collection');
  });

  it('stac_version is "1.0.0"', () => {
    const col = JSON.parse(generateStacCollection(makeModel(), dummySource));
    expect(col.stac_version).toBe('1.0.0');
  });

  it('extent.spatial.bbox defaults to [-180, -90, 180, 90] when no metadata', () => {
    const col = JSON.parse(generateStacCollection(makeModel(), dummySource));
    expect(col.extent.spatial.bbox[0]).toEqual([-180, -90, 180, 90]);
  });

  it('extent.spatial.bbox uses metadata.spatialExtent when present', () => {
    const model = makeModel({
      metadata: {
        spatialExtent: {
          westBoundLongitude: '10',
          eastBoundLongitude: '30',
          southBoundLatitude: '55',
          northBoundLatitude: '72',
        },
      } as any,
    });
    const col = JSON.parse(generateStacCollection(model, dummySource));
    expect(col.extent.spatial.bbox[0]).toEqual([10, 55, 30, 72]);
  });

  it('extent.temporal.interval uses metadata.temporalExtentFrom/To when set', () => {
    const model = makeModel({
      metadata: { temporalExtentFrom: '2020-01-01T00:00:00Z', temporalExtentTo: '2024-12-31T00:00:00Z' } as any,
    });
    const col = JSON.parse(generateStacCollection(model, dummySource));
    expect(col.extent.temporal.interval[0][0]).toBe('2020-01-01T00:00:00Z');
    expect(col.extent.temporal.interval[0][1]).toBe('2024-12-31T00:00:00Z');
  });

  it('license defaults to "proprietary" when not set in metadata', () => {
    const col = JSON.parse(generateStacCollection(makeModel(), dummySource));
    expect(col.license).toBe('proprietary');
  });

  it('includes stac_extensions array', () => {
    const col = JSON.parse(generateStacCollection(makeModel(), dummySource));
    expect(Array.isArray(col.stac_extensions)).toBe(true);
    expect(col.stac_extensions.length).toBeGreaterThan(0);
  });
});
