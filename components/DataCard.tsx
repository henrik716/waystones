import React, { Fragment } from 'react';
import { DataModel, Layer, PropertyConstraints, Field } from '../types';
import { COLORS, getFieldConfig } from '../constants';
import { MapPin, Database, ChevronRight, Layers, Globe, Palette, GitCommit, Square, Hash, Shapes, LayoutList, MousePointer2, Lock, Key, ListChecks, Link, CornerDownRight, Box } from 'lucide-react';

interface DataCardProps {
  model: DataModel;
  t: any;
}

const GEOM_ICONS: Record<string, any> = {
  'Point': MapPin,
  'LineString': GitCommit,
  'Polygon': Square,
  'MultiPoint': Hash,
  'MultiLineString': Shapes,
  'MultiPolygon': LayoutList
};

const hasMeaningfulConstraints = (c?: PropertyConstraints): boolean => {
  if (!c) return false;
  return Object.keys(c).some(k => {
    const val = c[k as keyof PropertyConstraints];
    return val !== undefined && val !== '' && val !== false && (!Array.isArray(val) || val.length > 0);
  });
};

/** Get a display label for a field's type */
const fieldTypeLabel = (f: Field, t: any): string => {
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

const DataCard: React.FC<DataCardProps> = ({ model, t }) => {
  const isRequired = (f: Field) => f.multiplicity === '1..1' || f.multiplicity === '1..*';

  // Recursive component for rendering properties, sub-properties AND shared types
  const PropertyRow: React.FC<{ prop: Field; layer: Layer; depth?: number }> = ({ prop, layer, depth = 0 }) => {
    const config = getFieldConfig(prop.fieldType);
    const isStyleAttribute = layer.style.type === 'categorized' && layer.style.propertyId === prop.id;
    const c = prop.constraints;
    const hasActiveConstraints = hasMeaningfulConstraints(c);
    const isPk = c?.isPrimaryKey;
    const isUnique = c?.isUnique;
    const hasEnum = c?.enumeration && c.enumeration.length > 0;
    const ft = prop.fieldType;
    const relationTargetLayer = ft.kind === 'feature-ref'
      ? model.layers.find(l => l.id === ft.layerId)?.name 
      : null;

    // Sjekk om dette er en delt type som skal "pakkes ut"
    const sharedTypeRef = ft.kind === 'datatype-ref'
      ? model.sharedTypes?.find(st => st.id === ft.typeId)
      : null;

    return (
      <Fragment key={prop.id}>
        <div className={`p-4 hover:bg-slate-50/50 transition-colors group relative ${isStyleAttribute ? 'bg-amber-50/30' : ''}`}>
          
          {/* Indentation guides for nested properties */}
          {depth > 0 && (
            <div 
              className="absolute top-0 bottom-0 border-l-2 border-slate-200/50 rounded-bl-xl" 
              style={{ left: `${depth * 1.5 + 1}rem` }} 
            />
          )}

          <div className="flex items-center justify-between" style={{ paddingLeft: `${depth * 1.5}rem` }}>
            <div className="min-w-0 pr-4 flex items-center gap-2">
              {depth > 0 && <CornerDownRight size={14} className="text-slate-300 shrink-0" />}
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  {isPk && <Key size={12} className="text-emerald-600" />}
                  <span className={`text-sm font-black mono ${isPk ? 'text-emerald-700' : 'text-slate-800'}`}>{prop.name}</span>
                  {(isRequired(prop) || isPk) && <span className="text-indigo-500 text-xs font-black">*</span>}
                </div>
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-tight truncate">
                  {sharedTypeRef ? `${sharedTypeRef.name} (Type)` : (prop.title || fieldTypeLabel(prop, t))}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
              {isStyleAttribute && <Palette size={12} className="text-amber-500" />}
              <div className="px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border flex items-center gap-1.5" style={{ backgroundColor: config.bg, color: config.color, borderColor: `${config.color}20` }}>
                {ft.kind === 'datatype-ref' && <Box size={10} />}
                {sharedTypeRef ? sharedTypeRef.name : fieldTypeLabel(prop, t)}
              </div>
            </div>
          </div>

          <div style={{ paddingLeft: `${depth * 1.5 + (depth > 0 ? 1.5 : 0)}rem` }}>
            {relationTargetLayer && ft.kind === 'feature-ref' && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[9px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100 w-fit">
                <Link size={10} />
                <span>{t.relationTypes?.[ft.relationType] || ft.relationType}</span>
                <span className="bg-indigo-100 text-indigo-700 px-1.5 rounded font-black">[{prop.multiplicity}]</span>
                <ChevronRight size={10} className="text-indigo-300" />
                <span className="text-indigo-800">{relationTargetLayer}</span>
              </div>
            )}
            
            {prop.description && depth === 0 && (
              <p className="text-[10px] text-slate-400 mt-1 italic leading-relaxed max-w-2xl">{prop.description}</p>
            )}

            {(hasActiveConstraints || isRequired(prop)) && (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {hasActiveConstraints && (
                    <div className="flex items-center gap-1 text-[8px] font-black text-emerald-600 uppercase bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100">
                      <Lock size={8} /> {t.constraints?.title || 'Constraints'}
                    </div>
                  )}
                  {isPk && <span className="text-[8px] font-black bg-emerald-600 text-white px-1.5 py-0.5 rounded uppercase tracking-wider shadow-sm">PK</span>}
                  {isUnique && <span className="text-[8px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded uppercase tracking-wider">{t.constraints?.unique || 'Unique'}</span>}
                  {isRequired(prop) && !isPk && <span className="text-[8px] font-black bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded uppercase tracking-wider">{t.constraints?.notNull || 'NOT NULL'}</span>}
                  {c?.min !== undefined && <span className="text-[8px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{t.constraints?.min || 'Min'}: {c.min}</span>}
                  {c?.max !== undefined && <span className="text-[8px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{t.constraints?.max || 'Max'}: {c.max}</span>}
                </div>
                {hasEnum && (
                  <div className="flex flex-wrap items-center gap-1.5 bg-blue-50/50 p-2 rounded-xl border border-blue-100/50">
                    <ListChecks size={10} className="text-blue-600" />
                    <span className="text-[8px] font-black uppercase text-blue-400 mr-1">{t.constraints?.enumeration || 'Allowed values'}:</span>
                    {c.enumeration?.map((val, idx) => (
                      <span key={idx} className="bg-white text-blue-700 text-[9px] font-bold px-2 py-0.5 rounded-lg border border-blue-100 shadow-sm mono">{val}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* Render sub-properties recursively (from datatype-inline) */}
        {ft.kind === 'datatype-inline' && ft.properties.length > 0 && (
          <div className="bg-slate-50/30 border-y border-slate-100/50">
            {ft.properties.map(subProp => (
              <PropertyRow key={subProp.id} prop={subProp} layer={layer} depth={depth + 1} />
            ))}
          </div>
        )}

        {sharedTypeRef && sharedTypeRef.properties.length > 0 && (
          <div className="bg-fuchsia-50/20 border-y border-fuchsia-100/30">
            {sharedTypeRef.properties.map(subProp => (
              <PropertyRow key={subProp.id} prop={subProp} layer={layer} depth={depth + 1} />
            ))}
          </div>
        )}
      </Fragment>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Info Card */}
      <div className="rounded-2xl p-6 text-white shadow-xl shadow-indigo-100" style={{ background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.primaryDark} 100%)` }}>
        <h2 className="text-xl font-black mb-1">{model.name || t.untitledModel || 'Untitled Model'}</h2>
        <div className="flex flex-wrap items-center gap-3 text-white/70 text-[10px] font-bold uppercase tracking-[0.2em] mb-4">
          <span>{model.namespace || t.noNamespace || 'no.namespace'}</span>
          <span className="w-1 h-1 rounded-full bg-white/30" />
          <span>v{model.version}</span>
          <span className="w-1 h-1 rounded-full bg-white/30" />
          <span className="flex items-center gap-1.5 bg-white/20 px-2 py-0.5 rounded-full"><Globe size={12} /> {model.crs || 'EPSG:4326'}</span>
        </div>
        {model.description && <p className="text-xs text-white/90 leading-relaxed font-medium italic">"{model.description}"</p>}
      </div>

      {/* Layers List */}
      {model.layers.map(layer => {
        
        // Find all codelists recursively to display them at the bottom
        const findCodelists = (props: Field[]): { prop: Field; values: { id: string; code: string; label: string; description?: string }[] }[] => {
            let lists: { prop: Field; values: { id: string; code: string; label: string; description?: string }[] }[] = [];
            props.forEach(f => {
                if (f.fieldType.kind === 'codelist') {
                    let vals: { id: string; code: string; label: string; description?: string }[] = [];
                    if (f.fieldType.mode === 'shared') {
                        vals = model.sharedEnums?.find(e => e.id === (f.fieldType as any).enumRef)?.values ?? [];
                    } else if (f.fieldType.mode === 'inline') {
                        vals = f.fieldType.values;
                    }
                    if (vals.length > 0) lists.push({ prop: f, values: vals });
                }
                if (f.fieldType.kind === 'datatype-inline' && f.fieldType.properties.length > 0) {
                    lists = [...lists, ...findCodelists(f.fieldType.properties)];
                }
                if (f.fieldType.kind === 'datatype-ref') {
                    const st = model.sharedTypes?.find(s => s.id === (f.fieldType as any).typeId);
                    if (st) lists = [...lists, ...findCodelists(st.properties)];
                }
            });
            return lists;
        };
        const codelists = findCodelists(layer.properties);
        
        const GeomIcon = GEOM_ICONS[layer.geometryType] || MousePointer2;

        return (
          <div key={layer.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 flex-wrap">
                   <div className="w-4 h-4 rounded-md border border-slate-200 shadow-sm shrink-0" style={{ backgroundColor: layer.style.simpleColor }} />
                   <Layers size={16} className="text-indigo-600" />
                   {layer.name}
                   {layer.isAbstract && (
                     <span className="text-[8px] font-black text-violet-500 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-full">{t.abstract || '«abstract»'}</span>
                   )}
                   {layer.extends && (() => {
                     const parent = model.layers.find(l => l.id === layer.extends);
                     return parent ? <span className="text-[9px] text-violet-400 font-bold">↑ {parent.name}</span> : null;
                   })()}
                </h3>
                {layer.description && <p className="text-[10px] text-slate-400 mt-1">{layer.description}</p>}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="flex items-center gap-1.5 bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full border border-indigo-100">
                    <GeomIcon size={12} />
                    <span className="text-[9px] font-black uppercase whitespace-nowrap">{t.geometryTypes[layer.geometryType] || layer.geometryType}</span>
                  </div>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {/* Special row for Geometry */}
              <div className="p-4 flex items-center justify-between bg-indigo-50/20">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-black text-indigo-800 mono">{layer.geometryColumnName}</span>
                    <span className="text-indigo-500 text-xs font-black">*</span>
                  </div>
                  <div className="text-[10px] text-indigo-500/70 font-bold uppercase tracking-tight">{t.types.geometry} ({model.crs})</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                   {layer.style.type === 'categorized' && (
                     <div className="flex -space-x-1.5 overflow-hidden p-1">
                        {Object.values(layer.style.categorizedColors || {}).slice(0, 4).map((c, idx) => (
                           <div key={idx} className="w-4 h-4 rounded-full border border-white ring-1 ring-slate-100 shadow-sm" style={{ backgroundColor: c }} />
                        ))}
                     </div>
                   )}
                   <div className="px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border border-indigo-200 bg-indigo-100 text-indigo-700 whitespace-nowrap">{layer.geometryType}</div>
                </div>
              </div>

              {/* Map base properties and recursively render */}
              {layer.properties.map(prop => (
                <PropertyRow key={prop.id} prop={prop} layer={layer} />
              ))}
            </div>

            {codelists.length > 0 && (
              <div className="bg-slate-50/50 p-5 space-y-4 border-t border-slate-100">
                <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 flex items-center gap-2"><Database size={14}/> {t.codelistValues}</span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {codelists.map(({ prop, values }, idx) => {
                    const isStyleAttribute = layer.style.type === 'categorized' && layer.style.propertyId === prop.id;
                    return (
                      <div key={`${prop.id}-${idx}`} className={`bg-white rounded-2xl border overflow-hidden shadow-sm flex flex-col ${isStyleAttribute ? 'border-amber-200' : 'border-slate-200'}`}>
                         <div className={`${isStyleAttribute ? 'bg-amber-500' : 'bg-slate-700'} px-4 py-2 text-white text-[10px] font-black uppercase flex items-center justify-between tracking-wider`}>
                           <span>{prop.title || prop.name}</span>
                           {isStyleAttribute && <Palette size={12} />}
                         </div>
                         <div className="divide-y divide-slate-50">
                            {values.map(v => (
                              <div key={v.id} className="px-4 py-2 hover:bg-slate-50 transition-colors">
                                <div className="flex items-center gap-2">
                                   {isStyleAttribute && (
                                     <div className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm ring-1 ring-slate-200" style={{ backgroundColor: layer.style.categorizedColors?.[v.code] || '#ccc' }} />
                                   )}
                                   <span className={`text-[10px] font-black mono shrink-0 ${isStyleAttribute ? 'text-amber-600' : 'text-blue-600'}`}>{v.code}</span>
                                   <span className="text-xs font-bold text-slate-700 truncate">{v.label}</span>
                                </div>
                                {v.description && (
                                  <p className="text-[9px] text-slate-400 mt-0.5 pl-4 sm:pl-4 italic">{v.description}</p>
                                )}
                              </div>
                            ))}
                         </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {layer.layerConstraints && layer.layerConstraints.length > 0 && (
              <div className="bg-emerald-50/30 p-5 space-y-4 border-t border-emerald-100">
                <span className="text-[10px] font-black uppercase tracking-[0.1em] text-emerald-600 flex items-center gap-2">
                  <Lock size={14} /> {t.layerValidation?.title || 'Advanced Validation'}
                </span>
                <div className="grid grid-cols-1 gap-3">
                  {layer.layerConstraints.map(constraint => (
                    <div key={constraint.id} className="bg-white rounded-xl border border-emerald-100 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black mono text-slate-700 bg-slate-100 px-2 py-1 rounded">{constraint.fieldA}</span>
                        <span className="text-xs font-black text-emerald-600 mono">{constraint.operator}</span>
                        <span className="text-xs font-black mono text-slate-700 bg-slate-100 px-2 py-1 rounded">{constraint.fieldB}</span>
                      </div>
                      {constraint.errorMessage && (
                        <div className="text-[10px] text-slate-500 italic bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                          "{constraint.errorMessage}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
          </div>
        );
      })}
    </div>
  );
};

export default DataCard;