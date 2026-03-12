import { DataModel, GeometryType, PropertyType, ModelProperty, SharedType } from '../types';
import { getEffectiveProperties } from './modelUtils';
import { COLORS } from '../constants';
import { hexToRgb } from './colorUtils';
import { getSqlType, getSqliteType } from './typeMapUtils';
import { normalizeGeometryType } from './geomUtils';

export { hexToRgb } from './colorUtils';
export { getSqlType, getSqliteType } from './typeMapUtils';
export { normalizeGeometryType } from './geomUtils';

declare var initSqlJs: any;

// --- Recursive helper to build JSON Schema property definitions ---
const buildPropertySchema = (p: ModelProperty, model: DataModel): any => {
  const propSchema: any = {
    title: p.title || p.name,
  };

  if (p.description) propSchema.description = p.description;

  switch (p.type) {
    case 'integer': propSchema.type = 'integer'; break;
    case 'number': propSchema.type = 'number'; break;
    case 'boolean': propSchema.type = 'boolean'; break;
    case 'date': propSchema.type = 'string'; propSchema.format = 'date'; break;
    case 'json': propSchema.type = 'object'; break;
    case 'shared_type': {
        const shared = model.sharedTypes?.find(st => st.id === p.sharedTypeId);
        propSchema.type = 'object';
        if (shared) {
            propSchema.description = (p.description || '') + ` (Type: ${shared.name})`;
            const subProps: any = {};
            const subRequired: string[] = [];
            shared.properties.forEach(sp => {
                subProps[sp.name || 'felt'] = buildPropertySchema(sp, model);
                if (sp.required) subRequired.push(sp.name);
            });
            propSchema.properties = subProps;
            if (subRequired.length > 0) propSchema.required = subRequired;
        }
        break;
    }
    case 'object': {
      propSchema.type = 'object';
      if (p.subProperties && p.subProperties.length > 0) {
        const subProps: any = {};
        const subRequired: string[] = [];
        p.subProperties.forEach(sp => {
          subProps[sp.name || 'felt'] = buildPropertySchema(sp, model);
          if (sp.required) subRequired.push(sp.name);
        });
        propSchema.properties = subProps;
        if (subRequired.length > 0) propSchema.required = subRequired;
      }
      break;
    }
    case 'array': {
      propSchema.type = 'array';
      if (p.subProperties && p.subProperties.length > 0) {
        const itemProps: any = {};
        const itemRequired: string[] = [];
        p.subProperties.forEach(sp => {
          itemProps[sp.name || 'felt'] = buildPropertySchema(sp, model);
          if (sp.required) itemRequired.push(sp.name);
        });
        propSchema.items = { type: 'object', properties: itemProps };
        if (itemRequired.length > 0) propSchema.items.required = itemRequired;
      }
      break;
    }
    case 'relation':
      propSchema.type = 'string';
      if (p.relationConfig) {
        const targetLayerName = model.layers.find(layer => layer.id === p.relationConfig?.targetLayerId)?.name || p.relationConfig?.targetLayerId;
        propSchema['x-relation'] = {
          targetLayer: targetLayerName,
          relationType: p.relationConfig.relationType,
          cascadeDelete: p.relationConfig.cascadeDelete,
          multiplicity: p.relationConfig.multiplicity
        };
      }
      break;
    case 'codelist': {
      propSchema.type = 'string';
      const resolvedValues = p.codelistMode === 'shared' && p.sharedEnumId
        ? (model.sharedEnums?.find(e => e.id === p.sharedEnumId)?.values ?? p.codelistValues)
        : p.codelistValues;
      if (resolvedValues && resolvedValues.length > 0) {
        propSchema.enum = resolvedValues.map(v => v.code);
        propSchema['x-codelist-labels'] = resolvedValues.map(v => ({ code: v.code, label: v.label }));
      }
      break;
    }
    default: propSchema.type = 'string';
  }

  // Constraints & Default (skip for containers)
  if (!['object', 'array', 'shared_type'].includes(p.type)) {
    if (p.defaultValue !== undefined && p.defaultValue !== '') {
        if (p.type === 'number' || p.type === 'integer') propSchema.default = Number(p.defaultValue);
        else if (p.type === 'boolean') propSchema.default = p.defaultValue === 'true';
        else propSchema.default = p.defaultValue;
    }
    const c = p.constraints;
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
  const result: Record<string, any> = {};

  model.layers.filter(l => !l.isAbstract).forEach(l => {
    const props: any = {};
    const required: string[] = [];
    getEffectiveProperties(l, model.layers).forEach(p => {
      props[p.name || 'felt'] = buildPropertySchema(p, model);
      if (p.required) required.push(p.name);
    });

    const propertiesSchema: any = { type: 'object', properties: props };
    if (required.length > 0) propertiesSchema.required = required;

    const hasGeom = l.geometryType !== 'None';

    if (!hasGeom) {
      result[l.name] = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        title: l.name,
        type: 'object',
        properties: props,
        ...(required.length > 0 ? { required } : {}),
        ...(l.description ? { description: l.description } : {}),
      };
      return;
    }

    const geomSchema = geoJsonGeometrySchema(l.geometryType);

    const featureSchema: any = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: l.name,
      type: 'object',
      required: ['type', 'geometry', 'properties'],
      properties: {
        type: { const: 'Feature' },
        id: { type: ['string', 'number'] },
        geometry: geomSchema
          ? { oneOf: [geomSchema, { type: 'null' }] }
          : { type: 'null' },
        properties: propertiesSchema,
      },
    };

    if (l.description) featureSchema.description = l.description;

    result[l.name] = featureSchema;
  });

  return result;
};

