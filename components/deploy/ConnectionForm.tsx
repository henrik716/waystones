import React, { useState, useId, useRef } from 'react';
import type { Translations } from '../../i18n/index';
import { Eye, EyeOff, Check, Upload, X } from 'lucide-react';
import {
  SourceType, PostgresConfig, SupabaseConfig, DatabricksConfig, GeopackageConfig
} from '../../types';
import { SOURCE_META } from './SourceTypePicker';

// ============================================================
// Reusable Field Component
// ============================================================
const Field: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  type?: 'text' | 'password';
}> = ({ label, value, onChange, placeholder, hint, type = 'text' }) => {
  const [visible, setVisible] = useState(false);
  const inputId = useId();
  const isPassword = type === 'password';

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1 cursor-pointer">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type={isPassword && !visible ? 'password' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-xs font-bold text-slate-800 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all"
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
      {hint && <p className="text-[10px] text-slate-400 font-medium px-1 leading-relaxed">{hint}</p>}
    </div>
  );
};

export { Field };

interface ConnectionFormProps {
  sourceType: SourceType;
  pgConfig: PostgresConfig;
  supaConfig: SupabaseConfig;
  dbConfig: DatabricksConfig;
  gpkgConfig: GeopackageConfig;
  onPgChange: (config: PostgresConfig) => void;
  onSupaChange: (config: SupabaseConfig) => void;
  onDbChange: (config: DatabricksConfig) => void;
  onGpkgChange: (config: GeopackageConfig) => void;
  localDataFile: { blob: Blob; filename: string } | null;
  onLocalDataFileChange: (file: { blob: Blob; filename: string } | null) => void;
  onIncludeDataChange: (include: boolean) => void;
  isConnectionValid: boolean;
  onBack: () => void;
  onNext: () => void;
  t: Translations;
}

