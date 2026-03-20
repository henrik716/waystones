import { DataModel, GeometryType, Field, FieldType, SharedType } from '../types';
import type { Translations } from '../i18n/index';
import { getEffectiveProperties } from './modelUtils';
import { COLORS } from '../constants';
import { hexToRgb } from './colorUtils';
import { getSqlType, getSqliteType } from './typeMapUtils';
import { normalizeGeometryType } from './geomUtils';
import { toTableName } from './nameSanitizer';

export { hexToRgb } from './colorUtils';
export { getSqlType, getSqliteType } from './typeMapUtils';
export { normalizeGeometryType } from './geomUtils';

declare var initSqlJs: any;

/** Helper: is the multiplicity "required" (lower bound ≥ 1) */
const isRequired = (f: Field): boolean => f.multiplicity === '1..1' || f.multiplicity === '1..*';

// --- Recursive helper to build JSON Schema property definitions ---
const buildPropertySchema = (f: Field, model: DataModel): any => {
  const propSchema: any = {
    title: f.title || f.name,
  };

  if (f.description) propSchema.description = f.description;

  const ft = f.fieldType;
  switch (ft.kind) {
    case 'primitive':
      switch (ft.baseType) {
        case 'integer': propSchema.type = 'integer'; break;
        case 'number':  propSchema.type = 'number'; break;
        case 'boolean': propSchema.type = 'boolean'; break;
        case 'date':    propSchema.type = 'string'; propSchema.format = 'date'; break;
        case 'date-time': propSchema.type = 'string'; propSchema.format = 'date-time'; break;
        case 'json':    propSchema.type = 'object'; break;
        default:        propSchema.type = 'string'; break;
      }
      break;
    case 'datatype-ref': {
        const shared = model.sharedTypes?.find(st => st.id === ft.typeId);
        propSchema.type = 'object';
        if (shared) {
            propSchema.description = (f.description || '') + ` (Type: ${shared.name})`;
            const subProps: any = {};
            const subRequired: string[] = [];
            shared.properties.forEach(sp => {
                subProps[sp.name || 'felt'] = buildPropertySchema(sp, model);
                if (isRequired(sp)) subRequired.push(sp.name);
            });
            propSchema.properties = subProps;
            if (subRequired.length > 0) propSchema.required = subRequired;
            // Arv type-nivå-avgrensninger (felt-nivå overstyrer)
            if (shared.constraints) {
              const tc = shared.constraints;
              if (tc.min !== undefined && f.constraints?.min === undefined) propSchema.minimum = Number(tc.min);
              if (tc.max !== undefined && f.constraints?.max === undefined) propSchema.maximum = Number(tc.max);
              if (tc.minLength !== undefined && f.constraints?.minLength === undefined) propSchema.minLength = Number(tc.minLength);
              if (tc.maxLength !== undefined && f.constraints?.maxLength === undefined) propSchema.maxLength = Number(tc.maxLength);
              if (tc.pattern && !f.constraints?.pattern) propSchema.pattern = tc.pattern;
            }
        }
        break;
    }
    case 'datatype-inline': {
      const isArray = f.multiplicity === '0..*' || f.multiplicity === '1..*';
      if (isArray) {
        propSchema.type = 'array';
        if (ft.properties && ft.properties.length > 0) {
          const itemProps: any = {};
          const itemRequired: string[] = [];
          ft.properties.forEach(sp => {
            itemProps[sp.name || 'felt'] = buildPropertySchema(sp, model);
            if (isRequired(sp)) itemRequired.push(sp.name);
          });
          propSchema.items = { type: 'object', properties: itemProps };
          if (itemRequired.length > 0) propSchema.items.required = itemRequired;
        }
      } else {
        propSchema.type = 'object';
        if (ft.properties && ft.properties.length > 0) {
          const subProps: any = {};
          const subRequired: string[] = [];
          ft.properties.forEach(sp => {
            subProps[sp.name || 'felt'] = buildPropertySchema(sp, model);
            if (isRequired(sp)) subRequired.push(sp.name);
          });
          propSchema.properties = subProps;
          if (subRequired.length > 0) propSchema.required = subRequired;
        }
      }
      break;
    }
    case 'feature-ref':
      propSchema.type = 'string';
      {
        const targetLayer = model.layers.find(layer => layer.id === ft.layerId);
        const targetLayerName = targetLayer?.name || ft.layerId;
        const inverseField = ft.inverseFieldId
          ? targetLayer?.properties.find(p => p.id === ft.inverseFieldId)
          : undefined;
        propSchema['x-relation'] = {
          targetLayer: targetLayerName,
          relationType: ft.relationType,
          cascadeDelete: ft.cascadeDelete,
          multiplicity: f.multiplicity,
          ...(inverseField ? { inverseTo: inverseField.name } : {}),
        };
      }
      break;
    case 'codelist': {
      propSchema.type = 'string';
      let resolvedValues: { code: string; label: string }[] = [];
      if (ft.mode === 'shared') {
        resolvedValues = model.sharedEnums?.find(e => e.id === ft.enumRef)?.values ?? [];
      } else if (ft.mode === 'inline') {
        resolvedValues = ft.values;
      }
      if (resolvedValues.length > 0) {
        propSchema.enum = resolvedValues.map(v => v.code);
        propSchema['x-codelist-labels'] = resolvedValues.map(v => ({ code: v.code, label: v.label }));
      }
      break;
    }
    case 'geometry':
      propSchema.type = 'string';
      propSchema.format = 'geometry';
      break;
  }

  // Constraints & Default (skip for containers)
  if (ft.kind !== 'datatype-inline' && ft.kind !== 'datatype-ref') {
    if (f.defaultValue !== undefined && f.defaultValue !== '') {
        if (ft.kind === 'primitive' && (ft.baseType === 'number' || ft.baseType === 'integer')) propSchema.default = Number(f.defaultValue);
        else if (ft.kind === 'primitive' && ft.baseType === 'boolean') propSchema.default = f.defaultValue === 'true';
        else propSchema.default = f.defaultValue;
    }
    const c = f.constraints;
    if (c) {
      if (c.min !== undefined && c.min !== null) propSchema.minimum = Number(c.min);
      if (c.max !== undefined && c.max !== null) propSchema.maximum = Number(c.max);
      if (c.minLength !== undefined && c.minLength !== null) propSchema.minLength = Number(c.minLength);
      if (c.maxLength !== undefined && c.maxLength !== null) propSchema.maxLength = Number(c.maxLength);
      if (c.pattern) propSchema.pattern = c.pattern;
      if (c.isPrimaryKey || c.isUnique) propSchema['x-constraints'] = { primaryKey: !!c.isPrimaryKey, unique: !!c.isUnique };
    }
  }
  return propSchema;
};

