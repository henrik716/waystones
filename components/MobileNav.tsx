import React from 'react';
import { Database, Settings, Eye, Rocket } from 'lucide-react';
import { ViewTab } from '../types';

const MobileNav: React.FC<{
  activeTab: ViewTab;
  selectedId: string | null;
  onTabChange: (tab: ViewTab) => void;
  getTabLabel: (key: string) => string;
}> = ({ activeTab, selectedId, onTabChange, getTabLabel }) => {
  return (
    <nav className="lg:hidden flex-none h-16 bg-white border-t border-slate-200 px-1 flex items-center justify-around z-[250] shadow-[0_-4px_20px_rgba(0,0,0,0.05)] backdrop-blur-md bg-white/90">
      <button onClick={() => onTabChange('models')} className={`flex flex-col items-center gap-1 flex-1 py-2 transition-all duration-300 ${activeTab === 'models' ? 'text-indigo-600 scale-105' : 'text-slate-400 hover:text-indigo-300'}`}><Database size={20} /><span className="text-[9px] font-black uppercase tracking-tight">{getTabLabel('models')}</span></button>
      <button onClick={() => selectedId && onTabChange('editor')} disabled={!selectedId} className={`flex flex-col items-center gap-1 flex-1 py-2 transition-all duration-300 ${activeTab === 'editor' ? 'text-indigo-600 scale-105' : 'text-slate-400 hover:text-indigo-300 disabled:opacity-30'}`}><Settings size={20} /><span className="text-[9px] font-black uppercase tracking-tight">{getTabLabel('editor')}</span></button>
      <button onClick={() => selectedId && onTabChange('preview')} disabled={!selectedId} className={`flex flex-col items-center gap-1 flex-1 py-2 transition-all duration-300 ${activeTab === 'preview' ? 'text-indigo-600 scale-105' : 'text-slate-400 hover:text-indigo-300 disabled:opacity-30'}`}><Eye size={20} /><span className="text-[9px] font-black uppercase tracking-tight">{getTabLabel('preview')}</span></button>
      <button onClick={() => selectedId && onTabChange('deploy')} disabled={!selectedId} className={`flex flex-col items-center gap-1 flex-1 py-2 transition-all duration-300 ${activeTab === 'deploy' ? 'text-indigo-600 scale-105' : 'text-slate-400 hover:text-indigo-300 disabled:opacity-30'}`}><Rocket size={18} /><span className="text-[9px] font-black uppercase tracking-tight">{getTabLabel('deploy')}</span></button>
    </nav>
  );
};

export default MobileNav;
