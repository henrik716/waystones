import React, { useState, useRef, useEffect } from 'react';
import type { Translations } from '../i18n/index';
import { 
  Eye, Code2, Share2, Database, Github, ChevronLeft, ChevronRight
} from 'lucide-react';
import { DataModel } from '../types';
import VisualTab from './preview/VisualTab';
import ExportTab from './preview/ExportTab';
import TutorialTab from './preview/TutorialTab';
import SchemaTab from './preview/SchemaTab';
import GithubTab from './preview/GithubTab';

interface PreviewPanelProps {
  model: DataModel;
  baselineModel: DataModel | null;
  githubConfig: { token: string; repo: string; path: string; branch: string };
  onImport: (model: DataModel) => void;
  onUpdate: (model: DataModel) => void;
  onSetBaseline: (model: DataModel) => void;
  onUpdateGithubConfig: (config: any) => void;
  t: Translations;
  lang: string;
}

const PreviewPanel: React.FC<PreviewPanelProps> = ({ 
  model, baselineModel, githubConfig, onImport, onUpdate, onSetBaseline, onUpdateGithubConfig, t, lang 
}) => {
  const [tab, setTab] = useState<'schema' | 'export' | 'tutorial' | 'github'>('schema');
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const tabContainerRef = useRef<HTMLDivElement>(null);

  const allTabs = [
    { id: 'schema' as const, icon: Code2, label: t.schemaTab },
    { id: 'github' as const, icon: Github, label: t.githubTab },
    { id: 'export' as const, icon: Share2, label: t.exportTab },
    { id: 'tutorial' as const, icon: Database, label: t.tutorialTab }
  ];

  // Check scroll position to show/hide scroll indicators
  const checkScroll = () => {
    if (tabContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = tabContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  };

  // Touch handlers for swipe navigation
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(0);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe && canScrollRight) {
      scrollTabs('right');
    }
    if (isRightSwipe && canScrollLeft) {
      scrollTabs('left');
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
  const handleTabClick = (tabId: string) => {
    setTab(tabId as 'schema' | 'export' | 'tutorial' | 'github');
    
    // Auto-scroll to selected tab if needed
    if (tabContainerRef.current) {
      const tabElement = document.querySelector(`[data-tab="${tabId}"]`);
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

      {/* ── LIVE PREVIEW ZONE (always visible) ── */}
      <div className="flex-none h-[38%] min-h-[200px] border-b border-slate-100 overflow-y-auto p-4 md:p-6 bg-slate-50/30 custom-scrollbar">
        <div className="flex items-center gap-2 mb-3">
          <Eye size={12} className="text-slate-300 shrink-0" />
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-300">
            {t.visualTab}
          </span>
        </div>
        <VisualTab model={model} t={t} />
      </div>

      {/* ── SECONDARY TABS ── */}
      <div className="flex-none relative">
        {/* Left gradient indicator */}
        {canScrollLeft && (
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white via-white to-transparent z-10 pointer-events-none" />
        )}

        {/* Right gradient indicator */}
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white via-white to-transparent z-10 pointer-events-none" />
        )}

        {/* Left scroll button */}
        {canScrollLeft && (
          <button
            onClick={() => scrollTabs('left')}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-20 bg-white border border-slate-200 rounded-full shadow-md p-1.5 hover:bg-slate-50 transition-all hover:scale-105"
            aria-label="Scroll tabs left"
          >
            <ChevronLeft size={14} className="text-slate-600" />
          </button>
        )}

        {/* Right scroll button */}
        {canScrollRight && (
          <button
            onClick={() => scrollTabs('right')}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-20 bg-white border border-slate-200 rounded-full shadow-md p-1.5 hover:bg-slate-50 transition-all hover:scale-105"
            aria-label="Scroll tabs right"
          >
            <ChevronRight size={14} className="text-slate-600" />
          </button>
        )}

        <div className="px-4 md:px-6 pt-5 border-b border-slate-100">
          <div 
            ref={tabContainerRef}
            onScroll={checkScroll}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="flex gap-4 md:gap-6 pb-px overflow-x-auto no-scrollbar scroll-smooth"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {/* Render all tabs */}
            {allTabs.map(tabItem => (
              <button 
                key={tabItem.id}
                data-tab={tabItem.id}
                onClick={() => handleTabClick(tabItem.id)} 
                className={`flex items-center gap-2 pb-4 text-[10px] md:text-xs font-black uppercase tracking-widest relative transition-colors h-12 whitespace-nowrap shrink-0 ${tab === tabItem.id ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <tabItem.icon size={16} className="shrink-0" />
                <span>{tabItem.label}</span>
                {tab === tabItem.id && <div className="absolute bottom-0 left-0 w-full h-1 bg-indigo-600 rounded-full" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50/30 custom-scrollbar min-w-0 min-h-0">
        {tab === 'export' && <ExportTab model={model} t={t} lang={lang} />}
        {tab === 'tutorial' && <TutorialTab model={model} t={t} lang={lang} />}
        {tab === 'schema' && <SchemaTab model={model} t={t} />}
        {tab === 'github' && (
          <GithubTab
            model={model}
            baselineModel={baselineModel}
            githubConfig={githubConfig}
            onSetBaseline={onSetBaseline}
            onUpdate={onUpdate}
            onUpdateGithubConfig={onUpdateGithubConfig}
            t={t}
          />
        )}
      </div>
    </div>
  );
};

export default PreviewPanel;
