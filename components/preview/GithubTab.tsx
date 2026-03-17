import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Translations } from '../../i18n/index';
import { DataModel } from '../../types';
import { 
  Github, Send, Check, CheckCircle2, AlertTriangle, X, HelpCircle, ExternalLink,
  History, ArrowRight, GitBranch, Terminal, ShieldAlert
} from 'lucide-react';
import { compareModels, generateChangelog, calculateNextVersion } from '../../utils/diffUtils';
import GitHubAuth from '../GitHubAuth';
import GitHubRepoBrowser from '../GitHubRepoBrowser';

interface GithubTabProps {
  model: DataModel;
  baselineModel: DataModel | null;
  githubConfig: { token: string; repo: string; path: string; branch: string };
  onSetBaseline: (model: DataModel) => void;
  onUpdate: (model: DataModel) => void;
  onUpdateGithubConfig: (config: any) => void;
  t: Translations;
}

interface OAuthState {
  isAuthenticated: boolean;
  user?: any;
  token?: any;
}

const GithubTab: React.FC<GithubTabProps> = ({ 
  model, baselineModel, githubConfig, onSetBaseline, onUpdate, onUpdateGithubConfig, t 
}) => {
  const q = t.quickPublish || {};
  const d = t.deploy || {};
  const o = d.oauth || {};
  const [commitSummary, setCommitSummary] = useState('Update model: ' + model.name);
  const [pushStatus, setPushStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [suggestedVersion, setSuggestedVersion] = useState(model.version);
  const [changelog, setChangelog] = useState('');
  const [useOAuth, setUseOAuth] = useState(true); // Default to OAuth
  const [oauthState, setOAuthState] = useState<OAuthState>({
    isAuthenticated: false,
    user: null,
    token: null
  });

  const { token: githubToken, repo: githubRepo, path: githubPath, branch: githubBranch } = githubConfig;

  const updateConfig = (updates: any) => {
    onUpdateGithubConfig({ ...githubConfig, ...updates });
  };

  // Ref to prevent infinite loops
  const isUpdatingConfig = useRef(false);

  // Handle OAuth authentication changes
  const handleOAuthChange = useCallback((isAuthenticated: boolean, user?: any, token?: any) => {
    setOAuthState({ isAuthenticated, user, token });
    
    if (!isUpdatingConfig.current) {
      isUpdatingConfig.current = true;
      
      if (isAuthenticated && token) {
        // Auto-populate token in config
        updateConfig({ token: token.access_token });
      } else {
        updateConfig({ token: '' });
      }
      
      // Reset the flag after a brief delay
      setTimeout(() => {
        isUpdatingConfig.current = false;
      }, 100);
    }
  }, []);

  // Handle repository selection from browser
  const handleRepoSelect = (repo: any, branch?: string) => {
    updateConfig({ 
      repo: repo.full_name,
      branch: branch || repo.default_branch || 'main'
    });
  };

  // Get effective token for API calls
  const getEffectiveToken = () => {
    return useOAuth && oauthState.token ? oauthState.token.access_token : githubToken;
  };

  useEffect(() => {
    if (baselineModel) {
      const changes = compareModels(baselineModel, model, t);
      const nextVer = calculateNextVersion(baselineModel.version, changes);
      const log = generateChangelog(changes, t);
      setSuggestedVersion(nextVer);
      setChangelog(log);
    }
  }, [model, baselineModel, t]);

  const cleanRepoName = (repo: string) => {
    return repo
      .replace(/^https?:\/\/github\.com\//, '')
      .replace(/^github\.com\//, '')
      .replace(/\/$/, '')
      .trim();
  };

  const handlePublishGithub = async () => {
    const token = getEffectiveToken();
    if (!token || !githubRepo || !githubPath) {
      setPushStatus('error');
      setStatusMessage(t.github.noTokenWarn);
      return;
    }

    setShowConfirm(true);
  };

  const confirmPublish = async () => {
    setShowConfirm(false);
    setPushStatus('loading');
    setStatusMessage(t.github.connecting);
    
    const token = getEffectiveToken();
    const cleanedRepo = cleanRepoName(githubRepo);

    try {
      // Update model version before publishing
      const updatedModel = { ...model, version: suggestedVersion, updatedAt: new Date().toISOString() };
      const content = btoa(unescape(encodeURIComponent(JSON.stringify(updatedModel, null, 2))));
      let sha = null;

      const checkResponse = await fetch(
        `https://api.github.com/repos/${cleanedRepo}/contents/${githubPath}?ref=${githubBranch}`,
        { headers: { Authorization: `token ${token}` } }
      );

      if (checkResponse.ok) {
        const checkData = await checkResponse.json();
        sha = checkData.sha;
      } else if (checkResponse.status === 401) {
        throw new Error(t.github.invalidToken);
      }

      // Combine version tag, summary and changelog
      const finalCommitMessage = `[v${suggestedVersion}] ${commitSummary || 'Update model'}\n\n${changelog}`;

      const putResponse = await fetch(
        `https://api.github.com/repos/${cleanedRepo}/contents/${githubPath}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `token ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: finalCommitMessage,
            content: content,
            sha: sha,
            branch: githubBranch
          })
        }
      );

      if (!putResponse.ok) {
        const errorData = await putResponse.json();
        if (putResponse.status === 404) throw new Error(t.github.repoNotFound);
        if (putResponse.status === 422) throw new Error(t.github.validationFailed);
        throw new Error(`${putResponse.status}: ${errorData.message || t.github.error}`);
      }

      // Update baseline after successful push
      onSetBaseline(updatedModel);
      onUpdate(updatedModel);

      setPushStatus('success');
      setStatusMessage(t.github.pushed);
      setTimeout(() => {
        setPushStatus('idle');
        setStatusMessage('');
      }, 3000);

    } catch (e: any) {
      setPushStatus('error');
      setStatusMessage(e.message || t.github.unknownError);
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-300 pb-24 min-w-0">
      {showConfirm && (
        <div className="fixed inset-0 z-[500] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[32px] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-100 flex flex-col max-h-[90vh]">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                  <History size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">{t.review.reviewAndPublish}</h3>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{t.review.vcs}</p>
                </div>
              </div>
              <button onClick={() => setShowConfirm(false)} className="p-2 rounded-xl hover:bg-slate-200 text-slate-400 transition-all"><X size={20} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">{t.review.currentVersion}</label>
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 font-mono text-slate-400 text-lg">{baselineModel?.version || model.version}</div>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-indigo-400 block">{t.review.suggestedVersion}</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={suggestedVersion} 
                      onChange={e => setSuggestedVersion(e.target.value)}
                      className="w-full bg-indigo-50 border-2 border-indigo-200 rounded-2xl px-5 py-4 font-mono text-indigo-700 text-lg outline-none focus:border-indigo-500 transition-all"
                    />
                    <div className="absolute -left-3 top-1/2 -translate-y-1/2 bg-white p-1 rounded-full shadow-md border border-slate-100 text-indigo-500">
                      <ArrowRight size={16} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">{t.review.generatedChangelog}</label>
                <div className="bg-slate-900 rounded-2xl p-6 font-mono text-xs text-slate-300 leading-relaxed border border-slate-800 shadow-inner whitespace-pre-wrap max-h-[200px] overflow-y-auto custom-scrollbar">
                  {changelog || t.review.noChanges}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">{t.github.commitSummary}</label>
                <input 
                  type="text"
                  value={commitSummary} 
                  onChange={e => setCommitSummary(e.target.value)}
                  placeholder={t.github.commitSummaryPlaceholder}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-sm font-medium outline-none focus:border-indigo-500 transition-all"
                />
              </div>
            </div>

            <div className="p-8 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row gap-4">
              <button onClick={() => setShowConfirm(false)} className="flex-1 bg-white border border-slate-200 text-slate-600 px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all hover:bg-slate-50">
                {t.cancel}
              </button>
              <button onClick={confirmPublish} className="flex-1 bg-slate-900 hover:bg-black text-white px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-3">
                <Send size={18} />
                {t.review.confirmAndPublish}
              </button>
            </div>
          </div>
        </div>
      )}

      {pushStatus === 'success' && (
        <div className="bg-emerald-50 border-2 border-emerald-100 rounded-[24px] p-6 flex items-center gap-4 text-emerald-800 animate-in slide-in-from-top-2 duration-500">
          <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 shrink-0"><CheckCircle2 size={28}/></div>
          <div>
             <h5 className="text-sm font-black uppercase tracking-widest">{t.github.pushed}</h5>
             <p className="text-xs font-medium opacity-80">{statusMessage}</p>
          </div>
        </div>
      )}
      
      {pushStatus === 'error' && (
        <div className="bg-rose-50 border-2 border-rose-100 rounded-[24px] p-6 flex items-center gap-4 text-rose-800 animate-in slide-in-from-top-2 duration-500">
          <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center text-rose-600 shrink-0"><AlertTriangle size={28}/></div>
          <div>
             <h5 className="text-sm font-black uppercase tracking-widest">{t.github.error}</h5>
             <p className="text-xs font-medium opacity-80">{statusMessage}</p>
          </div>
          <button onClick={() => setPushStatus('idle')} className="ml-auto text-rose-300 hover:text-rose-500"><X size={20}/></button>
        </div>
      )}

      <div className="bg-white p-5 md:p-8 rounded-[32px] md:rounded-[40px] border border-slate-200 shadow-sm space-y-6">
         <div className="flex items-center gap-4 md:gap-5">
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-[16px] md:rounded-[20px] bg-slate-100 flex items-center justify-center text-slate-600 shadow-inner shrink-0"><Github size={28}/></div>
            <div>
              <h4 className="text-sm md:text-base font-black text-slate-800 uppercase tracking-widest leading-none">{t.github.section}</h4>
            </div>
         </div>
         <p className="text-xs text-slate-500 leading-relaxed font-medium">{t.github.persistenceDesc}</p>
         
         {!useOAuth && (
         <div className="bg-indigo-50 rounded-2xl md:rounded-3xl p-4 md:p-5 border border-indigo-100 space-y-2 md:space-y-3">
            <div className="flex items-center gap-2 md:gap-3 text-indigo-700">
              <HelpCircle size={18} />
              <h5 className="text-[10px] md:text-[11px] font-black uppercase tracking-widest">{t.github.tokenHelp}</h5>
            </div>
            <p className="text-[10px] md:text-xs text-indigo-900/60 font-medium leading-relaxed">{t.github.tokenPermissions}</p>
            <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-indigo-600 font-black text-[9px] md:text-[10px] uppercase tracking-widest hover:underline">
              GitHub Settings <ExternalLink size={12} />
            </a>
         </div>
         )}

         <div className="space-y-4 md:space-y-5 pt-2">
            {/* OAuth Authentication - Much more prominent */}
            <div className="space-y-4">
              {!useOAuth ? (
                <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-2xl">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                        <Github size={20} className="text-indigo-600" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-indigo-900">{o.recommended}</h4>
                        <p className="text-sm text-indigo-600">{o.recommendedDesc}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setUseOAuth(true)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium text-sm transition-all active:scale-95 shadow-sm"
                    >
                      {o.enableButton}
                    </button>
                  </div>
                  <div className="text-xs text-indigo-500 space-y-1">
                    <p>✓ {o.benefits.noTokens}</p>
                    <p>✓ {o.benefits.autoManagement}</p>
                    <p>✓ {o.benefits.visualBrowse}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <GitHubAuth 
                    onAuthChange={handleOAuthChange}
                    compact={true}
                    t={t}
                  />

                  {/* Repository Browser for OAuth */}
                  {oauthState.isAuthenticated && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Github size={16} />
                        <span className="font-medium">{o.selectRepository}</span>
                      </div>
                      <GitHubRepoBrowser
                        onRepoSelect={handleRepoSelect}
                        selectedRepo={githubRepo}
                        selectedBranch={githubBranch}
                        showBranchSelection={true}
                        compact={true}
                        t={t}
                      />
                    </div>
                  )}

                  {/* Fallback to manual input */}
                  {!oauthState.isAuthenticated && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                      <div className="flex items-center gap-2 text-amber-700">
                        <AlertTriangle size={16} />
                        <span className="text-sm font-medium">{o.connectToBrowse}</span>
                      </div>
                    </div>
                  )}

                  {/* Switch back option */}
                  <button
                    onClick={() => setUseOAuth(false)}
                    className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    {o.switchToManual}
                  </button>
                </div>
              )}
            </div>

            {/* Manual Token Input (when OAuth is disabled) */}
            {!useOAuth && (
              <div className="space-y-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <ShieldAlert size={16} />
                  <span className="font-medium">{o.manualConfig}</span>
                </div>
                
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">{t.github.token}</label>
                    <input type="password" value={githubToken} onChange={e => updateConfig({ token: e.target.value })} placeholder="ghp_..." className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-xs outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 font-mono" />
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">{t.github.repo}</label>
                      <input type="text" value={githubRepo} onChange={e => updateConfig({ repo: e.target.value })} placeholder={t.github.repoPlaceholder} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-xs outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 font-bold" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">{t.github.branch || "Branch"}</label>
                      <input type="text" value={githubBranch} onChange={e => updateConfig({ branch: e.target.value })} placeholder="main" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-xs outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 font-bold" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">{t.github.path}</label>
              <input type="text" value={githubPath} onChange={e => updateConfig({ path: e.target.value })} placeholder={t.github.pathPlaceholder} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-xs outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 font-mono" />
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">{t.github.commitSummary}</label>
              <input 
                type="text" 
                value={commitSummary} 
                onChange={e => setCommitSummary(e.target.value)} 
                placeholder={t.github.commitSummaryPlaceholder}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-xs outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 font-medium" 
              />
            </div>

            {changelog && (
              <div className="space-y-1.5">
                <label className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">{t.review.generatedChangelog}</label>
                <div className="w-full bg-slate-900 rounded-xl p-4 text-[10px] font-mono text-slate-300 whitespace-pre-wrap max-h-[150px] overflow-y-auto custom-scrollbar border border-slate-800">
                  {changelog}
                </div>
              </div>
            )}

            <button 
              onClick={handlePublishGithub} 
              disabled={pushStatus === 'loading'} 
              className="w-full bg-slate-900 hover:bg-black text-white px-6 md:px-8 py-4 md:py-5 rounded-[18px] md:rounded-[24px] font-black text-[10px] md:text-xs uppercase tracking-[0.2em] shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-2 md:gap-3 disabled:opacity-50"
            >
              {pushStatus === 'loading' ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : pushStatus === 'success' ? (
                <Check size={18} className="text-emerald-400" />
              ) : (
                <Send size={18} />
              )}
              {pushStatus === 'loading' ? (t.github.pushing || "Pushing...") : t.github.push}
            </button>
         </div>
      </div>
    </div>
  );
};

export default GithubTab;
