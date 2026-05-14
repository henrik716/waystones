import React from 'react';
import type { Translations } from '../../i18n/index';
import { Database, Zap, Package, Cloud, HardDrive } from 'lucide-react';
import { SourceType } from '../../types';
import { SERVICE_ICONS } from '../../constants';

interface SourceTypePickerProps {
  sourceType: SourceType | null;
  s3Enabled?: boolean;
  onSelect: (type: SourceType, enableS3?: boolean) => void;
  idPrefix?: string;
  t: Translations;
}

type UiSourceKey = 'postgis' | 'supabase' | 'geopackage-local' | 'geopackage-s3';

const UI_SOURCE_META: Record<UiSourceKey, {
  icon: React.ReactNode;
  colorClass: string;
  sourceType: SourceType;
  enableS3: boolean;
}> = {
  postgis: {
    icon: <Database size={24} />,
    colorClass: 'bg-blue-50 text-blue-600 border-blue-100',
    sourceType: 'postgis',
    enableS3: false,
  },
  supabase: {
    icon: <Zap size={24} />,
    colorClass: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    sourceType: 'supabase',
    enableS3: false,
  },
  'geopackage-local': {
    icon: <HardDrive size={24} />,
    colorClass: 'bg-amber-50 text-amber-600 border-amber-100',
    sourceType: 'geopackage',
    enableS3: false,
  },
  'geopackage-s3': {
    icon: <Cloud size={24} />,
    colorClass: 'bg-violet-50 text-violet-600 border-violet-100',
    sourceType: 'geopackage',
    enableS3: true,
  },
};

const UI_SOURCE_ORDER: UiSourceKey[] = ['postgis', 'supabase', 'geopackage-local', 'geopackage-s3'];

// Map back to a UI key for highlighting the active card
function toUiKey(sourceType: SourceType | null, s3Enabled?: boolean): UiSourceKey | null {
  if (!sourceType) return null;
  if (sourceType === 'geopackage') return s3Enabled ? 'geopackage-s3' : 'geopackage-local';
  if (sourceType === 'postgis') return 'postgis';
  if (sourceType === 'supabase') return 'supabase';
  return null;
}

// Export for backward compat (ConnectionForm imports SOURCE_META for icons)
export const SOURCE_META: Record<string, { icon: React.ReactNode; colorClass: string }> = {
  postgis: UI_SOURCE_META.postgis,
  supabase: UI_SOURCE_META.supabase,
  geopackage: UI_SOURCE_META['geopackage-local'],
};

const SourceTypePicker: React.FC<SourceTypePickerProps> = ({
  sourceType, s3Enabled, onSelect, idPrefix = 'dp', t,
}) => {
  const d = t.deploy;
  const activeKey = toUiKey(sourceType, s3Enabled);

  const labelKey: Record<UiSourceKey, string> = {
    postgis: 'postgis',
    supabase: 'supabase',
    'geopackage-local': 'geopackageLocal',
    'geopackage-s3': 'geopackageS3',
  };

  return (
    <section className="bg-white p-6 md:p-10 rounded-[32px] border border-slate-200 shadow-sm space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-6">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 border border-amber-100 shrink-0">
          <SERVICE_ICONS.Storage size={28} />
        </div>
        <div>
          <h3 className="text-lg md:text-xl font-black text-slate-800 tracking-tight leading-none mb-1">{d.sourceTitle}</h3>
          <p className="text-xs text-slate-500 font-medium">{d.subtitle}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {UI_SOURCE_ORDER.map(key => {
          const meta = UI_SOURCE_META[key];
          const lk = labelKey[key];
          const isActive = activeKey === key;
          return (
            <button
              key={key}
              id={`${idPrefix}-source-type-${key}`}
              onClick={() => onSelect(meta.sourceType, meta.enableS3 || undefined)}
              className={`w-full overflow-hidden text-left p-5 sm:p-6 rounded-[24px] border-2 transition-all flex flex-col gap-4 active:scale-95 group hover:scale-[1.02] ${
                isActive ? 'border-violet-400 bg-violet-50 shadow-xl' : 'border-slate-100 bg-white shadow-sm'
              }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shrink-0 transition-transform group-hover:rotate-3 ${meta.colorClass}`}>
                {meta.icon}
              </div>
              <div className="min-w-0 w-full">
                <h3 className="text-[10px] sm:text-xs font-black text-slate-800 uppercase tracking-widest mb-1">
                  {d.sources?.[lk] || d.sources?.[meta.sourceType] || key}
                </h3>
                <p className="text-[10px] text-slate-500 font-medium leading-tight">
                  {d.sources?.[`${lk}Desc`] || d.sources?.[`${meta.sourceType}Desc`] || ''}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default SourceTypePicker;
