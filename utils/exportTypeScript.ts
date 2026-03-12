import { DataModel, ModelProperty } from '../types';
import { topoSortLayers } from './modelUtils';

function toPascalCase(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^[a-z]/, c => c.toUpperCase());
}

// Map a ModelProperty to its TypeScript type string
function tsType(p: ModelProperty, model: DataModel, indent: string = ''): string {
  switch (p.type) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'string'; // ISO 8601
    case 'geometry':
      return 'GeoJSON.Geometry';
    case 'json':
      return 'unknown';
    case 'relation': {
      const mult = p.relationConfig?.multiplicity;
      // Many-multiplicity → array; optional singular → string | null; default → string
      if (mult === '0..*' || mult === '1..*') return 'string[]';
      if (mult === '0..1') return 'string | null';
      return 'string';
    }
    case 'codelist': {
      if (p.codelistMode === 'shared' && p.sharedEnumId) {
        const se = model.sharedEnums?.find(e => e.id === p.sharedEnumId);
        if (se) return toPascalCase(se.name);
      }
      const vals = p.codelistValues;
      if (vals && vals.length > 0) {
        return vals.map(v => `'${v.code.replace(/'/g, "\\'")}'`).join(' | ');
      }
      return 'string';
    }
    case 'object': {
      if (!p.subProperties || p.subProperties.length === 0) return 'Record<string, unknown>';
      const nextIndent = indent + '  ';
      const fields = p.subProperties.map(sp => {
        const opt = sp.required ? '' : '?';
        return `${nextIndent}${sp.name}${opt}: ${tsType(sp, model, nextIndent)};`;
      });
      return `{\n${fields.join('\n')}\n${indent}}`;
    }
    case 'array': {
      if (!p.subProperties || p.subProperties.length === 0) return 'unknown[]';
      const nextIndent = indent + '  ';
      const fields = p.subProperties.map(sp => {
        const opt = sp.required ? '' : '?';
        return `${nextIndent}${sp.name}${opt}: ${tsType(sp, model, nextIndent)};`;
      });
      return `Array<{\n${fields.join('\n')}\n${indent}}>`;
    }
    case 'shared_type': {
      const shared = model.sharedTypes?.find(st => st.id === p.sharedTypeId);
      return shared ? toPascalCase(shared.name) : 'unknown';
    }
    default:
      return 'unknown';
  }
}

function renderInterface(name: string, properties: ModelProperty[], extendsName: string | undefined, model: DataModel): string {
  const extendsClause = extendsName ? ` extends ${toPascalCase(extendsName)}` : '';
  const lines: string[] = [`export interface ${toPascalCase(name)}${extendsClause} {`];

  for (const p of properties) {
    if (p.description) {
      lines.push(`  /** ${p.description} */`);
    }
    if (p.type === 'relation' && p.relationConfig?.multiplicity) {
      lines.push(`  /** @multiplicity ${p.relationConfig.multiplicity} */`);
    }
    const opt = p.required ? '' : '?';
    const type = tsType(p, model, '  ');
    lines.push(`  ${p.name}${opt}: ${type};`);
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

    chunks.push(renderInterface(layer.name, layer.properties, parentName, model));
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
