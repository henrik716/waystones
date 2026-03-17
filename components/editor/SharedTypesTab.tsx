import React, { useState } from 'react';
import { Plus, Trash2, Box, Hash } from 'lucide-react';
import { DataModel, SharedType, SharedEnum, Field, CodeValue } from '../../types';
import PropertyEditor from '../PropertyEditor';
import ConstraintsEditor from '../property/ConstraintsEditor';
import { createEmptyCodeValue } from '../../constants';

interface SharedTypesTabProps {
  model: DataModel;
  allLayersFull: Layer[];
  sharedTypes: SharedType[];
  activeSharedType: SharedType | undefined;
  activeSharedTypeId: string;
  onSelectSharedType: (id: string) => void;
  onAddSharedType: () => void;
  onDeleteSharedType: (id: string) => void;
  onUpdateSharedType: (update: Partial<SharedType>) => void;
  onAddProperty: () => void;
  onUpdateProperty: (prop: Field) => void;
  onDeleteProperty: (id: string) => void;
  onMoveProperty: (id: string, direction: 'up' | 'down') => void;
  // SharedEnum props
  sharedEnums: SharedEnum[];
  activeSharedEnumId: string;
  onSelectSharedEnum: (id: string) => void;
  onAddSharedEnum: () => void;
  onDeleteSharedEnum: (id: string) => void;
  onUpdateSharedEnum: (update: Partial<SharedEnum>) => void;
  onAddEnumValue: () => void;
  onUpdateEnumValue: (value: CodeValue) => void;
  onDeleteEnumValue: (id: string) => void;
  t: any;
  lang?: string;
}

