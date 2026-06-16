import { describe, it, expect } from 'vitest';
import { getEffectiveProperties, topoSortLayers, scrubModelForExport } from './modelUtils';
import type { Layer, Field, DataModel } from '../types';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let _id = 0;
const uid = () => `mid-${++_id}`;

const makeField = (name: string): Field => ({
  id: uid(),
  name,
  title: name,
  description: '',
  multiplicity: '0..1',
  constraints: {},
  fieldType: { kind: 'primitive', baseType: 'string' },
});

const makeLayer = (id: string, name: string, extendsId?: string, ...fieldNames: string[]): Layer => ({
  id,
  name,
  description: '',
  properties: fieldNames.map(makeField),
  geometryType: 'Polygon',
  geometryColumnName: 'geom',
  style: { type: 'simple', simpleColor: '#000' } as any,
  ...(extendsId ? { extends: extendsId } : {}),
});

const makeModel = (layers: Layer[], sourceConfig?: any): DataModel => ({
  id: uid(),
  name: 'Test',
  namespace: 'ns',
  description: '',
  version: '1.0.0',
  layers,
  sharedTypes: [],
  sharedEnums: [],
  crs: 'EPSG:4326',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...(sourceConfig ? { sourceConnection: sourceConfig } : {}),
});

// ---------------------------------------------------------------------------
// getEffectiveProperties
// ---------------------------------------------------------------------------