const ConnectionForm: React.FC<ConnectionFormProps> = ({
  sourceType,
  pgConfig, supaConfig, dbConfig, gpkgConfig,
  onPgChange, onSupaChange, onDbChange, onGpkgChange,
  localDataFile, onLocalDataFileChange, onIncludeDataChange,
  isConnectionValid,
  onBack, onNext,
  t,
}) => {
  const d = t.deploy;
  const gpkgFileInputRef = useRef<HTMLInputElement>(null);

  return (
    <section className="bg-white p-6 md:p-10 rounded-[32px] border border-slate-200 shadow-sm space-y-8 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-6">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border shrink-0 ${SOURCE_META[sourceType].colorClass}`}>
          {SOURCE_META[sourceType].icon}
        </div>
        <div>
          <h3 className="text-lg md:text-xl font-black text-slate-800 tracking-tight leading-none mb-1">{d.connectionTitle}</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{d.sources[sourceType] || sourceType}</p>
        </div>
      </div>
      <div className="p-8 bg-slate-50 rounded-[24px] border border-slate-100 space-y-6">
        {sourceType === 'postgis' && (
          <React.Fragment>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="sm:col-span-2"><Field label={d.fields.host} value={pgConfig.host} onChange={v => onPgChange({ ...pgConfig, host: v })} placeholder="localhost" /></div>
              <Field label={d.fields.port} value={pgConfig.port} onChange={v => onPgChange({ ...pgConfig, port: v })} placeholder="5432" />
            </div>
            <Field label={d.fields.database} value={pgConfig.dbname} onChange={v => onPgChange({ ...pgConfig, dbname: v })} placeholder="geodata" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <Field label={d.fields?.user} value={pgConfig.user} onChange={v => onPgChange({ ...pgConfig, user: v })} placeholder="postgres" />
              <Field label={d.fields?.password} value={pgConfig.password} onChange={v => onPgChange({ ...pgConfig, password: v })} type="password" />
            </div>
            <Field label={d.fields.schema} value={pgConfig.schema} onChange={v => onPgChange({ ...pgConfig, schema: v })} placeholder="public" />
          </React.Fragment>
        )}
        {sourceType === 'supabase' && (
          <React.Fragment>
            <Field label={d.fields.projectUrl} value={supaConfig.projectUrl} onChange={v => onSupaChange({ ...supaConfig, projectUrl: v })} placeholder="https://abcdef.supabase.co" hint={d.supabaseHint} />
            <Field label={d.fields.anonKey} value={supaConfig.anonKey} onChange={v => onSupaChange({ ...supaConfig, anonKey: v })} type="password" />
            <Field label={d.fields.schema} value={supaConfig.schema} onChange={v => onSupaChange({ ...supaConfig, schema: v })} placeholder="public" />
          </React.Fragment>
        )}
        {sourceType === 'databricks' && (
          <React.Fragment>
            <Field label={d.fields.serverHostname} value={dbConfig.host} onChange={v => onDbChange({ ...dbConfig, host: v })} />
            <Field label={d.fields.httpPath} value={dbConfig.httpPath} onChange={v => onDbChange({ ...dbConfig, httpPath: v })} />
            <Field label={d.fields.accessToken} value={dbConfig.token} onChange={v => onDbChange({ ...dbConfig, token: v })} type="password" />
            <div className="grid grid-cols-2 gap-6">
              <Field label={d.fields.catalog} value={dbConfig.catalog} onChange={v => onDbChange({ ...dbConfig, catalog: v })} />
              <Field label={d.fields.schema} value={dbConfig.schema} onChange={v => onDbChange({ ...dbConfig, schema: v })} />
            </div>
          </React.Fragment>
        )}
        {sourceType === 'geopackage' && (
          <React.Fragment>
            <Field
              label={d.gpkgFilename}
              value={gpkgConfig.filename}
              onChange={v => onGpkgChange({ ...gpkgConfig, filename: v })}
              hint={d.gpkgHint}
            />
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">{d.includeDataFile}</label>
              <input type="file" ref={gpkgFileInputRef} className="hidden" accept=".gpkg,.sqlite" onChange={e => {
                const f = e.target.files?.[0];
                if (f) {
                  onLocalDataFileChange({ blob: f, filename: f.name });
                  onGpkgChange({ ...gpkgConfig, filename: f.name });
                  onIncludeDataChange(true);
                }
              }} />
              {localDataFile ? (
                <div className="flex items-center gap-3 bg-indigo-50 text-indigo-700 px-5 py-3 rounded-2xl border border-indigo-200">
                  <Check size={16} strokeWidth={3} />
                  <span className="text-xs font-black truncate flex-1">{localDataFile.filename}</span>
                  <span className="text-[10px] font-bold text-indigo-500">{localDataFile.blob.size < 1024 * 1024 ? `${(localDataFile.blob.size / 1024).toFixed(1)} KB` : `${(localDataFile.blob.size / (1024 * 1024)).toFixed(1)} MB`}</span>
                  <button onClick={() => { onLocalDataFileChange(null); onIncludeDataChange(false); }} className="text-indigo-400 hover:text-rose-500 transition-colors"><X size={16}/></button>
                </div>
              ) : (
                <button
                  onClick={() => gpkgFileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-3 px-5 py-4 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-indigo-300 hover:text-indigo-500 transition-all text-xs font-bold"
                >
                  <Upload size={16} /> {d.includeDataUpload}
                </button>
              )}
            </div>
          </React.Fragment>
        )}
      </div>
      <div className="flex items-center justify-between pt-4">
        <button onClick={onBack} className="px-6 py-3 rounded-2xl border-2 border-slate-200 bg-white text-slate-500 font-black text-xs uppercase tracking-widest active:scale-95 transition-all hover:bg-slate-50">{d.back}</button>
        <button onClick={onNext} disabled={!isConnectionValid} className="px-8 py-3.5 rounded-2xl bg-indigo-600 text-white font-black text-xs uppercase tracking-widest disabled:opacity-50 shadow-lg active:scale-95 transition-all hover:bg-indigo-700">{d.next}</button>
      </div>
    </section>
  );
};

export default ConnectionForm;
