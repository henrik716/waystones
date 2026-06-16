import { describe, it, expect } from 'vitest';
import { compareModels, calculateNextVersion } from './diffUtils';
import type { DataModel, Layer, Field } from '../types';
import type { Translations } from '../i18n/index';

// ---------------------------------------------------------------------------
// Minimal Translations mock
// ---------------------------------------------------------------------------

const t = {
  modelName: 'Model name',
  version: 'Version',
  namespace: 'Namespace',
  crsLabel: 'CRS',
  layerName: 'Layer name',
  propName: 'Name',
  propTitle: 'Title',
  propType: 'Type',
  propRequired: 'Multiplicity',
  propDescription: 'Description',
  propDefault: 'Default',
  propGeometryType: 'Geometry type',
  geomColumnName: 'Geometry column',
  sharedTypeName: 'Datatype',
  sharedTypes: 'Shared types',
  types: { string: 'String', integer: 'Integer', number: 'Number', boolean: 'Boolean', codelist: 'Codelist', geometry: 'Geometry', 'feature-ref': 'Relation', 'datatype-inline': 'Object', 'datatype-ref': 'Datatype' },
  geometryTypes: { Point: 'Point', MultiPoint: 'MultiPoint', LineString: 'LineString', MultiLineString: 'MultiLineString', Polygon: 'Polygon', MultiPolygon: 'MultiPolygon', None: 'None' },
  constraints: { title: 'Constraints' },
  layerValidation: { title: 'Validation' },
  review: {
    empty: 'empty',
    added: 'Added',
    deleted: 'Deleted',
    modified: 'Modified',
    layer: 'layer',
    noChanges: 'No changes',
    modelMetadata: 'Model metadata',
    breakingChanges: 'Breaking Changes',
    newFeatures: 'New Features',
    improvementsFixes: 'Improvements',
  },
} as unknown as Translations;

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let _id = 0;
const uid = () => `d-${++_id}`;

const makeField = (name: string): Field => ({
  id: uid(),
  name,
  title: name,
  description: '',
  multiplicity: '0..1',
  constraints: {},
  fieldType: { kind: 'primitive', baseType: 'string' },
});

const makeLayer = (id: string, name: string, fields: Field[] = []): Layer => ({
  id,
  name,
  description: '',
  properties: fields,
  geometryType: 'Polygon',
  geometryColumnName: 'geom',
  style: { type: 'simple', simpleColor: '#000' } as any,
});

