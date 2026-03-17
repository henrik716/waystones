import React from 'react';
import type { Translations } from '../../i18n/index';
import { Database, Zap, Package, Cloud, DatabaseZap } from 'lucide-react';
import { SourceType } from '../../types';

interface SourceTypePickerProps {
  sourceType: SourceType | null;
  onSelect: (type: SourceType) => void;
  t: Translations;
}

const SOURCE_META: Record<SourceType, { icon: React.ReactNode; colorClass: string }> = {
  postgis: {
    icon: <Database size={24} />,
    colorClass: 'bg-blue-50 text-blue-600 border-blue-100',
  },
  supabase: {
    icon: <Zap size={24} />,
    colorClass: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  },
  databricks: {
    icon: <DatabaseZap size={24} />,
    colorClass: 'bg-[#fff1f0] text-[#ff3621] border-[#ffccc7]',
  },
  geopackage: {
    icon: <Package size={24} />,
    colorClass: 'bg-amber-50 text-amber-600 border-amber-100',
  }
};

const sourceTypes: SourceType[] = ['postgis', 'supabase', 'geopackage'];

const SourceTypePicker: React.FC<SourceTypePickerProps> = ({ sourceType, onSelect, t }) => {
  const d = t.deploy;

  return (
    <section className="bg-white p-6 md:p-10 rounded-[32px] border border-slate-200 shadow-sm space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-6">
        <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center text-violet-600 border border-violet-100 shrink-0"><Cloud size={28} /></div>
        <div>
          <h3 className="text-lg md:text-xl font-black text-slate-800 tracking-tight leading-none mb-1">{d.sourceTitle}</h3>
          <p className="text-xs text-slate-500 font-medium">{d.subtitle}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
        {sourceTypes.map(type => {
          const meta = SOURCE_META[type];
          return (
            <button
              key={type}
              onClick={() => { onSelect(type); }}
              className={`w-full overflow-hidden text-left p-5 sm:p-6 rounded-[24px] border-2 transition-all flex flex-col gap-4 active:scale-95 group hover:scale-[1.02] ${sourceType === type ? 'border-violet-400 bg-violet-50 shadow-xl' : 'border-slate-100 bg-white shadow-sm'
                }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shrink-0 transition-transform group-hover:rotate-3 ${meta.colorClass}`}>
                {meta.icon}
              </div>
              <div className="min-w-0 w-full">
                <h3 className="text-[10px] sm:text-xs font-black text-slate-800 uppercase tracking-widest mb-1">{d.sources[type] || type}</h3>
                <p className="text-[10px] text-slate-500 font-medium leading-tight">{d.sources[`${type}Desc`] || `Connect to ${type}`}</p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default SourceTypePicker;
export { SOURCE_META };
