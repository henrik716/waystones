import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle, Hammer, Sparkles, X, Activity, Check, AlertTriangle } from 'lucide-react';
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
        <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-200 bg-indigo-600 shrink-0">
          <Hammer size={18} className="md:w-[22px] md:h-[22px]" />
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