// --- GeoJSON geometry schema helper ---
const geoJsonGeometrySchema = (geometryType: GeometryType): any => {
  const geomTypes: Record<string, any> = {
    Point: { type: 'object', required: ['type', 'coordinates'], properties: { type: { const: 'Point' }, coordinates: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 3 } } },
    LineString: { type: 'object', required: ['type', 'coordinates'], properties: { type: { const: 'LineString' }, coordinates: { type: 'array', items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 3 } } } },
    Polygon: { type: 'object', required: ['type', 'coordinates'], properties: { type: { const: 'Polygon' }, coordinates: { type: 'array', items: { type: 'array', items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 3 } } } } },
    MultiPoint: { type: 'object', required: ['type', 'coordinates'], properties: { type: { const: 'MultiPoint' }, coordinates: { type: 'array', items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 3 } } } },
    MultiLineString: { type: 'object', required: ['type', 'coordinates'], properties: { type: { const: 'MultiLineString' }, coordinates: { type: 'array', items: { type: 'array', items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 3 } } } } },
    MultiPolygon: { type: 'object', required: ['type', 'coordinates'], properties: { type: { const: 'MultiPolygon' }, coordinates: { type: 'array', items: { type: 'array', items: { type: 'array', items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 3 } } } } } },
    GeometryCollection: { type: 'object', required: ['type', 'geometries'], properties: { type: { const: 'GeometryCollection' }, geometries: { type: 'array', items: { type: 'object' } } } },
  };
  return geomTypes[geometryType] || null;
};

export const generateGeoJSONSchema = (model: DataModel): Record<string, any> => {
  const rootSchema: Record<string, any> = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: model.name,
    type: 'object',
    $defs: {},
    oneOf: []
  };

  if (model.description) rootSchema.description = model.description;

  model.layers.filter(l => !l.isAbstract).forEach(l => {
    const props: any = {};
    const required: string[] = [];
    getEffectiveProperties(l, model.layers).forEach(f => {
      props[f.name || 'felt'] = buildPropertySchema(f, model);
      if (isRequired(f)) required.push(f.name);
    });

    const propertiesSchema: any = { type: 'object', properties: props };
    if (required.length > 0) propertiesSchema.required = required;

    const hasGeom = l.geometryType !== 'None';

    if (!hasGeom) {
      rootSchema.$defs[l.name] = {
        title: l.name,
        type: 'object',
        properties: props,
        ...(required.length > 0 ? { required } : {}),
        ...(l.description ? { description: l.description } : {}),
      };
      rootSchema.oneOf.push({ $ref: `#/$defs/${l.name}` });
      return;
    }

    const geomSchema = geoJsonGeometrySchema(l.geometryType);

    const featureSchema: any = {
      title: l.name,
      type: 'object',
      required: ['type', 'geometry', 'properties'],
      properties: {
        type: { const: 'Feature' },
        id: { type: ['string', 'number'] },
        geometry: geomSchema
          ? { oneOf: [geomSchema, { type: 'null' }] }
          : { type: 'null' },
        properties: { oneOf: [propertiesSchema, { type: 'null' }] },
      },
    };

    if (l.description) featureSchema.description = l.description;

    rootSchema.$defs[l.name] = featureSchema;
    rootSchema.oneOf.push({ $ref: `#/$defs/${l.name}` });
  });

  return rootSchema;
};

export const generateJSONFGSchema = (model: DataModel): Record<string, any> => {
  const rootSchema: Record<string, any> = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: model.name,
    type: 'object',
    $defs: {},
    oneOf: []
  };

  if (model.description) rootSchema.description = model.description;

  model.layers.filter(l => !l.isAbstract).forEach(l => {
    const props: any = {};
    const required: string[] = [];
    getEffectiveProperties(l, model.layers).forEach(f => {
      props[f.name || 'felt'] = buildPropertySchema(f, model);
      if (isRequired(f)) required.push(f.name);
    });

    const propertiesSchema: any = { type: 'object', properties: props };
    if (required.length > 0) propertiesSchema.required = required;

    const hasGeom = l.geometryType !== 'None';

    if (!hasGeom) {
      rootSchema.$defs[l.name] = {
        title: l.name,
        type: 'object',
        properties: props,
        ...(required.length > 0 ? { required } : {}),
        ...(l.description ? { description: l.description } : {}),
      };
      rootSchema.oneOf.push({ $ref: `#/$defs/${l.name}` });
      return;
    }

    const crs = model.crs || 'EPSG:4326';
    const isWgs84 = crs === 'EPSG:4326' || crs === 'CRS84';
    const placeSchema = geoJsonGeometrySchema(l.geometryType);

    const featureSchema: any = {
      title: l.name,
      type: 'object',
      conformsTo: '[OGC-21-045]',
      featureType: l.name,
      coordRefSys: `https://www.opengis.net/def/crs/${crs.replace(':', '/')}`,
      required: ['type', 'time', 'geometry', 'properties'],
      properties: {
        type: { const: 'Feature' },
        id: { type: ['string', 'number'] },
        featureType: { const: l.name },
        time: {
          oneOf: [
            { type: 'null' },
            { type: 'string', format: 'date' },
            { type: 'string', format: 'date-time' },
            { type: 'object', properties: { date: { type: 'string', format: 'date' }, timestamp: { type: 'string', format: 'date-time' } } }
          ]
        },
        geometry: isWgs84 && placeSchema
          ? { oneOf: [placeSchema, { type: 'null' }] }
          : { type: 'null' },
        place: placeSchema
          ? { oneOf: [placeSchema, { type: 'null' }] }
          : { type: 'null' },
        properties: { oneOf: [propertiesSchema, { type: 'null' }] },
      },
    };

    if (l.description) featureSchema.description = l.description;

    rootSchema.$defs[l.name] = featureSchema;
    rootSchema.oneOf.push({ $ref: `#/$defs/${l.name}` });
  });

  return rootSchema;
};