describe('getEffectiveProperties', () => {
  it('returns own properties when layer has no parent', () => {
    const layer = makeLayer('A', 'A', undefined, 'field_a');
    const props = getEffectiveProperties(layer, [layer]);
    expect(props.map(p => p.name)).toEqual(['field_a']);
  });

  it('puts parent properties before own properties', () => {
    const parent = makeLayer('P', 'Parent', undefined, 'parent_field');
    const child  = makeLayer('C', 'Child', 'P', 'child_field');
    const props = getEffectiveProperties(child, [parent, child]);
    expect(props.map(p => p.name)).toEqual(['parent_field', 'child_field']);
  });

  it('handles multi-level chain A → B → C (A props first)', () => {
    const a = makeLayer('A', 'A', undefined, 'a_field');
    const b = makeLayer('B', 'B', 'A', 'b_field');
    const c = makeLayer('C', 'C', 'B', 'c_field');
    const props = getEffectiveProperties(c, [a, b, c]);
    expect(props.map(p => p.name)).toEqual(['a_field', 'b_field', 'c_field']);
  });

  it('does not infinite-loop on circular reference', () => {
    const a = makeLayer('A', 'A', 'B', 'a_field');
    const b = makeLayer('B', 'B', 'A', 'b_field');
    // Should not throw or hang
    expect(() => getEffectiveProperties(a, [a, b])).not.toThrow();
  });

  it('returns own properties when parent ID does not exist', () => {
    const layer = makeLayer('C', 'Child', 'nonexistent', 'child_field');
    const props = getEffectiveProperties(layer, [layer]);
    expect(props.map(p => p.name)).toEqual(['child_field']);
  });

  it('returns empty array for layer with no properties and no parent', () => {
    const layer = makeLayer('A', 'A');
    const props = getEffectiveProperties(layer, [layer]);
    expect(props).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// topoSortLayers
// ---------------------------------------------------------------------------

describe('topoSortLayers', () => {
  it('flat list (no extends) preserves original order', () => {
    const layers = [makeLayer('A', 'A'), makeLayer('B', 'B'), makeLayer('C', 'C')];
    const sorted = topoSortLayers(layers);
    expect(sorted.map(l => l.id)).toEqual(['A', 'B', 'C']);
  });

  it('parent comes before child in A → B chain', () => {
    const parent = makeLayer('P', 'Parent');
    const child  = makeLayer('C', 'Child', 'P');
    const sorted = topoSortLayers([child, parent]); // child listed first
    const parentIdx = sorted.findIndex(l => l.id === 'P');
    const childIdx  = sorted.findIndex(l => l.id === 'C');
    expect(parentIdx).toBeLessThan(childIdx);
  });

  it('handles multi-level chain A → B → C', () => {
    const a = makeLayer('A', 'A');
    const b = makeLayer('B', 'B', 'A');
    const c = makeLayer('C', 'C', 'B');
    const sorted = topoSortLayers([c, b, a]);
    const [ia, ib, ic] = ['A', 'B', 'C'].map(id => sorted.findIndex(l => l.id === id));
    expect(ia).toBeLessThan(ib);
    expect(ib).toBeLessThan(ic);
  });

  it('handles multiple independent roots', () => {
    const a1 = makeLayer('A1', 'A1');
    const a2 = makeLayer('A2', 'A2');
    const b1 = makeLayer('B1', 'B1', 'A1');
    const b2 = makeLayer('B2', 'B2', 'A2');
    const sorted = topoSortLayers([b1, b2, a1, a2]);
    const ia1 = sorted.findIndex(l => l.id === 'A1');
    const ib1 = sorted.findIndex(l => l.id === 'B1');
    const ia2 = sorted.findIndex(l => l.id === 'A2');
    const ib2 = sorted.findIndex(l => l.id === 'B2');
    expect(ia1).toBeLessThan(ib1);
    expect(ia2).toBeLessThan(ib2);
  });

  it('does not infinite-loop on circular reference', () => {
    const a = makeLayer('A', 'A', 'B');
    const b = makeLayer('B', 'B', 'A');
    expect(() => topoSortLayers([a, b])).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// scrubModelForExport
// ---------------------------------------------------------------------------

describe('scrubModelForExport', () => {
  it('removes password from postgis sourceConnection', () => {
    const model = makeModel([], {
      type: 'postgis',
      config: { host: 'db.host', port: '5432', dbname: 'mydb', user: 'alice', password: 'secret', schema: 'public' },
      layerMappings: {},
    });
    const scrubbed = scrubModelForExport(model);
    expect((scrubbed.sourceConnection!.config as any).password).toBeUndefined();
  });

  it('preserves non-credential fields in config', () => {
    const model = makeModel([], {
      type: 'postgis',
      config: { host: 'db.host', port: '5432', dbname: 'mydb', user: 'alice', password: 'secret', schema: 'public' },
      layerMappings: {},
    });
    const scrubbed = scrubModelForExport(model);
    const cfg = scrubbed.sourceConnection!.config as any;
    expect(cfg.host).toBe('db.host');
    expect(cfg.dbname).toBe('mydb');
    expect(cfg.user).toBe('alice');
  });

  it('removes token from databricks sourceConnection', () => {
    const model = makeModel([], {
      type: 'databricks',
      config: { host: 'adb.host', httpPath: '/sql/1.0/w/abc', token: 'dapi123', catalog: 'main', schema: 'default' },
      layerMappings: {},
    });
    const scrubbed = scrubModelForExport(model);
    expect((scrubbed.sourceConnection!.config as any).token).toBeUndefined();
  });

  it('removes anonKey from supabase-style config', () => {
    const model = makeModel([], {
      type: 'supabase',
      config: { connectionString: 'postgresql://u:p@host/db', schema: 'public', anonKey: 'abc123' },
      layerMappings: {},
    });
    const scrubbed = scrubModelForExport(model);
    expect((scrubbed.sourceConnection!.config as any).anonKey).toBeUndefined();
  });

  it('does NOT mutate the original model', () => {
    const model = makeModel([], {
      type: 'postgis',
      config: { host: 'h', port: '5432', dbname: 'd', user: 'u', password: 'p', schema: 'public' },
      layerMappings: {},
    });
    scrubModelForExport(model);
    // Original password must still be intact
    expect((model.sourceConnection!.config as any).password).toBe('p');
  });

  it('handles model with no sourceConnection', () => {
    const model = makeModel([]);
    expect(() => scrubModelForExport(model)).not.toThrow();
    expect(scrubModelForExport(model).sourceConnection).toBeUndefined();
  });
});
