import React, { useState } from 'react';
import { DataModel } from '../../types';
import { 
  BookOpen, FileText, Globe2, Database, Download, Cloud, FileCode, DatabaseZap, Zap
} from 'lucide-react';
import { 
  exportGeoPackage, exportSQL, exportDatabricks, 
  exportDocumentation, exportDocumentationHTML 
} from '../../utils/exportUtils';

interface ExportTabProps {
  model: DataModel;
  t: any;
  lang: string;
}

const ExportTab: React.FC<ExportTabProps> = ({ model, t, lang }) => {
  const [isExporting, setIsExporting] = useState(false);
  const modelFilename = model.name.replace(/\s/g, '_') || 'modell';

  const handleGpkgExport = async () => {
    setIsExporting(true);
    await exportGeoPackage(model, modelFilename);
    setIsExporting(false);
  };

  return (
    <div className="space-y-8 md:space-y-10 pb-16 md:pb-24 animate-in fade-in duration-300 min-w-0">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4 md:gap-5">
        
        {/* 1. DOCUMENTATION */}
        <div className="bg-white p-5 md:p-6 rounded-[24px] md:rounded-[32px] border border-slate-200 shadow-sm flex flex-col justify-between gap-5 transition-transform hover:scale-[1.02] min-h-[220px]">
          <div>
            <BookOpen className="text-emerald-600 mb-3 md:mb-4" size={32}/>
            <h3 className="text-sm md:text-base font-black text-slate-800 mb-1.5">{t.export.docTitle}</h3>
            <p className="text-[10px] md:text-[11px] text-slate-500 font-medium leading-relaxed opacity-80">{t.export.docDesc}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => exportDocumentation(model, modelFilename, lang, t)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-[8px] md:text-[9px] font-black uppercase tracking-wider whitespace-nowrap px-2 py-3.5 rounded-xl md:rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95">
              <FileText size={14} /> .MD
            </button>
            <button onClick={() => exportDocumentationHTML(model, modelFilename, lang, t)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-[8px] md:text-[9px] font-black uppercase tracking-wider whitespace-nowrap px-2 py-3.5 rounded-xl md:rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95">
              <Globe2 size={14} /> .HTML
            </button>
          </div>
        </div>

        {/* 2. GEOPACKAGE TEMPLATE */}
        <div className="bg-white p-5 md:p-6 rounded-[24px] md:rounded-[32px] border border-slate-200 shadow-sm flex flex-col justify-between gap-5 transition-transform hover:scale-[1.02] min-h-[220px]">
          <div>
            <Database className="text-indigo-600 mb-3 md:mb-4" size={32}/>
            <h3 className="text-sm md:text-base font-black text-slate-800 mb-1.5">{t.export.gpkgTitle}</h3>
            <p className="text-[10px] md:text-[11px] text-slate-500 font-medium leading-relaxed opacity-80">{t.export.gpkgDesc}</p>
          </div>
          <button onClick={handleGpkgExport} disabled={isExporting} className="bg-indigo-600 hover:bg-indigo-700 text-white text-[9px] md:text-[10px] font-black uppercase tracking-wider whitespace-nowrap px-4 md:px-5 py-3.5 rounded-xl md:rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95">
            {isExporting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Download size={16} />} {t.export.download}
          </button>
        </div>

        {/* 3. CLOUD SQL (POSTGIS) */}
        <div className="bg-white p-5 md:p-6 rounded-[24px] md:rounded-[32px] border border-slate-200 shadow-sm flex flex-col justify-between gap-5 transition-transform hover:scale-[1.02] min-h-[220px]">
          <div>
            <FileCode className="text-blue-600 mb-3 md:mb-4" size={32}/>
            <h3 className="text-sm md:text-base font-black text-slate-800 mb-1.5">{t.export.cloudSqlTitle}</h3>
            <p className="text-[10px] md:text-[11px] text-slate-500 font-medium leading-relaxed opacity-80">{t.export.cloudSqlDesc}</p>
          </div>
          <button onClick={() => exportSQL(model, modelFilename)} className="bg-[#1a4b8c] hover:bg-[#143a6d] text-white text-[9px] md:text-[10px] font-black uppercase tracking-wider whitespace-nowrap px-4 md:px-5 py-3.5 rounded-xl md:rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95">
            <Cloud size={16} /> {t.export.download}
          </button>
        </div>

        {/* 4. DATABRICKS SQL */}
        <div className="bg-white p-5 md:p-6 rounded-[24px] md:rounded-[32px] border border-slate-200 shadow-sm flex flex-col justify-between gap-5 transition-transform hover:scale-[1.02] min-h-[220px]">
          <div>
            <DatabaseZap className="text-orange-600 mb-3 md:mb-4" size={32}/>
            <h3 className="text-sm md:text-base font-black text-slate-800 mb-1.5">{t.export.databricksTitle}</h3>
            <p className="text-[10px] md:text-[11px] text-slate-500 font-medium leading-relaxed opacity-80">{t.export.databricksDesc}</p>
          </div>
          <button onClick={() => exportDatabricks(model, modelFilename)} className="bg-[#ff3621] hover:bg-[#e02f1d] text-white text-[9px] md:text-[10px] font-black uppercase tracking-wider whitespace-nowrap px-4 md:px-5 py-3.5 rounded-xl md:rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95">
            <Zap size={16} /> {t.export.download}
          </button>
        </div>

      </div>
    </div>
  );
};

export default ExportTab;