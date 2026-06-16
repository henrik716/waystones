import { describe, it, expect } from 'vitest';
import { normalizeGeometryType } from './geomUtils';

describe('normalizeGeometryType', () => {
  it('"point" → "Point"', () => {
    expect(normalizeGeometryType('point')).toBe('Point');
  });

  it('"POINT" → "Point"', () => {
    expect(normalizeGeometryType('POINT')).toBe('Point');
  });

  it('"linestring" → "LineString"', () => {
    expect(normalizeGeometryType('linestring')).toBe('LineString');
  });

  it('"LINESTRING" → "LineString"', () => {
    expect(normalizeGeometryType('LINESTRING')).toBe('LineString');
  });

  it('"polygon" → "Polygon"', () => {
    expect(normalizeGeometryType('polygon')).toBe('Polygon');
  });

  it('"POLYGON" → "Polygon"', () => {
    expect(normalizeGeometryType('POLYGON')).toBe('Polygon');
  });

  it('"multipoint" → "MultiPoint"', () => {
    expect(normalizeGeometryType('multipoint')).toBe('MultiPoint');
  });

  it('"MULTIPOINT" → "MultiPoint"', () => {
    expect(normalizeGeometryType('MULTIPOINT')).toBe('MultiPoint');
  });

  it('"multilinestring" → "MultiLineString"', () => {
    expect(normalizeGeometryType('multilinestring')).toBe('MultiLineString');
  });

  it('"MULTILINESTRING" → "MultiLineString"', () => {
    expect(normalizeGeometryType('MULTILINESTRING')).toBe('MultiLineString');
  });

  it('"multipolygon" → "MultiPolygon"', () => {
    expect(normalizeGeometryType('multipolygon')).toBe('MultiPolygon');
  });

  it('"MULTIPOLYGON" → "MultiPolygon"', () => {
    expect(normalizeGeometryType('MULTIPOLYGON')).toBe('MultiPolygon');
  });

  it('"none" → "None"', () => {
    expect(normalizeGeometryType('none')).toBe('None');
  });

  it('"NONE" → "None"', () => {
    expect(normalizeGeometryType('NONE')).toBe('None');
  });

  it('"geometrycollection" → "GeometryCollection"', () => {
    expect(normalizeGeometryType('geometrycollection')).toBe('GeometryCollection');
  });

  it('"GEOMETRYCOLLECTION" → "GeometryCollection"', () => {
    expect(normalizeGeometryType('GEOMETRYCOLLECTION')).toBe('GeometryCollection');
  });

  it('"geometry(Point, 4326)" contains "point" → "Point"', () => {
    expect(normalizeGeometryType('geometry(Point, 4326)')).toBe('Point');
  });

  it('"geometry(Polygon, 25833)" → "Polygon"', () => {
    expect(normalizeGeometryType('geometry(Polygon, 25833)')).toBe('Polygon');
  });

  it('"geometry(MultiLineString, 4326)" → "MultiLineString"', () => {
    expect(normalizeGeometryType('geometry(MultiLineString, 4326)')).toBe('MultiLineString');
  });

  it('unknown type falls back to "Polygon"', () => {
    expect(normalizeGeometryType('raster')).toBe('Polygon');
    expect(normalizeGeometryType('tin')).toBe('Polygon');
  });

  it('empty string falls back to "Polygon"', () => {
    expect(normalizeGeometryType('')).toBe('Polygon');
  });
});
