import React, { useState, useEffect, useRef } from 'react';
import type { Translations } from '../../i18n/index';
import { X, Sparkles, Check, AlertCircle, HelpCircle, ExternalLink } from 'lucide-react';
import { AiProvider, getProvider, setProvider, getApiKey, saveApiKey, clearApiKey, getTrialUsesLeft } from '../../utils/aiService';
import { AiOperationType } from '../../hooks/useAiContext';

interface AiConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialOperation?: AiOperationType | null;
  onSuccess?: () => void;
  t: Translations;
  lang: string;
}

const providerHelp = {
  claude: {
    name: 'Claude (Anthropic)',
    placeholder: 'sk-ant-api03-...',
    helpUrl: 'https://console.anthropic.com/',
  },
  gemini: {
    name: 'Gemini (Google)',
    placeholder: 'AIza...',
    helpUrl: 'https://makersuite.google.com/app/apikey',
  }
};

const AiConfigModal: React.FC<AiConfigModalProps> = ({
  isOpen,
  onClose,
  initialOperation,
  onSuccess,
  t,
  lang
}) => {
  const [provider, setProviderState] = useState<AiProvider>(getProvider());
  const [keyDraft, setKeyDraft] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [trialUsesLeft, setTrialUsesLeft] = useState(getTrialUsesLeft());
  const modalRef = useRef<HTMLDivElement>(null);
  const hasDefaultKey = !!import.meta.env.VITE_DEFAULT_AI_KEY;

  useEffect(() => {
    if (isOpen) {
      setProviderState(getProvider());
      setKeyDraft('');
      setHasKey(!!getApiKey());
      setSaveError('');
      setShowSuccess(false);
      setTrialUsesLeft(getTrialUsesLeft());
    }
  }, [isOpen]);

  useEffect(() => {
    const handleTrialUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && typeof customEvent.detail.usesLeft !== 'undefined') {
        setTrialUsesLeft(customEvent.detail.usesLeft);
      } else {
        setTrialUsesLeft(getTrialUsesLeft());
      }
    };

    window.addEventListener('ai-trial-updated', handleTrialUpdate);
    return () => window.removeEventListener('ai-trial-updated', handleTrialUpdate);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  const handleProviderChange = (newProvider: AiProvider) => {
    setProviderState(newProvider);
    setKeyDraft('');
    setHasKey(!!getApiKey(newProvider));
  };

  const handleSave = async () => {
    if (!keyDraft.trim()) return;

    setIsSaving(true);
    setSaveError('');

    try {
      setProvider(provider);
      saveApiKey(keyDraft, provider);
      setHasKey(true);
      setShowSuccess(true);

      setTimeout(() => {
        setShowSuccess(false);
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (error) {
      setSaveError(t.ai?.failedToSaveKey || 'Failed to save API key. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = () => {
    clearApiKey(provider);
    setHasKey(false);
    setKeyDraft('');
    setSaveError('');
  };

  const currentProviderHelp = providerHelp[provider];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 w-full max-w-md animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-xl">
              <Sparkles size={20} className="text-indigo-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{t.ai?.aiConfiguration || 'AI Configuration'}</h3>
              {initialOperation && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {t.ai?.configureAiTo?.replace('{operation}', initialOperation.replace('_', ' ')) || `Configure AI to ${initialOperation.replace('_', ' ')}`}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        {/* Provider Selection */}
        <div className="mb-6">
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-3">
            {t.ai?.aiProvider || 'AI Provider'}
          </label>
          <div className="grid grid-cols-2 gap-3">
            {(['claude', 'gemini'] as AiProvider[]).map(p => {
              const help = providerHelp[p];
              return (
                <button
                  key={p}
                  onClick={() => handleProviderChange(p)}
                  className={`p-3 rounded-xl border-2 transition-all ${provider === p
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600'
                    }`}
                >
                  <div className="text-sm font-bold">{help.name}</div>
                  <div className="text-xs opacity-75 mt-1">
                    {p === 'claude'
                      ? (t.ai?.claudeDescription || 'Fast, reliable AI with excellent text generation')
                      : (t.ai?.geminiDescription || 'Google\'s AI model with strong reasoning capabilities')
                    }
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* API Key Input */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-black uppercase tracking-widest text-slate-400">
              {t.ai?.apiKey || 'API Key'}
            </label>
            <a
              href={currentProviderHelp.helpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              <HelpCircle size={12} />
              {t.ai?.getKey || 'Get Key'}
              <ExternalLink size={10} />
            </a>
          </div>

          {!hasKey && hasDefaultKey && (
            <div className={`flex items-center gap-2 px-4 py-3 mb-3 rounded-xl border ${trialUsesLeft > 0 ? 'bg-indigo-50 border-indigo-100 text-indigo-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
              {trialUsesLeft > 0 ? (
                <>
                  <Sparkles size={16} />
                  <span className="text-sm font-medium">
                    {t.ai?.trialUsesLeft?.replace('{uses}', trialUsesLeft.toString()) || `${trialUsesLeft} free AI uses left. Add your own key for unlimited use.`}
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle size={16} />
                  <span className="text-sm font-medium">
                    {t.ai?.trialExhausted || 'Free trial exhausted. Please add your own API key.'}
                  </span>
                </>
              )}
            </div>
          )}

          {hasKey && !keyDraft ? (
            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 mb-3">
              <div className="flex items-center gap-2">
                <Check size={16} className="text-emerald-600" />
                <span className="text-sm font-medium text-emerald-700">
                  {t.ai?.keyConfigured || 'Key configured ✓'}
                </span>
              </div>
              <button
                onClick={handleClear}
                className="text-xs font-medium text-rose-600 hover:text-rose-700 transition-colors"
              >
                {t.ai?.clear || 'Clear'}
              </button>
            </div>
          ) : (
            <>
              <input
                type="password"
                placeholder={currentProviderHelp.placeholder}
                value={keyDraft}
                onChange={e => setKeyDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono outline-none focus:border-indigo-500 mb-3 transition-colors"
                autoFocus
              />

              {saveError && (
                <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg mb-3">
                  <AlertCircle size={14} className="text-rose-600" />
                  <span className="text-xs text-rose-700">{saveError}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 text-sm font-medium text-slate-600 hover:text-slate-700 transition-colors"
          >
            {t.ai?.cancel || 'Cancel'}
          </button>

          {!hasKey && (
            <button
              onClick={handleSave}
              disabled={!keyDraft.trim() || isSaving}
              className="flex-1 bg-indigo-600 text-white text-sm font-medium py-3 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {showSuccess ? (
                <>
                  <Check size={16} />
                  {t.ai?.saved || 'Saved!'}
                </>
              ) : isSaving ? (
                t.ai?.saving || 'Saving...'
              ) : (
                t.ai?.saveKey || 'Save Key'
              )}
            </button>
          )}
        </div>

        {/* Privacy Notice */}
        <div className="mt-4 pt-4 border-t border-slate-100">
          <p className="text-xs text-slate-400 leading-relaxed">
            {t.ai?.privacyNotice || 'Your API key is stored locally in your browser and never sent to any server except the AI provider you choose.'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default AiConfigModal;
