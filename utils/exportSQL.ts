import { DataModel } from '../types';
import { getSqlType } from './typeMapUtils';
import { toTableName } from './nameSanitizer';
import { getEffectiveProperties } from './modelUtils';

const isRequired = (f: any): boolean => f.multiplicity === '1..1' || f.multiplicity === '1..*';

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
