import { describe, it, expect } from 'vitest';
import { generateOapifGoConfig } from './oapifgo';
import type { DataModel, Layer } from '../../types';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let _id = 0;
const uid = () => `oa-${++_id}`;

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
// generateOapifGoConfig
// ---------------------------------------------------------------------------

describe('generateOapifGoConfig', () => {
  it('returns valid JSON string', () => {
    const result = generateOapifGoConfig(makeModel());
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('collections array has one entry per non-abstract layer', () => {
    const model = makeModel({
      layers: [makeLayer('Roads'), makeLayer('Buildings')],
    });
    const config = JSON.parse(generateOapifGoConfig(model));
    expect(config.collections).toHaveLength(2);
  });

  it('abstract layers are excluded from collections', () => {
    const model = makeModel({
      layers: [makeLayer('Roads'), makeLayer('Base', { isAbstract: true })],
    });
    const config = JSON.parse(generateOapifGoConfig(model));
    expect(config.collections).toHaveLength(1);
    expect(config.collections[0].id).toBe('roads');
  });

  it('collection id uses toTableName(layer.name)', () => {
    const model = makeModel({ layers: [makeLayer('My Roads Layer')] });
    const config = JSON.parse(generateOapifGoConfig(model));
    expect(config.collections[0].id).toBe('my_roads_layer');
  });

  it('parquet_key is id + ".parquet"', () => {
    const model = makeModel({ layers: [makeLayer('Roads')] });
    const config = JSON.parse(generateOapifGoConfig(model));
    expect(config.collections[0].parquet_key).toBe('roads.parquet');
  });

  it('geom_column comes from layer.geometryColumnName', () => {
    const layer = makeLayer('Roads', { geometryColumnName: 'wkb_geometry' });
    const config = JSON.parse(generateOapifGoConfig(makeModel({ layers: [layer] })));
    expect(config.collections[0].geom_column).toBe('wkb_geometry');
  });

  it('geom_column defaults to "geometry" when geometryColumnName is empty', () => {
    const layer = makeLayer('Roads', { geometryColumnName: '' });
    const config = JSON.parse(generateOapifGoConfig(makeModel({ layers: [layer] })));
    expect(config.collections[0].geom_column).toBe('geometry');
  });

  it('id_column comes from layer.primaryKeyColumn', () => {
    const layer = makeLayer('Roads', { primaryKeyColumn: 'objectid' } as any);
    const config = JSON.parse(generateOapifGoConfig(makeModel({ layers: [layer] })));
    expect(config.collections[0].id_column).toBe('objectid');
  });

  it('id_column defaults to "fid" when primaryKeyColumn is not set', () => {
    const config = JSON.parse(generateOapifGoConfig(makeModel()));
    expect(config.collections[0].id_column).toBe('fid');
  });

  it('top-level title comes from model.name', () => {
    const model = makeModel({ name: 'My Dataset' });
    const config = JSON.parse(generateOapifGoConfig(model));
    expect(config.title).toBe('My Dataset');
  });

  it('top-level description from model.description', () => {
    const model = makeModel({ description: 'A great dataset' });
    const config = JSON.parse(generateOapifGoConfig(model));
    expect(config.description).toBe('A great dataset');
  });

  it('keywords from model.metadata when present', () => {
    const model = makeModel({
      metadata: { keywords: ['roads', 'transport'] } as any,
    });
    const config = JSON.parse(generateOapifGoConfig(model));
    expect(config.keywords).toEqual(['roads', 'transport']);
  });

  it('omits undefined fields from JSON output', () => {
    const model = makeModel({ description: '' });
    const config = JSON.parse(generateOapifGoConfig(model));
    expect('description' in config).toBe(false);
  });

  it('collection includes description when layer has description', () => {
    const layer = makeLayer('Roads', { description: 'Road layer' });
    const config = JSON.parse(generateOapifGoConfig(makeModel({ layers: [layer] })));
    expect(config.collections[0].description).toBe('Road layer');
  });
});