const makeModel = (layers: Layer[], overrides: Partial<DataModel> = {}): DataModel => ({
  id: uid(),
  name: 'Test Model',
  namespace: 'test',
  description: '',
  version: '1.0.0',
  layers,
  sharedTypes: [],
  sharedEnums: [],
  crs: 'EPSG:4326',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// compareModels
// ---------------------------------------------------------------------------

describe('compareModels', () => {
  it('returns empty array when baseline is null', () => {
    const model = makeModel([makeLayer('L1', 'Roads')]);
    expect(compareModels(null, model, t)).toEqual([]);
  });

  it('returns empty array when both models are identical', () => {
    const layer = makeLayer('L1', 'Roads');
    const model = makeModel([layer]);
    const changes = compareModels(model, model, t);
    expect(changes).toHaveLength(0);
  });

  it('detects added layer', () => {
    const baseline = makeModel([makeLayer('L1', 'Roads')]);
    const current = makeModel([makeLayer('L1', 'Roads'), makeLayer('L2', 'Buildings')]);
    const changes = compareModels(baseline, current, t);
    const added = changes.filter(c => c.type === 'added' && c.itemType === 'layer');
    expect(added).toHaveLength(1);
    expect(added[0].itemName).toBe('Buildings');
    expect(added[0].layerId).toBe('L2');
  });

  it('detects deleted layer', () => {
    const baseline = makeModel([makeLayer('L1', 'Roads'), makeLayer('L2', 'Buildings')]);
    const current = makeModel([makeLayer('L1', 'Roads')]);
    const changes = compareModels(baseline, current, t);
    const deleted = changes.filter(c => c.type === 'deleted' && c.itemType === 'layer');
    expect(deleted).toHaveLength(1);
    expect(deleted[0].itemName).toBe('Buildings');
  });

  it('detects modified layer name', () => {
    const baseline = makeModel([makeLayer('L1', 'Roads')]);
    const current = makeModel([makeLayer('L1', 'Paths')]);
    const changes = compareModels(baseline, current, t);
    const modified = changes.filter(c => c.type === 'modified' && c.itemType === 'layer');
    expect(modified).toHaveLength(1);
    const nameChange = modified[0].modifiedFields?.find(f => f.field === t.layerName);
    expect(nameChange?.oldValue).toBe('Roads');
    expect(nameChange?.newValue).toBe('Paths');
  });

  it('detects added property', () => {
    const field = makeField('length');
    const baseline = makeModel([makeLayer('L1', 'Roads', [])]);
    const current = makeModel([makeLayer('L1', 'Roads', [field])]);
    const changes = compareModels(baseline, current, t);
    const added = changes.filter(c => c.type === 'added' && c.itemType === 'property');
    expect(added).toHaveLength(1);
    expect(added[0].itemName).toBe('length');
    expect(added[0].layerId).toBe('L1');
  });

  it('detects deleted property', () => {
    const field = makeField('length');
    const baseline = makeModel([makeLayer('L1', 'Roads', [field])]);
    const current = makeModel([makeLayer('L1', 'Roads', [])]);
    const changes = compareModels(baseline, current, t);
    const deleted = changes.filter(c => c.type === 'deleted' && c.itemType === 'property');
    expect(deleted).toHaveLength(1);
    expect(deleted[0].itemName).toBe('length');
  });

  it('detects modified property name', () => {
    const baseField = { ...makeField('length'), id: 'F1' };
    const currField = { ...makeField('road_length'), id: 'F1' };
    const baseline = makeModel([makeLayer('L1', 'Roads', [baseField])]);
    const current = makeModel([makeLayer('L1', 'Roads', [currField])]);
    const changes = compareModels(baseline, current, t);
    const modified = changes.filter(c => c.type === 'modified' && c.itemType === 'property');
    expect(modified).toHaveLength(1);
    const nameChange = modified[0].modifiedFields?.find(f => f.field === (t as any).propName);
    expect(nameChange?.oldValue).toBe('length');
    expect(nameChange?.newValue).toBe('road_length');
  });

  it('detects model metadata change (name)', () => {
    const baseline = makeModel([], { name: 'Old Model' });
    const current = makeModel([], { name: 'New Model' });
    const changes = compareModels(baseline, current, t);
    const meta = changes.filter(c => c.itemType === 'model_meta');
    expect(meta).toHaveLength(1);
    const nameChange = meta[0].modifiedFields?.find(f => f.field === t.modelName);
    expect(nameChange?.oldValue).toBe('Old Model');
    expect(nameChange?.newValue).toBe('New Model');
  });

  it('detects CRS change in model metadata', () => {
    const baseline = makeModel([], { crs: 'EPSG:4326' });
    const current = makeModel([], { crs: 'EPSG:25833' });
    const changes = compareModels(baseline, current, t);
    const meta = changes.filter(c => c.itemType === 'model_meta');
    expect(meta).toHaveLength(1);
    const crsChange = meta[0].modifiedFields?.find(f => f.field === t.crsLabel);
    expect(crsChange?.oldValue).toBe('EPSG:4326');
    expect(crsChange?.newValue).toBe('EPSG:25833');
  });
});

// ---------------------------------------------------------------------------
// calculateNextVersion
// ---------------------------------------------------------------------------

describe('calculateNextVersion', () => {
  it('bumps patch when only modifications', () => {
    const changes = [{ type: 'modified', itemType: 'layer', itemName: 'Roads' } as any];
    expect(calculateNextVersion('1.2.3', changes)).toBe('1.2.4');
  });

  it('bumps minor and resets patch when layer added', () => {
    const changes = [{ type: 'added', itemType: 'layer', itemName: 'Buildings' } as any];
    expect(calculateNextVersion('1.2.3', changes)).toBe('1.3.0');
  });

  it('bumps major and resets minor+patch when layer deleted', () => {
    const changes = [{ type: 'deleted', itemType: 'layer', itemName: 'Buildings' } as any];
    expect(calculateNextVersion('1.2.3', changes)).toBe('2.0.0');
  });

  it('returns "1.0.0" for non-semver current version', () => {
    const changes = [{ type: 'modified', itemType: 'layer', itemName: 'Roads' } as any];
    expect(calculateNextVersion('bad-version', changes)).toBe('1.0.0');
  });

  it('returns unchanged version when no changes', () => {
    expect(calculateNextVersion('2.5.1', [])).toBe('2.5.1');
  });
});