export const exportGeoPackage = async (model: DataModel, filename: string) => {
  const SQL = await initSqlJs({ locateFile: () => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/sql-wasm.wasm` });
  const db = new SQL.Database();
  db.run("CREATE TABLE gpkg_contents (table_name TEXT PRIMARY KEY, data_type TEXT);");

  for (const layer of model.layers) {
    if (layer.isAbstract) continue;
    const tbl = toTableName(layer.name);
    const effectiveProperties = getEffectiveProperties(layer, model.layers);
    const pkFields = effectiveProperties.filter(f => f.constraints?.isPrimaryKey);
    const hasDeclaredPk = pkFields.length > 0;

    let sql = `CREATE TABLE ${tbl} (`;

    // Only add auto-injected fid if no primary key is declared
    if (!hasDeclaredPk) {
      sql += `fid INTEGER PRIMARY KEY AUTOINCREMENT`;
    }

    effectiveProperties.forEach((f, idx) => {
      const ft = f.fieldType;
      if (ft.kind === 'feature-ref' && ft.relationType !== 'foreign_key') return;
      const type = getSqliteType(ft);
      let colDef = hasDeclaredPk && idx === 0 ? '' : ',';
      colDef += ` "${f.name}" ${type}`;
      if (isRequired(f)) colDef += ' NOT NULL';
      if (f.constraints?.isPrimaryKey && pkFields.length === 1) colDef += ' PRIMARY KEY';
      else if (f.constraints?.isUnique) colDef += ' UNIQUE';
      
      // Foreign Key logikk
      if (ft.kind === 'feature-ref' && ft.relationType === 'foreign_key') {
        const targetLayer = model.layers.find(l => l.id === ft.layerId);
        if (targetLayer) {
          const targetTbl = toTableName(targetLayer.name);
          colDef += ` REFERENCES ${targetTbl}(fid)`;
          if (ft.cascadeDelete) colDef += ' ON DELETE CASCADE';
        }
      }
      
      // Check constraints
      if (ft.kind !== 'datatype-inline' && ft.kind !== 'datatype-ref') {
          const c = f.constraints;
          const checks: string[] = [];
          if (c?.min !== undefined && c.min !== null) checks.push(`"${f.name}" >= ${c.min}`);
          if (c?.max !== undefined && c.max !== null) checks.push(`"${f.name}" <= ${c.max}`);
          if (c?.minLength !== undefined && c.minLength !== null) checks.push(`length("${f.name}") >= ${c.minLength}`);
          if (c?.maxLength !== undefined && c.maxLength !== null) checks.push(`length("${f.name}") <= ${c.maxLength}`);
          if (c?.enumeration && c.enumeration.length > 0) {
            const enumVals = c.enumeration.map(v => `'${v.replace(/'/g, "''")}'`).join(', ');
            checks.push(`"${f.name}" IN (${enumVals})`);
          }
          if (checks.length > 0) colDef += ` CHECK (${checks.join(' AND ')})`;
      }
      sql += colDef;
    });

    // Composite PK if multiple fields
    if (pkFields.length > 1) {
      const pkCols = pkFields.map(f => `"${f.name}"`).join(', ');
      sql += `, CONSTRAINT "pk_${tbl}" PRIMARY KEY (${pkCols})`;
    }

    if (layer.layerConstraints && layer.layerConstraints.length > 0) {
      layer.layerConstraints.forEach(c => {
        sql += `, CONSTRAINT "chk_${c.id.substring(0,6)}" CHECK ("${c.fieldA}" ${c.operator} "${c.fieldB}")`;
      });
    }

    if (layer.geometryType !== 'None') {
        sql += `, ${layer.geometryColumnName || 'geom'} BLOB`;
    }
    sql += `);`;
    db.run(sql);
  }
  
  const binary = db.export();
  const blob = new Blob([binary], { type: 'application/x-sqlite3' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${filename}.gpkg`; a.click();
};

export const exportSQL = (model: DataModel, filename: string) => {
  let sql = `-- SQL Schema for ${model.name}\n-- Generated: ${new Date().toISOString()}\n\n`;
  sql += `CREATE EXTENSION IF NOT EXISTS postgis;\n\n`;

  model.layers.filter(l => !l.isAbstract).forEach(l => {
    const tbl = toTableName(l.name);
    const hasGeom = l.geometryType !== 'None';
    const effectiveProperties = getEffectiveProperties(l, model.layers);

    // Check for declared primary key fields
    const pkFields = effectiveProperties.filter(f => f.constraints?.isPrimaryKey);
    const hasDeclaredPk = pkFields.length > 0;

    // Collect geometry fields from properties
    const geomFields = effectiveProperties.filter(f => f.fieldType.kind === 'geometry');

    sql += `CREATE TABLE ${tbl} (\n`;

    // Only add auto-injected fid if no primary key is declared
    if (!hasDeclaredPk) {
      sql += `  fid SERIAL PRIMARY KEY`;
    } else {
      // Start with first column definition (no leading comma yet)
      let firstCol = true;
      effectiveProperties.forEach(f => {
        const ft = f.fieldType;
        if (ft.kind === 'feature-ref' && ft.relationType !== 'foreign_key') return;
        const type = getSqlType(ft);
        const c = f.constraints;

        if (firstCol) {
          firstCol = false;
          sql += `  "${f.name}" ${type}`;
        } else {
          sql += `,\n  "${f.name}" ${type}`;
        }

        if (isRequired(f)) sql += ' NOT NULL';
        if (c?.isPrimaryKey && pkFields.length === 1) sql += ' PRIMARY KEY';
        else if (c?.isUnique) sql += ' UNIQUE';

        // Constraints...
        if (ft.kind !== 'datatype-inline' && ft.kind !== 'datatype-ref') {
          const checkParts: string[] = [];
          if (c?.min !== undefined && c.min !== null) checkParts.push(`"${f.name}" >= ${c.min}`);
          if (c?.max !== undefined && c.max !== null) checkParts.push(`"${f.name}" <= ${c.max}`);
          if (c?.minLength !== undefined && c.minLength !== null) checkParts.push(`length("${f.name}") >= ${c.minLength}`);
          if (c?.maxLength !== undefined && c.maxLength !== null) checkParts.push(`length("${f.name}") <= ${c.maxLength}`);
          if (c?.pattern) checkParts.push(`"${f.name}" ~ '${c.pattern.replace(/'/g, "''")}'`);
          if (c?.enumeration && c.enumeration.length > 0) {
            const enumVals = c.enumeration.map(v => `'${v.replace(/'/g, "''")}'`).join(', ');
            checkParts.push(`"${f.name}" IN (${enumVals})`);
          }
          if (checkParts.length > 0) {
            sql += ` CHECK (${checkParts.join(' AND ')})`;
          }
        }

        // Foreign key
        if (ft.kind === 'feature-ref' && ft.relationType === 'foreign_key') {
          const targetLayer = model.layers.find(lyr => lyr.id === ft.layerId);
          if (targetLayer) {
            const targetTbl = toTableName(targetLayer.name);
            sql += ` REFERENCES ${targetTbl}(fid)`;
            if (ft.cascadeDelete) sql += ' ON DELETE CASCADE';
          }
        }
      });

      // Composite PK if multiple fields
      if (pkFields.length > 1) {
        const pkCols = pkFields.map(f => `"${f.name}"`).join(', ');
        sql += `,\n  CONSTRAINT "pk_${tbl}" PRIMARY KEY (${pkCols})`;
      }
    }

    // When using auto fid, add all properties with commas
    if (!hasDeclaredPk) {
      effectiveProperties.forEach(f => {
        const ft = f.fieldType;
        if (ft.kind === 'feature-ref' && ft.relationType !== 'foreign_key') return;
        const type = getSqlType(ft);
        const c = f.constraints;
        let line = `,\n  "${f.name}" ${type}`;

        if (isRequired(f)) line += ' NOT NULL';
        if (c?.isUnique) line += ' UNIQUE';

        if (ft.kind === 'feature-ref' && ft.relationType === 'foreign_key') {
          const targetLayer = model.layers.find(lyr => lyr.id === ft.layerId);
          if (targetLayer) {
            const targetTbl = toTableName(targetLayer.name);
            line += ` REFERENCES ${targetTbl}(fid)`;
            if (ft.cascadeDelete) line += ' ON DELETE CASCADE';
          }
        }

        if (ft.kind !== 'datatype-inline' && ft.kind !== 'datatype-ref') {
          const checkParts: string[] = [];
          if (c?.min !== undefined && c.min !== null) checkParts.push(`"${f.name}" >= ${c.min}`);
          if (c?.max !== undefined && c.max !== null) checkParts.push(`"${f.name}" <= ${c.max}`);
          if (c?.minLength !== undefined && c.minLength !== null) checkParts.push(`length("${f.name}") >= ${c.minLength}`);
          if (c?.maxLength !== undefined && c.maxLength !== null) checkParts.push(`length("${f.name}") <= ${c.maxLength}`);
          if (c?.pattern) checkParts.push(`"${f.name}" ~ '${c.pattern.replace(/'/g, "''")}'`);
          if (c?.enumeration && c.enumeration.length > 0) {
            const enumVals = c.enumeration.map(v => `'${v.replace(/'/g, "''")}'`).join(', ');
            checkParts.push(`"${f.name}" IN (${enumVals})`);
          }
          if (checkParts.length > 0) {
            line += ` CHECK (${checkParts.join(' AND ')})`;
          }
        }

        sql += line;
      });
    }

    if (l.layerConstraints && l.layerConstraints.length > 0) {
      l.layerConstraints.forEach(c => {
        sql += `,\n  CONSTRAINT "chk_${c.id.substring(0,6)}" CHECK ("${c.fieldA}" ${c.operator} "${c.fieldB}")`;
      });
    }

    // Multi-geometry export: add geometry columns for all geometry fields
    if (geomFields.length > 0) {
      geomFields.forEach(f => {
        const geomType = (f.fieldType.kind === 'geometry' ? f.fieldType.geometryType : 'Point').toUpperCase();
        sql += `,\n  "${f.name}" geometry(${geomType}, ${model.crs?.split(':')[1] || '4326'})`;
      });
    } else if (hasGeom) {
      // Fallback to layer-level geometry for backward compatibility
      const geomCol = l.geometryColumnName || 'geom';
      const geomType = l.geometryType.toUpperCase();
      sql += `,\n  "${geomCol}" geometry(${geomType}, ${model.crs?.split(':')[1] || '4326'})`;
    }
    sql += `\n);\n\n`;

    // Create indices for all geometry fields
    if (geomFields.length > 0) {
      geomFields.forEach(f => {
        sql += `CREATE INDEX "${tbl}_${f.name}_idx" ON "${tbl}" USING GIST ("${f.name}");\n`;
      });
      sql += '\n';
    } else if (hasGeom) {
      // Fallback for layer-level geometry
      sql += `CREATE INDEX "${tbl}_geom_idx" ON "${tbl}" USING GIST ("${l.geometryColumnName || 'geom'}");\n\n`;
    }
  });
  
  const blob = new Blob([sql], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${filename}.sql`; a.click();
};

export const exportDatabricks = (model: DataModel, filename: string) => {
  let sql = `-- Databricks SQL for ${model.name}\n\n`;
  model.layers.filter(l => !l.isAbstract).forEach(l => {
    const tbl = toTableName(l.name);
    const effectiveProperties = getEffectiveProperties(l, model.layers);
    const pkFields = effectiveProperties.filter(f => f.constraints?.isPrimaryKey);
    const hasDeclaredPk = pkFields.length > 0;

    sql += `CREATE TABLE ${tbl} (\n`;

    // Only add auto-injected fid if no primary key is declared
    if (!hasDeclaredPk) {
      sql += `  fid BIGINT GENERATED ALWAYS AS IDENTITY`;
    }

    effectiveProperties.forEach((f, idx) => {
      const ft = f.fieldType;
      if (ft.kind === 'feature-ref' && ft.relationType !== 'foreign_key') return;
      let type = 'STRING';
      if (ft.kind === 'primitive') {
        if (ft.baseType === 'integer') type = 'INT';
        else if (ft.baseType === 'number') type = 'DOUBLE';
        else if (ft.baseType === 'boolean') type = 'BOOLEAN';
        else if (ft.baseType === 'date') type = 'DATE';
        else if (ft.baseType === 'date-time') type = 'TIMESTAMP';
      }
      const colDef = (!hasDeclaredPk || idx > 0 ? ',\n  ' : ',\n  ') + f.name + ' ' + type + (isRequired(f) ? ' NOT NULL' : '');
      sql += colDef;
    });
    
    if (l.geometryType !== 'None') {
        sql += `,\n  ${l.geometryColumnName || 'geom'} STRING -- WKT representation`;
    }

    // For Databricks: add a comment about primary key fields (not directly supported)
    if (hasDeclaredPk) {
      const pkCols = pkFields.map(f => f.name).join(', ');
      sql += `\n) USING DELTA;\n-- Primary key: ${pkCols}\n\n`;
    } else {
      sql += `\n) USING DELTA;\n\n`;
    }
  });
  const blob = new Blob([sql], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${filename}_databricks.sql`; a.click();
};

