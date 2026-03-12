import React, { useEffect } from 'react';
import { 
  X, Database, Layers, GitBranch, ArrowRight, 
  Share2, FileCode, Cloud, Link2, BookOpen, ShieldCheck, Github, Rocket
} from 'lucide-react';

interface GuideProps {
  onClose: () => void;
  t: any;
}

const Guide: React.FC<GuideProps> = ({ onClose, t }) => {
  
  // 1. ADDED: Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const sections = [
    {
      title: t.guide.sections.modeling,
      desc: t.guide.sections.modelingDesc,
      icon: <Layers className="text-indigo-500" size={28} />,
      color: "bg-indigo-50",
      accent: "border-indigo-100",
      secondaryIcon: <ShieldCheck className="text-indigo-300" size={16} />
    },
    {
      title: t.guide.sections.mapping,
      desc: t.guide.sections.mappingDesc,
      icon: <Link2 className="text-amber-500" size={28} />,
      color: "bg-amber-50",
      accent: "border-amber-100",
      secondaryIcon: <Database className="text-amber-300" size={16} />
    },
    {
      title: t.guide.sections.versioning,
      desc: t.guide.sections.versioningDesc,
      icon: <Github className="text-slate-700" size={28} />,
      color: "bg-slate-50",
      accent: "border-slate-200",
      secondaryIcon: <GitBranch className="text-slate-300" size={16} />
    },
    {
      title: t.guide.sections.export,
      desc: t.guide.sections.exportDesc,
      icon: <Share2 className="text-blue-500" size={28} />,
      color: "bg-blue-50",
      accent: "border-blue-100",
      secondaryIcon: <FileCode className="text-blue-300" size={16} />
    },
    {
      title: t.guide.sections.api,
      desc: t.guide.sections.apiDesc,
      icon: <Rocket className="text-violet-500" size={28} />,
      color: "bg-violet-50",
      accent: "border-violet-100",
      secondaryIcon: <Cloud className="text-violet-300" size={16} />
    }
  ];

  return (
    <div 
      className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300"
      onClick={onClose} // 2. ADDED: Clicking the blurred background closes the modal
      role="dialog"     // 3. ADDED: Accessibility role
      aria-modal="true"
    >
      <div 
        className="bg-white rounded-[40px] w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-500"
        onClick={(e) => e.stopPropagation()} // PREVENTS clicks inside the white box from closing it
      >
        
        {/* Header */}
        <div className="relative px-8 py-10 sm:px-14 sm:pt-14 overflow-hidden shrink-0">
          <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-50 rounded-full blur-[120px] -mr-48 -mt-48 opacity-50" />
          <div className="relative z-10 flex items-start justify-between">
            <div className="max-w-xl">
              <h2 className="text-3xl sm:text-4xl font-black text-slate-800 tracking-tight leading-tight mb-4">
                {t.guide.title}
              </h2>
              <p className="text-base sm:text-lg text-slate-500 font-medium leading-relaxed">
                {t.guide.subtitle}
              </p>
            </div>
            <button 
              onClick={onClose} 
              aria-label="Close guide"
              className="p-3 rounded-2xl bg-slate-100 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all active:scale-90"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 sm:px-14 pb-12 custom-scrollbar">
          <div className="space-y-8 pt-4">
            {sections.map((section, idx) => (
              <div key={idx} className="group flex flex-col sm:flex-row gap-8 items-start p-8 rounded-[36px] border border-slate-100 hover:bg-slate-50/50 hover:border-slate-200 transition-all duration-300">
                <div className={`w-20 h-20 ${section.color} ${section.accent} border rounded-[28px] flex items-center justify-center shrink-0 shadow-sm relative group-hover:scale-105 transition-transform duration-500`}>
                  {section.icon}
                  <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-white rounded-xl shadow-md border border-slate-100 flex items-center justify-center">
                    {section.secondaryIcon}
                  </div>
                </div>
                <div className="space-y-3">
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">
                    {section.title}
                  </h3>
                  <p className="text-sm sm:text-base text-slate-500 leading-relaxed font-medium">
                    {section.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-8 sm:p-12 bg-slate-50/50 border-t border-slate-100 flex items-center justify-center sm:justify-end shrink-0">
          <button 
            onClick={onClose}
            className="w-full sm:w-auto flex items-center justify-center gap-4 bg-slate-900 hover:bg-black text-white px-12 py-5 rounded-[24px] font-black text-sm uppercase tracking-[0.2em] shadow-2xl shadow-slate-200 transition-all active:scale-95 group"
          >
            {t.guide.close}
            <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Guide;