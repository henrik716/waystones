import React, { useState } from 'react';
import { Globe, X, CloudDownload, RefreshCw } from 'lucide-react';

const UrlImportDialog: React.FC<{
  t: any, 
  onClose: () => void, 
  onImport: (json: any, name: string, url: string) => Promise<void> | void 
}> = ({ t, onClose, onImport }) => {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleFetch = async () => {
    if (!url) return;
    setIsLoading(true);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Fetch error");
      const json = await response.json();
      const name = url.split('/').pop()?.split('?')[0] || "API Data";
      await onImport(json, name, url);
      onClose();
    } catch (e) {
      alert(t.fetchError || "Could not fetch from URL");
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
                 <div className="w-10 h-10 md:w-14 md:h-14 rounded-[18px] md:rounded-[22px] bg-emerald-600 text-white flex items-center justify-center shadow-xl shadow-emerald-200 shrink-0"><Globe size={24} className="md:w-8 md:h-8"/></div>
                 <div className="min-w-0">
                    <h3 className="text-lg md:text-xl font-black text-slate-800 tracking-tight leading-none truncate">{t.importUrl}</h3>
                    <p className="text-[9px] md:text-[10px] text-slate-400 font-black mt-1.5 md:mt-2 uppercase tracking-widest">REST API / OpenAPI</p>
                 </div>
              </div>
              <button onClick={onClose} className="p-2 md:p-3 rounded-xl bg-slate-50 text-slate-400 hover:text-indigo-600 transition-all shrink-0"><X size={20} className="md:w-6 md:h-6"/></button>
           </div>
           <div className="space-y-4 md:space-y-5">
              <div>
                <label className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 md:mb-2 block">{t.importUrlHint}</label>
                <input 
                  type="text" 
                  value={url} 
                  onChange={e => setUrl(e.target.value)} 
                  placeholder={t.urlPlaceholder} 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 md:px-5 py-3 md:py-4 text-sm font-bold outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500" 
                />
              </div>
           </div>
           <button 
             onClick={handleFetch}
             disabled={isLoading || !url}
             className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-6 md:px-8 py-4 md:py-5 rounded-2xl md:rounded-[22px] font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-emerald-200 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
           >
             {isLoading ? <RefreshCw size={18} className="animate-spin" /> : <CloudDownload size={18} />}
             {t.fetchUrl}
           </button>
        </div>
      </div>
    </div>
  );
};

export default UrlImportDialog;
