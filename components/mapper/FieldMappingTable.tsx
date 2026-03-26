import React from 'react';
import type { Translations } from '../../i18n/index';
import { ArrowRightLeft, Wand2, ChevronDown } from 'lucide-react';
import { Layer, Field } from '../../types';
import { getFieldConfig } from '../../constants';

interface LayerMapping {
  sourceLayer: string;
  fieldMappings: Record<string, string>;
  valueMappings: Record<string, Record<string, string>>;
}

interface FieldMappingTableProps {
  activeLayer: Layer | undefined;
  activeMapping: LayerMapping;
  allFields: Record<string, string[]>;
  t: Translations;
  onAutoMap: () => void;
  onUpdateFieldMapping: (propId: string, sourceField: string) => void;
  onOpenValueMap: (propId: string) => void;
}

/** Helper: get a display label for field kind */
const fieldKindLabel = (f: Field, t: Translations): string => {
  const ft = f.fieldType;
  switch (ft.kind) {
    case 'primitive':       return t.types?.[ft.baseType] || ft.baseType;
    case 'codelist':        return t.types?.codelist || 'Codelist';
    case 'geometry':        return t.types?.geometry || 'Geometry';
    case 'feature-ref':     return t.types?.relation || 'Relation';
    case 'datatype-inline': return t.types?.object || 'Object';
    case 'datatype-ref':    return t.types?.shared_type || 'Datatype';
  }
};

const FieldMappingTable: React.FC<FieldMappingTableProps> = ({
  activeLayer,
  activeMapping,
  allFields,
  t,
  onAutoMap,
  onUpdateFieldMapping,
  onOpenValueMap,
}) => {
  const mappedCount = Object.values(activeMapping.fieldMappings).filter(Boolean).length;
  const totalCount = activeLayer?.properties.length || 0;

  return (
    <section className={`transition-all duration-500 ${!activeMapping.sourceLayer ? 'opacity-30 grayscale pointer-events-none' : 'opacity-100'}`}>
       <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 py-6 md:px-10 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
             <div className="flex items-center gap-6">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 border border-emerald-100 shrink-0">
                  <ArrowRightLeft size={28} />
                </div>
                <div>
                   <h3 className="text-lg md:text-xl font-black text-slate-800 tracking-tight leading-none mb-1">{t.mapper.step3}</h3>
                   <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{activeLayer?.name}</p>
                </div>
             </div>
             <div className="flex items-center gap-3 w-full sm:w-auto">
                {totalCount > 0 && (
                  <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl border ${mappedCount === totalCount ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-100 border-slate-200 text-slate-500'}`}>
                    {mappedCount}/{totalCount} {t.mapper.fieldsMapped}
                  </span>
                )}
                <button onClick={onAutoMap} className="flex-1 sm:flex-none px-6 py-3 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all active:scale-95 shadow-lg shadow-emerald-200">
                   <Wand2 size={16}/> {t.mapper.autoMap}
                </button>
             </div>
          </div>

          <div className="overflow-x-auto">
             <table className="w-full text-left border-collapse min-w-[600px]">
                <thead className="sticky top-0 z-20 bg-slate-50/90 backdrop-blur-md border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 w-1/3">{t.mapper.targetFields}</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 w-24">Type</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">{t.mapper.sourceFields}</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 w-32 text-right">{t.mapper.mapValues}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {!activeLayer || activeLayer.properties.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-20 text-center text-slate-300 italic text-sm uppercase font-black tracking-widest">{t.mapper.noPropsTarget}</td>
                    </tr>
                  ) : (
                    activeLayer.properties.map(prop => {
                      const mappedField = activeMapping.fieldMappings[prop.id];
                      const isValueMappable = (prop.fieldType.kind === 'codelist' || (prop.constraints?.enumeration && prop.constraints.enumeration.length > 0)) && !!mappedField;
                      const valueMapCount = Object.keys(activeMapping.valueMappings[prop.id] || {}).length;
                      const isRequired = prop.multiplicity.startsWith('1');

                      return (
                        <tr key={prop.id} className={`hover:bg-slate-50/80 transition-colors group ${mappedField ? 'bg-emerald-50/10' : ''}`}>
                          <td className="px-6 py-3">
                             <div className="flex items-center gap-1.5">
                               <span className="font-black text-slate-800 text-sm mono">{prop.name}</span>
                               {isRequired && !mappedField && <span className="text-rose-500 text-xs font-black leading-none" title="Required">*</span>}
                             </div>
                             <div className="text-[10px] text-slate-400 font-medium truncate max-w-[200px]">{prop.title}</div>
                          </td>
                          <td className="px-4 py-3">
                             <span className="text-[9px] font-black uppercase tracking-[0.1em] px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200">
                               {fieldKindLabel(prop, t)}
                             </span>
                          </td>
                          <td className="px-6 py-3">
                             <div className="relative group/select">
                                <select
                                  value={mappedField || ''}
                                  onChange={e => onUpdateFieldMapping(prop.id, e.target.value)}
                                  className={`w-full py-2.5 px-4 pr-10 rounded-xl text-xs font-bold border transition-all outline-none appearance-none cursor-pointer ${mappedField ? 'bg-white border-emerald-400 text-emerald-700 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-400'}`}
                                >
                                   <option value="">{t.mapper.unmapped}</option>
                                   {(allFields[activeMapping.sourceLayer] || []).map(f => <option key={f} value={f}>{f}</option>)}
                                </select>
                                <ChevronDown size={14} className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors ${mappedField ? 'text-emerald-500' : 'text-slate-300'}`} />
                             </div>
                          </td>
                          <td className="px-6 py-3 text-right">
                             {isValueMappable ? (
                                <button
                                  onClick={() => onOpenValueMap(prop.id)}
                                  className={`p-2.5 rounded-xl border transition-all relative ${valueMapCount > 0 ? 'bg-amber-100 border-amber-300 text-amber-700 shadow-sm' : 'bg-white border-slate-200 text-slate-300 hover:text-amber-500 hover:border-amber-300'}`}
                                  title={t.mapper.mapValues}
                                >
                                  <Wand2 size={18} />
                                  {valueMapCount > 0 && <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center border-2 border-white">{valueMapCount}</span>}
                                </button>
                             ) : null}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
             </table>
          </div>
       </div>
    </section>
  );
};

export default FieldMappingTable;
