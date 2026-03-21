import { DataModel } from '../types';
import type { Translations } from '../i18n/index';
import { getEffectiveProperties } from './modelUtils';
import { COLORS } from '../constants';
import { hexToRgb } from './colorUtils';

const isRequired = (f: any): boolean => f.multiplicity === '1..1' || f.multiplicity === '1..*';

export const getConstraintsString = (f: any, model: DataModel) => {
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
  props: any[],
  model: DataModel,
  depth: number = 0
): (any & { depth: number; displayName: string })[] => {
  const result: (any & { depth: number; displayName: string })[] = [];
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
const fieldTypeDisplay = (f: any, t: Translations): string => {
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
