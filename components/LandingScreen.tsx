import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useAmbient } from '../contexts/AmbientContext';
import type { Translations } from '../i18n/index';
import { Upload, PenTool, Github, Plus, ArrowRight, Database, Loader2, Layers, Globe, Server, Cloud, Zap, GitBranch, Code2, Rocket, CloudUpload, Package, Map, Search } from 'lucide-react';
import { DataModel } from '../types';
import { SERVICE_ICONS, SERVICE_COLORS } from '../constants';

interface LandingScreenProps {
  t: Translations;
  models: DataModel[];
  onDropGpkg: (file: File) => void;
  onNewModel: () => void;
  onImportFile: () => void;
  onImportUrl: () => void;
  onImportGithub: () => void;
  onImportDatabase?: (sourceType: 'postgis' | 'supabase') => void;
  onSelectModel: (id: string) => void;
  isParsing: boolean;
}

const Tag: React.FC<{ label: string, color: string, icon: any }> = ({ label, color, icon: Icon }) => (
  <div className={`px-4 py-1.5 md:px-5 md:py-2 rounded-2xl text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 ${color} border border-black/5 shadow-sm`}>
    <Icon className="w-3 h-3 md:w-3.5 md:h-3.5 opacity-70" />
    <span className="whitespace-nowrap">{label}</span>
  </div>
);

