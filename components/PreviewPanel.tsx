import React, { useState, useRef, useEffect } from 'react';
import type { Translations } from '../i18n/index';
import {
  Code2, Share2, ChevronLeft, ChevronRight, FileText, Network, Layout
} from 'lucide-react';
import { DataModel } from '../types';
import ExportTab from './preview/ExportTab';
import SchemaTab from './preview/SchemaTab';
import DataCard from './DataCard';
import ERDiagram from './ERDiagram';

interface PreviewPanelProps {
  model: DataModel;
  t: Translations;
  lang: string;
  activeLayerId?: string | null;
}

type PreviewTab = 'card' | 'diagram' | 'schema' | 'export';

const PreviewPanel: React.FC<PreviewPanelProps> = ({ model, t, lang, activeLayerId }) => {
  const [tab, setTab] = useState<PreviewTab>('card');
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const tabContainerRef = useRef<HTMLDivElement>(null);

  const allTabs = [
    { id: 'card' as const, icon: FileText, label: t.viewCard || 'Data Card' },
    { id: 'diagram' as const, icon: Network, label: t.viewDiagram || 'ER Diagram' },
    { id: 'schema' as const, icon: Code2, label: t.schemaTab || 'Schema' },
    { id: 'export' as const, icon: Share2, label: t.exportTab || 'Export' },
  ];

  // Check scroll position to show/hide scroll indicators
  const checkScroll = () => {
    if (tabContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = tabContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  };

  // Scroll tabs container
  const scrollTabs = (direction: 'left' | 'right') => {
    if (tabContainerRef.current) {
      const scrollAmount = 200;
      tabContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  // Handle tab selection with auto-scroll
  const handleTabClick = (tabId: PreviewTab) => {
    setTab(tabId);
    
    // Auto-scroll to selected tab if needed
    if (tabContainerRef.current) {
      const tabElement = tabContainerRef.current.querySelector(`[data-tab="${tabId}"]`);
      if (tabElement) {
        tabElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  };

  // Check scroll on mount and resize
  useEffect(() => {
    checkScroll();
    const resizeObserver = new ResizeObserver(checkScroll);
    if (tabContainerRef.current) {
      resizeObserver.observe(tabContainerRef.current);
    }
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div className="flex flex-col w-full h-full bg-white overflow-hidden min-w-0">
      
      {/* ── PREMIUM TAB BAR ── */}
      <div className="flex-none relative z-30 bg-white/80 backdrop-blur-md border-b border-slate-100">
        {/* Left gradient indicator */}
        {canScrollLeft && (
          <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-white via-white/80 to-transparent z-10 pointer-events-none" />
        )}

        {/* Right gradient indicator */}
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-white via-white/80 to-transparent z-10 pointer-events-none" />
        )}

        {/* Scroll buttons */}
        {canScrollLeft && (
          <button
            onClick={() => scrollTabs('left')}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-full shadow-lg text-slate-600 hover:text-indigo-600 transition-all hover:scale-110 active:scale-95"
          >
            <ChevronLeft size={16} />
          </button>
        )}
        {canScrollRight && (
          <button
            onClick={() => scrollTabs('right')}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-full shadow-lg text-slate-600 hover:text-indigo-600 transition-all hover:scale-110 active:scale-95"
          >
            <ChevronRight size={16} />
          </button>
        )}

        <div 
          ref={tabContainerRef}
          onScroll={checkScroll}
          className="flex px-4 md:px-6 overflow-x-auto no-scrollbar scroll-smooth"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <div className="flex gap-2 py-3">
            {allTabs.map(tabItem => {
              const active = tab === tabItem.id;
              return (
                <button 
                  key={tabItem.id}
                  data-tab={tabItem.id}
                  onClick={() => handleTabClick(tabItem.id)} 
                  className={`
                    flex items-center gap-2.5 px-4 py-2 rounded-xl text-[10px] md:text-[11px] font-black uppercase tracking-widest whitespace-nowrap transition-all duration-300 relative group
                    ${active 
                      ? 'bg-slate-900 text-white shadow-xl shadow-slate-200 translate-y-[-1px]' 
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}
                  `}
                >
                  <tabItem.icon size={14} className={`${active ? 'text-indigo-300' : 'text-slate-300 group-hover:text-slate-400'} transition-colors`} />
                  <span>{tabItem.label}</span>
                  {active && (
                    <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-slate-900" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── CONTENT ZONE ── */}
      <div className={`flex-1 overflow-y-auto bg-slate-50/50 custom-scrollbar relative ${tab === 'diagram' ? 'flex flex-col' : ''}`}>
        <div className={`
          animate-in fade-in slide-in-from-bottom-4 duration-500 min-w-0
          ${tab === 'diagram' ? 'flex-1 h-full' : 'p-4 md:p-6 lg:p-8'}
        `}>
          {tab === 'card' && <DataCard model={model} t={t} activeLayerId={activeLayerId} />}
          {tab === 'diagram' && <ERDiagram model={model} t={t} />}
          {tab === 'schema' && <SchemaTab model={model} t={t} />}
          {tab === 'export' && <ExportTab model={model} t={t} lang={lang} />}
        </div>
      </div>

      {/* Footer Info (Subtle) */}
      <div className="flex-none px-6 py-3 bg-white border-t border-slate-100 flex items-center justify-between text-[8px] font-black uppercase tracking-widest text-slate-300">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1"><Layout size={10}/> {model.layers.length} Layers</span>
          <span className="flex items-center gap-1"><Code2 size={10}/> {model.sharedTypes?.length || 0} Shared Types</span>
        </div>
        <span>{model.namespace} • v{model.version}</span>
      </div>
    </div>
  );
};

export default PreviewPanel;
