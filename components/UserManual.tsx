import React from 'react';
import { 
  Layers, ShieldCheck, Link2, Palette, Rocket, Info, CheckCircle2, BookOpen, Github
} from 'lucide-react';

interface UserManualProps {
  t: any;
}

const UserManual: React.FC<UserManualProps> = ({ t }) => {
  const steps = [
    {
      title: t.manual.step1Title,
      desc: t.manual.step1Desc,
      icon: <Layers size={24} className="text-indigo-600" />,
      bg: "bg-indigo-50",
      border: "border-indigo-100"
    },
    {
      title: t.manual.step2Title,
      desc: t.manual.step2Desc,
      icon: <ShieldCheck size={24} className="text-emerald-600" />,
      bg: "bg-emerald-50",
      border: "border-emerald-100"
    },
    {
      title: t.manual.step3Title,
      desc: t.manual.step3Desc,
      icon: <Github size={24} className="text-slate-700" />,
      bg: "bg-slate-100",
      border: "border-slate-200"
    },
    {
      title: t.manual.step4Title,
      desc: t.manual.step4Desc,
      icon: <Link2 size={24} className="text-amber-600" />,
      bg: "bg-amber-50",
      border: "border-amber-100"
    },
    {
      title: t.manual.step5Title,
      desc: t.manual.step5Desc,
      icon: <Palette size={24} className="text-rose-600" />,
      bg: "bg-rose-50",
      border: "border-rose-100"
    },
    {
      title: t.manual.step6Title,
      desc: t.manual.step6Desc,
      icon: <Rocket size={24} className="text-violet-600" />,
      bg: "bg-violet-50",
      border: "border-violet-100"
    }
  ];

  return (
    <div className="space-y-10 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="bg-indigo-900 rounded-[40px] p-8 md:p-12 text-white relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl" />
        <div className="relative z-10 space-y-4">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center shadow-inner">
                <BookOpen size={28} />
              </div>
              <h2 className="text-2xl md:text-3xl font-black tracking-tight">{t.manual.title}</h2>
           </div>
           <p className="text-indigo-100/80 text-sm md:text-base font-medium max-w-xl">{t.manual.subtitle}</p>
        </div>
      </div>

      <div className="space-y-6">
        {steps.map((step, idx) => (
          <div 
            key={idx} 
            className="group bg-white p-6 md:p-10 rounded-[40px] border border-slate-200 shadow-sm hover:shadow-xl hover:border-indigo-200 transition-all duration-500 flex flex-col md:flex-row gap-8 items-start relative overflow-hidden"
          >
            <div className={`w-14 h-14 md:w-20 md:h-20 rounded-[28px] ${step.bg} ${step.border} border flex items-center justify-center shrink-0 shadow-inner group-hover:scale-110 transition-transform`}>
              {step.icon}
            </div>
            <div className="space-y-3 relative z-10 flex-1">
               <h3 className="text-lg md:text-xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                 {step.title}
                 <CheckCircle2 size={18} className="text-slate-200 group-hover:text-emerald-500 transition-colors" />
               </h3>
               <p className="text-xs md:text-sm text-slate-500 leading-relaxed font-medium">
                 {step.desc}
               </p>
            </div>
            {idx < steps.length - 1 && (
               <div className="hidden md:block absolute bottom-0 left-[60px] w-px h-10 bg-slate-100" />
            )}
          </div>
        ))}
      </div>

      <div className="bg-slate-900 p-8 md:p-12 rounded-[40px] text-white flex flex-col md:flex-row items-center gap-8 shadow-2xl">
         <div className="w-16 h-16 bg-white/10 rounded-[28px] flex items-center justify-center shrink-0">
           <Info size={32} className="text-indigo-400" />
         </div>
         <div className="space-y-2 flex-1 text-center md:text-left">
            <h4 className="text-lg font-black uppercase tracking-widest text-indigo-400">Pro-tips</h4>
            <p className="text-xs md:text-sm text-slate-400 font-medium leading-relaxed">
              Husk at datamodeller aldri er helt ferdige! Bruk Modellfabrikken til å iterere, gjøre endringer basert på tilbakemeldinger, og generere nye deploy-pakker når prosjektet vokser.
            </p>
         </div>
         <button 
           onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
           className="px-8 py-4 bg-white/10 hover:bg-white/20 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0"
         >
           Gå til toppen
         </button>
      </div>
    </div>
  );
};

export default UserManual;