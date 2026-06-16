import { describe, it, expect } from 'vitest';
import { processGeoJsonToModel, processSqlToModel } from './importUtils';

// ---------------------------------------------------------------------------
// processGeoJsonToModel
// ---------------------------------------------------------------------------

describe('processGeoJsonToModel', () => {
  const makeFeatureCollection = (geometryType: string, properties: Record<string, any>) => ({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: geometryType, coordinates: [] },
      properties,
    }],
  });

  it('sets model name from filename (strips extension)', () => {
    const model = processGeoJsonToModel(makeFeatureCollection('Point', {}), 'roads.geojson');
    expect(model.name).toBe('roads');
  });

  it('detects Point geometry type', () => {
    const model = processGeoJsonToModel(makeFeatureCollection('Point', {}), 'file.json');
    expect(model.layers[0].geometryType).toBe('Point');
  });

  it('detects Polygon geometry type', () => {
    const model = processGeoJsonToModel(makeFeatureCollection('Polygon', {}), 'file.json');
    expect(model.layers[0].geometryType).toBe('Polygon');
  });

  it('detects LineString geometry type', () => {
    const model = processGeoJsonToModel(makeFeatureCollection('LineString', {}), 'file.json');
    expect(model.layers[0].geometryType).toBe('LineString');
  });

  it('creates a field for each property key', () => {
    const model = processGeoJsonToModel(
      makeFeatureCollection('Point', { name: 'road', length: 100, is_open: true }),
      'file.json'
    );
    expect(model.layers[0].properties).toHaveLength(3);
  });

  it('infers string type from string property', () => {
    const model = processGeoJsonToModel(makeFeatureCollection('Point', { label: 'abc' }), 'f.json');
    const field = model.layers[0].properties.find(f => f.name === 'label');
    expect(field?.fieldType).toEqual({ kind: 'primitive', baseType: 'string' });
  });

  it('infers integer type from integer property', () => {
    const model = processGeoJsonToModel(makeFeatureCollection('Point', { count: 5 }), 'f.json');
    const field = model.layers[0].properties.find(f => f.name === 'count');
    expect(field?.fieldType).toEqual({ kind: 'primitive', baseType: 'integer' });
  });

  it('infers number type from float property', () => {
    const model = processGeoJsonToModel(makeFeatureCollection('Point', { length: 1.5 }), 'f.json');
    const field = model.layers[0].properties.find(f => f.name === 'length');
    expect(field?.fieldType).toEqual({ kind: 'primitive', baseType: 'number' });
  });

  it('infers boolean type from boolean property', () => {
    const model = processGeoJsonToModel(makeFeatureCollection('Point', { is_open: true }), 'f.json');
    const field = model.layers[0].properties.find(f => f.name === 'is_open');
    expect(field?.fieldType).toEqual({ kind: 'primitive', baseType: 'boolean' });
  });

  it('sanitizes field names using sanitizeTechnicalName', () => {
    const model = processGeoJsonToModel(makeFeatureCollection('Point', { 'Road Name': 'x' }), 'f.json');
    const field = model.layers[0].properties[0];
    // sanitizeTechnicalName: "Road Name" → "road_name"
    expect(field.name).toBe('road_name');
  });

  it('preserves colon in OSM-style field names', () => {
    const model = processGeoJsonToModel(makeFeatureCollection('Point', { 'addr:street': 'Main St' }), 'f.json');
    const field = model.layers[0].properties[0];
    expect(field.name).toBe('addr:street');
  });

  it('handles empty features array gracefully', () => {
    const model = processGeoJsonToModel({ type: 'FeatureCollection', features: [] }, 'f.json');
    expect(model.layers).toHaveLength(1);
    expect(model.layers[0].properties).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// processSqlToModel
// ---------------------------------------------------------------------------

describe('processSqlToModel', () => {
  it('sets model name from filename', () => {
    const sql = 'CREATE TABLE roads (id SERIAL PRIMARY KEY, name TEXT);';
    const model = processSqlToModel(sql, 'roads.sql');
    expect(model.name).toBe('roads');
  });

  it('parses a CREATE TABLE with basic columns', () => {
    const sql = 'CREATE TABLE roads (id SERIAL PRIMARY KEY, road_name TEXT, length FLOAT);';
    const model = processSqlToModel(sql, 'f.sql');
    expect(model.layers[0].name).toBe('roads');
    const names = model.layers[0].properties.map(p => p.name);
    expect(names).toContain('road_name');
    expect(names).toContain('length');
  });

  it('maps TEXT to string field type', () => {
    const sql = 'CREATE TABLE t (label TEXT);';
    const model = processSqlToModel(sql, 'f.sql');
    const field = model.layers[0].properties.find(f => f.name === 'label');
    expect(field?.fieldType).toEqual({ kind: 'primitive', baseType: 'string' });
  });

  it('maps INTEGER to integer field type', () => {
    const sql = 'CREATE TABLE t (count INTEGER);';
    const model = processSqlToModel(sql, 'f.sql');
    const field = model.layers[0].properties.find(f => f.name === 'count');
    expect(field?.fieldType).toMatchObject({ kind: 'primitive', baseType: 'integer' });
  });

  it('marks NOT NULL columns with 1..1 multiplicity', () => {
    const sql = 'CREATE TABLE t (name TEXT NOT NULL, desc TEXT);';
    const model = processSqlToModel(sql, 'f.sql');
    const required = model.layers[0].properties.find(f => f.name === 'name');
    const optional = model.layers[0].properties.find(f => f.name === 'desc');
    expect(required?.multiplicity).toBe('1..1');
    expect(optional?.multiplicity).toBe('0..1');
  });

  it('parses multiple CREATE TABLE statements', () => {
    const sql = `
      CREATE TABLE roads (id SERIAL, name TEXT);
      CREATE TABLE buildings (id SERIAL, height FLOAT);
    `;
    const model = processSqlToModel(sql, 'f.sql');
    expect(model.layers.map(l => l.name)).toContain('roads');
    expect(model.layers.map(l => l.name)).toContain('buildings');
  });

  it('handles geometry column and sets geometryType', () => {
    const sql = 'CREATE TABLE roads (id SERIAL, geom geometry(LineString, 4326));';
    const model = processSqlToModel(sql, 'f.sql');
    expect(model.layers[0].geometryType).toBe('LineString');
  });
});