export const generateJSONFGSchema = (model: DataModel): Record<string, any> => {
  const result: Record<string, any> = {};

  model.layers.filter(l => !l.isAbstract).forEach(l => {
    const props: any = {};
    const required: string[] = [];
    getEffectiveProperties(l, model.layers).forEach(p => {
      props[p.name || 'felt'] = buildPropertySchema(p, model);
      if (p.required) required.push(p.name);
    });

    const propertiesSchema: any = { type: 'object', properties: props };
    if (required.length > 0) propertiesSchema.required = required;

    const hasGeom = l.geometryType !== 'None';

    if (!hasGeom) {
      // Pure attribute table — plain JSON Schema, no Feature wrapper
      result[l.name] = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        title: l.name,
        type: 'object',
        properties: props,
        ...(required.length > 0 ? { required } : {}),
        ...(l.description ? { description: l.description } : {}),
      };
      return;
    }

    const crs = model.crs || 'EPSG:4326';
    const isWgs84 = crs === 'EPSG:4326' || crs === 'CRS84';
    const whereSchema = geoJsonGeometrySchema(l.geometryType);

    const featureSchema: any = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: l.name,
      type: 'object',
      conformsTo: '[OGC-21-045]',
      featureType: l.name,
      coordRefSys: `https://www.opengis.net/def/crs/${crs.replace(':', '/')}`,
      required: ['type', 'geometry', 'properties'],
      properties: {
        type: { const: 'Feature' },
        id: { type: ['string', 'number'] },
        featureType: { const: l.name },
        // geometry: GeoJSON (WGS84) — null if non-WGS84 CRS
        geometry: isWgs84 && whereSchema
          ? { oneOf: [whereSchema, { type: 'null' }] }
          : { type: 'null' },
        // where: primary geometry in declared CRS
        where: whereSchema
          ? { oneOf: [whereSchema, { type: 'null' }] }
          : { type: 'null' },
        properties: propertiesSchema,
      },
    };

    if (l.description) featureSchema.description = l.description;

    result[l.name] = featureSchema;
  });

  return result;
};

