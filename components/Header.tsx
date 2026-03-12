import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle, Sparkles, X, Activity, Check, AlertTriangle } from 'lucide-react';
import { Language } from '../types';
import { AiProvider, getProvider, setProvider, getApiKey, saveApiKey, clearApiKey, getTrialUsesLeft } from '../utils/aiService';
import { useAiStatus } from '../hooks/useAiStatus';
import AiConfigModal from './ai/AiConfigModal';
import AiErrorHandler from './ai/AiErrorHandler';

const Header: React.FC<{
  t: any;
  lang: Language;
  onLangChange: (lang: Language) => void;
  onShowGuide: () => void;
  onHome?: () => void;
}> = ({ t, lang, onLangChange, onShowGuide, onHome }) => {
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [pendingOperation, setPendingOperation] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const aiStatus = useAiStatus();

  useEffect(() => {
    if (!showAiPanel) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowAiPanel(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAiPanel]);

  // Listen for AI configuration requests
  useEffect(() => {
    const handleAiConfigureRequired = (e: CustomEvent) => {
      setPendingOperation(e.detail.operation);
      setShowAiModal(true);
    };

    window.addEventListener('ai-configure-required', handleAiConfigureRequired as EventListener);
    return () => window.removeEventListener('ai-configure-required', handleAiConfigureRequired as EventListener);
  }, []);

  const handleAiButtonClick = () => {
    if (!aiStatus.hasKey) {
      setShowAiModal(true);
    } else {
      setShowAiPanel(!showAiPanel);
    }
  };

  const getAiStatusColor = () => {
    if (aiStatus.error) return 'text-rose-500 hover:bg-rose-50';
    if (aiStatus.isActive) return 'text-indigo-600 hover:bg-indigo-50';
    if (aiStatus.hasKey) return 'text-indigo-500 hover:bg-indigo-50';
    return 'text-slate-300 hover:text-slate-500 hover:bg-slate-50';
  };

  const getAiStatusIcon = () => {
    if (aiStatus.error) return <AlertTriangle size={18} />;
    if (aiStatus.isActive) return <Activity size={18} className="animate-pulse" />;
    if (aiStatus.hasKey) return <Sparkles size={18} />;
    return <Sparkles size={18} />;
  };

  return (
    <header className="flex-none h-14 md:h-16 bg-white border-b border-slate-200 px-3 md:px-6 flex items-center justify-between z-[200] shadow-sm relative">

      {/* Added 'text-left' here to fix the button's default center alignment */}
      <button onClick={onHome} className="flex items-center gap-2 md:gap-4 overflow-hidden min-w-0 hover:opacity-80 transition-opacity text-left">
        <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-2xl flex items-center justify-center bg-indigo-950 shrink-0">
          <svg width="100%" height="100%" viewBox="28 0 144 200">
            <defs>
              <linearGradient id="hStoneFace" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%"   stopColor="#232330"/>
                <stop offset="28%"  stopColor="#484862"/>
                <stop offset="55%"  stopColor="#56566e"/>
                <stop offset="78%"  stopColor="#484862"/>
                <stop offset="100%" stopColor="#232330"/>
              </linearGradient>
              <linearGradient id="hStoneShade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.06"/>
                <stop offset="100%" stopColor="#000000" stopOpacity="0.25"/>
              </linearGradient>
              <filter id="hCrisp" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="1.2" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <clipPath id="hStoneClip">
                <path d="M 58,177 L 50,150 L 46,96 L 50,54 L 60,30 L 74,18 L 100,14 L 126,18 L 140,30 L 150,54 L 154,96 L 150,150 L 142,177 Z"/>
              </clipPath>
            </defs>
            <path d="M 55,178 L 46,148 L 42,95 L 46,52 L 57,27 L 72,15 L 100,11 L 128,15 L 143,27 L 154,52 L 158,95 L 154,148 L 145,178 Z" fill="#1a1a28"/>
            <path d="M 58,177 L 50,150 L 46,96 L 50,54 L 60,30 L 74,18 L 100,14 L 126,18 L 140,30 L 150,54 L 154,96 L 150,150 L 142,177 Z" fill="url(#hStoneFace)"/>
            <path d="M 58,177 L 50,150 L 46,96 L 50,54 L 60,30 L 74,18 L 100,14 L 126,18 L 140,30 L 150,54 L 154,96 L 150,150 L 142,177 Z" fill="url(#hStoneShade)"/>
            <g clipPath="url(#hStoneClip)" fill="none" stroke="#2a2a3e" strokeLinecap="round">
              <path d="M 70,42 Q 66,54 70,68"       strokeWidth="1"   opacity="0.7"/>
              <path d="M 132,58 Q 136,74 131,90"    strokeWidth="0.9" opacity="0.6"/>
              <path d="M 80,138 Q 78,150 83,162"    strokeWidth="0.8" opacity="0.5"/>
              <path d="M 118,145 Q 122,157 118,168" strokeWidth="0.8" opacity="0.45"/>
              <path d="M 96,28 Q 100,35 98,44"      strokeWidth="0.7" opacity="0.5"/>
            </g>
            <g clipPath="url(#hStoneClip)" opacity="0.45">
              <circle cx="64"  cy="158" r="3"   fill="#2e5030"/>
              <circle cx="68"  cy="165" r="2"   fill="#2e5030"/>
              <circle cx="73"  cy="160" r="1.5" fill="#2e5030"/>
              <circle cx="132" cy="162" r="2.5" fill="#2e5030"/>
              <circle cx="128" cy="170" r="2"   fill="#2e5030"/>
              <circle cx="136" cy="156" r="1.5" fill="#2e5030"/>
            </g>
            <g clipPath="url(#hStoneClip)">
              <path d="M 100,90 C 103,83 110,80 116,84 C 123,89 123,100 115,107 C 105,114 91,110 86,99 C 80,87 86,72 99,69 C 115,66 130,77 131,94 C 133,114 119,128 100,130 C 79,132 63,118 61,97 C 59,75 74,59 96,58"
                    fill="none" stroke="#131320" strokeWidth="7" strokeLinecap="round" opacity="0.6"/>
            </g>
            <g filter="url(#hCrisp)" stroke="#40ecff" strokeLinecap="round" fill="none">
              <path d="M 100,90 C 103,83 110,80 116,84 C 123,89 123,100 115,107 C 105,114 91,110 86,99 C 80,87 86,72 99,69 C 115,66 130,77 131,94 C 133,114 119,128 100,130 C 79,132 63,118 61,97 C 59,75 74,59 96,58"
                    strokeWidth="2.4"/>
            </g>
            <g fill="#70f4ff">
              <circle cx="72"  cy="74"  r="1.5" opacity="0.75"/>
              <circle cx="130" cy="81"  r="1.5" opacity="0.65"/>
              <circle cx="60"  cy="102" r="1.2" opacity="0.55"/>
              <circle cx="140" cy="115" r="1.2" opacity="0.60"/>
              <circle cx="88"  cy="138" r="1.2" opacity="0.55"/>
              <circle cx="113" cy="136" r="1"   opacity="0.50"/>
            </g>
          </svg>
        </div>
        <div className="overflow-hidden min-w-0">
          <h1 className="text-xs md:text-base font-black leading-tight truncate tracking-tight text-slate-800">{t.appTitle}</h1>
          <p className="text-[8px] md:text-[10px] text-slate-400 font-black uppercase tracking-[0.05em] md:tracking-[0.2em] truncate">{t.appSubtitle}</p>
        </div>
      </button>

      <div className="flex items-center gap-1 md:gap-3 shrink-0">

        {/* AI settings button */}
        <div className="relative" ref={panelRef}>
          <button
            onClick={handleAiButtonClick}
            title={aiStatus.hasKey ? `AI: ${aiStatus.provider}` : 'AI settings - click to configure'}
            className={`p-2 md:p-3 rounded-xl transition-all flex items-center gap-1.5 ${getAiStatusColor()}`}
          >
            {getAiStatusIcon()}
            {aiStatus.hasKey && (
              <span className="hidden md:block text-[9px] font-black uppercase tracking-widest">
                {aiStatus.provider}
              </span>
            )}
            {aiStatus.hasDefaultKey && !getApiKey() && aiStatus.trialUsesLeft > 0 && (
              <span className="hidden md:block text-[9px] font-black uppercase bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded ml-1">
                {aiStatus.trialUsesLeft} {t.ai?.left || 'LEFT'}
              </span>
            )}
            {aiStatus.isActive && (
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-indigo-600 rounded-full animate-pulse" />
            )}
          </button>

          {showAiPanel && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl border border-slate-200 shadow-2xl p-5 z-[300] animate-in zoom-in-95 slide-in-from-top-1 duration-150">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-indigo-50 rounded-lg">
                    <Sparkles size={16} className="text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-700">{t.ai?.aiAssistant || 'AI Assistant'}</p>
                    <p className="text-[9px] text-slate-500">{aiStatus.provider} • {t.ai?.ready || 'Ready'}</p>
                  </div>
                </div>
                <button onClick={() => setShowAiPanel(false)} className="text-slate-300 hover:text-slate-500 transition-colors">
                  <X size={14} />
                </button>
              </div>

              {/* Status */}
              <div className="space-y-3 mb-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">{t.ai?.status || 'Status'}</span>
                  <div className="flex items-center gap-2">
                    {aiStatus.isActive ? (
                      <>
                        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                        <span className="text-indigo-600 font-medium">{t.ai?.active || 'Active'}</span>
                      </>
                    ) : (
                      <>
                        <Check size={12} className="text-emerald-500" />
                        <span className="text-emerald-600 font-medium">{t.ai?.ready || 'Ready'}</span>
                      </>
                    )}
                  </div>
                </div>

                {aiStatus.operationCount > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">{t.ai?.operations || 'Operations'}</span>
                    <span className="text-slate-700 font-medium">{aiStatus.operationCount} {t.ai?.completed || 'completed'}</span>
                  </div>
                )}

                {aiStatus.lastOperation && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">{t.ai?.lastUsed || 'Last used'}</span>
                    <span className="text-slate-700 font-medium">
                      {new Date(aiStatus.lastOperation.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="space-y-2">
                <button
                  onClick={() => {
                    setShowAiPanel(false);
                    setShowAiModal(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-black bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
                >
                  <Sparkles size={14} />
                  {t.ai?.configureApiKeyButton || 'Configure API Key'}
                </button>

                {aiStatus.error && (
                  <AiErrorHandler
                    error={aiStatus.error}
                    onConfigure={() => {
                      setShowAiPanel(false);
                      setShowAiModal(true);
                    }}
                    onRetry={aiStatus.clearError}
                    onDismiss={aiStatus.clearError}
                    className="text-xs"
                    t={t}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        <button aria-label="Hjelp" onClick={onShowGuide} className="p-2 md:p-3 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all shrink-0">
          <HelpCircle size={18} className="md:w-[22px] md:h-[22px]" />
        </button>

        <div className="flex items-center bg-slate-100 rounded-lg md:rounded-2xl p-0.5 md:p-1 border border-slate-200 shrink-0">
          <button onClick={() => onLangChange('no')} className={`px-1.5 md:px-3 py-1 text-[8px] md:text-[10px] font-black uppercase tracking-widest rounded-md md:rounded-xl transition-all ${lang === 'no' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>NO</button>
          <button onClick={() => onLangChange('en')} className={`px-1.5 md:px-3 py-1 text-[8px] md:text-[10px] font-black uppercase tracking-widest rounded-md md:rounded-xl transition-all ${lang === 'en' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>EN</button>
        </div>
      </div>

      {/* AI Configuration Modal */}
      <AiConfigModal
        isOpen={showAiModal}
        onClose={() => setShowAiModal(false)}
        initialOperation={pendingOperation}
        onSuccess={() => {
          setShowAiModal(false);
          setPendingOperation(null);
        }}
        t={t}
        lang={lang}
      />
    </header>
  );
};

export default Header;
