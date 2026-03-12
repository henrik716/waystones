import { PropertyType } from '../types';

export const mapSqlTypeToPropertyType = (type: string): PropertyType => {
  const tLower = type.toLowerCase();
  if (tLower.includes('int')) return 'integer';
  if (tLower.includes('double') || tLower.includes('float') || tLower.includes('real') || tLower.includes('numeric')) return 'number';
  if (tLower.includes('bool') || tLower.includes('boolean')) return 'boolean';
  if (tLower.includes('date') || tLower.includes('time') || tLower.includes('timestamp')) return 'date';
  if (tLower.includes('geom') || tLower.includes('point') || tLower.includes('line') || tLower.includes('poly') || tLower.includes('shape')) return 'geometry';
  return 'string';
};

export const getSqlType = (type: PropertyType): string => {
  switch (type) {
    case 'integer': return 'INTEGER';
    case 'number': return 'DOUBLE PRECISION';
    case 'boolean': return 'BOOLEAN';
    case 'date': return 'TIMESTAMP';
    case 'json': return 'JSONB';
    case 'object': return 'JSONB';
    case 'array': return 'JSONB';
    case 'shared_type': return 'JSONB';
    case 'relation': return 'TEXT';
    default: return 'TEXT';
  }
};

export const getSqliteType = (type: PropertyType): string => {
  switch (type) {
    case 'integer': return 'INTEGER';
    case 'number': return 'REAL';
    case 'boolean': return 'INTEGER';
    case 'object': return 'TEXT';
    case 'array': return 'TEXT';
    case 'shared_type': return 'TEXT';
    case 'relation': return 'TEXT';
    default: return 'TEXT';
  }
};