export const getConstraintsString = (f: Field, model: DataModel) => {
  const c = f.constraints;
  const parts: string[] = [];
  if (c?.isPrimaryKey) parts.push('PRIMARY KEY');
  if (c?.isUnique) parts.push('UNIK');
  if (c?.min !== undefined && c.min !== null) parts.push(`Min: ${c.min}`);
  if (c?.max !== undefined && c.max !== null) parts.push(`Max: ${c.max}`);
  if (c?.minLength !== undefined && c.minLength !== null) parts.push(`Min lengde: ${c.minLength}`);
  if (c?.maxLength !== undefined && c.maxLength !== null) parts.push(`Maks lengde: ${c.maxLength}`);
  if (c?.pattern) parts.push(`Mønster: ${c.pattern}`);
  if (c?.enumeration && c.enumeration.length > 0) parts.push(`Verdier: [${c.enumeration.join(', ')}]`);
  
  const ft = f.fieldType;
  if (ft.kind === 'feature-ref') {
    const target = model.layers.find(l => l.id === ft.layerId)?.name || ft.layerId;
    parts.push(`Relation: ${ft.relationType} -> ${target}`);
    parts.push(`[${f.multiplicity}]`);
    if (ft.cascadeDelete) parts.push('Cascade Delete');
  }
  if (ft.kind === 'codelist' && ft.mode === 'shared') {
    const se = model.sharedEnums?.find(e => e.id === ft.enumRef);
    if (se) parts.push(`Enum: ${se.name}`);
  }

  return parts.join(', ') || '-';
};

