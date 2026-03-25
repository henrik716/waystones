import React, { useState, useCallback, useRef } from 'react';
import type { Translations } from '../../i18n/index';
import {
  Check, Github, Layers, RefreshCw, ExternalLink, Info,
  GitPullRequest, Download, Cloud, Server, Package, AlertTriangle, ShieldAlert
} from 'lucide-react';
import { DataModel, ModelMetadata, DeployTarget, SourceConnection, LayerSourceMapping } from '../../types';
import { InferredDataSummary } from '../../utils/importUtils';
import { generateDeployFiles, exportDeployKit } from '../../utils/deployUtils';
import { pushDeployKit, checkRepoAccess, DeployPushResult } from '../../utils/githubService';
import GitHubAuth from '../GitHubAuth';
import GitHubRepoBrowser from '../GitHubRepoBrowser';

interface PublishStepProps {
  model: DataModel;
  summary?: InferredDataSummary;
  selectedLayers: Set<string>;
  dataBlob?: { blob: Blob; filename: string } | null;
  lang: string;
  t: Translations;
  onBack?: () => void;
  /** When provided (e.g. from DeployPanel), skip building a geopackage source and use this instead */
  sourceOverride?: SourceConnection;
}

interface OAuthState {
  isAuthenticated: boolean;
  user?: any;
  token?: any;
}

