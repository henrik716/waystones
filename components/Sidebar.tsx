import React from 'react';
import { Plus, Database, Layers, Github, Trash2, Link2, Globe, Rocket } from 'lucide-react';
import { DataModel } from '../types';

interface SidebarProps {
  models: DataModel[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onImportGis: () => void;
  onImportUrl: () => void;
  onGithubImport: () => void;
  onDelete: (id: string) => void;
  onOpenMapper: () => void;
  onOpenDeploy: () => void;
  t: any;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  models, selectedId, onSelect, onNew, onImportGis, onImportUrl, onGithubImport, onDelete, onOpenMapper, onOpenDeploy, t 
}) => {
  return (
    <div className="flex flex-col w-full h-full bg-white">
      <div className="p-4 md:p-5 border-b border-slate-100 bg-white sticky top-0 z-10 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 shrink-0">{t.models}</h2>
          <div className="flex items-center gap-1 md:gap-1.5">
            {/* --- Import & create --- */}
            <button 
              onClick={onGithubImport}
              className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-100 transition-all shadow-sm shrink-0"
              title={t.github?.importTitle}
            >
              <Github size={16} className="md:w-[18px] md:h-[18px]" />
            </button>
            <button 
              onClick={onImportUrl}
              className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-slate-50 text-emerald-600 hover:bg-emerald-50 border border-slate-100 transition-all shadow-sm shrink-0"
              title={t.importUrl}
            >
              <Globe size={16} className="md:w-[18px] md:h-[18px]" />
            </button>
            <button 
              onClick={onImportGis}
              className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-100 transition-all shadow-sm shrink-0"
              title={t.importGis}
            >
              <Layers size={16} className="md:w-[18px] md:h-[18px]" />
            </button>
            <button 
              onClick={onNew}
              className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-xl active:scale-90 shrink-0"
              title={t.newModel}
            >
              <Plus size={16} className="md:w-[18px] md:h-[18px]" />
            </button>
          </div>
        </div>

        {/* --- Model tools (only when a model is selected) --- */}
        {selectedId && (
          <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
            <span className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em] text-slate-300 mr-1">{t.tabs?.tools || 'Verktøy'}</span>
            <button 
              onClick={onOpenMapper}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg md:rounded-xl bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-100 transition-all text-[9px] md:text-[10px] font-bold"
              title={t.mappingTab}
            >
              <Link2 size={14} />
              <span className="hidden md:inline">{t.mappingTab || 'Kartlegg'}</span>
            </button>
            <button 
              onClick={onOpenDeploy}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg md:rounded-xl bg-violet-50 text-violet-600 hover:bg-violet-100 border border-violet-100 transition-all text-[9px] md:text-[10px] font-bold"
              title={t.deploy?.title || 'Deploy'}
            >
              <Rocket size={14} />
              <span className="hidden md:inline">{t.deploy?.title || 'Deploy'}</span>
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-4 md:py-6 px-4 md:px-5 space-y-6">
        {models.length === 0 ? (
          <div className="py-24 px-4 text-center">
            <div className="w-16 h-16 rounded-[28px] bg-slate-50 flex items-center justify-center text-slate-200 mx-auto mb-6 shadow-inner">
              <Database size={32} />
            </div>
            <p className="text-sm font-black text-slate-400 uppercase tracking-widest leading-relaxed">{t.noModels}</p>
            <p className="text-[10px] text-slate-300 font-bold uppercase tracking-widest mt-2">{t.noModelsHint}</p>
          </div>
        ) : (
          <div className="space-y-3 pb-20">
            {models.map(m => {
              const isActive = m.id === selectedId;
              
              return (
                <div key={m.id} className="group relative">
                  <button
                    onClick={() => onSelect(m.id)}
                    className={`w-full text-left p-4 md:p-5 rounded-[24px] md:rounded-[28px] transition-all border-2 ${
                      isActive 
                        ? 'bg-indigo-50/50 border-indigo-500 shadow-2xl scale-[1.01] z-10' 
                        : 'bg-white border-slate-50 hover:border-slate-200 hover:shadow-lg'
                    }`}
                  >
                    <div className="flex items-start justify-between pr-8">
                      <div className="min-w-0 flex-1">
                        <div className={`text-xs md:text-sm font-black tracking-tight truncate mb-2 ${isActive ? 'text-indigo-900' : 'text-slate-800'}`}>
                          {m.name || <span className="italic font-medium text-slate-300">{t.newModel}</span>}
                        </div>
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span className={`text-[8px] md:text-[9px] font-black uppercase tracking-[0.15em] px-1.5 py-0.5 rounded-lg border shadow-inner ${isActive ? 'bg-white border-indigo-200 text-indigo-600' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                            v{m.version}
                          </span>
                          <span className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap opacity-60">
                            {m.layers.length} {t.layers.toLowerCase()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                  <button 
                    onClick={(e) => { 
                      e.preventDefault();
                      e.stopPropagation(); 
                      onDelete(m.id); 
                    }}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-xl text-slate-300 hover:text-indigo-600 hover:bg-indigo-100 transition-all opacity-0 group-hover:opacity-100 z-[30] ${isActive ? 'opacity-100' : ''}`}
                    title={t.delete}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;