// --- Helper: flatten properties for documentation (handles Shared Types) ---
const flattenPropertiesRecursive = (
  props: Field[], 
  model: DataModel,
  depth: number = 0
): (Field & { depth: number; displayName: string })[] => {
  const result: (Field & { depth: number; displayName: string })[] = [];
  props.forEach(f => {
    const indent = depth > 0 ? '  '.repeat(depth) + '↳ ' : '';
    result.push({ ...f, depth, displayName: `${indent}${f.name}` });
    
    if (f.fieldType.kind === 'datatype-inline' && f.fieldType.properties.length > 0) {
      result.push(...flattenPropertiesRecursive(f.fieldType.properties, model, depth + 1));
    }
    if (f.fieldType.kind === 'datatype-ref' && f.fieldType.typeId) {
        const shared = model.sharedTypes?.find(st => st.id === (f.fieldType as any).typeId);
        if (shared) result.push(...flattenPropertiesRecursive(shared.properties, model, depth + 1));
    }
  });
  return result;
};

/** Helper: get a display label for a field's type for docs */
const fieldTypeDisplay = (f: Field, t: Translations): string => {
  const ft = f.fieldType;
  switch (ft.kind) {
    case 'primitive':       return t.types?.[ft.baseType] || ft.baseType;
    case 'codelist':        return t.types?.codelist || 'Kodeliste';
    case 'geometry':        return t.types?.geometry || 'Geometri';
    case 'feature-ref':     return t.types?.relation || 'Relasjon';
    case 'datatype-inline': return t.types?.object || 'Objekt';
    case 'datatype-ref':    return t.types?.shared_type || 'Datatype';
  }
};

