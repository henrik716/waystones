import { describe, it, expect } from 'vitest';
import { validateModel, validateLayer } from './validationUtils';
import type { DataModel, Layer, Field } from '../types';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let _id = 0;
const uid = () => `id-${++_id}`;

const makeField = (overrides: Partial<Field> = {}): Field => ({
  id: uid(),
  name: 'road_name',
  title: 'Road Name',
  description: '',
  multiplicity: '0..1',
  constraints: {},
  fieldType: { kind: 'primitive', baseType: 'string' },
  ...overrides,
});

const makeLayer = (overrides: Partial<Layer> = {}): Layer => ({
  id: uid(),
  name: 'Roads',
  description: '',
  properties: [makeField({ name: 'name' })],
  geometryType: 'LineString',
  geometryColumnName: 'geom',
  style: { type: 'simple', simpleColor: '#000' } as any,
  ...overrides,
});

const makeModel = (overrides: Partial<DataModel> = {}): DataModel => ({
  id: uid(),
  name: 'Test Model',
  namespace: 'test',
  description: '',
  version: '1.0.0',
  layers: [makeLayer()],
  sharedTypes: [],
  sharedEnums: [],
  crs: 'EPSG:4326',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// validateModel — model-level checks
// ---------------------------------------------------------------------------

describe('validateModel', () => {
  it('returns no issues for a minimal valid model', () => {
    const issues = validateModel(makeModel());
    const errors = issues.filter(i => i.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('LAYER_DUPLICATE_NAME: two layers with the same name', () => {
    const model = makeModel({
      layers: [makeLayer({ name: 'Roads' }), makeLayer({ name: 'Roads' })],
    });
    const issues = validateModel(model);
    const dupes = issues.filter(i => i.code === 'LAYER_DUPLICATE_NAME');
    expect(dupes.length).toBeGreaterThanOrEqual(2);
    expect(dupes[0].severity).toBe('error');
  });

  it('no LAYER_DUPLICATE_NAME when names are unique', () => {
    const model = makeModel({
      layers: [makeLayer({ name: 'Roads' }), makeLayer({ name: 'Buildings' })],
    });
    const issues = validateModel(model);
    expect(issues.filter(i => i.code === 'LAYER_DUPLICATE_NAME')).toHaveLength(0);
  });

  it('LAYER_EXTENDS_CIRCULAR_DEEP: A extends B extends A', () => {
    const a = makeLayer({ name: 'A' });
    const b = makeLayer({ name: 'B' });
    (a as any).extends = b.id;
    (b as any).extends = a.id;
    const model = makeModel({ layers: [a, b] });
    const issues = validateModel(model);
    expect(issues.some(i => i.code === 'LAYER_EXTENDS_CIRCULAR_DEEP')).toBe(true);
  });

  it('LAYER_EXTENDS_UNKNOWN: layer extends a non-existent ID', () => {
    const layer = makeLayer({ name: 'Child' });
    (layer as any).extends = 'nonexistent-id';
    const model = makeModel({ layers: [layer] });
    const issues = validateModel(model);
    expect(issues.some(i => i.code === 'LAYER_EXTENDS_UNKNOWN')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateLayer — layer-level checks
// ---------------------------------------------------------------------------

describe('validateLayer', () => {
  it('LAYER_NO_PROPERTIES: non-abstract layer with no properties gets warning', () => {
    const layer = makeLayer({ properties: [] });
    const issues = validateLayer(layer, [layer]);
    expect(issues.some(i => i.code === 'LAYER_NO_PROPERTIES')).toBe(true);
    expect(issues.find(i => i.code === 'LAYER_NO_PROPERTIES')?.severity).toBe('warning');
  });

  it('no LAYER_NO_PROPERTIES for abstract layer with no properties', () => {
    const layer = makeLayer({ properties: [], isAbstract: true });
    const issues = validateLayer(layer, [layer]);
    expect(issues.some(i => i.code === 'LAYER_NO_PROPERTIES')).toBe(false);
  });

  it('FIELD_DUPLICATE_NAME: two fields with the same name in a layer', () => {
    const f1 = makeField({ name: 'road_name' });
    const f2 = makeField({ name: 'road_name' });
    const layer = makeLayer({ properties: [f1, f2] });
    const issues = validateLayer(layer, [layer]);
    expect(issues.some(i => i.code === 'FIELD_DUPLICATE_NAME')).toBe(true);
    expect(issues.find(i => i.code === 'FIELD_DUPLICATE_NAME')?.severity).toBe('error');
  });

  it('FIELD_NAME_TOO_LONG: field name longer than 63 chars', () => {
    const longName = 'a'.repeat(64);
    const layer = makeLayer({ properties: [makeField({ name: longName })] });
    const issues = validateLayer(layer, [layer]);
    expect(issues.some(i => i.code === 'FIELD_NAME_TOO_LONG')).toBe(true);
  });

  it('no FIELD_NAME_TOO_LONG: exactly 63 chars is fine', () => {
    const name63 = 'a'.repeat(63);
    const layer = makeLayer({ properties: [makeField({ name: name63 })] });
    const issues = validateLayer(layer, [layer]);
    expect(issues.some(i => i.code === 'FIELD_NAME_TOO_LONG')).toBe(false);
  });

  it('FIELD_FEATURE_REF_EMPTY: feature-ref field with no layerId', () => {
    const refField = makeField({
      name: 'parent_road',
      fieldType: { kind: 'feature-ref', layerId: '', relationType: 'foreign_key' },
    });
    const layer = makeLayer({ properties: [refField] });
    const issues = validateLayer(layer, [layer]);
    expect(issues.some(i => i.code === 'FIELD_FEATURE_REF_EMPTY')).toBe(true);
  });

  it('LAYER_PK_MULTIPLICITY: nullable PK field gets warning', () => {
    const pkField = makeField({
      name: 'id',
      multiplicity: '0..1',
      constraints: { isPrimaryKey: true },
      fieldType: { kind: 'primitive', baseType: 'integer' },
    });
    const layer = makeLayer({ properties: [pkField] });
    const issues = validateLayer(layer, [layer]);
    expect(issues.some(i => i.code === 'LAYER_PK_MULTIPLICITY')).toBe(true);
  });
});
