import React from 'react';
import { Plus, Trash2, Box } from 'lucide-react';
import { DataModel, SharedType, ModelProperty } from '../../types';
import PropertyEditor from '../PropertyEditor';

interface SharedTypesTabProps {
  model: DataModel;
  sharedTypes: SharedType[];
  activeSharedType: SharedType | undefined;
  activeSharedTypeId: string;
  onSelectSharedType: (id: string) => void;
  onAddSharedType: () => void;
  onDeleteSharedType: (id: string) => void;
  onUpdateSharedType: (update: Partial<SharedType>) => void;
  onAddProperty: () => void;
  onUpdateProperty: (prop: ModelProperty) => void;
  onDeleteProperty: (id: string) => void;
  onMoveProperty: (id: string, direction: 'up' | 'down') => void;
  t: any;
}

const SharedTypesTab: React.FC<SharedTypesTabProps> = ({
  model, sharedTypes, activeSharedType, activeSharedTypeId,
  onSelectSharedType, onAddSharedType, onDeleteSharedType, onUpdateSharedType,
  onAddProperty, onUpdateProperty, onDeleteProperty, onMoveProperty, t
}) => {
  return (
        <section className="space-y-6 md:space-y-8 animate-in fade-in duration-300 pb-24">
          <div className="flex items-center justify-between mb-4 px-2">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{t.sharedTypes || 'Datatyper'}</h3>
            <button onClick={onAddSharedType} className="text-xs font-black text-indigo-600 hover:underline flex items-center gap-1.5 shrink-0"><Plus size={14}/> {t.addSharedType || 'Ny datatype'}</button>
          </div>

          <div className="flex flex-wrap gap-2 md:gap-3 px-1 pb-4">
            {sharedTypes.map(st => (
              <button
                key={st.id}
                onClick={() => onSelectSharedType(st.id)}
                className={`
                  px-4 py-3 md:px-6 md:py-3.5 rounded-[16px] md:rounded-[20px] text-xs md:text-sm font-black transition-all border flex items-center gap-2 md:gap-3 whitespace-nowrap shrink-0 relative
                  ${activeSharedTypeId === st.id ? 'bg-fuchsia-600 border-fuchsia-600 text-white shadow-xl shadow-fuchsia-200' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:shadow-md'}
                `}
              >
                <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                  <Box size={14} className={activeSharedTypeId === st.id ? 'text-white' : 'text-slate-400'} />
                </div>
                {st.name || "Untitled Type"}
              </button>
            ))}
            {sharedTypes.length === 0 && (
               <div className="text-xs text-slate-400 italic py-3 px-4">Ingen datatyper opprettet ennå.</div>
            )}
          </div>

          {activeSharedType && (
            <div className="bg-white rounded-[24px] md:rounded-[32px] border border-slate-200 shadow-sm p-4 sm:p-6 md:p-8">
              <div className="flex items-center justify-between mb-5 md:mb-6">
                <div className="flex-1 relative group/typename">
                  <div className="flex items-center gap-2 group">
                    <div className="relative flex-1">
                        <label className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.15em] text-slate-400 block mb-2">{t.sharedTypeName || 'Type Name'}</label>
                        <input type="text" value={activeSharedType.name} onChange={e => onUpdateSharedType({ name: e.target.value })} className={`w-full bg-slate-50 border-2 border-slate-100 hover:border-fuchsia-200 text-lg sm:text-xl md:text-2xl font-black px-4 py-3 rounded-2xl focus:bg-white focus:border-fuchsia-500 focus:ring-4 focus:ring-fuchsia-500/5 outline-none placeholder:text-slate-200 transition-all`} placeholder="f.eks. Adresse" />
                    </div>
                  </div>
                </div>
                <button onClick={() => onDeleteSharedType(activeSharedType.id)} className="ml-3 sm:ml-4 p-3 rounded-xl text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-all self-end"><Trash2 size={20} /></button>
              </div>

              <textarea
                placeholder={t.sharedTypeDescriptionPlaceholder}
                value={activeSharedType.description}
                onChange={e => onUpdateSharedType({ description: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-[18px] md:rounded-[20px] px-4 py-4 md:px-5 md:py-4 text-xs md:text-sm min-h-[60px] md:min-h-[80px] focus:ring-4 focus:ring-fuchsia-500/10 focus:border-fuchsia-500 outline-none transition-all resize-none leading-relaxed mb-8"
              />

              <div className="space-y-4 md:space-y-6">
                <div className="flex items-center justify-between mb-2 px-2">
                  <div className="flex items-center gap-2 md:gap-3">
                    <h2 className="text-base md:text-lg font-black text-slate-800 tracking-tight">{t.properties} i {activeSharedType.name}</h2>
                    <span className="bg-slate-100 text-slate-500 text-[10px] md:text-xs font-black px-3 py-1 rounded-full border border-slate-200 shadow-inner">{activeSharedType.properties.length}</span>
                  </div>
                </div>

                <div className="space-y-3 md:space-y-5">
                  {activeSharedType.properties.map((prop, idx) => (
                    <PropertyEditor
                      key={prop.id}
                      prop={prop}
                      onUpdate={onUpdateProperty}
                      onDelete={onDeleteProperty}
                      onMove={(dir) => onMoveProperty(prop.id, dir)}
                      isFirst={idx === 0}
                      isLast={idx === activeSharedType.properties.length - 1}
                      t={t}
                      allLayers={model.layers.map(l => ({ id: l.id, name: l.name }))}
                      sharedTypes={sharedTypes.filter(st => st.id !== activeSharedType.id)}
                    />
                  ))}
                  <button onClick={onAddProperty} className="w-full py-6 md:py-8 border-2 border-dashed border-slate-200 rounded-[18px] md:rounded-[24px] text-slate-400 font-black text-[10px] uppercase tracking-[0.2em] hover:border-fuchsia-300 hover:text-fuchsia-600 hover:bg-fuchsia-50/50 transition-all flex items-center justify-center gap-3 active:scale-[0.99]"><Plus size={18} />{t.addProperty}</button>
                </div>
              </div>

            </div>
          )}
        </section>
  );
};

export default SharedTypesTab;