export const exportDocumentationHTML = (model: DataModel, filename: string, lang: string, t: Translations) => {
  const isNo = lang === 'no';
  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${model.name}</title>
    <style>
        body { font-family: sans-serif; line-height: 1.6; color: #334155; max-width: 1000px; margin: 0 auto; padding: 40px 20px; background: #f8fafc; }
        .layer-box { background: white; padding: 30px; border-radius: 16px; border: 1px solid #e2e8f0; margin-bottom: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        h1 { border-bottom: 4px solid #6366f1; padding-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th { background: #f8fafc; text-align: left; padding: 12px; border-bottom: 2px solid #e2e8f0; }
        td { padding: 12px; border-bottom: 1px solid #f1f5f9; }
        .badge { padding: 2px 8px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; background: #e0f2fe; color: #0369a1; }
        .constraint-badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; background: #f0fdf4; color: #166534; border: 1px solid #dcfce7; margin-right: 4px; margin-bottom: 4px; }
    </style></head><body>
    <h1>${model.name}</h1>
    <div class="layer-box">
        <h2>📋 ${isNo ? 'Generell Informasjon' : 'General Information'}</h2>
        <p>Namespace: <code>${model.namespace}</code> | Versjon: ${model.version} | CRS: ${model.crs}</p>
        <p>${model.description || ''}</p>
    </div>

    ${model.layers.filter(l => !l.isAbstract).map(l => {
      const flatProps = flattenPropertiesRecursive(getEffectiveProperties(l, model.layers), model);
      return `
        <div class="layer-box">
            <h2>📂 ${isNo ? 'Lag' : 'Layer'}: ${l.name}</h2>
            ${l.description ? `<p>${l.description}</p>` : ''}
            
            ${l.geometryType !== 'None' ? `
                <h3>🌍 ${isNo ? 'Geometri' : 'Geometry'}</h3>
                <ul>
                    <li><strong>Type:</strong> ${t.geometryTypes[l.geometryType]}</li>
                    <li><strong>Feltnavn:</strong> <code>${l.geometryColumnName}</code></li>
                </ul>
            ` : `<h3>📄 ${isNo ? 'Tabelltype' : 'Table Type'}</h3><p>${isNo ? 'Ren atributtabell (ingen geometri)' : 'Attribute table (no geometry)'}</p>`}

            <h3>📝 ${isNo ? 'Egenskaper (Felt)' : 'Properties (Fields)'}</h3>
            <table>
                <thead><tr><th>${isNo ? 'Feltnavn' : 'Field'}</th><th>Type</th><th>${isNo ? 'Multiplisitet' : 'Multiplicity'}</th><th>Restriksjoner</th><th>${isNo ? 'Beskrivelse' : 'Description'}</th></tr></thead>
                <tbody>
                    ${flatProps.map(f => `
                        <tr>
                            <td style="padding-left: ${f.depth * 20 + 12}px"><code>${f.name}</code><br><small style="color:#94a3b8">${f.title || ''}</small></td>
                            <td><span class="badge">${fieldTypeDisplay(f, t)}</span></td>
                            <td><code>${f.multiplicity}</code></td>
                            <td>${getConstraintsString(f, model).split(', ').map(c => c !== '-' ? `<span class="constraint-badge">${c}</span>` : '-').join('')}</td>
                            <td>${f.description || '-'}</td>
                        </tr>`).join('')}
                </tbody>
            </table>
            
            ${flatProps.filter(f => {
              if (f.fieldType.kind !== 'codelist') return false;
              if (f.fieldType.mode === 'shared') {
                const vals = model.sharedEnums?.find(e => e.id === (f.fieldType as any).enumRef)?.values;
                return vals && vals.length > 0;
              }
              if (f.fieldType.mode === 'inline') return f.fieldType.values.length > 0;
              return false;
            }).map(f => {
              const ft = f.fieldType as any;
              const vals = ft.mode === 'shared'
                ? (model.sharedEnums?.find(e => e.id === ft.enumRef)?.values ?? [])
                : ft.values;
              return `
                <h4>🔢 ${isNo ? 'Kodeliste' : 'Codelist'}: ${f.title || f.name}</h4>
                <table>
                    <thead>
                        <tr>
                            <th>${isNo ? 'Kode' : 'Code'}</th>
                            <th>${isNo ? 'Navn' : 'Label'}</th>
                            <th>${isNo ? 'Beskrivelse' : 'Description'}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${vals.map((v: any) => `
                            <tr>
                                <td><code>${v.code}</code></td>
                                <td>${v.label}</td>
                                <td>${v.description || '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
              `;
            }).join('')}
        </div>`;
    }).join('')}
    </body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${filename}_dokumentasjon.html`; a.click();
};

export const exportDocumentation = (model: DataModel, filename: string, lang: string, t: Translations) => {
    let md = `# ${model.name}\n\nNamespace: \`${model.namespace}\` | Versjon: ${model.version}\n\n`;
    if (model.description) md += `${model.description}\n\n`;
    
    model.layers.filter(l => !l.isAbstract).forEach(l => {
        md += `## Lag: ${l.name}\n`;
        if (l.description) md += `${l.description}\n\n`;

        if (l.geometryType === 'None') md += `_Dette er en ren atributtabell uten geometri._\n\n`;
        else md += `- Geometri: ${t.geometryTypes[l.geometryType]} (\`${l.geometryColumnName}\`)\n\n`;

        md += `| Feltnavn | Type | Multiplisitet | Restriksjoner | Beskrivelse |\n| :--- | :--- | :--- | :--- | :--- |\n`;
        const flatProps = flattenPropertiesRecursive(getEffectiveProperties(l, model.layers), model);
        flatProps.forEach(f => {
            md += `| \`${f.displayName}\` | ${fieldTypeDisplay(f, t)} | \`${f.multiplicity}\` | ${getConstraintsString(f, model)} | ${f.description || '-'} |\n`;
        });
        md += `\n`;

        const codelistProps = flatProps.filter(f => {
            if (f.fieldType.kind !== 'codelist') return false;
            if (f.fieldType.mode === 'shared') {
              return (model.sharedEnums?.find(e => e.id === (f.fieldType as any).enumRef)?.values ?? []).length > 0;
            }
            if (f.fieldType.mode === 'inline') return f.fieldType.values.length > 0;
            return false;
        });
        if (codelistProps.length > 0) {
            md += `### Kodelister\n\n`;
            codelistProps.forEach(f => {
                const ft = f.fieldType as any;
                const vals = ft.mode === 'shared'
                    ? (model.sharedEnums?.find(e => e.id === ft.enumRef)?.values ?? [])
                    : ft.values;
                md += `#### Verdi-valg for: ${f.title || f.name}\n\n`;
                md += `| Kode | Navn | Beskrivelse |\n`;
                md += `| :--- | :--- | :--- |\n`;
                vals.forEach((v: any) => {
                    md += `| \`${v.code}\` | ${v.label} | ${v.description || '-'} |\n`;
                });
                md += `\n`;
            });
        }
    });
    
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${filename}_dokumentasjon.md`; a.click();
};

// Simple JSON to YAML converter (handles DataModel structure)
const jsonToYaml = (obj: any, indent: number = 0): string => {
  const spaces = ' '.repeat(indent);
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj === 'boolean') return obj.toString();
  if (typeof obj === 'number') return obj.toString();
  if (typeof obj === 'string') {
    // Quote strings that contain special chars
    if (obj.includes(':') || obj.includes('#') || obj.includes('\"') || obj.includes("'") || obj.includes('\n')) {
      return JSON.stringify(obj);
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return '\n' + obj.map(item => {
      const itemYaml = jsonToYaml(item, indent + 2);
      const isComplex = typeof item === 'object' && item !== null;
      return spaces + '- ' + (isComplex ? itemYaml.slice(indent + 2) : itemYaml);
    }).join('\n');
  }
  if (typeof obj === 'object') {
    const entries = Object.entries(obj).filter(([_, v]) => v !== undefined);
    if (entries.length === 0) return '{}';
    return entries.map(([key, value]) => {
      const valueYaml = jsonToYaml(value, indent + 2);
      const isComplex = typeof value === 'object' && value !== null;
      if (isComplex && !Array.isArray(value)) {
        return `${spaces}${key}:${valueYaml}`;
      } else if (Array.isArray(value) && value.length > 0) {
        return `${spaces}${key}:${valueYaml}`;
      } else {
        return `${spaces}${key}: ${valueYaml}`;
      }
    }).join('\n');
  }
  return String(obj);
};

export const exportModelAsYaml = (model: DataModel, filename: string) => {
  const yaml = `# Data Model: ${model.name}
# Namespace: ${model.namespace}
# Version: ${model.version}
# Generated: ${new Date().toISOString()}

${jsonToYaml(model)}`;

  const blob = new Blob([yaml], { type: 'text/yaml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.model.yaml`;
  a.click();
  URL.revokeObjectURL(url);
};

// JSON Schema for model.json itself (meta-schema)
export const generateModelSchema = (): Record<string, any> => {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'GeoForge Data Model',
    description: 'Schema describing the structure of a GeoForge data model (model.json)',
    type: 'object',
    required: ['id', 'name', 'namespace', 'version', 'layers', 'crs', 'createdAt', 'updatedAt'],
    properties: {
      id: { type: 'string', description: 'Unique model identifier (UUID)' },
      name: { type: 'string', description: 'Display name of the data model' },
      namespace: { type: 'string', description: 'Namespace (e.g., org.example.dataset)' },
      description: { type: 'string', description: 'Model description' },
      version: { type: 'string', description: 'Semantic version (e.g., 1.0.0)' },
      crs: { type: 'string', description: 'EPSG code (e.g., EPSG:25833)' },
      createdAt: { type: 'string', format: 'date-time', description: 'ISO 8601 timestamp' },
      updatedAt: { type: 'string', format: 'date-time', description: 'ISO 8601 timestamp' },
      layers: {
        type: 'array',
        description: 'Feature classes / database tables',
        items: {
          type: 'object',
          required: ['id', 'name', 'geometryType', 'geometryColumnName', 'properties', 'style'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            geometryType: {
              enum: ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon', 'GeometryCollection', 'None']
            },
            geometryColumnName: { type: 'string' },
            properties: {
              type: 'array',
              items: { $ref: '#/$defs/Field' }
            },
            style: { $ref: '#/$defs/LayerStyle' },
            layerConstraints: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  fieldIds: { type: 'array', items: { type: 'string' } },
                  operator: { enum: ['equals', 'lessThan', 'greaterThan', 'lessOrEqual', 'greaterOrEqual', 'notEquals', 'contains'] },
                  value: { type: 'string' }
                }
              }
            },
            extends: { type: 'string', description: 'Parent layer ID (inheritance)' },
            isAbstract: { type: 'boolean' }
          }
        }
      },
      sharedTypes: {
        type: 'array',
        description: 'Reusable complex types (datatype definitions)',
        items: {
          type: 'object',
          required: ['id', 'name', 'properties'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            properties: {
              type: 'array',
              items: { $ref: '#/$defs/Field' }
            }
          }
        }
      },
      sharedEnums: {
        type: 'array',
        description: 'Reusable code lists / enumerations',
        items: {
          type: 'object',
          required: ['id', 'name', 'values'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            values: {
              type: 'array',
              items: { $ref: '#/$defs/CodeValue' }
            }
          }
        }
      },
      metadata: { $ref: '#/$defs/ModelMetadata' },
      renderingOrder: {
        type: 'array',
        description: 'Layer IDs in draw order',
        items: { type: 'string' }
      },
      githubMeta: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'owner/name' },
          path: { type: 'string', description: 'File path in repo' },
          branch: { type: 'string', description: 'Branch name' }
        }
      },
      sourceConnection: { $ref: '#/$defs/SourceConnection' }
    },
    $defs: {
      Field: {
        type: 'object',
        required: ['id', 'name', 'title', 'description', 'multiplicity', 'fieldType'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          multiplicity: { enum: ['1..1', '0..1', '1..*', '0..*'] },
          defaultValue: { type: 'string' },
          constraints: { $ref: '#/$defs/PropertyConstraints' },
          fieldType: { $ref: '#/$defs/FieldType' }
        }
      },
      FieldType: {
        oneOf: [
          {
            type: 'object',
            required: ['kind', 'baseType'],
            properties: {
              kind: { const: 'primitive' },
              baseType: { enum: ['string', 'integer', 'number', 'boolean', 'date', 'date-time', 'json'] }
            },
            additionalProperties: false
          },
          {
            type: 'object',
            required: ['kind', 'mode'],
            properties: {
              kind: { const: 'codelist' },
              mode: { const: 'inline' },
              values: { type: 'array', items: { $ref: '#/$defs/CodeValue' } }
            },
            additionalProperties: false
          },
          {
            type: 'object',
            required: ['kind', 'mode'],
            properties: {
              kind: { const: 'codelist' },
              mode: { const: 'external' },
              url: { type: 'string' }
            },
            additionalProperties: false
          },
          {
            type: 'object',
            required: ['kind', 'mode'],
            properties: {
              kind: { const: 'codelist' },
              mode: { const: 'shared' },
              enumRef: { type: 'string' }
            },
            additionalProperties: false
          },
          {
            type: 'object',
            required: ['kind', 'geometryType'],
            properties: {
              kind: { const: 'geometry' },
              geometryType: { enum: ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon', 'GeometryCollection', 'None'] },
              role: { enum: ['primary', 'secondary'] }
            },
            additionalProperties: false
          },
          {
            type: 'object',
            required: ['kind', 'properties'],
            properties: {
              kind: { const: 'datatype-inline' },
              properties: { type: 'array', items: { $ref: '#/$defs/Field' } },
              name: { type: 'string' },
              isNameSynthetic: { type: 'boolean' }
            },
            additionalProperties: false
          },
          {
            type: 'object',
            required: ['kind', 'typeId'],
            properties: {
              kind: { const: 'datatype-ref' },
              typeId: { type: 'string' }
            },
            additionalProperties: false
          },
          {
            type: 'object',
            required: ['kind', 'layerId', 'relationType'],
            properties: {
              kind: { const: 'feature-ref' },
              layerId: { type: 'string' },
              relationType: { enum: ['foreign_key', 'intersects', 'contains', 'within', 'touches', 'crosses'] },
              cascadeDelete: { type: 'boolean' },
              inverseFieldId: { type: 'string' }
            },
            additionalProperties: false
          }
        ]
      },
      PropertyConstraints: {
        type: 'object',
        properties: {
          min: { type: 'number' },
          max: { type: 'number' },
          minLength: { type: 'integer' },
          maxLength: { type: 'integer' },
          pattern: { type: 'string', description: 'Regular expression' },
          isUnique: { type: 'boolean' },
          isPrimaryKey: { type: 'boolean' },
          enumeration: { type: 'array', items: { type: 'string' } }
        }
      },
      CodeValue: {
        type: 'object',
        required: ['id', 'code', 'label'],
        properties: {
          id: { type: 'string' },
          code: { type: 'string' },
          label: { type: 'string' },
          description: { type: 'string' }
        }
      },
      LayerStyle: {
        type: 'object',
        required: ['type', 'simpleColor'],
        properties: {
          type: { enum: ['simple', 'categorized'] },
          simpleColor: { type: 'string', description: 'Hex color code' },
          propertyId: { type: 'string' },
          categorizedColors: { type: 'object', additionalProperties: { type: 'string' } },
          pointSize: { type: 'number' },
          pointIcon: { enum: ['circle', 'square', 'triangle', 'star'] },
          lineWidth: { type: 'number' },
          lineDash: { enum: ['solid', 'dashed', 'dotted', 'dash-dot', 'dash-dot-dot', 'long-dash'] },
          fillOpacity: { type: 'number' },
          hatchStyle: { enum: ['solid', 'horizontal', 'vertical', 'cross', 'b_diagonal', 'f_diagonal', 'diagonal_x'] },
          hatchThickness: { type: 'number' },
          hatchSpacing: { type: 'number' },
          hatchLineCount: { type: 'number' }
        }
      },
      ModelMetadata: {
        type: 'object',
        properties: {
          contactName: { type: 'string' },
          contactEmail: { type: 'string', format: 'email' },
          contactOrganization: { type: 'string' },
          keywords: { type: 'array', items: { type: 'string' } },
          theme: { type: 'array', items: { type: 'string' }, description: 'INSPIRE themes (2-letter codes)' },
          license: { enum: ['CC-BY-4.0', 'CC0', 'CC-BY-SA-4.0', 'NLOD-2.0'] },
          accessRights: { enum: ['public', 'restricted', 'private'] },
          purpose: { type: 'string' },
          accrualPeriodicity: { type: 'string', description: 'Frequency of updates (ISO 8601 duration or named interval)' },
          spatialExtent: {
            type: 'object',
            properties: {
              west: { type: 'number' },
              east: { type: 'number' },
              south: { type: 'number' },
              north: { type: 'number' }
            }
          },
          temporalExtentFrom: { type: 'string', format: 'date-time' },
          temporalExtentTo: { type: 'string', format: 'date-time' },
          url: { type: 'string', format: 'uri' },
          termsOfService: { type: 'string', format: 'uri' }
        }
      },
      SourceConnection: {
        oneOf: [
          {
            type: 'object',
            required: ['type', 'host', 'port', 'database', 'user'],
            properties: {
              type: { const: 'postgis' },
              host: { type: 'string' },
              port: { type: 'integer' },
              database: { type: 'string' },
              user: { type: 'string' },
              password: { type: 'string' },
              ssl: { type: 'boolean' }
            },
            additionalProperties: false
          },
          {
            type: 'object',
            required: ['type', 'filepath'],
            properties: {
              type: { const: 'geopackage' },
              filepath: { type: 'string' }
            },
            additionalProperties: false
          },
          {
            type: 'object',
            required: ['type', 'workspace', 'catalog'],
            properties: {
              type: { const: 'databricks' },
              workspace: { type: 'string' },
              catalog: { type: 'string' },
              schema: { type: 'string' },
              token: { type: 'string' }
            },
            additionalProperties: false
          }
        ]
      }
    }
  };
};

export const exportModelSchema = (filename: string) => {
  const schema = generateModelSchema();
  const json = JSON.stringify(schema, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.model-schema.json`;
  a.click();
  URL.revokeObjectURL(url);
};