import type { FieldType, PrimitiveFieldType } from '../types';

/** Map a SQL type string to a FieldType (used during import) */
export const mapSqlTypeToFieldType = (type: string): FieldType => {
  const tLower = type.toLowerCase();
  if (tLower.includes('int'))                                                                                    return { kind: 'primitive', baseType: 'integer' };
  if (tLower.includes('double') || tLower.includes('float') || tLower.includes('real') || tLower.includes('numeric')) return { kind: 'primitive', baseType: 'number' };
  if (tLower.includes('bool') || tLower.includes('boolean'))                                                     return { kind: 'primitive', baseType: 'boolean' };
  if (tLower.includes('date') || tLower.includes('time') || tLower.includes('timestamp'))                        return { kind: 'primitive', baseType: 'date' };
  if (tLower.includes('geom') || tLower.includes('point') || tLower.includes('line') || tLower.includes('poly') || tLower.includes('shape')) return { kind: 'geometry', geometryType: 'Point' };
  return { kind: 'primitive', baseType: 'string' };
};

/** Get PostgreSQL column type for a FieldType */
export const getSqlType = (ft: FieldType): string => {
  switch (ft.kind) {
    case 'primitive': {
      switch (ft.baseType) {
        case 'integer': return 'INTEGER';
        case 'number':  return 'DOUBLE PRECISION';
        case 'boolean': return 'BOOLEAN';
        case 'date':    return 'TIMESTAMP';
        case 'json':    return 'JSONB';
        default:        return 'TEXT';
      }
    }
    case 'codelist':        return 'TEXT';
    case 'geometry':        return 'TEXT'; // handled separately via PostGIS
    case 'feature-ref':     return 'TEXT';
    case 'datatype-inline': return 'JSONB';
    case 'datatype-ref':    return 'JSONB';
  }
};

/** Get SQLite column type for a FieldType */
export const getSqliteType = (ft: FieldType): string => {
  switch (ft.kind) {
    case 'primitive': {
      switch (ft.baseType) {
        case 'integer': return 'INTEGER';
        case 'number':  return 'REAL';
        case 'boolean': return 'INTEGER';
        default:        return 'TEXT';
      }
    }
    case 'codelist':        return 'TEXT';
    case 'geometry':        return 'BLOB';
    case 'feature-ref':     return 'TEXT';
    case 'datatype-inline': return 'TEXT';
    case 'datatype-ref':    return 'TEXT';
  }
};
