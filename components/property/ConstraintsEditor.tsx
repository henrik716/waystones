import React, { useState } from 'react';
import type { Translations } from '../../i18n/index';
import { ChevronDown, ChevronUp, ShieldCheck, X, Plus } from 'lucide-react';
import { Field, PropertyConstraints } from '../../types';

interface ConstraintsEditorProps {
  prop: Field;
  onUpdate: (prop: Field) => void;
  t: Translations;
  isSharedType?: boolean; // True when editing properties of a SharedType
  hideMultiplicity?: boolean; // True when editing type-level constraints (multiplicity doesn't apply)
}

const ConstraintsEditor: React.FC<ConstraintsEditorProps> = ({ prop, onUpdate, t, isSharedType = false, hideMultiplicity = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [enumInputValue, setEnumInputValue] = useState('');

  const c = prop.constraints || {};
  const hasActiveConstraints = prop.multiplicity !== '0..1' || Object.keys(c).some(k => {
    const val = c[k as keyof PropertyConstraints];
    return val !== undefined && val !== '' && val !== false && (!Array.isArray(val) || val.length > 0);
  });

  const handleUpdate = (updates: Partial<Field>) => {
    onUpdate({ ...prop, ...updates });
  };

  const handleConstraintUpdate = (updates: Partial<PropertyConstraints>) => {
    handleUpdate({
      constraints: { ...(prop.constraints || {}), ...updates }
    });
  };

  const handleAddEnum = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    const currentEnum = prop.constraints?.enumeration || [];
    if (!currentEnum.includes(trimmed)) {
      handleConstraintUpdate({ enumeration: [...currentEnum, trimmed] });
    }
    setEnumInputValue('');
  };

  const handleRemoveEnum = (val: string) => {
    const currentEnum = prop.constraints?.enumeration || [];
    handleConstraintUpdate({ enumeration: currentEnum.filter(v => v !== val) });
  };

  const handleEnumKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddEnum(enumInputValue);
    }
  };

  const ft = prop.fieldType;
  const isNumeric = ft.kind === 'primitive' && (ft.baseType === 'number' || ft.baseType === 'integer');
  const isString = ft.kind === 'primitive' && ft.baseType === 'string' || ft.kind === 'codelist';

  return (
    <div className="space-y-2 pt-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center gap-3 text-[10px] font-black uppercase tracking-widest transition-colors py-4 px-5 rounded-xl border ${isOpen ? 'text-emerald-700 bg-emerald-50 border-emerald-100 shadow-sm' : 'text-slate-500 bg-white border-slate-100 hover:border-emerald-200'}`}
      >
        <ShieldCheck size={16} className={hasActiveConstraints ? "text-emerald-600" : "text-slate-300"} />
        {t.constraints.title}
        <div className="ml-auto flex items-center gap-2">
          {hasActiveConstraints && !isOpen && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {isOpen && (
        <div className="bg-slate-50 p-5 rounded-xl border border-emerald-100 space-y-6 animate-in slide-in-from-top-1 duration-200">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-5">
            {/* Multiplicity — hidden for type-level constraints */}
            {!hideMultiplicity && (
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase block mb-1.5">
                  {t.constraints.multiplicity}
                </label>
                <div className="inline-flex bg-slate-200/60 p-1 rounded-lg">
                  {(['1..1', '0..1', '1..*', '0..*'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => handleUpdate({ multiplicity: m })}
                      className={`px-3 py-1.5 rounded-md text-[10px] font-bold font-mono transition-all ${prop.multiplicity === m ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Checkboxes */}
            {ft.kind !== 'datatype-inline' && ft.kind !== 'datatype-ref' && (
              <div className="flex items-center gap-5 pb-1.5">
                {!isSharedType && (
                  <label className="flex items-center gap-2 cursor-pointer select-none group">
                    <input type="checkbox" checked={!!c.isPrimaryKey} onChange={e => handleConstraintUpdate({ isPrimaryKey: e.target.checked })} className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 accent-emerald-600 cursor-pointer" />
                    <span className="text-[10px] font-black text-slate-600 uppercase group-hover:text-emerald-700 transition-colors">{t.constraints.primaryKey}</span>
                  </label>
                )}
                <label className="flex items-center gap-2 cursor-pointer select-none group">
                  <input type="checkbox" checked={!!c.isUnique} onChange={e => handleConstraintUpdate({ isUnique: e.target.checked })} className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 accent-emerald-600 cursor-pointer" />
                  <span className="text-[10px] font-black text-slate-600 uppercase group-hover:text-emerald-700 transition-colors">{t.constraints.unique}</span>
                </label>
              </div>
            )}
          </div>

            {(isNumeric || isString) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-4 border-t border-emerald-100/50">
                {isNumeric && (
                  <>
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase block mb-1.5">{t.constraints.min}</label>
                      <input type="number" value={c.min ?? ''} onChange={e => handleConstraintUpdate({ min: e.target.value ? Number(e.target.value) : undefined })} className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-emerald-500 transition-all h-11" />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase block mb-1.5">{t.constraints.max}</label>
                      <input type="number" value={c.max ?? ''} onChange={e => handleConstraintUpdate({ max: e.target.value ? Number(e.target.value) : undefined })} className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-emerald-500 transition-all h-11" />
                    </div>
                  </>
                )}
                {isString && (
                  <>
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase block mb-1.5">{t.constraints.minLength}</label>
                      <input type="number" min="0" value={c.minLength ?? ''} onChange={e => handleConstraintUpdate({ minLength: e.target.value ? Number(e.target.value) : undefined })} className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-emerald-500 transition-all h-11" />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase block mb-1.5">{t.constraints.maxLength}</label>
                      <input type="number" min="0" value={c.maxLength ?? ''} onChange={e => handleConstraintUpdate({ maxLength: e.target.value ? Number(e.target.value) : undefined })} className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-emerald-500 transition-all h-11" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase block mb-1.5">{t.constraints.pattern}</label>
                      <input type="text" placeholder={t.constraints.patternPlaceholder} value={c.pattern ?? ''} onChange={e => handleConstraintUpdate({ pattern: e.target.value || undefined })} className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 text-sm font-mono outline-none focus:border-emerald-500 transition-all h-11" />
                    </div>
                    <div className="sm:col-span-2 space-y-4 pt-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">{t.constraints.enumeration}</label>
                      <div className="flex flex-wrap gap-2.5">
                        {c.enumeration?.map((val) => (
                          <span key={val} className="inline-flex items-center gap-2 bg-emerald-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-sm animate-in zoom-in-95 duration-150">
                            {val}
                            <button onClick={() => handleRemoveEnum(val)} className="text-emerald-200 hover:text-white transition-colors p-0.5">
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder={t.constraints.enumPlaceholder}
                          value={enumInputValue}
                          onKeyDown={handleEnumKeyDown}
                          onChange={e => setEnumInputValue(e.target.value)}
                          className="flex-1 bg-white border border-slate-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-emerald-500 transition-all h-12"
                        />
                        <button onClick={() => handleAddEnum(enumInputValue)} className="w-12 h-12 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shrink-0 flex items-center justify-center">
                          <Plus size={20} />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
        </div>
      )}
    </div>
  );
};

export default ConstraintsEditor;
