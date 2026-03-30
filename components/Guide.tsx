import React, { useEffect, useState } from 'react';
import type { Translations } from '../i18n/index';
import { 
  X, Database, Layers, GitBranch, ArrowRight, ArrowLeft,
  Link2, Github, Rocket, Sparkles, Zap, Paintbrush, Check, Package,
  CloudUpload, PenTool, Globe, Server, Cloud
} from 'lucide-react';

interface GuideProps {
  onClose: () => void;
  t: Translations;
}

const Guide: React.FC<GuideProps> = ({ onClose, t }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  
  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const sections = [
    {
      title: t.guide.sections.quickPublish,
      desc: t.guide.sections.quickPublishDesc,
      icon: <Rocket className="text-emerald-600" size={32} />,
      color: "bg-emerald-50",
      accent: "border-emerald-100",
      secondaryIcon: <Package className="text-emerald-400" size={16} />,
      gradient: "from-emerald-500/20 to-teal-500/20"
    },
    {
      title: t.guide.sections.ai,
      desc: t.guide.sections.aiDesc,
      icon: <Sparkles className="text-violet-500" size={32} />,
      color: "bg-violet-50",
      accent: "border-violet-100",
      secondaryIcon: <Zap className="text-violet-400" size={16} />,
      gradient: "from-violet-500/20 to-fuchsia-500/20"
    },
    {
      title: t.guide.sections.connect,
      desc: t.guide.sections.connectDesc,
      icon: <CloudUpload className="text-indigo-600" size={32} />,
      color: "bg-indigo-50",
      accent: "border-indigo-100",
      secondaryIcon: <Database className="text-indigo-400" size={16} />,
      gradient: "from-indigo-500/20 to-purple-500/20"
    },
    {
      title: t.guide.sections.design,
      desc: t.guide.sections.designDesc,
      icon: <PenTool className="text-blue-600" size={32} />,
      color: "bg-blue-50",
      accent: "border-blue-100",
      secondaryIcon: <Layers className="text-blue-400" size={16} />,
      gradient: "from-blue-500/20 to-indigo-500/20"
    },
    {
      title: t.guide.sections.collaboration,
      desc: t.guide.sections.collaborationDesc,
      icon: <Github className="text-slate-600" size={32} />,
      color: "bg-slate-50",
      accent: "border-slate-200",
      secondaryIcon: <Cloud className="text-slate-400" size={16} />,
      gradient: "from-slate-500/20 to-slate-700/20"
    }
  ];

  const handleNext = () => {
    if (currentStep < sections.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onClose();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const activeSection = sections[currentStep];

  return (
    <div 
      className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div 
        className="bg-white rounded-[40px] w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-500 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Background Gradient */}
        <div className={`absolute inset-0 bg-gradient-to-br ${activeSection.gradient} transition-all duration-1000 opacity-30`} />
        
        {/* Progress bar at the very top */}
        <div className="absolute top-0 left-0 w-full h-1.5 bg-slate-100 z-20">
          <div 
            className="h-full bg-indigo-600 transition-all duration-500 ease-out"
            style={{ width: `${((currentStep + 1) / sections.length) * 100}%` }}
          />
        </div>

        {/* Top Header Controls */}
        <div className="relative z-10 flex items-center justify-between px-8 py-6">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 bg-white/50 backdrop-blur-md px-3 py-1 rounded-full border border-white/50 shadow-sm">
            {t.guide.step} {currentStep + 1} {t.guide.of} {sections.length}
          </div>
          <button 
            onClick={onClose} 
            aria-label="Close guide"
            className="p-2.5 rounded-2xl bg-white/50 backdrop-blur-md text-slate-400 hover:text-indigo-600 hover:bg-white transition-all active:scale-90 border border-white/50 shadow-sm"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Area */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-10 sm:px-20 py-4">
          <div key={currentStep} className="animate-in fade-in slide-in-from-bottom-8 duration-500 flex flex-col items-center">
            <div className={`w-24 h-24 ${activeSection.color} ${activeSection.accent} border-4 rounded-[42px] flex items-center justify-center mb-10 shadow-xl relative`}>
              {activeSection.icon}
              <div className="absolute -bottom-3 -right-3 w-12 h-12 bg-white rounded-2xl shadow-lg border-2 border-slate-50 flex items-center justify-center text-indigo-600">
                {activeSection.secondaryIcon}
              </div>
            </div>
            
            <h2 className="text-3xl sm:text-4xl font-black text-slate-800 tracking-tight leading-tight mb-6">
              {activeSection.title}
            </h2>
            <p className="text-base sm:text-lg text-slate-600 font-medium leading-relaxed max-w-md">
              {activeSection.desc}
            </p>
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="relative z-10 p-8 sm:p-10 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex gap-2">
            {sections.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentStep(idx)}
                className={`h-2 rounded-full transition-all duration-300 ${idx === currentStep ? 'w-8 bg-indigo-600' : 'w-2 bg-slate-200 hover:bg-slate-300'}`}
                aria-label={`Go to step ${idx + 1}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-4 w-full sm:w-auto">
            {currentStep > 0 && (
              <button 
                onClick={handleBack}
                className="flex-1 sm:flex-none flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-600 px-8 py-4 rounded-[22px] font-black text-xs uppercase tracking-widest border border-slate-200 transition-all active:scale-95 group"
              >
                <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                {t.guide.back}
              </button>
            )}
            
            <button 
              onClick={handleNext}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-4 ${currentStep === sections.length - 1 ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200' : 'bg-slate-900 hover:bg-black shadow-slate-200'} text-white px-10 py-4 rounded-[22px] font-black text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95 group`}
            >
              {currentStep === sections.length - 1 ? t.guide.close : t.guide.next}
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Guide;