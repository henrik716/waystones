import React, { useState } from 'react';
import { DataModel } from '../../types';
import { 
  Cloud, Terminal, Check, Copy, Monitor, DatabaseZap, Cpu, Box, Folder, Globe, Server, CloudRain, Database
} from 'lucide-react';
import { CheckSquare } from 'lucide-react';

interface TutorialTabProps {
  model: DataModel;
  t: any;
  lang: string;
}

const TutorialTab: React.FC<TutorialTabProps> = ({ model, t, lang }) => {
  const [tutorialCopied, setTutorialCopied] = useState<string | null>(null);
  const modelFilename = model.name.replace(/\s/g, '_') || 'modell';

  const copyCmd = (cmd: string, id: string) => {
    navigator.clipboard.writeText(cmd);
    setTutorialCopied(id);
    setTimeout(() => setTutorialCopied(null), 2000);
  };

  const renderDescription = (text: string, colorClass: string) => {
    if (!text) return null;
    const lines = text.split('\n');
    const introLines: string[] = [];
    const checklistItems: string[] = [];
    
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('•')) {
        checklistItems.push(trimmed.substring(1).trim());
      } else if (trimmed) {
        introLines.push(line);
      }
    });

    return (
      <div className="space-y-3 sm:space-y-4">
        {introLines.map((line, idx) => (
          <p key={idx} className="text-xs md:text-sm text-slate-500 font-medium leading-relaxed whitespace-pre-wrap">
            {line}
          </p>
        ))}
        {checklistItems.length > 0 && (
          <div className={`${colorClass} rounded-[20px] md:rounded-2xl p-4 sm:p-6 space-y-2 sm:space-y-3 border shadow-inner`}>
             {checklistItems.map((item, i) => (
               <div key={i} className="flex gap-2 sm:gap-3 group/item">
                  <div className="mt-0.5 shrink-0"><CheckSquare size={16} className="text-indigo-500 group-hover/item:scale-110 transition-transform" /></div>
                  <span className="text-xs font-bold text-slate-700 leading-snug">{item}</span>
               </div>
             ))}
          </div>
        )}
      </div>
    );
  };

  const pygeoapiDockerCmd = `docker run -p 80:80 -v $(pwd)/config.yml:/pygeoapi/local.config.yml geopython/pygeoapi:latest`;
  const qgisServerDockerCmd = `docker run -d -p 8080:80 -v $(pwd):/data -e QGIS_PROJECT_FILE=/data/${modelFilename}.qgs qgis/qgis-server:latest`;
  const cloudSqlExample = `psql -h [DIN_IP] -U [BRUKER] -d [DATABASE] -f ${modelFilename}.sql`;

  return (
    <div className="space-y-8 md:space-y-12 pb-24 md:pb-32 animate-in fade-in duration-300 min-w-0">
      <section className="bg-white rounded-[32px] md:rounded-[40px] border border-slate-200 shadow-xl overflow-hidden border-b-8 border-b-indigo-500">
         <div className="bg-indigo-600 p-6 md:p-8 text-white relative">
            <h3 className="text-lg md:text-xl font-black uppercase tracking-widest flex items-center gap-3 md:gap-4 relative z-10"><Cloud size={32}/> {t.tutorials.pygeoapi.title}</h3>
            <p className="text-[10px] md:text-xs text-indigo-100 font-bold mt-2 leading-relaxed opacity-90 max-w-xl relative z-10">{t.tutorials.pygeoapi.usage}</p>
         </div>
         <div className="p-5 md:p-10 space-y-8 md:space-y-10">
            {[
              { title: t.tutorials.pygeoapi.step1, desc: t.tutorials.pygeoapi.step1Desc },
              { title: t.tutorials.pygeoapi.step2, desc: t.tutorials.pygeoapi.step2Desc },
              { title: t.tutorials.pygeoapi.step3, desc: t.tutorials.pygeoapi.step3Desc, command: pygeoapiDockerCmd, id: 'pygeoapi' }
            ].map((step, idx) => (
              <div key={idx} className="flex flex-col md:flex-row gap-4 md:gap-8 group">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center text-base md:text-lg font-black shrink-0 border border-indigo-100 shadow-inner group-hover:scale-110 transition-transform">{idx + 1}</div>
                  <div className="flex-1 space-y-3 md:space-y-4 min-w-0">
                      <h4 className="text-xs md:text-base font-black uppercase text-slate-800">{step.title}</h4>
                      {renderDescription(step.desc, "bg-indigo-50/50 border-indigo-100")}
                      {step.command && (
                        <div className="bg-slate-900 rounded-2xl md:rounded-3xl p-5 md:p-6 shadow-2xl relative min-w-0 overflow-hidden">
                          <div className="flex items-center justify-between mb-3 md:mb-4">
                              <span className="text-[8px] md:text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><Terminal size={14}/> {t.tutorials.pygeoapi.commandLabel}</span>
                              <button onClick={() => copyCmd(step.command!, step.id!)} className="text-slate-400 hover:text-white transition-all bg-slate-800 p-2 rounded-lg md:rounded-xl border border-slate-700">
                                {tutorialCopied === step.id ? <Check size={16} className="text-emerald-400" /> : <Copy size={16}/>}
                              </button>
                          </div>
                          <code className="text-[10px] md:text-xs font-mono text-indigo-400 break-all leading-relaxed block select-all">{step.command}</code>
                        </div>
                      )}
                  </div>
              </div>
            ))}
         </div>
      </section>
      <section className="bg-white rounded-[32px] md:rounded-[40px] border border-slate-200 shadow-xl overflow-hidden border-b-8 border-b-lime-600">
         <div className="bg-lime-600 p-6 md:p-8 text-white relative">
            <h3 className="text-lg md:text-xl font-black uppercase tracking-widest flex items-center gap-3 md:gap-4 relative z-10"><Monitor size={32}/> {t.tutorials.qgisServer.title}</h3>
            <p className="text-[10px] md:text-xs text-lime-50 font-bold mt-2 leading-relaxed opacity-90 max-w-xl relative z-10">{t.tutorials.qgisServer.usage}</p>
         </div>
         <div className="p-5 md:p-10 space-y-8 md:space-y-10">
            {[
              { title: t.tutorials.qgisServer.step1, desc: t.tutorials.qgisServer.step1Desc },
              { title: t.tutorials.qgisServer.step2, desc: t.tutorials.qgisServer.step2Desc, command: qgisServerDockerCmd, id: 'qgis-server' }
            ].map((step, idx) => (
              <div key={idx} className="flex flex-col md:flex-row gap-4 md:gap-8 group">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-lime-50 text-lime-700 flex items-center justify-center text-base md:text-lg font-black shrink-0 border border-lime-100 shadow-inner group-hover:scale-110 transition-transform">{idx + 1}</div>
                  <div className="flex-1 space-y-3 md:space-y-4 min-w-0">
                      <h4 className="text-xs md:text-base font-black uppercase text-slate-800">{step.title}</h4>
                      {renderDescription(step.desc, "bg-lime-50/50 border-lime-100")}
                      {step.command && (
                        <div className="bg-slate-900 rounded-2xl md:rounded-3xl p-5 md:p-6 shadow-2xl relative min-w-0 overflow-hidden">
                          <div className="flex items-center justify-between mb-3 md:mb-4">
                              <span className="text-[8px] md:text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><Terminal size={14}/> {t.tutorials.qgisServer.commandLabel}</span>
                              <button onClick={() => copyCmd(step.command!, step.id!)} className="text-slate-400 hover:text-white transition-all bg-slate-800 p-2 rounded-lg md:rounded-xl border border-slate-700">
                                {tutorialCopied === step.id ? <Check size={16} className="text-emerald-400" /> : <Copy size={16}/>}
                              </button>
                          </div>
                          <code className="text-[10px] md:text-xs font-mono text-lime-400 break-all leading-relaxed block select-all">{step.command}</code>
                        </div>
                      )}
                  </div>
              </div>
            ))}
         </div>
      </section>
      <section className="bg-white rounded-[32px] md:rounded-[40px] border border-slate-200 shadow-xl overflow-hidden border-b-8 border-b-blue-800">
         <div className="bg-blue-800 p-6 md:p-8 text-white relative">
            <h3 className="text-lg md:text-xl font-black uppercase tracking-widest flex items-center gap-3 md:gap-4 relative z-10"><DatabaseZap size={32}/> {t.tutorials.cloudSql.title}</h3>
            <p className="text-[10px] md:text-xs text-blue-100 font-bold mt-2 leading-relaxed opacity-90 max-w-xl relative z-10">{t.tutorials.cloudSql.usage}</p>
         </div>
         <div className="p-5 md:p-10 space-y-8 md:space-y-10">
            {[
              { title: t.tutorials.cloudSql.step1, desc: t.tutorials.cloudSql.step1Desc },
              { title: t.tutorials.cloudSql.step2, desc: t.tutorials.cloudSql.step2Desc, command: cloudSqlExample, id: 'postgis' }
            ].map((step, idx) => (
              <div key={idx} className="flex flex-col md:flex-row gap-4 md:gap-8 group">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center text-base md:text-lg font-black shrink-0 border border-blue-100 shadow-inner group-hover:scale-110 transition-transform">{idx + 1}</div>
                  <div className="flex-1 space-y-3 md:space-y-4 min-w-0">
                      <h4 className="text-xs md:text-base font-black uppercase text-slate-800">{step.title}</h4>
                      {renderDescription(step.desc, "bg-blue-50/50 border-blue-100")}
                      {step.command && (
                        <div className="bg-slate-900 rounded-2xl md:rounded-3xl p-5 md:p-6 shadow-2xl relative min-w-0 overflow-hidden">
                          <div className="flex items-center justify-between mb-3 md:mb-4">
                              <span className="text-[8px] md:text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><Terminal size={14}/> {t.tutorials.cloudSql.commandLabel}</span>
                              <button onClick={() => copyCmd(step.command!, step.id!)} className="text-slate-400 hover:text-white transition-all bg-slate-800 p-2 rounded-lg md:rounded-xl border border-slate-700">
                                {tutorialCopied === step.id ? <Check size={16} className="text-emerald-400" /> : <Copy size={16}/>}
                              </button>
                          </div>
                          <code className="text-[10px] md:text-xs font-mono text-blue-400 break-all leading-relaxed block select-all">{step.command}</code>
                        </div>
                      )}
                  </div>
              </div>
            ))}
         </div>
      </section>
      <section className="bg-white rounded-[32px] md:rounded-[40px] border border-slate-200 shadow-xl overflow-hidden border-b-8 border-b-slate-800">
         <div className="bg-slate-800 p-6 md:p-8 text-white relative">
            <h3 className="text-lg md:text-xl font-black uppercase tracking-widest flex items-center gap-3 md:gap-4 relative z-10"><Cpu size={32}/> {t.tutorials.env.title}</h3>
            <p className="text-[10px] md:text-xs text-slate-200 font-bold mt-2 leading-relaxed opacity-90 max-w-xl relative z-10">{t.tutorials.env.desc}</p>
         </div>
         <div className="p-5 md:p-10 space-y-8 md:space-y-10">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { icon: <Box className="text-indigo-500" />, title: t.tutorials.env.docker, desc: t.tutorials.env.dockerDesc },
                { icon: <Terminal className="text-emerald-500" />, title: t.tutorials.env.terminal, desc: t.tutorials.env.terminalDesc },
                { icon: <Folder className="text-amber-500" />, title: t.tutorials.env.paths, desc: t.tutorials.env.pathsDesc }
              ].map((item, i) => (
                <div key={i} className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-3 transition-transform hover:scale-[1.03]">
                   <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm">{item.icon}</div>
                   <h4 className="text-xs font-black uppercase text-slate-800">{item.title}</h4>
                   <p className="text-[10px] text-slate-500 font-medium leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
         </div>
      </section>
      <section className="bg-white rounded-[32px] md:rounded-[40px] border border-slate-200 shadow-xl overflow-hidden border-b-8 border-b-indigo-900">
         <div className="bg-indigo-900 p-6 md:p-8 text-white relative">
            <h3 className="text-lg md:text-xl font-black uppercase tracking-widest flex items-center gap-3 md:gap-4 relative z-10"><Globe size={32}/> {t.tutorials.hosting.title}</h3>
            <p className="text-[10px] md:text-xs text-indigo-100 font-bold mt-2 leading-relaxed opacity-90 max-w-xl relative z-10">{t.tutorials.hosting.desc}</p>
         </div>
         <div className="p-5 md:p-10 space-y-8">
            {[
              { title: t.tutorials.hosting.vpsTitle, desc: t.tutorials.hosting.vpsDesc, options: t.tutorials.hosting.vpsOptions, icon: <Server size={24} className="text-indigo-600"/> },
              { title: t.tutorials.hosting.paasTitle, desc: t.tutorials.hosting.paasDesc, options: t.tutorials.hosting.paasOptions, icon: <CloudRain size={24} className="text-blue-600"/> },
              { title: t.tutorials.hosting.managedDbTitle, desc: t.tutorials.hosting.managedDbDesc, options: t.tutorials.hosting.managedDbOptions, icon: <Database size={24} className="text-emerald-600"/> }
            ].map((item, idx) => (
              <div key={idx} className="flex gap-6 items-start group p-4 hover:bg-slate-50 rounded-3xl transition-colors">
                  <div className="w-14 h-14 rounded-2xl bg-white border border-slate-100 flex items-center justify-center shrink-0 shadow-sm group-hover:scale-110 transition-transform">{item.icon}</div>
                  <div className="space-y-2">
                     <h4 className="text-sm font-black uppercase text-slate-800">{item.title}</h4>
                     <p className="text-xs text-slate-500 font-medium leading-relaxed">{item.desc}</p>
                     <div className="pt-2">
                        <span className="text-[9px] font-black uppercase text-indigo-400 block mb-1">Anbefalinger:</span>
                        <p className="text-[10px] text-indigo-900/60 font-bold italic">{item.options}</p>
                     </div>
                  </div>
              </div>
            ))}
         </div>
      </section>
    </div>
  );
};

export default TutorialTab;