const LandingScreen: React.FC<LandingScreenProps> = ({
  t, models, onDropGpkg, onNewModel, onImportFile, onImportUrl, onImportGithub, onImportDatabase, onSelectModel, isParsing
}) => {
  const { triggerQuestWhisper, stats } = useAmbient();
  const l = t.landing || {};
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Trigger intro quest on mount for new architects
  useEffect(() => {
    if (models.length === 0 || stats.unitsMet.length === 0) {
      triggerQuestWhisper('landing_intro');
    }
  }, [triggerQuestWhisper, models.length, stats.unitsMet.length]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.gpkg') || file.name.endsWith('.sqlite'))) {
      onDropGpkg(file);
    }
  }, [onDropGpkg]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onDropGpkg(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex-1 flex flex-col items-center p-6 md:p-12 pt-32 md:pt-48 bg-slate-50 overflow-y-auto">
      <div className="w-full max-w-5xl space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">

        {/* Hero */}
        <div className="text-center space-y-8 max-w-3xl mx-auto">
          <div className="space-y-4">
            <h1 className="text-4xl md:text-6xl font-black tracking-tight text-slate-800 leading-[1.1] whitespace-pre-line">
              {l.heroTagline}
            </h1>
            <p className="text-lg md:text-xl text-slate-500 font-medium max-w-2xl mx-auto leading-relaxed whitespace-pre-line">
              {l.heroSubtitle}
            </p>
          </div>

          {/* Output showcase - Matching Cloud's Tag system */}
          <div className="pt-2 flex flex-col items-center gap-6">
            <div className="flex flex-col items-center gap-3">
              <div className="flex flex-wrap justify-center items-center gap-3">
                <Tag label="OGC API" color={SERVICE_COLORS.OAPIF} icon={SERVICE_ICONS.OAPIF} />
                <Tag label="Vector Tiles" color={SERVICE_COLORS.Tiles} icon={SERVICE_ICONS.Tiles} />
                <Tag label="WMS" color={SERVICE_COLORS.WMS} icon={SERVICE_ICONS.WMS} />
                <Tag label="STAC" color={SERVICE_COLORS.STAC} icon={SERVICE_ICONS.STAC} />
                <Tag label="Cloud Native" color={SERVICE_COLORS.CloudNative} icon={SERVICE_ICONS.CloudNative} />
              </div>
              <div className="flex flex-wrap justify-center items-center gap-3">
                <Tag label="Docker" color="bg-indigo-50 text-indigo-600" icon={Server} />
                <Tag label="CI/CD" color="bg-indigo-50 text-indigo-600" icon={GitBranch} />
                <Tag label="OpenAPI" color="bg-violet-50 text-violet-600" icon={Code2} />
              </div>
            </div>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.3em]">
              {l.heroOutputLabel}
            </p>
          </div>
        </div>

        {/* Three paths: Asymmetric 2-column layout */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8">

          {/* Path 1: Publish data (Left column - wider) */}
          <div className="md:col-span-3 group relative bg-white rounded-[40px] border border-slate-200 hover:border-emerald-400 p-8 md:p-12 flex flex-col gap-8 transition-all duration-500 hover:shadow-2xl hover:shadow-emerald-100/50">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform duration-500">
                <Rocket size={32} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">{l.publishTitle}</h2>
                <p className="text-sm text-slate-400 font-medium mt-1">{l.publishDesc}</p>
              </div>
            </div>

            {/* Dropzone */}
            <div
              id="landing-dropzone"
              onDragOver={e => { 
                e.preventDefault(); 
                if (!isDragOver) {
                  setIsDragOver(true); 
                  triggerQuestWhisper('file_hover');
                }
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => !isParsing && fileInputRef.current?.click()}
              className={`relative cursor-pointer rounded-[32px] border-2 border-dashed p-12 flex flex-1 flex-col items-center justify-center gap-4 transition-all duration-500 ${isParsing
                  ? 'border-emerald-300 bg-emerald-50'
                  : isDragOver
                    ? 'border-emerald-500 bg-emerald-50 scale-[1.02]'
                    : 'border-slate-100 bg-slate-50/50 hover:border-emerald-200 hover:bg-emerald-50/30'
                }`}
            >
              {isParsing ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 size={40} className="text-emerald-500 animate-spin" />
                  <span className="text-sm font-bold text-emerald-600">{l.parsing}</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-300 group-hover:text-emerald-400 transition-colors">
                    <Package size={32} />
                  </div>
                  <span className="text-base font-bold text-slate-500">{l.publishDropHint}</span>
                  <span className="px-4 py-1.5 rounded-full bg-emerald-100 text-[10px] font-black text-emerald-600 uppercase tracking-widest">{l.publishBrowse}</span>
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".gpkg,.sqlite"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Right column: Connect & Deploy + Work with model stacked */}
          <div className="md:col-span-2 flex flex-col gap-8">
            {/* Path 2: Connect & Deploy */}
            <div className="group relative bg-white rounded-[40px] border border-slate-200 hover:border-indigo-400 p-8 md:p-10 flex flex-col gap-6 transition-all duration-500 hover:shadow-2xl hover:shadow-indigo-100/50">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform duration-500">
                  <CloudUpload size={28} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">{l.connectTitle}</h2>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">{l.connectDesc}</p>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => onImportDatabase && onImportDatabase('postgis')}
                  className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 text-left transition-all group/btn"
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover/btn:bg-indigo-100 group-hover/btn:text-indigo-500 transition-colors">
                    <Database size={20} />
                  </div>
                  <span className="text-sm font-bold text-slate-700">{l.connectPostgis}</span>
                  <ArrowRight size={16} className="ml-auto text-slate-200 group-hover/btn:text-indigo-400 transition-colors" />
                </button>

                <button
                  onClick={() => onImportDatabase && onImportDatabase('supabase')}
                  className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 text-left transition-all group/btn"
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover/btn:bg-indigo-100 group-hover/btn:text-indigo-500 transition-colors">
                    <Zap size={20} />
                  </div>
                  <span className="text-sm font-bold text-slate-700">{l.connectSupabase}</span>
                  <ArrowRight size={16} className="ml-auto text-slate-200 group-hover/btn:text-indigo-400 transition-colors" />
                </button>
              </div>
            </div>

            {/* Path 3: Work with model (Right column bottom) */}
            <div className="group relative bg-white rounded-[40px] border border-slate-200 hover:border-indigo-400 p-8 md:p-10 flex flex-col gap-6 transition-all duration-500 hover:shadow-2xl hover:shadow-indigo-100/50">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform duration-500">
                  <PenTool size={28} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">{l.modelTitle}</h2>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">{l.modelDesc}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={onNewModel}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all group/btn"
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover/btn:bg-indigo-100 group-hover/btn:text-indigo-500 transition-colors">
                    <Plus size={20} />
                  </div>
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider text-center">{l.modelNew || 'New Model'}</span>
                </button>

                <button
                  onClick={onImportGithub}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all group/btn"
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover/btn:bg-indigo-100 group-hover/btn:text-indigo-500 transition-colors">
                    <Github size={20} />
                  </div>
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider text-center">GitHub</span>
                </button>

                <button
                  onClick={onImportFile}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all group/btn"
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover/btn:bg-indigo-100 group-hover/btn:text-indigo-500 transition-colors">
                    <Database size={20} />
                  </div>
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider text-center">File</span>
                </button>

                <button
                   onClick={onImportUrl}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all group/btn"
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover/btn:bg-indigo-100 group-hover/btn:text-indigo-500 transition-colors">
                    <Globe size={20} />
                  </div>
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider text-center">URL</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Existing models */}
        {models.length > 0 && (
          <div className="space-y-6 animate-in fade-in duration-700 delay-300">
            <div className="flex flex-col items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{l.existingModels}</span>
              <div className="w-12 h-0.5 bg-slate-200 rounded-full"></div>
            </div>
            <div className="flex flex-wrap justify-center gap-4">
              {models.map(m => (
                <button
                  key={m.id}
                  onClick={() => onSelectModel(m.id)}
                  className="group flex flex-col items-start gap-1 p-5 bg-white rounded-3xl border border-slate-200 hover:border-indigo-400 hover:shadow-xl hover:shadow-indigo-50 transition-all active:scale-95 text-left min-w-[200px]"
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-500 group-hover:bg-indigo-100 transition-colors">
                      <Layers size={16} />
                    </div>
                    <span className="text-sm font-bold text-slate-700 truncate flex-1">{m.name}</span>
                    <ArrowRight size={14} className="text-slate-200 group-hover:text-indigo-400 transition-colors" />
                  </div>
                  <div className="mt-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-11">
                    {m.layers.length} {t.layers}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Technical Capabilities / What can I do? */}
        <div className="max-w-3xl mx-auto w-full pt-12 pb-20">
          <div className="bg-slate-100/50 rounded-[40px] p-8 md:p-12 border border-slate-200/50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div className="space-y-4">
                <h3 className="text-xl font-black text-slate-900 tracking-tight">{l.whatCanIDoTitle}</h3>
                <p className="text-sm text-slate-500 leading-relaxed font-medium">Waystones is a modern spatial data engine that bridges the gap between raw data and live web services.</p>
              </div>
              <ul className="grid grid-cols-1 gap-4">
                {[l.whatCanIDo1, l.whatCanIDo2, l.whatCanIDo3, l.whatCanIDo4, l.whatCanIDo5].filter(Boolean).map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-slate-600 font-medium">
                    <div className="mt-1 w-5 h-5 rounded-full bg-white shadow-sm flex items-center justify-center shrink-0">
                      <ArrowRight size={12} className="text-indigo-500" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingScreen;