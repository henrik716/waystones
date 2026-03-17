import React, { useState } from 'react';
import type { Translations } from '../../i18n/index';
import { Github, X, Download, RefreshCw } from 'lucide-react';
import { DataModel } from '../../types';

const GithubImportDialog: React.FC<{
  t: Translations, 
  onClose: () => void, 
  onImport: (model: DataModel, meta?: { repo: string; path: string; branch: string }) => void 
}> = ({ t, onClose, onImport }) => {
  const [repo, setRepo] = useState('');
  const [path, setPath] = useState('');
  const [branch, setBranch] = useState('main');
  const [isLoading, setIsLoading] = useState(false);

  const gt = t.github || { importTitle: "Import GitHub", repo: "Repo", repoPlaceholder: "", path: "Path", pathPlaceholder: "", branch: "Branch", importBtn: "Fetch" };

  const handleFetch = async () => {
    if (!repo || !path) return;
    setIsLoading(true);
    try {
      const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`);
      if (!response.ok) throw new Error("GitHub error");
      const data = await response.json();
      const content = JSON.parse(atob(data.content));
      onImport(content, { repo, path, branch });
      onClose();
    } catch (e) {
      alert(gt.importError || "Could not fetch from GitHub");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-300">
      <div className="bg-white rounded-[32px] md:rounded-[40px] w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden flex flex-col animate-in zoom-in-95 duration-500">
        <div className="p-6 md:p-10 space-y-6 md:space-y-8">
           <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 md:gap-5">
                 <div className="w-10 h-10 md:w-14 md:h-14 rounded-[18px] md:rounded-[22px] bg-indigo-900 text-white flex items-center justify-center shadow-xl shadow-indigo-200 shrink-0"><Github size={24} className="md:w-8 md:h-8"/></div>
                 <div className="min-w-0">
                    <h3 className="text-lg md:text-xl font-black text-slate-800 tracking-tight leading-none truncate">{gt.importTitle}</h3>
                    <p className="text-[9px] md:text-[10px] text-slate-400 font-black mt-1.5 md:mt-2 uppercase tracking-widest">{t.appTitle} GitHub API</p>
                 </div>
              </div>
              <button onClick={onClose} className="p-2 md:p-3 rounded-xl bg-slate-50 text-slate-400 hover:text-indigo-600 transition-all shrink-0"><X size={20} className="md:w-6 md:h-6"/></button>
           </div>
           <div className="space-y-4 md:space-y-5">
              <div>
                <label className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 md:mb-2 block">{gt.repo}</label>
                <input type="text" value={repo} onChange={e => setRepo(e.target.value)} placeholder={gt.repoPlaceholder} className="w-full bg-slate-50 border border-slate-200 rounded-xl md:rounded-2xl px-4 md:px-5 py-3 md:py-4 text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500" />
              </div>
              <div>
                <label className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 md:mb-2 block">{gt.path}</label>
                <input type="text" value={path} onChange={e => setPath(e.target.value)} placeholder={gt.pathPlaceholder} className="w-full bg-slate-50 border border-slate-200 rounded-xl md:rounded-2xl px-4 md:px-5 py-3 md:py-4 text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500" />
              </div>
              <div>
                <label className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 md:mb-2 block">{gt.branch}</label>
                <input type="text" value={branch} onChange={e => setBranch(e.target.value)} placeholder="main" className="w-full bg-slate-50 border border-slate-200 rounded-xl md:rounded-2xl px-4 md:px-5 py-3 md:py-4 text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500" />
              </div>
           </div>
           <button 
             onClick={handleFetch}
             disabled={isLoading || !repo || !path}
             className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-6 md:px-8 py-4 md:py-5 rounded-2xl md:rounded-[22px] font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-indigo-200 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
           >
             {isLoading ? <RefreshCw size={18} className="animate-spin" /> : <Download size={18} />}
             {gt.importBtn}
           </button>
        </div>
      </div>
    </div>
  );
};

export default GithubImportDialog;