const PublishStep: React.FC<PublishStepProps> = ({ model, summary, selectedLayers, dataBlob, lang, t, onBack, sourceOverride }) => {
  const q = t.quickPublish || {};
  const d = t.deploy || {};
  const o = d.oauth || {};

  const meta: ModelMetadata = model.metadata || {} as ModelMetadata;

  // GitHub publish state
  const [deployTarget, setDeployTarget] = useState<DeployTarget>('railway');
  const [ghRepo, setGhRepo] = useState(model.githubMeta?.repo || '');
  const [ghBranch, setGhBranch] = useState(model.githubMeta?.branch || 'main');
  const [ghToken, setGhToken] = useState('');
  const [ghBasePath, setGhBasePath] = useState('');
  const [includeData, setIncludeData] = useState(false);
  const [useOAuth, setUseOAuth] = useState(true); // Default to OAuth
  const [oauthState, setOAuthState] = useState<OAuthState>({
    isAuthenticated: false,
    user: null,
    token: null
  });
  const [repoAccess, setRepoAccess] = useState<{ isOwner: boolean; ownerLogin: string } | null>(null);
  const [repoCheckStatus, setRepoCheckStatus] = useState<'idle' | 'checking' | 'done' | 'error'>('idle');
  const [publishStatus, setPublishStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [publishResult, setPublishResult] = useState<DeployPushResult | null>(null);

  const willCreatePR = repoAccess !== null && !repoAccess.isOwner;

  const formatBlobSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const checkAccess = async () => {
    const token = useOAuth && oauthState.token ? oauthState.token.access_token : ghToken;
    if (!ghRepo || !token) { setRepoAccess(null); setRepoCheckStatus('idle'); return; }
    setRepoCheckStatus('checking');
    try {
      const access = await checkRepoAccess(token, ghRepo);
      setRepoAccess(access);
      setRepoCheckStatus('done');
    } catch {
      setRepoAccess(null);
      setRepoCheckStatus('error');
    }
  };

  // Handle OAuth authentication changes
  const isUpdatingToken = useRef(false);
  
  const handleOAuthChange = useCallback((isAuthenticated: boolean, user?: any, token?: any) => {
    setOAuthState({ isAuthenticated, user, token });
    
    if (!isUpdatingToken.current) {
      isUpdatingToken.current = true;
      
      if (isAuthenticated && token) {
        setGhToken(token.access_token);
      } else {
        setGhToken('');
      }
      
      // Reset the flag after a brief delay
      setTimeout(() => {
        isUpdatingToken.current = false;
      }, 100);
    }
  }, []);

  // Handle repository selection from browser
  const handleRepoSelect = (repo: any, branch?: string) => {
    setGhRepo(repo.full_name);
    if (branch) {
      setGhBranch(branch);
    } else {
      setGhBranch(repo.default_branch || 'main');
    }
  };

  // Get effective token for API calls
  const getEffectiveToken = () => {
    return useOAuth && oauthState.token ? oauthState.token.access_token : ghToken;
  };

  const buildPublishModel = (baseModel: DataModel, selectedIds: Set<string>): DataModel => {
    const filtered = {
      ...baseModel,
      layers: baseModel.layers.filter(l => selectedIds.has(l.id)),
    };
    if (!filtered.crs) {
      const summarySrid = summary?.layers.find((sl: { tableName: string; srid: number }) =>
        filtered.layers.some(l => l.name === sl.tableName)
      )?.srid;
      if (summarySrid) {
        return { ...filtered, crs: `EPSG:${summarySrid}` };
      }
    }
    return filtered;
  };

  const buildSourceForPublish = (publishModel: DataModel, layerMappings: Record<string, LayerSourceMapping>): SourceConnection => {
    if (sourceOverride) {
      return { ...sourceOverride, layerMappings: sourceOverride.layerMappings ?? layerMappings };
    }
    const sc = publishModel.sourceConnection;
    if (sc && (sc.type === 'postgis' || sc.type === 'supabase') && sc.config) {
      return { type: sc.type, config: sc.config, layerMappings };
    }
    return {
      type: 'geopackage' as const,
      config: { filename: summary?.filename || 'data.gpkg' },
      layerMappings,
    };
  };

  const buildLayerMappings = (publishModel: DataModel) => {
    if (sourceOverride?.layerMappings) return sourceOverride.layerMappings;
    return Object.fromEntries(
      publishModel.layers.map(l => {
        const summaryLayer = summary?.layers.find((sl: { tableName: string; primaryKeyColumn: string }) => sl.tableName === l.name);
        const primaryKeyColumn = summaryLayer?.primaryKeyColumn || 'fid';
        return [l.id, {
          sourceTable: l.name,
          fieldMappings: {},
          primaryKeyColumn,
        }];
      })
    );
  };

  const handlePublish = async () => {
    setPublishStatus('loading');
    setPublishResult(null);
    try {
      const publishModel = buildPublishModel(model, selectedLayers);
      const layerMappings = buildLayerMappings(publishModel);
      const source = buildSourceForPublish(publishModel, layerMappings);
      const files = await generateDeployFiles(publishModel, source, lang, deployTarget);
      const commitMsg = `[${publishModel.version}] Publish ${publishModel.name}`;

      const binaryFiles: Record<string, Blob> | undefined =
        includeData && dataBlob ? { [`data/${dataBlob.filename}`]: dataBlob.blob } : undefined;

      const result = await pushDeployKit(
        getEffectiveToken()!, ghRepo, ghBranch, ghBasePath, files, commitMsg,
        willCreatePR, `Publish: ${publishModel.name}`, binaryFiles
      );
      setPublishResult(result);
      setPublishStatus(result.success ? 'success' : 'error');
    } catch (e: any) {
      setPublishResult({ success: false, error: e.message });
      setPublishStatus('error');
    }
  };

  const handleDownloadZip = async () => {
    const publishModel = buildPublishModel(model, selectedLayers);
    const layerMappings = buildLayerMappings(publishModel);
    const source = buildSourceForPublish(publishModel, layerMappings);
    const binaryFilesForZip = includeData && dataBlob ? { [`data/${dataBlob.filename}`]: dataBlob.blob } : undefined;
    await exportDeployKit(publishModel, source, lang, deployTarget, binaryFilesForZip);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-400">
      <div className="space-y-2">
        <h2 className="text-2xl font-black tracking-tight text-slate-900">{q.step3Title}</h2>
        <p className="text-sm text-slate-400 font-medium">{q.step3Desc}</p>
      </div>

      {/* How it works guide */}
      <div className="p-6 bg-indigo-50/70 border border-indigo-100 rounded-2xl space-y-4">
        <h3 className="text-xs font-black uppercase tracking-widest text-indigo-500">{q.publishGuideTitle}</h3>
        <ol className="space-y-3">
          {(useOAuth ? (q.publishGuideStepsOAuth || q.publishGuideSteps) : (q.publishGuideSteps || [])).map((text: string, i: number) => (
            <li key={i} className="flex gap-3 text-sm text-slate-600 font-medium leading-relaxed">
              <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-black shrink-0 mt-0.5">{i + 1}</span>
              <span>{text}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Summary badge */}
      <div className="flex flex-wrap gap-3 p-5 bg-slate-50 rounded-2xl border border-slate-200">
        <span className="px-3 py-1.5 bg-white rounded-xl text-xs font-bold text-slate-600 border border-slate-200">
          <Layers size={12} className="inline mr-1.5 text-indigo-400" />{model.name}
        </span>
        <span className="px-3 py-1.5 bg-white rounded-xl text-xs font-bold text-slate-600 border border-slate-200">
          {selectedLayers.size} {q.selectedLayers}
        </span>
        {meta.contactOrganization && (
          <span className="px-3 py-1.5 bg-indigo-50 rounded-xl text-xs font-bold text-indigo-600 border border-indigo-200">
            {meta.contactOrganization}
          </span>
        )}
        {meta.license && (
          <span className="px-3 py-1.5 bg-violet-50 rounded-xl text-xs font-bold text-violet-600 border border-violet-200">
            {meta.license}
          </span>
        )}
      </div>

      {/* Deploy target selector */}
      <div className="space-y-3">
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{d.targetTitle}</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(['railway', 'fly', 'ghcr', 'docker-compose'] as DeployTarget[]).map(tgt => {
            const icons: Record<DeployTarget, React.ReactNode> = {
              'railway': <Cloud size={20} />,
              'fly': <Cloud size={20} />,
              'ghcr': <Package size={20} />,
              'docker-compose': <Server size={20} />,
            };
            const isActive = deployTarget === tgt;
            return (
              <button
                key={tgt}
                onClick={() => setDeployTarget(tgt)}
                className={`flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all ${
                  isActive
                    ? 'bg-white border-indigo-400 shadow-md shadow-indigo-50'
                    : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                  isActive ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'
                }`}>
                  {icons[tgt]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-slate-900">{d.targets?.[tgt]}</p>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5 leading-relaxed">{d.targets?.[tgt + 'Desc']}</p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  isActive ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300'
                }`}>
                  {isActive && <Check size={12} strokeWidth={3} className="text-white" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* GitHub config */}
      <div className="space-y-4">
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
                    selectedRepo={ghRepo}
                    selectedBranch={ghBranch}
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
                ← {o.switchToManual}
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
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{d.githubToken}</label>
                <input type="password" value={ghToken} onChange={e => setGhToken(e.target.value)} onBlur={checkAccess} placeholder="ghp_..." className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all" />
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{d.githubRepo}</label>
                  <input value={ghRepo} onChange={e => setGhRepo(e.target.value)} onBlur={checkAccess} placeholder={d.githubRepoPlaceholder} className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{d.githubBranch}</label>
                  <input value={ghBranch} onChange={e => setGhBranch(e.target.value)} className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all" />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{d.githubBasePath}</label>
          <input value={ghBasePath} onChange={e => setGhBasePath(e.target.value)} placeholder={d.githubBasePathPlaceholder} className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all" />
        </div>
      </div>

      {/* Repo access info */}
      {repoCheckStatus === 'checking' && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-100 text-xs font-bold text-slate-500">
          <RefreshCw size={14} className="animate-spin" /> {d.repoChecking}
        </div>
      )}
      {repoCheckStatus === 'done' && repoAccess && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-bold ${
          willCreatePR ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
        }`}>
          {willCreatePR ? <GitPullRequest size={14} /> : <Check size={14} strokeWidth={3} />}
          {willCreatePR ? d.repoAccessPR?.replace('{owner}', repoAccess.ownerLogin) : d.repoAccessDirect?.replace('{branch}', ghBranch)}
        </div>
      )}
      {repoCheckStatus === 'error' && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-red-50 text-xs font-bold text-red-600 border border-red-200">
          <Info size={14} /> {d.repoAccessError}
        </div>
      )}

      {/* Publish result */}
      {publishStatus === 'success' && publishResult?.success && (
        <div className="p-6 bg-indigo-50 border border-indigo-200 rounded-2xl space-y-4 animate-in zoom-in-95 duration-500">
          <div className="flex items-center gap-2 text-indigo-700">
            <Check size={20} strokeWidth={3} />
            <span className="text-sm font-black">{d.publishSuccess}</span>
          </div>
          <p className="text-xs text-indigo-600 font-medium">
            {publishResult.prUrl ? d.prCreatedDesc : d.directPushDesc}
          </p>
          {publishResult.prUrl && (
            <a href={publishResult.prUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest hover:bg-indigo-500 transition-all active:scale-95">
              <ExternalLink size={14} /> {d.viewPR}
            </a>
          )}
          {!publishResult.prUrl && publishResult.commitSha && (
            <a href={`https://github.com/${ghRepo}/commit/${publishResult.commitSha}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest hover:bg-indigo-500 transition-all active:scale-95">
              <ExternalLink size={14} /> {d.viewCommit}
            </a>
          )}
        </div>
      )}
      {publishStatus === 'error' && (
        <div className="p-6 bg-red-50 border border-red-200 rounded-2xl space-y-2">
          <span className="text-sm font-black text-red-700">{d.publishError}</span>
          <p className="text-xs text-red-500 font-mono">{publishResult?.error}</p>
        </div>
      )}

      {/* Include data toggle */}
      {dataBlob && (
        <div className={`p-5 rounded-2xl border-2 transition-all ${includeData ? 'bg-amber-50 border-amber-300' : 'bg-slate-50 border-slate-200'}`}>
          <label className="flex items-start gap-4 cursor-pointer">
            <input
              type="checkbox"
              checked={includeData}
              onChange={e => setIncludeData(e.target.checked)}
              className="mt-1 w-5 h-5 rounded-lg border-2 border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
            <div className="flex-1">
              <span className="text-sm font-black text-slate-800 block">{d.includeData}</span>
              <span className="text-xs text-slate-500 font-medium">
                {dataBlob.filename} ({formatBlobSize(dataBlob.blob.size)}) {d.includeDataDesc} <code className="bg-slate-200 px-1.5 py-0.5 rounded text-[10px] font-mono">data/</code>
              </span>
              {dataBlob.blob.size > 50 * 1024 * 1024 && includeData && (
                <div className="flex items-center gap-2 mt-2 text-amber-700 text-xs font-bold">
                  <AlertTriangle size={14} />
                  {d.includeDataWarn50}
                </div>
              )}
              {dataBlob.blob.size > 100 * 1024 * 1024 && includeData && (
                <div className="flex items-center gap-2 mt-1 text-rose-700 text-xs font-bold">
                  <AlertTriangle size={14} />
                  {d.includeDataWarn100}
                </div>
              )}
            </div>
          </label>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-4">
        {onBack && (
          <button onClick={onBack} className="px-6 py-3 rounded-2xl border-2 border-slate-200 text-slate-500 font-black text-xs uppercase tracking-widest hover:bg-slate-50 active:scale-95 transition-all">
            {q.back}
          </button>
        )}
        <div className="flex items-center gap-3">
          <button onClick={handleDownloadZip} className="px-4 py-3 rounded-2xl border-2 border-slate-200 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:text-slate-600 active:scale-95 transition-all flex items-center gap-2">
            <Download size={14} /> {d.downloadZip}
          </button>
          <button
            onClick={handlePublish}
            disabled={!ghRepo || !getEffectiveToken() || publishStatus === 'loading'}
            className="px-8 py-3.5 rounded-2xl bg-indigo-600 text-white font-black text-xs uppercase tracking-[0.15em] hover:bg-indigo-500 active:scale-95 transition-all shadow-lg shadow-indigo-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {publishStatus === 'loading' ? (
              <React.Fragment><RefreshCw size={16} className="animate-spin" /> {d.publishing}</React.Fragment>
            ) : publishStatus === 'success' ? (
              <React.Fragment><Check size={16} strokeWidth={3} /> {d.publishSuccess}</React.Fragment>
            ) : (
              <React.Fragment><Github size={16} /> {d.publishBtn}</React.Fragment>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PublishStep;