export const exportGeoPackage = async (model: DataModel, filename: string) => {
  const SQL = await initSqlJs({ locateFile: () => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/sql-wasm.wasm` });
  const db = new SQL.Database();
  db.run("CREATE TABLE gpkg_contents (table_name TEXT PRIMARY KEY, data_type TEXT);");
  
  for (const layer of model.layers) {
    if (layer.isAbstract) continue;
    const tbl = layer.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    let sql = `CREATE TABLE ${tbl} (fid INTEGER PRIMARY KEY AUTOINCREMENT`;
    const effectiveProperties = getEffectiveProperties(layer, model.layers);
    effectiveProperties.forEach(p => {
      if (p.type === 'relation' && p.relationConfig?.relationType !== 'foreign_key') return;
      const type = getSqliteType(p.type);
      let colDef = `, "${p.name}" ${type}`;
      if (p.required) colDef += ' NOT NULL';
      if (p.constraints?.isUnique) colDef += ' UNIQUE';
      
      // Foreign Key logikk
      if (p.type === 'relation' && p.relationConfig?.relationType === 'foreign_key') {
        const targetLayer = model.layers.find(l => l.id === p.relationConfig?.targetLayerId);
        if (targetLayer) {
          const targetTbl = targetLayer.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
          colDef += ` REFERENCES ${targetTbl}(fid)`;
          if (p.relationConfig.cascadeDelete) colDef += ' ON DELETE CASCADE';
        }
      }
      
      // Check constraints
      if (!['object', 'array', 'shared_type'].includes(p.type)) {
          const c = p.constraints;
          const checks = [];
          if (c?.min !== undefined && c.min !== null) checks.push(`"${p.name}" >= ${c.min}`);
          if (c?.max !== undefined && c.max !== null) checks.push(`"${p.name}" <= ${c.max}`);
          if (c?.minLength !== undefined && c.minLength !== null) checks.push(`length("${p.name}") >= ${c.minLength}`);
          if (c?.maxLength !== undefined && c.maxLength !== null) checks.push(`length("${p.name}") <= ${c.maxLength}`);
          if (c?.enumeration && c.enumeration.length > 0) {
            const enumVals = c.enumeration.map(v => `'${v.replace(/'/g, "''")}'`).join(', ');
            checks.push(`"${p.name}" IN (${enumVals})`);
          }
          if (checks.length > 0) colDef += ` CHECK (${checks.join(' AND ')})`;
      }
      sql += colDef;
    });

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
    const tbl = l.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const hasGeom = l.geometryType !== 'None';

    sql += `CREATE TABLE ${tbl} (\n  fid SERIAL PRIMARY KEY`;
    const effectiveProperties = getEffectiveProperties(l, model.layers);
    effectiveProperties.forEach(p => {
      if (p.type === 'relation' && p.relationConfig?.relationType !== 'foreign_key') return;
      const type = getSqlType(p.type);
      const c = p.constraints; 
      let line = `,\n  "${p.name}" ${type}`;
      
      if (p.required) line += ' NOT NULL';
      if (c?.isUnique || c?.isPrimaryKey) line += ' UNIQUE';

      if (p.type === 'relation' && p.relationConfig?.relationType === 'foreign_key') {
        const targetLayer = model.layers.find(lyr => lyr.id === p.relationConfig?.targetLayerId);
        if (targetLayer) {
          const targetTbl = targetLayer.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
          line += ` REFERENCES ${targetTbl}(fid)`;
          if (p.relationConfig.cascadeDelete) line += ' ON DELETE CASCADE';
        }
      }

      if (!['object', 'array', 'shared_type'].includes(p.type)) {
        const checkParts: string[] = [];
        if (c?.min !== undefined && c.min !== null) checkParts.push(`"${p.name}" >= ${c.min}`);
        if (c?.max !== undefined && c.max !== null) checkParts.push(`"${p.name}" <= ${c.max}`);
        if (c?.minLength !== undefined && c.minLength !== null) checkParts.push(`length("${p.name}") >= ${c.minLength}`);
        if (c?.maxLength !== undefined && c.maxLength !== null) checkParts.push(`length("${p.name}") <= ${c.maxLength}`);
        if (c?.pattern) checkParts.push(`"${p.name}" ~ '${c.pattern.replace(/'/g, "''")}'`);
        if (c?.enumeration && c.enumeration.length > 0) {
          const enumVals = c.enumeration.map(v => `'${v.replace(/'/g, "''")}'`).join(', ');
          checkParts.push(`"${p.name}" IN (${enumVals})`);
        }
        if (checkParts.length > 0) {
          line += ` CHECK (${checkParts.join(' AND ')})`;
        }
      }
      
      sql += line;
    });

    if (l.layerConstraints && l.layerConstraints.length > 0) {
      l.layerConstraints.forEach(c => {
        sql += `,\n  CONSTRAINT "chk_${c.id.substring(0,6)}" CHECK ("${c.fieldA}" ${c.operator} "${c.fieldB}")`;
      });
    }
    
    if (hasGeom) {
        const geomCol = l.geometryColumnName || 'geom';
        const geomType = l.geometryType.toUpperCase();
        sql += `,\n  "${geomCol}" geometry(${geomType}, ${model.crs?.split(':')[1] || '4326'})`;
    }
    sql += `\n);\n\n`;
    
    if (hasGeom) {
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
    const tbl = l.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    sql += `CREATE TABLE ${tbl} (\n  fid BIGINT GENERATED ALWAYS AS IDENTITY`;
    const effectiveProperties = getEffectiveProperties(l, model.layers);
    effectiveProperties.forEach(p => {
      if (p.type === 'relation' && p.relationConfig?.relationType !== 'foreign_key') return;
      let type = 'STRING';
      if (p.type === 'integer') type = 'INT';
      else if (p.type === 'number') type = 'DOUBLE';
      else if (p.type === 'boolean') type = 'BOOLEAN';
      else if (p.type === 'date') type = 'TIMESTAMP';
      sql += `,\n  ${p.name} ${type}${p.required ? ' NOT NULL' : ''}`;
    });
    
    if (l.geometryType !== 'None') {
        sql += `,\n  ${l.geometryColumnName || 'geom'} STRING -- WKT representation`;
    }
    sql += `\n) USING DELTA;\n\n`;
  });
  const blob = new Blob([sql], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${filename}_databricks.sql`; a.click();
};

export const getConstraintsString = (p: ModelProperty, model: DataModel) => {
  const c = p.constraints;
  const parts = [];
  if (c?.isPrimaryKey) parts.push('PRIMARY KEY');
  if (c?.isUnique) parts.push('UNIK');
  if (c?.min !== undefined && c.min !== null) parts.push(`Min: ${c.min}`);
  if (c?.max !== undefined && c.max !== null) parts.push(`Max: ${c.max}`);
  if (c?.minLength !== undefined && c.minLength !== null) parts.push(`Min lengde: ${c.minLength}`);
  if (c?.maxLength !== undefined && c.maxLength !== null) parts.push(`Maks lengde: ${c.maxLength}`);
  if (c?.pattern) parts.push(`Mønster: ${c.pattern}`);
  if (c?.enumeration && c.enumeration.length > 0) parts.push(`Verdier: [${c.enumeration.join(', ')}]`);
  
  if (p.type === 'relation' && p.relationConfig) {
    const target = model.layers.find(l => l.id === p.relationConfig.targetLayerId)?.name || p.relationConfig.targetLayerId;
    parts.push(`Relation: ${p.relationConfig.relationType} -> ${target}`);
    if (p.relationConfig.multiplicity) parts.push(`[${p.relationConfig.multiplicity}]`);
    if (p.relationConfig.cascadeDelete) parts.push('Cascade Delete');
  }
  if (p.type === 'codelist' && p.codelistMode === 'shared' && p.sharedEnumId) {
    const se = model.sharedEnums?.find(e => e.id === p.sharedEnumId);
    if (se) parts.push(`Enum: ${se.name}`);
  }

  return parts.join(', ') || '-';
};

// --- Helper: flatten properties for documentation (handles Shared Types) ---
const flattenPropertiesRecursive = (
  props: ModelProperty[], 
  model: DataModel,
  depth: number = 0
): (ModelProperty & { depth: number; displayName: string })[] => {
  const result: (ModelProperty & { depth: number; displayName: string })[] = [];
  props.forEach(p => {
    const indent = depth > 0 ? '  '.repeat(depth) + '↳ ' : '';
    result.push({ ...p, depth, displayName: `${indent}${p.name}` });
    
    if (p.subProperties && p.subProperties.length > 0) {
      result.push(...flattenPropertiesRecursive(p.subProperties, model, depth + 1));
    }
    if (p.type === 'shared_type' && p.sharedTypeId) {
        const shared = model.sharedTypes?.find(st => st.id === p.sharedTypeId);
        if (shared) result.push(...flattenPropertiesRecursive(shared.properties, model, depth + 1));
    }
  });
  return result;
};

export const exportDocumentationHTML = (model: DataModel, filename: string, lang: string, t: any) => {
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
                <thead><tr><th>${isNo ? 'Feltnavn' : 'Field'}</th><th>Type</th><th>${isNo ? 'Påkrevd' : 'Required'}</th><th>Restriksjoner</th><th>${isNo ? 'Beskrivelse' : 'Description'}</th></tr></thead>
                <tbody>
                    ${flatProps.map(p => `
                        <tr>
                            <td style="padding-left: ${p.depth * 20 + 12}px"><code>${p.name}</code><br><small style="color:#94a3b8">${p.title || ''}</small></td>
                            <td><span class="badge">${t.types[p.type] || p.type}</span></td>
                            <td>${p.required ? '<strong>Ja</strong>' : 'Nei'}</td>
                            <td>${getConstraintsString(p, model).split(', ').map(c => c !== '-' ? `<span class="constraint-badge">${c}</span>` : '-').join('')}</td>
                            <td>${p.description || '-'}</td>
                        </tr>`).join('')}
                </tbody>
            </table>
            
            ${flatProps.filter(p => {
              if (p.type !== 'codelist') return false;
              const vals = p.codelistMode === 'shared' && p.sharedEnumId
                ? model.sharedEnums?.find(e => e.id === p.sharedEnumId)?.values
                : p.codelistValues;
              return vals && vals.length > 0;
            }).map(p => {
              const vals = p.codelistMode === 'shared' && p.sharedEnumId
                ? (model.sharedEnums?.find(e => e.id === p.sharedEnumId)?.values ?? p.codelistValues)
                : p.codelistValues;
              return `
                <h4>🔢 ${isNo ? 'Kodeliste' : 'Codelist'}: ${p.title || p.name}</h4>
                <table>
                    <thead>
                        <tr>
                            <th>${isNo ? 'Kode' : 'Code'}</th>
                            <th>${isNo ? 'Navn' : 'Label'}</th>
                            <th>${isNo ? 'Beskrivelse' : 'Description'}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${vals.map(v => `
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

export const exportDocumentation = (model: DataModel, filename: string, lang: string, t: any) => {
    let md = `# ${model.name}\n\nNamespace: \`${model.namespace}\` | Versjon: ${model.version}\n\n`;
    if (model.description) md += `${model.description}\n\n`;
    
    model.layers.filter(l => !l.isAbstract).forEach(l => {
        md += `## Lag: ${l.name}\n`;
        if (l.description) md += `${l.description}\n\n`;

        if (l.geometryType === 'None') md += `_Dette er en ren atributtabell uten geometri._\n\n`;
        else md += `- Geometri: ${t.geometryTypes[l.geometryType]} (\`${l.geometryColumnName}\`)\n\n`;

        md += `| Feltnavn | Type | Påkrevd | Restriksjoner | Beskrivelse |\n| :--- | :--- | :--- | :--- | :--- |\n`;
        const flatProps = flattenPropertiesRecursive(getEffectiveProperties(l, model.layers), model);
        flatProps.forEach(p => {
            md += `| \`${p.displayName}\` | ${t.types[p.type] || p.type} | ${p.required ? 'Ja' : 'Nei'} | ${getConstraintsString(p, model)} | ${p.description || '-'} |\n`;
        });
        md += `\n`;

        const codelistProps = flatProps.filter(p => {
            if (p.type !== 'codelist') return false;
            const vals = p.codelistMode === 'shared' && p.sharedEnumId
                ? model.sharedEnums?.find(e => e.id === p.sharedEnumId)?.values
                : p.codelistValues;
            return vals && vals.length > 0;
        });
        if (codelistProps.length > 0) {
            md += `### Kodelister\n\n`;
            codelistProps.forEach(p => {
                const vals = p.codelistMode === 'shared' && p.sharedEnumId
                    ? (model.sharedEnums?.find(e => e.id === p.sharedEnumId)?.values ?? p.codelistValues)
                    : p.codelistValues;
                md += `#### Verdi-valg for: ${p.title || p.name}\n\n`;
                md += `| Kode | Navn | Beskrivelse |\n`;
                md += `| :--- | :--- | :--- |\n`;
                vals.forEach(v => {
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