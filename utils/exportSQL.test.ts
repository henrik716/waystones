import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportSQL } from './exportSQL';
import type { DataModel, Layer, Field } from '../types';

// ---------------------------------------------------------------------------
// Stub DOM APIs that jsdom doesn't implement
// ---------------------------------------------------------------------------

// Blob IS implemented by jsdom but URL.createObjectURL is not.
// We intercept Blob to capture the SQL text, and stub URL methods.

let capturedSql = '';

beforeEach(() => {
  capturedSql = '';

  // Capture Blob content without preventing the module from running
  const RealBlob = global.Blob;
  vi.spyOn(global, 'Blob').mockImplementation((parts?: BlobPart[]) => {
    capturedSql = (parts ?? []).map(p => String(p)).join('');
    return new RealBlob(parts ?? []);
  });

  // URL.createObjectURL is not in jsdom — stub it
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:fake'), configurable: true, writable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true, writable: true });
});

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let _id = 0;
const uid = () => `sql-${++_id}`;

const makeField = (name: string, baseType: string = 'string', overrides: Partial<Field> = {}): Field => ({
  id: uid(),
  name,
  title: name,
  description: '',
  multiplicity: '0..1',
  constraints: {},
  fieldType: { kind: 'primitive', baseType: baseType as any },
  ...overrides,
});

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

const makeModel = (layers: Layer[], overrides: Partial<DataModel> = {}): DataModel => ({
  id: uid(),
  name: 'My Model',
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
// Tests
// ---------------------------------------------------------------------------

describe('exportSQL', () => {
  it('does not throw', () => {
    expect(() => exportSQL(makeModel([makeLayer('Roads')]), 'test')).not.toThrow();
  });

  it('includes CREATE EXTENSION IF NOT EXISTS postgis', () => {
    exportSQL(makeModel([makeLayer('Roads')]), 'test');
    expect(capturedSql).toContain('CREATE EXTENSION IF NOT EXISTS postgis');
  });

  it('creates a table for each non-abstract layer', () => {
    const model = makeModel([makeLayer('Roads'), makeLayer('Buildings')]);
    exportSQL(model, 'test');
    expect(capturedSql).toContain('CREATE TABLE roads');
    expect(capturedSql).toContain('CREATE TABLE buildings');
  });

  it('uses toTableName for table names (spaces → underscores)', () => {
    exportSQL(makeModel([makeLayer('My Layer')]), 'test');
    expect(capturedSql).toContain('CREATE TABLE my_layer');
    expect(capturedSql).not.toContain('CREATE TABLE My Layer');
  });

  it('skips abstract layers', () => {
    const model = makeModel([makeLayer('Roads'), makeLayer('Base', { isAbstract: true })]);
    exportSQL(model, 'test');
    expect(capturedSql).toContain('CREATE TABLE roads');
    expect(capturedSql).not.toContain('CREATE TABLE base');
  });

  it('adds fid SERIAL PRIMARY KEY when no pk field declared', () => {
    exportSQL(makeModel([makeLayer('Roads')]), 'test');
    expect(capturedSql).toContain('fid SERIAL PRIMARY KEY');
  });

  it('includes string field as TEXT', () => {
    const layer = makeLayer('Roads', { properties: [makeField('name', 'string')] });
    exportSQL(makeModel([layer]), 'test');
    expect(capturedSql).toContain('"name" TEXT');
  });

  it('includes integer field as INTEGER', () => {
    const layer = makeLayer('Roads', { properties: [makeField('lane_count', 'integer')] });
    exportSQL(makeModel([layer]), 'test');
    expect(capturedSql).toContain('"lane_count" INTEGER');
  });

  it('includes number field as DOUBLE PRECISION', () => {
    const layer = makeLayer('Roads', { properties: [makeField('length_km', 'number')] });
    exportSQL(makeModel([layer]), 'test');
    expect(capturedSql).toContain('"length_km" DOUBLE PRECISION');
  });

  it('includes boolean field as BOOLEAN', () => {
    const layer = makeLayer('Roads', { properties: [makeField('is_one_way', 'boolean')] });
    exportSQL(makeModel([layer]), 'test');
    expect(capturedSql).toContain('"is_one_way" BOOLEAN');
  });

  it('includes NOT NULL for multiplicity 1..1 fields', () => {
    const field = makeField('name', 'string', { multiplicity: '1..1' });
    const layer = makeLayer('Roads', { properties: [field] });
    exportSQL(makeModel([layer]), 'test');
    expect(capturedSql).toContain('"name" TEXT NOT NULL');
  });

  it('creates GIST spatial index for geometry layers', () => {
    exportSQL(makeModel([makeLayer('Roads')]), 'test');
    expect(capturedSql).toContain('USING GIST');
  });

  it('geometry column uses model CRS SRID', () => {
    exportSQL(makeModel([makeLayer('Roads')], { crs: 'EPSG:25833' }), 'test');
    expect(capturedSql).toContain('geometry(POLYGON, 25833)');
  });

  it('skips geometry column for None geometry type', () => {
    const layer = makeLayer('Meta', { geometryType: 'None' });
    exportSQL(makeModel([layer]), 'test');
    // No geometry column for None layers
    expect(capturedSql).not.toContain('geometry(');
    // But the table itself is still created
    expect(capturedSql).toContain('CREATE TABLE meta');
  });
});
