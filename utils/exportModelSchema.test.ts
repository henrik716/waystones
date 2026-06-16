import { describe, it, expect } from 'vitest';
import { generateModelSchema } from './exportModelSchema';

describe('generateModelSchema', () => {
  const schema = generateModelSchema();

  it('returns an object', () => {
    expect(typeof schema).toBe('object');
    expect(schema).not.toBeNull();
  });

  it('$schema points to JSON Schema 2020-12', () => {
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
  });

  it('type is "object"', () => {
    expect(schema.type).toBe('object');
  });

  it('required contains id, name, namespace, version, layers, crs, createdAt, updatedAt', () => {
    const required = schema.required as string[];
    for (const field of ['id', 'name', 'namespace', 'version', 'layers', 'crs', 'createdAt', 'updatedAt']) {
      expect(required).toContain(field);
    }
  });

  it('properties.layers is an array type', () => {
    expect(schema.properties.layers.type).toBe('array');
  });

  it('properties.layers.items has required array', () => {
    expect(Array.isArray(schema.properties.layers.items.required)).toBe(true);
  });

  it('layers items required includes id, name, geometryType, properties, style', () => {
    const r = schema.properties.layers.items.required as string[];
    for (const f of ['id', 'name', 'geometryType', 'properties', 'style']) {
      expect(r).toContain(f);
    }
  });

  it('geometryType is an enum with all known types', () => {
    const enumVals: string[] = schema.properties.layers.items.properties.geometryType.enum;
    for (const t of ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon', 'None']) {
      expect(enumVals).toContain(t);
    }
  });

  it('$defs contains Field definition', () => {
    expect(schema.$defs?.Field || schema.definitions?.Field).toBeTruthy();
  });

  it('$defs contains LayerStyle definition', () => {
    expect(schema.$defs?.LayerStyle || schema.definitions?.LayerStyle).toBeTruthy();
  });

  it('properties.crs has string type', () => {
    expect(schema.properties.crs.type).toBe('string');
  });

  it('properties.createdAt has date-time format', () => {
    expect(schema.properties.createdAt.format).toBe('date-time');
  });

  it('returns same object each call (no state mutation)', () => {
    const s1 = generateModelSchema();
    const s2 = generateModelSchema();
    expect(JSON.stringify(s1)).toBe(JSON.stringify(s2));
  });
});
