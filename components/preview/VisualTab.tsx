import React, { useState } from 'react';
import type { Translations } from '../../i18n/index';
import { DataModel } from '../../types';
import ERDiagram from '../ERDiagram';
import DataCard from '../DataCard';

interface VisualTabProps {
  model: DataModel;
  t: Translations;
}

const VisualTab: React.FC<VisualTabProps> = ({ model, t }) => {
  const [vizMode, setVizMode] = useState<'card' | 'diagram'>('card');

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-300 min-w-0">
      <div className="flex bg-white p-1 rounded-xl md:rounded-2xl border border-slate-200 w-fit shadow-sm mx-auto sm:mx-0">
        <button onClick={() => setVizMode('card')} className={`px-4 md:px-5 py-2 text-[10px] md:text-xs font-black uppercase tracking-widest rounded-lg md:rounded-xl transition-all ${vizMode === 'card' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>{t.viewCard}</button>
        <button onClick={() => setVizMode('diagram')} className={`px-4 md:px-5 py-2 text-[10px] md:text-xs font-black uppercase tracking-widest rounded-lg md:rounded-xl transition-all ${vizMode === 'diagram' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>{t.viewDiagram}</button>
      </div>
      <div className="min-h-[300px]">
        {vizMode === 'diagram' ? <ERDiagram model={model} t={t} /> : <DataCard model={model} t={t} />}
      </div>
    </div>
  );
};

export default VisualTab;
