import { DataModel, CodeValue, GeometryFieldType } from '../types';
import { getSqliteType } from './typeMapUtils';
import { normalizeGeometryType } from './geomUtils';
import { toTableName } from './nameSanitizer';
import { getEffectiveProperties } from './modelUtils';

declare var initSqlJs: any;

const isRequired = (f: any): boolean => f.multiplicity === '1..1' || f.multiplicity === '1..*';

export const exportGeoPackage = async (model: DataModel, filename: string) => {
  const SQL = await initSqlJs({ locateFile: () => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/sql-wasm.wasm` });
  const db = new SQL.Database();

  // Parse CRS from model (format: "EPSG:XXXXX")
  const epsgMatch = model.crs?.match(/EPSG:(\d+)/i);
  const srsId = epsgMatch ? parseInt(epsgMatch[1]) : 4326;

  // Set GeoPackage-specific PRAGMAs
  db.run("PRAGMA application_id = 1196444487;");  // 0x47504B47 = "GPKG"
  db.run("PRAGMA user_version = 10200;");          // GeoPackage 1.2.0

  // Create gpkg_spatial_ref_sys (required for spatial reference system tracking)
  db.run(`CREATE TABLE gpkg_spatial_ref_sys (
    srs_name TEXT NOT NULL,
    srs_id INTEGER NOT NULL PRIMARY KEY,
    organization TEXT NOT NULL,
    organization_coordsys_id INTEGER NOT NULL,
    definition TEXT NOT NULL,
    description TEXT
  );`);

  // Insert seed SRS entries (required by spec)
  db.run("INSERT INTO gpkg_spatial_ref_sys VALUES('Undefined cartesian SRS',-1,'NONE',-1,'undefined',NULL);");
  db.run("INSERT INTO gpkg_spatial_ref_sys VALUES('Undefined geographic SRS',0,'NONE',0,'undefined',NULL);");
  db.run("INSERT INTO gpkg_spatial_ref_sys VALUES('WGS 84 geodetic',4326,'EPSG',4326,'GEOGCS[\"WGS 84\",DATUM[\"WGS_1984\",SPHEROID[\"WGS 84\",6378137,298.257223563]],PRIMEM[\"Greenwich\",0],UNIT[\"degree\",0.0174532925199433]]',NULL);");

  // Insert model's CRS if different from 4326
  if (srsId !== 4326) {
    db.run(
      "INSERT OR IGNORE INTO gpkg_spatial_ref_sys (srs_name, srs_id, organization, organization_coordsys_id, definition) VALUES (?, ?, ?, ?, ?)",
      [`EPSG:${srsId}`, srsId, 'EPSG', srsId, 'undefined']
    );
  }

  // Create gpkg_contents (required system table for feature layer metadata)
  db.run(`CREATE TABLE gpkg_contents (
    table_name TEXT NOT NULL PRIMARY KEY,
    data_type TEXT NOT NULL,
    identifier TEXT UNIQUE,
    description TEXT DEFAULT '',
    last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    min_x DOUBLE,
    min_y DOUBLE,
    max_x DOUBLE,
    max_y DOUBLE,
    srs_id INTEGER,
    CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id)
  );`);

  // Create gpkg_geometry_columns (required to describe geometry columns)
  db.run(`CREATE TABLE gpkg_geometry_columns (
    table_name TEXT NOT NULL,
    column_name TEXT NOT NULL,
    geometry_type_name TEXT NOT NULL,
    srs_id INTEGER NOT NULL,
    z TINYINT NOT NULL,
    m TINYINT NOT NULL,
    CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name),
    CONSTRAINT uk_gc_table_name UNIQUE (table_name),
    CONSTRAINT fk_gc_tn FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name),
    CONSTRAINT fk_gc_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id)
  );`);

  // Create gpkg_data_column_constraints (OGC extension for codelist domains)
  // One row per enum value; unique constraint on (constraint_name, constraint_type, value) triplet
  db.run(`CREATE TABLE gpkg_data_column_constraints (
    constraint_name TEXT NOT NULL,
    constraint_type TEXT NOT NULL CHECK (constraint_type IN ('range', 'enum', 'glob')),
    value TEXT,
    min NUMERIC,
    max NUMERIC,
    min_is_inclusive BOOLEAN,
    max_is_inclusive BOOLEAN,
    description TEXT,
    CONSTRAINT gdcc_pk UNIQUE (constraint_name, constraint_type, value)
  );`);

  // Create gpkg_data_columns (OGC extension for column metadata and constraint linking)
  db.run(`CREATE TABLE gpkg_data_columns (
    table_name TEXT NOT NULL,
    column_name TEXT NOT NULL,
    name TEXT UNIQUE,
    title TEXT,
    description TEXT,
    mime_type TEXT,
    constraint_name TEXT,
    PRIMARY KEY (table_name, column_name),
    FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name)
  );`);

  // Create gpkg_extensions (required to declare active extensions so QGIS recognizes gpkg_schema)
  db.run(`CREATE TABLE gpkg_extensions (
    table_name TEXT,
    column_name TEXT,
    extension_name TEXT NOT NULL,
    definition TEXT NOT NULL,
    scope TEXT NOT NULL,
    CONSTRAINT ge_tce UNIQUE (table_name, column_name, extension_name)
  );`);

  // Register the Schema extension for gpkg_data_columns and gpkg_data_column_constraints
  db.run(
    `INSERT INTO gpkg_extensions (table_name, column_name, extension_name, definition, scope) VALUES (?, ?, ?, ?, ?)`,
    ['gpkg_data_columns', null, 'gpkg_schema', 'http://www.geopackage.org/spec120/#extension_schema', 'read-write']
  );
  db.run(
    `INSERT INTO gpkg_extensions (table_name, column_name, extension_name, definition, scope) VALUES (?, ?, ?, ?, ?)`,
    ['gpkg_data_column_constraints', null, 'gpkg_schema', 'http://www.geopackage.org/spec120/#extension_schema', 'read-write']
  );

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

      // Add DEFAULT clause if specified
      if (f.defaultValue !== undefined && f.defaultValue !== null && f.defaultValue !== '') {
        const escaped = f.defaultValue.replace(/'/g, "''");
        colDef += ` DEFAULT '${escaped}'`;
      }

      if (f.constraints?.isPrimaryKey && pkFields.length === 1) colDef += ' PRIMARY KEY';
      else if (f.constraints?.isUnique) colDef += ' UNIQUE';

      // Add CHECK constraints for codelist values
      if (ft.kind === 'codelist') {
        let codeValues: string[] = [];
        if (ft.mode === 'inline' && ft.values?.length > 0) {
          codeValues = ft.values.map((v: CodeValue) => v.code);
        } else if (ft.mode === 'shared' && ft.enumRef) {
          const shared = model.sharedEnums?.find(e => e.id === ft.enumRef);
          if (shared?.values?.length > 0) {
            codeValues = shared.values.map((v: CodeValue) => v.code);
          }
        }
        if (codeValues.length > 0) {
          const vals = codeValues.map(c => `'${c.replace(/'/g, "''")}'`).join(', ');
          colDef += ` CHECK ("${f.name}" IN (${vals}))`;
        }
      }

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

    // Insert metadata into gpkg_contents
    db.run(
      `INSERT INTO gpkg_contents (table_name, data_type, identifier, description, srs_id) VALUES (?, ?, ?, ?, ?)`,
      [tbl, 'features', tbl, layer.description || '', srsId]
    );

    // Insert geometry column metadata if layer has geometry
    if (layer.geometryType !== 'None') {
      const geomCol = layer.geometryColumnName || 'geom';
      db.run(
        `INSERT INTO gpkg_geometry_columns (table_name, column_name, geometry_type_name, srs_id, z, m) VALUES (?, ?, ?, ?, ?, ?)`,
        [tbl, geomCol, layer.geometryType, srsId, 0, 0]
      );
    }

    // Register secondary geometry fields in gpkg_geometry_columns
    effectiveProperties.forEach(f => {
      if (f.fieldType.kind === 'geometry') {
        const ft = f.fieldType as GeometryFieldType;
        db.run(
          `INSERT OR IGNORE INTO gpkg_geometry_columns (table_name, column_name, geometry_type_name, srs_id, z, m) VALUES (?, ?, ?, ?, ?, ?)`,
          [tbl, f.name, ft.geometryType, srsId, 0, 0]
        );
      }
    });

    // Register constrained fields for QGIS support via gpkg metadata tables
    effectiveProperties.forEach(f => {
      let codeValues: string[] = [];

      // Case 1 & 2: Enumeration (from codelist or constraints.enumeration)
      if (f.fieldType.kind === 'codelist') {
        const ft = f.fieldType;
        if (ft.mode === 'inline' && ft.values?.length > 0) {
          codeValues = ft.values.map((v: CodeValue) => v.code);
        } else if (ft.mode === 'shared' && 'enumRef' in ft) {
          const enumRef = (ft as any).enumRef;
          const shared = model.sharedEnums?.find(e => e.id === enumRef);
          if (shared?.values?.length > 0) {
            codeValues = shared.values.map((v: CodeValue) => v.code);
          }
        }
      } else if (f.constraints?.enumeration?.length > 0) {
        codeValues = f.constraints.enumeration;
      }

      if (codeValues.length > 0) {
        const constraintName = `${tbl}_${f.name}_enum`;

        // Insert one row per enum value into gpkg_data_column_constraints
        // QGIS reads one row per value to build the dropdown list
        codeValues.forEach(code => {
          db.run(
            `INSERT INTO gpkg_data_column_constraints (constraint_name, constraint_type, value) VALUES (?, ?, ?)`,
            [constraintName, 'enum', code]
          );
        });

        // Insert into gpkg_data_columns to link the constraint to the column
        db.run(
          `INSERT INTO gpkg_data_columns (table_name, column_name, name, title, description, mime_type, constraint_name) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [tbl, f.name, null, f.title || f.name, f.description || '', null, constraintName]
        );

        // Register this constrained column in gpkg_extensions
        db.run(
          `INSERT OR IGNORE INTO gpkg_extensions (table_name, column_name, extension_name, definition, scope) VALUES (?, ?, ?, ?, ?)`,
          [tbl, f.name, 'gpkg_schema', 'http://www.geopackage.org/spec120/#extension_schema', 'read-write']
        );
      }

      // Case 3: Min/Max range constraint
      const c = f.constraints;
      const isNumeric = f.fieldType.kind === 'primitive' && (f.fieldType.baseType === 'number' || f.fieldType.baseType === 'integer');
      const hasRange = isNumeric && ((c?.min !== undefined && c.min !== null) || (c?.max !== undefined && c.max !== null));

      if (hasRange) {
        const constraintName = `${tbl}_${f.name}_range`;
        db.run(
          `INSERT INTO gpkg_data_column_constraints (constraint_name, constraint_type, value, min, min_is_inclusive, max, max_is_inclusive) VALUES (?, ?, NULL, ?, 1, ?, 1)`,
          [constraintName, 'range', c.min ?? null, c.max ?? null]
        );
        db.run(
          `INSERT INTO gpkg_data_columns (table_name, column_name, name, title, description, mime_type, constraint_name) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [tbl, f.name, null, f.title || f.name, f.description || '', null, constraintName]
        );
        db.run(
          `INSERT OR IGNORE INTO gpkg_extensions (table_name, column_name, extension_name, definition, scope) VALUES (?, ?, ?, ?, ?)`,
          [tbl, f.name, 'gpkg_schema', 'http://www.geopackage.org/spec120/#extension_schema', 'read-write']
        );
      }
    });
  }

  const binary = db.export();
  const blob = new Blob([binary], { type: 'application/x-sqlite3' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${filename}.gpkg`; a.click();
};
