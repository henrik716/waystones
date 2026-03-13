import React, { useState } from 'react';
import { Trash2, Plus, MessageSquare } from 'lucide-react';
import { Field, CodeValue, SharedEnum, CodelistFieldType } from '../../types';
import { createEmptyCodeValue } from '../../constants';

interface PropDiffFieldProps {
  label: string;
  currentValue: any;
  baselineValue: any;
  reviewMode: boolean;
  children: React.ReactNode;
}

const PropDiffField: React.FC<PropDiffFieldProps> = ({ label, currentValue, baselineValue, reviewMode, children }) => {
  const isChanged = reviewMode && baselineValue !== undefined && baselineValue !== null && currentValue !== baselineValue;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">{label}</label>
        {isChanged && (
          <span className="text-[9px] text-rose-500 line-through font-bold">
            {String(baselineValue)}
          </span>
        )}
      </div>
      <div className={`transition-all ${isChanged ? 'ring-2 ring-amber-400 bg-amber-50 rounded-xl overflow-hidden' : ''}`}>
        {children}
      </div>
    </div>
  );
};

interface CodelistEditorProps {
  prop: Field;
  baselineProp?: Field | null;
  onUpdate: (prop: Field) => void;
  isGhost?: boolean;
  reviewMode?: boolean;
  sharedEnums?: SharedEnum[];
  t: any;
  lang?: string;
}

const CodelistEditor: React.FC<CodelistEditorProps> = ({ prop, baselineProp, onUpdate, isGhost, reviewMode, sharedEnums = [], t, lang = 'no' }) => {
  const [expandedDescs, setExpandedDescs] = useState<Record<string, boolean>>({});

  // Safe access to codelist-specific fields
  const ft = prop.fieldType as CodelistFieldType;
  const mode = ft.mode;
  const values = mode === 'inline' ? ft.values : [];
  const enumRef = mode === 'shared' ? ft.enumRef : undefined;
  const externalUrl = mode === 'external' ? ft.url : undefined;

  const baselineFt = baselineProp?.fieldType.kind === 'codelist' ? baselineProp.fieldType as CodelistFieldType : null;
  const baselineMode = baselineFt?.mode;

  const handleUpdate = (updates: Partial<Field>) => {
    onUpdate({ ...prop, ...updates });
  };

  const handleModeChange = (newMode: 'inline' | 'external' | 'shared') => {
    switch (newMode) {
      case 'inline':
        handleUpdate({ fieldType: { kind: 'codelist', mode: 'inline', values: [] } });
        break;
      case 'external':
        handleUpdate({ fieldType: { kind: 'codelist', mode: 'external', url: '' } });
        break;
      case 'shared':
        handleUpdate({ fieldType: { kind: 'codelist', mode: 'shared', enumRef: '' } });
        break;
    }
  };

  const handleAddCodeValue = () => {
    if (mode !== 'inline') return;
    const newValue = createEmptyCodeValue();
    handleUpdate({ fieldType: { kind: 'codelist', mode: 'inline', values: [...values, newValue] } });
  };

  const handleUpdateCodeValue = (updated: CodeValue) => {
    if (mode !== 'inline') return;
    handleUpdate({ fieldType: { kind: 'codelist', mode: 'inline', values: values.map(v => v.id === updated.id ? updated : v) } });
  };

  const handleDeleteCodeValue = (id: string) => {
    if (mode !== 'inline') return;
    handleUpdate({ fieldType: { kind: 'codelist', mode: 'inline', values: values.filter(v => v.id !== id) } });
  };

  const toggleDesc = (id: string) => {
    setExpandedDescs(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 pb-4 border-b border-slate-200/50">
        <div className="flex flex-wrap items-center gap-6">
          <PropDiffField label={t.propCodelistMode} currentValue={mode} baselineValue={baselineMode} reviewMode={!!reviewMode}>
            <div className="flex items-center gap-6 flex-wrap">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="radio" name={`mode-${prop.id}`} checked={mode === 'inline'} onChange={() => handleModeChange('inline')} className="w-6 h-6 accent-indigo-600" />
                <span className="text-[10px] font-black text-slate-600 uppercase tracking-wide">{t.propCodelistModeInline}</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="radio" name={`mode-${prop.id}`} checked={mode === 'external'} onChange={() => handleModeChange('external')} className="w-6 h-6 accent-indigo-600" />
                <span className="text-[10px] font-black text-slate-600 uppercase tracking-wide">{t.propCodelistModeExternal}</span>
              </label>
              {sharedEnums.length > 0 && (
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="radio" name={`mode-${prop.id}`} checked={mode === 'shared'} onChange={() => handleModeChange('shared')} className="w-6 h-6 accent-amber-500" />
                  <span className="text-[10px] font-black text-amber-600 uppercase tracking-wide">{lang === 'no' ? 'Delt kodeliste' : 'Shared'}</span>
                </label>
              )}
            </div>
          </PropDiffField>
        </div>
        {mode === 'inline' && !isGhost && (
          <button onClick={handleAddCodeValue} className="text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:text-white hover:bg-indigo-600 transition-all bg-indigo-50 px-5 py-3 rounded-xl border border-indigo-100 flex items-center justify-center gap-2">
            <Plus size={16} /> {t.addValue}
          </button>
        )}
      </div>

      {/* Shared mode: enum picker */}
      {mode === 'shared' && (
        <div className="space-y-3">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">
            {lang === 'no' ? 'Delt kodeliste' : 'Shared Codelist'}
          </label>
          <select
            value={enumRef ?? ''}
            onChange={e => handleUpdate({ fieldType: { kind: 'codelist', mode: 'shared', enumRef: e.target.value || '' } })}
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-400 transition-all"
          >
            <option value="">{lang === 'no' ? '— Velg kodeliste —' : '— Select codelist —'}</option>
            {sharedEnums.map(se => (
              <option key={se.id} value={se.id}>{se.name} ({se.values.length} {lang === 'no' ? 'verdier' : 'values'})</option>
            ))}
          </select>
          {enumRef && (() => {
            const se = sharedEnums.find(e => e.id === enumRef);
            if (!se || se.values.length === 0) return null;
            return (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {se.values.map(v => (
                  <span key={v.id} className="text-[9px] font-black font-mono bg-amber-50 border border-amber-200 text-amber-700 px-2 py-1 rounded-lg">{v.code}</span>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* External mode: URL input */}
      {mode === 'external' && (
        <PropDiffField label={t.propCodelistUrl} currentValue={externalUrl} baselineValue={baselineFt?.mode === 'external' ? baselineFt.url : undefined} reviewMode={!!reviewMode}>
          <input type="text" placeholder={t.propCodelistUrlPlaceholder} value={externalUrl || ''} onChange={e => handleUpdate({ fieldType: { kind: 'codelist', mode: 'external', url: e.target.value } })} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-xs focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all h-12" />
        </PropDiffField>
      )}

      {/* Inline mode: value grid */}
      {mode === 'inline' && (
        <div className="space-y-3">
          <div className="grid grid-cols-[80px_1fr_90px] gap-2 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
            <span>{t.codeKey}</span>
            <span>{t.codeLabel}</span>
            <span className="text-right"></span>
          </div>
          <div className="space-y-3">
            {values.map((v) => {
              const isExpanded = expandedDescs[v.id];
              const baselineValues = baselineFt?.mode === 'inline' ? baselineFt.values : [];
              const baselineVal = baselineValues.find(bv => bv.id === v.id);
              return (
                <div key={v.id} className="bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm transition-all hover:border-indigo-200">
                  <div className="grid grid-cols-[80px_1fr_90px] items-center gap-2 p-2">
                    <PropDiffField label="" currentValue={v.code} baselineValue={baselineVal?.code} reviewMode={!!reviewMode}>
                      <input placeholder="ID" value={v.code} onChange={e => handleUpdateCodeValue({ ...v, code: e.target.value })} className="w-full bg-slate-50 border-transparent rounded-lg px-2.5 py-2.5 text-xs font-mono outline-none focus:bg-white focus:border-indigo-100 border h-10" />
                    </PropDiffField>
                    <PropDiffField label="" currentValue={v.label} baselineValue={baselineVal?.label} reviewMode={!!reviewMode}>
                      <input placeholder="Navn" value={v.label} onChange={e => handleUpdateCodeValue({ ...v, label: e.target.value })} className="w-full bg-slate-50 border-transparent rounded-lg px-2.5 py-2.5 text-xs font-bold outline-none focus:bg-white focus:border-indigo-100 border h-10" />
                    </PropDiffField>
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => toggleDesc(v.id)} className={`p-2.5 rounded-lg transition-colors ${v.description ? 'text-blue-500 bg-blue-50' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-50'}`} title={t.codeDescription}>
                        <MessageSquare size={18} />
                      </button>
                      {!isGhost && <button onClick={() => handleDeleteCodeValue(v.id)} className="p-2.5 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors"><Trash2 size={18} /></button>}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-slate-50 bg-slate-50/30 animate-in slide-in-from-top-1">
                      <PropDiffField label={t.codeDescription} currentValue={v.description} baselineValue={baselineVal?.description} reviewMode={!!reviewMode}>
                        <textarea placeholder="..." value={v.description} onChange={e => handleUpdateCodeValue({ ...v, description: e.target.value })} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-[11px] min-h-[70px] resize-none outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/5 transition-all" />
                      </PropDiffField>
                    </div>
                  )}
                </div>
              );
            })}
            {values.length === 0 && (
              <div className="py-12 text-center text-slate-300 italic text-[10px] uppercase tracking-widest font-black border-2 border-dashed border-slate-100 rounded-2xl">
                Ingen verdier lagt til ennå.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CodelistEditor;
