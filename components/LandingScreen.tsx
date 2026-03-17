import React, { useState, useRef, useCallback } from 'react';
import type { Translations } from '../i18n/index';
import { Upload, PenTool, Github, Plus, ArrowRight, Database, Loader2, Layers, Globe } from 'lucide-react';
import { DataModel } from '../types';

interface LandingScreenProps {
  t: Translations;
  models: DataModel[];
  onDropGpkg: (file: File) => void;
  onNewModel: () => void;
  onImportFile: () => void;
  onImportUrl: () => void;
  onImportGithub: () => void;
  onSelectModel: (id: string) => void;
  isParsing: boolean;
}

const LandingScreen: React.FC<LandingScreenProps> = ({
  t, models, onDropGpkg, onNewModel, onImportFile, onImportUrl, onImportGithub, onSelectModel, isParsing
}) => {
  const l = t.landing || {};
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    <div className="flex-1 flex flex-col items-center p-6 md:p-12 pt-16 md:pt-16 bg-slate-50 overflow-y-auto">
      <div className="w-full max-w-4xl space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700 mt-4 md:mt-6">

        {/* Header */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900">{l.title}</h1>
          <p className="text-sm text-slate-400 font-medium">{l.subtitle}</p>
        </div>

        {/* Two paths */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Path 1: Publish data */}
          {/* Endret fra space-y-6 til flex flex-col gap-6 for å tillate strekking */}
          <div className="group relative bg-white rounded-[32px] border-2 border-slate-200 hover:border-emerald-400 p-8 md:p-10 flex flex-col gap-6 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-100/50">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
                <Upload size={28} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">{l.publishTitle}</h2>
                <p className="text-xs text-slate-400 font-medium mt-0.5">{l.publishDesc}</p>
              </div>
            </div>

            {/* Dropzone */}
            {/* Lagt til flex-1 for å fylle høyden, og justify-center for å midtstille innholdet */}
            <div
              onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => !isParsing && fileInputRef.current?.click()}
              className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-10 flex flex-1 flex-col items-center justify-center gap-3 transition-all duration-300 ${
                isParsing
                  ? 'border-emerald-300 bg-emerald-50'
                  : isDragOver
                    ? 'border-emerald-500 bg-emerald-50 scale-[1.02]'
                    : 'border-slate-200 bg-slate-50/50 hover:border-emerald-300 hover:bg-emerald-50/50'
              }`}
            >
              {isParsing ? (
                <React.Fragment>
                  <Loader2 size={32} className="text-emerald-500 animate-spin" />
                  <span className="text-sm font-bold text-emerald-600">{l.parsing}</span>
                </React.Fragment>
              ) : (
                <React.Fragment>
                  <Database size={32} className="text-slate-300" />
                  <span className="text-sm font-bold text-slate-500">{l.publishDropHint}</span>
                  <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">{l.publishBrowse}</span>
                </React.Fragment>
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

          {/* Path 2: Work with model */}
          <div className="group relative bg-white rounded-[32px] border-2 border-slate-200 hover:border-indigo-400 p-8 md:p-10 space-y-6 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-100/50">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                <PenTool size={28} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">{l.modelTitle}</h2>
                <p className="text-xs text-slate-400 font-medium mt-0.5">{l.modelDesc}</p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={onNewModel}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border-2 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 text-left transition-all group/btn"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-500 group-hover/btn:bg-indigo-200 transition-colors">
                  <Plus size={20} />
                </div>
                <span className="text-sm font-bold text-slate-700">{l.modelNew}</span>
                <ArrowRight size={16} className="ml-auto text-slate-300 group-hover/btn:text-indigo-400 transition-colors" />
              </button>

              <button
                onClick={onImportFile}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border-2 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 text-left transition-all group/btn"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover/btn:bg-indigo-100 group-hover/btn:text-indigo-500 transition-colors">
                  <Layers size={20} />
                </div>
                <span className="text-sm font-bold text-slate-700">{l.modelImportFile}</span>
                <ArrowRight size={16} className="ml-auto text-slate-300 group-hover/btn:text-indigo-400 transition-colors" />
              </button>

              <button
                onClick={onImportUrl}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border-2 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 text-left transition-all group/btn"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover/btn:bg-indigo-100 group-hover/btn:text-indigo-500 transition-colors">
                  <Globe size={20} />
                </div>
                <span className="text-sm font-bold text-slate-700">{l.modelImportUrl}</span>
                <ArrowRight size={16} className="ml-auto text-slate-300 group-hover/btn:text-indigo-400 transition-colors" />
              </button>

              <button
                onClick={onImportGithub}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border-2 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 text-left transition-all group/btn"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover/btn:bg-indigo-100 group-hover/btn:text-indigo-500 transition-colors">
                  <Github size={20} />
                </div>
                <span className="text-sm font-bold text-slate-700">{l.modelImportGithub}</span>
                <ArrowRight size={16} className="ml-auto text-slate-300 group-hover/btn:text-indigo-400 transition-colors" />
              </button>
            </div>
          </div>
        </div>

        {/* Existing models */}
        {models.length > 0 && (
          <div className="space-y-4 animate-in fade-in duration-500">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-center">{l.existingModels}</p>
            <div className="flex flex-wrap justify-center gap-3">
              {models.map(m => (
                <button
                  key={m.id}
                  onClick={() => onSelectModel(m.id)}
                  className="flex items-center gap-3 px-5 py-3 bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 hover:shadow-md text-sm font-bold text-slate-700 transition-all active:scale-95"
                >
                  <Layers size={16} className="text-indigo-400" />
                  {m.name}
                  <span className="text-[10px] text-slate-400 font-medium">{m.layers.length} lag</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LandingScreen;