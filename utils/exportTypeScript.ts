import { DataModel, Field, Layer } from '../types';
import { topoSortLayers } from './modelUtils';

function toPascalCase(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^[a-z]/, c => c.toUpperCase());
}

// Map a Field to its TypeScript type string
function tsType(f: Field, model: DataModel, indent: string = ''): string {
  const ft = f.fieldType;
  switch (ft.kind) {
    case 'primitive':
      switch (ft.baseType) {
        case 'string':  return 'string';
        case 'number':
        case 'integer': return 'number';
        case 'boolean': return 'boolean';
        case 'date':    return 'string'; // ISO 8601
        case 'json':    return 'unknown';
      }
      break; // unreachable but satisfies TS
    case 'geometry':
      return 'GeoJSON.Geometry';
    case 'feature-ref': {
      const mult = f.multiplicity;
      if (mult === '0..*' || mult === '1..*') return 'string[]';
      if (mult === '0..1') return 'string | null';
      return 'string';
    }
    case 'codelist': {
      if (ft.mode === 'shared') {
        const se = model.sharedEnums?.find(e => e.id === ft.enumRef);
        if (se) return toPascalCase(se.name);
      }
      if (ft.mode === 'inline') {
        const vals = ft.values;
        if (vals && vals.length > 0) {
          return vals.map(v => `'${v.code.replace(/'/g, "\\'")}'`).join(' | ');
        }
      }
      return 'string';
    }
    case 'datatype-inline': {
      if (!ft.properties || ft.properties.length === 0) return 'Record<string, unknown>';
      const nextIndent = indent + '  ';
      const isArray = f.multiplicity === '0..*' || f.multiplicity === '1..*';
      const fields = ft.properties.map(sp => {
        const opt = sp.multiplicity === '1..1' || sp.multiplicity === '1..*' ? '' : '?';
        return `${nextIndent}${sp.name}${opt}: ${tsType(sp, model, nextIndent)};`;
      });
      const objType = `{\n${fields.join('\n')}\n${indent}}`;
      return isArray ? `Array<${objType}>` : objType;
    }
    case 'datatype-ref': {
      const shared = model.sharedTypes?.find(st => st.id === ft.typeId);
      return shared ? toPascalCase(shared.name) : 'unknown';
    }
  }
  return 'unknown';
}

function renderInterface(name: string, properties: Field[], extendsName: string | undefined, model: DataModel, layer?: Layer): string {
  const extendsClause = extendsName ? ` extends ${toPascalCase(extendsName)}` : '';
  const lines: string[] = [`export interface ${toPascalCase(name)}${extendsClause} {`];

  if (layer && !layer.isAbstract) {
    if (!extendsName) {
      lines.push(`  /** Primary key */`);
      lines.push(`  fid: number;`);
    }
    
    // Only add geom column if the layer defines one itself, or if we want to ensure it's there. 
    // Since SQL export adds geom to every concrete table, we should include it.
    if (layer.geometryType && layer.geometryType !== 'None') {
      const geomType = layer.geometryType === 'GeometryCollection' ? 'GeometryCollection' : layer.geometryType;
      lines.push(`  /** Geometry */`);
      lines.push(`  ${layer.geometryColumnName || 'geom'}: GeoJSON.${geomType} | null;`);
    }
  }

  for (const f of properties) {
    if (f.description) {
      lines.push(`  /** ${f.description} */`);
    }
    if (f.fieldType.kind === 'feature-ref') {
      lines.push(`  /** @multiplicity ${f.multiplicity} */`);
    }
    const opt = f.multiplicity === '1..1' || f.multiplicity === '1..*' ? '' : '?';
    const type = tsType(f, model, '  ');
    lines.push(`  ${f.name}${opt}: ${type};`);
  }

  lines.push('}');
  return lines.join('\n');
}

export const exportTypeScript = (model: DataModel, filename: string): void => {
  const chunks: string[] = [
    `// TypeScript interfaces for ${model.name}`,
    `// Generated: ${new Date().toISOString()}`,
    `// Geometry types require the @types/geojson package`,
    '',
  ];

  // SharedEnums as type unions (before everything else)
  if (model.sharedEnums && model.sharedEnums.length > 0) {
    for (const se of model.sharedEnums) {
      if (se.description) chunks.push(`/** ${se.description} */`);
      const union = se.values.length > 0
        ? se.values.map(v => `'${v.code.replace(/'/g, "\\'")}'`).join(' | ')
        : 'string';
      chunks.push(`export type ${toPascalCase(se.name)} = ${union};`);
      chunks.push('');
    }
  }

  // SharedTypes as interfaces
  if (model.sharedTypes && model.sharedTypes.length > 0) {
    for (const st of model.sharedTypes) {
      chunks.push(renderInterface(st.name, st.properties, undefined, model));
      chunks.push('');
    }
  }

  // Layers in topological order (parents before children)
  const sorted = topoSortLayers(model.layers);

  for (const layer of sorted) {
    const parentName = layer.extends
      ? model.layers.find(l => l.id === layer.extends)?.name
      : undefined;

    if (layer.isAbstract) {
      chunks.push(`// Abstract — not exported as a database table`);
    }

    chunks.push(renderInterface(layer.name, layer.properties, parentName, model, layer));
    chunks.push('');
  }

  const content = chunks.join('\n');
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.ts`;
  a.click();
  URL.revokeObjectURL(url);
};
