import { GeometryType } from '../types';

export const normalizeGeometryType = (type: string): GeometryType => {
  const t = type.toLowerCase();
  if (t === 'none') return 'None';
  if (t.includes('multipolygon')) return 'MultiPolygon';
  if (t.includes('multilinestring')) return 'MultiLineString';
  if (t.includes('multipoint')) return 'MultiPoint';
  if (t.includes('polygon')) return 'Polygon';
  if (t.includes('linestring')) return 'LineString';
  if (t.includes('point')) return 'Point';
  if (t.includes('collection')) return 'GeometryCollection';
  return 'Polygon';
};