const SharedTypesTab: React.FC<SharedTypesTabProps> = ({
  model, allLayersFull = [], sharedTypes, activeSharedType, activeSharedTypeId,
  onSelectSharedType, onAddSharedType, onDeleteSharedType, onUpdateSharedType,
  onAddProperty, onUpdateProperty, onDeleteProperty, onMoveProperty,
  sharedEnums, activeSharedEnumId, onSelectSharedEnum, onAddSharedEnum,
  onDeleteSharedEnum, onUpdateSharedEnum, onAddEnumValue, onUpdateEnumValue, onDeleteEnumValue,
  t, lang
}) => {
  const [subTab, setSubTab] = useState<'types' | 'enums'>('types');
  const activeSharedEnum = sharedEnums.find(e => e.id === activeSharedEnumId);

  return (
    <section className="space-y-6 md:space-y-8 animate-in fade-in duration-300 pb-24">

      {/* Sub-tab toggle */}
      <div className="flex bg-white p-1 rounded-xl border border-slate-200 w-fit shadow-sm">
        <button
          onClick={() => setSubTab('types')}
          className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${subTab === 'types' ? 'bg-fuchsia-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
        >
          {t.sharedTypes || 'Types'}
          {sharedTypes.length > 0 && (
            <span className={`ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full ${subTab === 'types' ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{sharedTypes.length}</span>
          )}
        </button>
        <button
          onClick={() => setSubTab('enums')}
          className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${subTab === 'enums' ? 'bg-amber-500 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
        >
          {lang === 'no' ? 'Delte kodelister' : 'Shared Codelists'}
          {sharedEnums.length > 0 && (
            <span className={`ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full ${subTab === 'enums' ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{sharedEnums.length}</span>
          )}
        </button>
      </div>

      {/* ---- TYPES TAB ---- */}
      {subTab === 'types' && (
        <>
          <div className="flex items-center justify-between mb-4 px-2">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{t.sharedTypes || 'Datatyper'}</h3>
            <button onClick={onAddSharedType} className="text-xs font-black text-indigo-600 hover:underline flex items-center gap-1.5 shrink-0"><Plus size={14} /> {t.addSharedType || 'Ny datatype'}</button>
          </div>

          <div className="flex flex-wrap gap-2 md:gap-3 px-1 pb-4">
            {sharedTypes.map(st => (
              <button
                key={st.id}
                onClick={() => onSelectSharedType(st.id)}
                className={`px-4 py-3 md:px-6 md:py-3.5 rounded-[16px] md:rounded-[20px] text-xs md:text-sm font-black transition-all border flex items-center gap-2 md:gap-3 whitespace-nowrap shrink-0 relative
                  ${activeSharedTypeId === st.id ? 'bg-fuchsia-600 border-fuchsia-600 text-white shadow-xl shadow-fuchsia-200' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:shadow-md'}`}
              >
                <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                  <Box size={14} className={activeSharedTypeId === st.id ? 'text-white' : 'text-slate-400'} />
                </div>
                {st.name || 'Untitled Type'}
              </button>
            ))}
            {sharedTypes.length === 0 && (
              <div className="text-xs text-slate-400 italic py-3 px-4">Ingen datatyper opprettet ennå.</div>
            )}
          </div>

          {activeSharedType && (
            <div className="bg-white rounded-[24px] md:rounded-[32px] border border-slate-200 shadow-sm p-4 sm:p-6 md:p-8">
              <div className="flex items-center justify-between mb-5 md:mb-6">
                <div className="flex-1 relative">
                  <label className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.15em] text-slate-400 block mb-2">{t.sharedTypeName || 'Type Name'}</label>
                  <input type="text" value={activeSharedType.name} onChange={e => onUpdateSharedType({ name: e.target.value })} className="w-full bg-slate-50 border-2 border-slate-100 hover:border-fuchsia-200 text-lg sm:text-xl md:text-2xl font-black px-4 py-3 rounded-2xl focus:bg-white focus:border-fuchsia-500 focus:ring-4 focus:ring-fuchsia-500/5 outline-none placeholder:text-slate-200 transition-all" placeholder="f.eks. Adresse" />
                </div>
                <button onClick={() => onDeleteSharedType(activeSharedType.id)} className="ml-3 sm:ml-4 p-3 rounded-xl text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-all self-end"><Trash2 size={20} /></button>
              </div>

              <textarea placeholder={t.sharedTypeDescriptionPlaceholder} value={activeSharedType.description} onChange={e => onUpdateSharedType({ description: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-[18px] md:rounded-[20px] px-4 py-4 md:px-5 md:py-4 text-xs md:text-sm min-h-[60px] md:min-h-[80px] focus:ring-4 focus:ring-fuchsia-500/10 focus:border-fuchsia-500 outline-none transition-all resize-none leading-relaxed mb-6" />

              {/* Type-nivå-avgrensninger */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
                    {lang === 'no' ? 'Avgrensninger på typen' : 'Type-level constraints'}
                  </label>
                  <span className="text-[9px] text-fuchsia-500 font-bold bg-fuchsia-50 px-2 py-0.5 rounded-full">
                    {lang === 'no' ? 'Arves av felt som bruker denne typen' : 'Inherited by fields using this type'}
                  </span>
                </div>
                <ConstraintsEditor
                  prop={{
                    id: activeSharedType.id,
                    name: activeSharedType.name,
                    title: '',
                    description: '',
                    multiplicity: '0..1',
                    fieldType: { kind: 'primitive', baseType: 'string' },
                    constraints: activeSharedType.constraints,
                  }}
                  onUpdate={(updatedProp) => onUpdateSharedType({ constraints: updatedProp.constraints })}
                  t={t}
                  hideMultiplicity={true}
                />
              </div>

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
                      allLayersFull={allLayersFull}
                      sharedTypes={sharedTypes.filter(st => st.id !== activeSharedType.id)}
                      isSharedType={true}
                    />
                  ))}
                  <button onClick={onAddProperty} className="w-full py-6 md:py-8 border-2 border-dashed border-slate-200 rounded-[18px] md:rounded-[24px] text-slate-400 font-black text-[10px] uppercase tracking-[0.2em] hover:border-fuchsia-300 hover:text-fuchsia-600 hover:bg-fuchsia-50/50 transition-all flex items-center justify-center gap-3 active:scale-[0.99]"><Plus size={18} />{t.addProperty}</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ---- ENUMS TAB ---- */}
      {subTab === 'enums' && (
        <>
          <div className="flex items-center justify-between mb-4 px-2">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              {lang === 'no' ? 'Delte kodelister' : 'Shared Codelists'}
            </h3>
            <button onClick={onAddSharedEnum} className="text-xs font-black text-amber-600 hover:underline flex items-center gap-1.5 shrink-0">
              <Plus size={14} /> {lang === 'no' ? 'Ny kodeliste' : 'New codelist'}
            </button>
          </div>

          <div className="flex flex-wrap gap-2 md:gap-3 px-1 pb-4">
            {sharedEnums.map(se => (
              <button
                key={se.id}
                onClick={() => onSelectSharedEnum(se.id)}
                className={`px-4 py-3 md:px-6 md:py-3.5 rounded-[16px] md:rounded-[20px] text-xs md:text-sm font-black transition-all border flex items-center gap-2 md:gap-3 whitespace-nowrap shrink-0
                  ${activeSharedEnumId === se.id ? 'bg-amber-500 border-amber-500 text-white shadow-xl shadow-amber-200' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:shadow-md'}`}
              >
                <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                  <Hash size={14} className={activeSharedEnumId === se.id ? 'text-white' : 'text-slate-400'} />
                </div>
                {se.name || (lang === 'no' ? 'Uten navn' : 'Untitled')}
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${activeSharedEnumId === se.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'}`}>{se.values.length}</span>
              </button>
            ))}
            {sharedEnums.length === 0 && (
              <div className="text-xs text-slate-400 italic py-3 px-4">
                {lang === 'no' ? 'Ingen delte kodelister opprettet ennå.' : 'No shared codelists yet.'}
              </div>
            )}
          </div>

          {activeSharedEnum && (
            <div className="bg-white rounded-[24px] md:rounded-[32px] border border-slate-200 shadow-sm p-4 sm:p-6 md:p-8">
              <div className="flex items-center justify-between mb-5 md:mb-6">
                <div className="flex-1 relative">
                  <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 block mb-2">
                    {lang === 'no' ? 'Navn på kodeliste' : 'Codelist name'}
                  </label>
                  <input
                    type="text"
                    value={activeSharedEnum.name}
                    onChange={e => onUpdateSharedEnum({ name: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-slate-100 hover:border-amber-200 text-lg sm:text-xl md:text-2xl font-black px-4 py-3 rounded-2xl focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/5 outline-none placeholder:text-slate-200 transition-all"
                    placeholder={lang === 'no' ? 'f.eks. Status' : 'e.g. Status'}
                  />
                </div>
                <button onClick={() => onDeleteSharedEnum(activeSharedEnum.id)} className="ml-3 sm:ml-4 p-3 rounded-xl text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-all self-end"><Trash2 size={20} /></button>
              </div>

              <textarea
                placeholder={lang === 'no' ? 'Beskrivelse...' : 'Description...'}
                value={activeSharedEnum.description}
                onChange={e => onUpdateSharedEnum({ description: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-[18px] px-4 py-4 text-xs md:text-sm min-h-[60px] focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all resize-none leading-relaxed mb-6"
              />

              {/* Enum values */}
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-2 px-1">
                  <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
                    {lang === 'no' ? 'Verdier' : 'Values'} ({activeSharedEnum.values.length})
                  </label>
                  <button onClick={onAddEnumValue} className="text-[10px] font-black text-amber-600 hover:underline flex items-center gap-1">
                    <Plus size={12} /> {lang === 'no' ? 'Legg til' : 'Add value'}
                  </button>
                </div>

                <div className="grid grid-cols-[80px_1fr_40px] gap-2 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
                  <span>{lang === 'no' ? 'Kode' : 'Code'}</span>
                  <span>{lang === 'no' ? 'Navn' : 'Label'}</span>
                  <span></span>
                </div>

                {activeSharedEnum.values.map(v => (
                  <div key={v.id} className="grid grid-cols-[80px_1fr_40px] items-center gap-2 bg-amber-50/40 border border-amber-100 rounded-xl p-2">
                    <input
                      value={v.code}
                      onChange={e => onUpdateEnumValue({ ...v, code: e.target.value })}
                      placeholder="ID"
                      className="w-full bg-white border-transparent rounded-lg px-2.5 py-2 text-xs font-mono outline-none focus:bg-white focus:border-amber-200 border h-9"
                    />
                    <input
                      value={v.label}
                      onChange={e => onUpdateEnumValue({ ...v, label: e.target.value })}
                      placeholder={lang === 'no' ? 'Navn' : 'Label'}
                      className="w-full bg-white border-transparent rounded-lg px-2.5 py-2 text-xs font-bold outline-none focus:bg-white focus:border-amber-200 border h-9"
                    />
                    <button onClick={() => onDeleteEnumValue(v.id)} className="p-2 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors flex items-center justify-center">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}

                {activeSharedEnum.values.length === 0 && (
                  <div className="py-10 text-center text-slate-300 italic text-[10px] uppercase tracking-widest font-black border-2 border-dashed border-slate-100 rounded-2xl">
                    {lang === 'no' ? 'Ingen verdier ennå' : 'No values yet'}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default SharedTypesTab;
