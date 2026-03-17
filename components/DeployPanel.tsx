import React, { useState, useEffect } from 'react';
import type { Translations } from '../i18n/index';
import {
  Database, Cloud, Zap, Server, ChevronRight, ChevronDown,
  Check, Clock, RefreshCw, Package, Table,
  Layers, FileCode, Shield, Link2,
  Settings2, FileText, Info, Globe, Github, ExternalLink, Download, GitPullRequest, AlertTriangle
} from 'lucide-react';
import {
  DataModel, SourceConnection, SourceType, DeployTarget,
  PostgresConfig, SupabaseConfig, DatabricksConfig, GeopackageConfig, LayerSourceMapping, ImportValidationResult
} from '../types';
import { toTableName } from '../utils/nameSanitizer';
import { generateDeployFiles, generatePygeoapiConfig, exportDeployKit } from '../utils/deployUtils';
import { pushDeployKit, checkRepoAccess, DeployPushResult } from '../utils/githubService';
import ImportWarnings from './ImportWarnings';
import SourceTypePicker, { SOURCE_META } from './deploy/SourceTypePicker';
import ConnectionForm from './deploy/ConnectionForm';
import LayerMappingCard from './deploy/LayerMappingCard';
import GitHubAuth from './GitHubAuth';
import GitHubRepoBrowser from './GitHubRepoBrowser';

interface DeployPanelProps {
  model: DataModel;
  t: Translations;
  lang: string;
  onSourceChange?: (source: SourceConnection) => void;
  validation?: ImportValidationResult;
}

// ============================================================
// Main DeployPanel Component
// ============================================================
const DeployPanel: React.FC<DeployPanelProps> = ({ model, t, lang, onSourceChange, validation }) => {
  const d = t.deploy; 
  const [step, setStep] = useState(0);
  const [sourceType, setSourceType] = useState<SourceType | null>(null);
  const [includeData, setIncludeData] = useState(false);
  const [localDataFile, setLocalDataFile] = useState<{ blob: Blob; filename: string } | null>(null);

  // Connection states
  const [pgConfig, setPgConfig] = useState<PostgresConfig>({
    host: 'localhost', port: '5432', dbname: '', user: 'postgres', password: '', schema: 'public',
  });
  const [supaConfig, setSupaConfig] = useState<SupabaseConfig>({
    projectUrl: '', anonKey: '', schema: 'public',
  });
  const [dbConfig, setDbConfig] = useState<DatabricksConfig>({
    host: '', httpPath: '', token: '', catalog: 'main', schema: 'default',
  });
  const [gpkgConfig, setGpkgConfig] = useState<GeopackageConfig>({
    filename: `${toTableName(model.name)}.gpkg`
  });

  // Layer mapping state
  const [layerMappings, setLayerMappings] = useState<Record<string, LayerSourceMapping>>(() => {
    const initial: Record<string, LayerSourceMapping> = {};
    model.layers.forEach(l => {
      const tbl = toTableName(l.name);
      const fieldMappings: Record<string, string> = {};
      l.properties.forEach(p => { fieldMappings[p.id] = p.name; });
      initial[l.id] = { sourceTable: tbl, fieldMappings, timestampColumn: '', primaryKeyColumn: 'fid' };
    });
    return initial;
  });

  const [expandedLayer, setExpandedLayer] = useState<string | null>(model.layers[0]?.id || null);
  const [showPreview, setShowPreview] = useState(false);

  // GitHub publish state
  const [ghRepo, setGhRepo] = useState(model.githubMeta?.repo || '');
  const [ghBranch, setGhBranch] = useState(model.githubMeta?.branch || 'main');
  const [ghToken, setGhToken] = useState('');
  const [ghBasePath, setGhBasePath] = useState('');
  const [useOAuth, setUseOAuth] = useState(true); // Default to OAuth
  const [oauthUser, setOAuthUser] = useState<any>(null);
  const [oauthToken, setOAuthToken] = useState<any>(null);
  const [deployTarget, setDeployTarget] = useState<DeployTarget>('docker-compose');
  const [repoAccess, setRepoAccess] = useState<{ isOwner: boolean; ownerLogin: string; userLogin: string } | null>(null);
  const [repoCheckStatus, setRepoCheckStatus] = useState<'idle' | 'checking' | 'done' | 'error'>('idle');
  const [publishStatus, setPublishStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [publishResult, setPublishResult] = useState<DeployPushResult | null>(null);

  // Auto-detect repo ownership when repo + token are filled
  const checkAccess = async () => {
    const token = useOAuth ? oauthToken?.access_token : ghToken;
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
  const handleOAuthChange = (isAuthenticated: boolean, user?: any, token?: any) => {
    if (isAuthenticated && token) {
      setOAuthUser(user || null);
      setOAuthToken(token);
    } else {
      setOAuthUser(null);
      setOAuthToken(null);
    }
  };

  // Handle repository selection from browser
  const handleRepoSelect = (repo: any, branch?: string) => {
    setGhRepo(repo.full_name);
    if (branch) {
      setGhBranch(branch);
    } else {
      setGhBranch(repo.default_branch);
    }
  };

  // Get effective token for API calls
  const getEffectiveToken = () => {
    return useOAuth ? oauthToken?.access_token : ghToken;
  };

  const willCreatePR = repoAccess !== null && !repoAccess.isOwner;

  // State Updaters
  const updateMapping = (layerId: string, updates: Partial<LayerSourceMapping>) => {
    setLayerMappings(prev => ({
      ...prev,
      [layerId]: { ...prev[layerId], ...updates }
    }));
  };

  const handleFieldChange = (layerId: string, propId: string, val: string) => {
    setLayerMappings(prev => {
      const layer = prev[layerId];
      const fields = layer.fieldMappings || {};
      return {
        ...prev,
        [layerId]: {
          ...layer,
          fieldMappings: { ...fields, [propId]: val }
        }
      };
    });
  };

  const buildSource = (): SourceConnection | null => {
    if (!sourceType) return null;
    let config;
    if (sourceType === 'postgis') config = pgConfig;
    else if (sourceType === 'supabase') config = supaConfig;
    else if (sourceType === 'databricks') config = dbConfig;
    else config = gpkgConfig;
    
    return { type: sourceType, config, layerMappings };
  };

  const [previewYaml, setPreviewYaml] = useState<string>('');

  useEffect(() => {
    const generatePreview = async () => {
      const source = buildSource();
      if (source) {
        try {
          const yaml = await generatePygeoapiConfig(model, source, lang);
          setPreviewYaml(yaml);
        } catch (error) {
          console.error('Failed to generate pygeoapi config:', error);
          setPreviewYaml('');
        }
      } else {
        setPreviewYaml('');
      }
    };

    generatePreview();
  }, [sourceType, pgConfig, supaConfig, dbConfig, gpkgConfig, layerMappings, model, lang]);

  const isConnectionValid = (): boolean => {
    if (!sourceType) return false;
    if (sourceType === 'postgis') return !!(pgConfig.host && pgConfig.dbname && pgConfig.user);
    if (sourceType === 'supabase') return !!(supaConfig.projectUrl && supaConfig.anonKey);
    if (sourceType === 'databricks') return !!(dbConfig.host && dbConfig.httpPath && dbConfig.token);
    if (sourceType === 'geopackage') return !!gpkgConfig.filename;
    return false;
  };

  const isPublishReady = (): boolean => {
    const token = useOAuth ? oauthToken : ghToken;
    return !!(ghRepo && token);
  };

  const handlePublish = async () => {
    const source = buildSource();
    if (!source) return;
    setPublishStatus('loading');
    setPublishResult(null);
    try {
      const files = await generateDeployFiles(model, source, lang, deployTarget);
      const commitMsg = `[${model.version}] Deploy ${model.name}`;
      
      const binaryFiles: Record<string, Blob> | undefined = 
        includeData && localDataFile ? { [`data/${localDataFile.filename}`]: localDataFile.blob } : undefined;
      
      const result = await pushDeployKit(
        getEffectiveToken()!, ghRepo, ghBranch, ghBasePath, files, commitMsg,
        willCreatePR, `Deploy: ${model.name} v${model.version}`, binaryFiles
      );
      setPublishResult(result);
      setPublishStatus(result.success ? 'success' : 'error');
      if (result.success) onSourceChange?.(source);
    } catch (e: any) {
      setPublishResult({ success: false, error: e.message });
      setPublishStatus('error');
    }
  };

  const handleDownloadZip = async () => {
    const source = buildSource();
    if (!source) return;
    const binaryFilesForZip = includeData && localDataFile ? { [`data/${localDataFile.filename}`]: localDataFile.blob } : undefined;
    await exportDeployKit(model, source, lang, deployTarget, binaryFilesForZip);
  };

  const stepIcons = [Database, Link2, Table, Github];

  return (
    <div className="max-w-6xl mx-auto space-y-8 md:space-y-12 pb-40 px-2 md:px-4">
      
      {/* 1. PROGRESS STEPPER */}
      <div className="flex items-center justify-between px-4 sm:px-12 py-8 bg-white border border-slate-200 rounded-[32px] shadow-sm overflow-hidden">
        {d.steps.map((label: string, idx: number) => {
          const Icon = stepIcons[idx];
          const isPast = step > idx;
          return (
            <React.Fragment key={idx}>
              <div 
                className={`flex flex-col items-center gap-2 relative z-10 transition-all ${isPast ? 'cursor-pointer group' : ''}`}
                onClick={() => isPast && setStep(idx)}
              >
                <div className={`w-10 h-10 md:w-12 md:h-12 rounded-2xl flex items-center justify-center shadow-lg transition-all ${
                  step >= idx ? 'bg-violet-600 text-white shadow-violet-200' : 'bg-slate-50 text-slate-300'
                } ${isPast ? 'group-hover:bg-violet-500 group-hover:scale-105' : ''}`}>
                  {isPast ? <Check size={20} strokeWidth={3} /> : <Icon size={18} />}
                </div>
                <span className={`text-[8px] md:text-[10px] font-black uppercase tracking-widest hidden sm:block ${step >= idx ? 'text-violet-900' : 'text-slate-400'}`}>
                  {label}
                </span>
              </div>
              {idx < d.steps.length - 1 && (
                <div className="flex-1 h-1 mx-2 md:mx-4 rounded-full bg-slate-100 relative overflow-hidden">
                  <div className={`absolute inset-0 bg-violet-600 transition-all duration-700 ${step > idx ? 'w-full' : 'w-0'}`} />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Validation warnings */}
      {validation && validation.warnings.length > 0 && (
        <ImportWarnings
          validation={validation}
          onProceed={() => {/* User can proceed despite warnings */}}
          onFixIssues={() => {/* User can go back to fix issues */}}
          t={t}
          lang={lang}
        />
      )}

      {/* STEP 0: SOURCE SELECTION */}
      {step === 0 && (
        <SourceTypePicker sourceType={sourceType} onSelect={(type) => { setSourceType(type); setStep(1); }} t={t} />
      )}

      {/* STEP 1: CONNECTION DETAILS */}
      {step === 1 && sourceType && (
        <ConnectionForm
          sourceType={sourceType}
          pgConfig={pgConfig} supaConfig={supaConfig} dbConfig={dbConfig} gpkgConfig={gpkgConfig}
          onPgChange={setPgConfig} onSupaChange={setSupaConfig} onDbChange={setDbConfig} onGpkgChange={setGpkgConfig}
          localDataFile={localDataFile}
          onLocalDataFileChange={setLocalDataFile}
          onIncludeDataChange={setIncludeData}
          isConnectionValid={isConnectionValid()}
          onBack={() => setStep(0)}
          onNext={() => setStep(2)}
          t={t}
        />
      )}

      {/* STEP 2: LAYER MAPPING */}
      {step === 2 && (
        <section className="bg-white p-6 md:p-10 rounded-[32px] border border-slate-200 shadow-sm space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-6">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 border border-amber-100 shrink-0"><Layers size={28} /></div>
            <div>
              <h3 className="text-lg md:text-xl font-black text-slate-800 tracking-tight leading-none mb-1">{d.mappingTitle}</h3>
              <p className="text-xs text-slate-500 font-medium">{d.mappingDesc}</p>
            </div>
          </div>

          <div className="space-y-6 pb-20">
            {model.layers.map(layer => (
              <LayerMappingCard
                key={layer.id}
                layer={layer}
                mapping={layerMappings[layer.id]}
                isExpanded={expandedLayer === layer.id}
                sourceType={sourceType}
                onToggle={() => setExpandedLayer(expandedLayer === layer.id ? null : layer.id)}
                onUpdateMapping={(updates) => updateMapping(layer.id, updates)}
                onFieldChange={(propId, val) => handleFieldChange(layer.id, propId, val)}
                t={t}
              />
            ))}
          </div>

          {/* Sticky Footer */}
          <div className="sticky bottom-6 z-20 flex gap-4 p-2 bg-white/80 backdrop-blur-md border border-slate-100 rounded-[28px] shadow-xl">
            <button onClick={() => setStep(1)} className="px-10 py-4 rounded-2xl border-2 bg-white border-slate-200 text-slate-500 font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all hover:bg-slate-50">{d.back}</button>
            <button onClick={() => setStep(3)} className="flex-1 px-10 py-4 rounded-2xl bg-violet-600 text-white font-black text-[10px] uppercase tracking-widest active:scale-95 shadow-lg shadow-violet-200 transition-all hover:bg-violet-700">{d.next}</button>
          </div>
        </section>
      )}

      {/* STEP 3: PUBLISH TO GITHUB */}
      {step === 3 && (
        <section className="bg-slate-900 rounded-[40px] border border-slate-800 shadow-2xl overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Header */}
          <div className="p-8 md:p-12 bg-slate-800/80 border-b border-slate-700">
            <div className="flex items-center gap-8">
              <div className="w-20 h-20 rounded-[28px] bg-violet-600 flex items-center justify-center text-white shrink-0 shadow-2xl transition-transform hover:rotate-3"><Github size={40} /></div>
              <div>
                <h3 className="text-2xl font-black text-white tracking-tight leading-none mb-2">{d.kitTitle} {model.name}</h3>
                <p className="text-[10px] text-violet-400 font-bold uppercase tracking-[0.2em]">{d.readyToGenerate}</p>
              </div>
            </div>
          </div>

          {/* Stats bar */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-800">
            {[
              { label: d.source, val: sourceType, icon: SOURCE_META[sourceType!]?.icon },
              { label: d.layersLabel, val: model.layers.length, icon: <Layers size={14}/> },
              { label: d.changeTracking, val: sourceType === 'geopackage' ? 'Static File' : `${Object.values(layerMappings).filter((m: LayerSourceMapping) => m.timestampColumn).length} delta`, icon: <Clock size={14}/> },
              { label: 'CRS', val: model.crs || 'EPSG:25833', icon: <Globe size={14}/> }
            ].map((stat, i) => (
              <div key={i} className="bg-slate-900 p-8 flex flex-col gap-2">
                <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest flex items-center gap-2">{stat.label}</span>
                <p className="text-white font-bold text-lg truncate capitalize">{String(stat.val)}</p>
              </div>
            ))}
          </div>

          {/* Deploy target selector */}
          <div className="p-8 md:p-12 border-b border-slate-800 space-y-4">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{d.targetTitle}</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {(['railway', 'fly', 'ghcr', 'docker-compose'] as DeployTarget[]).map(tgt => {
                const icons: Record<string, React.ReactNode> = {
                  'railway': <Cloud size={18} />,
                  'fly': <Cloud size={18} />,
                  'ghcr': <Package size={18} />,
                  'docker-compose': <Server size={18} />,
                };
                const isActive = deployTarget === tgt;
                return (
                  <button
                    key={tgt}
                    onClick={() => setDeployTarget(tgt)}
                    className={`flex items-center gap-3 p-4 rounded-2xl border text-left transition-all ${
                      isActive
                        ? 'bg-violet-600/20 border-violet-500 shadow-lg shadow-violet-500/10'
                        : 'bg-slate-800/60 border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isActive ? 'bg-violet-600 text-white' : 'bg-slate-700 text-slate-400'
                    }`}>
                      {icons[tgt]}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs font-black truncate ${isActive ? 'text-white' : 'text-slate-300'}`}>{d.targets?.[tgt]}</p>
                      <p className="text-[9px] text-slate-500 font-medium mt-0.5 line-clamp-2 leading-relaxed">{d.targets?.[tgt + 'Desc']}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* GitHub config */}
          <div className="p-8 md:p-12 space-y-8">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{d.publishTitle}</h4>
            </div>
            <p className="text-sm text-slate-400 font-medium -mt-4">{d.publishDesc}</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">{d.githubRepo}</label>
                <input
                  type="text"
                  value={ghRepo}
                  onChange={e => setGhRepo(e.target.value)}
                  onBlur={checkAccess}
                  placeholder={d.githubRepoPlaceholder}
                  className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-5 py-4 text-xs font-bold text-slate-200 outline-none focus:ring-4 focus:ring-violet-500/20 focus:border-violet-500 transition-all placeholder:text-slate-600"
                />
                <p className="text-[10px] text-slate-600 font-medium px-1">{d.githubRepoHint}</p>
              </div>
              {/* GitHub Authentication */}
              <div className="space-y-6 md:col-span-2">
                {/* Auth Method Toggle */}
                <div className="flex items-center gap-4 p-4 bg-slate-800/60 rounded-2xl border border-slate-700">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useOAuth}
                      onChange={(e) => setUseOAuth(e.target.checked)}
                      className="w-5 h-5 rounded-lg border-2 border-slate-600 text-violet-500 focus:ring-violet-500 bg-slate-900"
                    />
                    <span className="text-sm font-medium text-white">Use OAuth Authentication</span>
                  </label>
                  <div className="flex-1 text-right">
                    <p className="text-xs text-slate-400">
                      {useOAuth ? 'Recommended - More secure' : 'Manual token input'}
                    </p>
                  </div>
                </div>

                {useOAuth ? (
                  <GitHubAuth 
                    onAuthChange={handleOAuthChange}
                    compact={false}
                  />
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">{d.githubToken}</label>
                    <div className="relative">
                      <input
                        type="password"
                        value={ghToken}
                        onChange={e => setGhToken(e.target.value)}
                        onBlur={checkAccess}
                        className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-5 py-4 text-xs font-bold text-slate-200 outline-none focus:ring-4 focus:ring-violet-500/20 focus:border-violet-500 transition-all placeholder:text-slate-600"
                        placeholder="ghp_..."
                      />
                    </div>
                    <p className="text-[10px] text-slate-600 font-medium px-1">{d.githubTokenHint}</p>
                  </div>
                )}

                {/* Repository Browser for OAuth */}
                {useOAuth && oauthToken && (
                  <GitHubRepoBrowser
                    onRepoSelect={handleRepoSelect}
                    selectedRepo={ghRepo}
                    selectedBranch={ghBranch}
                    showBranchSelection={true}
                    compact={false}
                  />
                )}
              </div>
            </div>

            {/* Branch and Base Path */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">{d.githubBranch}</label>
                <input
                  type="text"
                  value={ghBranch}
                  onChange={e => setGhBranch(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-5 py-4 text-xs font-bold text-slate-200 outline-none focus:ring-4 focus:ring-violet-500/20 focus:border-violet-500 transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1">{d.githubBasePath}</label>
                <input
                  type="text"
                  value={ghBasePath}
                  onChange={e => setGhBasePath(e.target.value)}
                  placeholder={d.githubBasePathPlaceholder}
                  className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-5 py-4 text-xs font-bold text-slate-200 outline-none focus:ring-4 focus:ring-violet-500/20 focus:border-violet-500 transition-all placeholder:text-slate-600"
                />
                <p className="text-[10px] text-slate-600 font-medium px-1">{d.githubBasePathHint}</p>
              </div>
            </div>

            {/* Repo access info */}
            {repoCheckStatus === 'checking' && (
              <div className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-slate-800 border border-slate-700 text-xs font-bold text-slate-400">
                <RefreshCw size={16} className="animate-spin text-violet-400" />
                {d.repoChecking}
              </div>
            )}
            {repoCheckStatus === 'done' && repoAccess && (
              <div className={`flex items-center gap-3 px-5 py-4 rounded-2xl border text-xs font-bold ${
                willCreatePR 
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' 
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              }`}>
                {willCreatePR ? (
                  <React.Fragment>
                    <GitPullRequest size={16} />
                    {d.repoAccessPR?.replace('{owner}', repoAccess.ownerLogin)}
                  </React.Fragment>
                ) : (
                  <React.Fragment>
                    <Check size={16} strokeWidth={3} />
                    {d.repoAccessDirect?.replace('{branch}', ghBranch)}
                  </React.Fragment>
                )}
              </div>
            )}
            {repoCheckStatus === 'error' && (
              <div className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs font-bold text-rose-300">
                <Info size={16} />
                {d.repoAccessError}
              </div>
            )}
          </div>

          {/* File inventory — based on deployTarget */}
          <div className="px-8 md:px-12 pb-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{d.packageContents}</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(() => {
                const hasWms = model.layers.some(l => l.geometryType !== 'None');
                const isGpkg = sourceType === 'geopackage';
                const items: { file: string; desc: string; icon: React.ReactNode }[] = [
                  { file: 'model.json', desc: d.files?.model || 'Model definition', icon: <FileCode size={16}/> },
                  { file: 'Dockerfile', desc: d.files?.dockerfile || 'Container image', icon: <Package size={16}/> },
                  { file: 'pygeoapi-config.yml', desc: isGpkg ? (d.files?.pygeoapiGpkg || 'File-based OGC API') : (d.files?.pygeoapiPg || 'Live DB'), icon: <Settings2 size={16}/> },
                ];
                if (hasWms) {
                  items.push({ file: 'project.qgs', desc: d.files?.qgis || 'Cartography', icon: <FileText size={16}/> });
                }
                if (hasWms && deployTarget !== 'docker-compose') {
                  items.push({ file: 'Dockerfile.qgis', desc: d.files?.dockerfileQgis || 'QGIS Server image', icon: <Package size={16}/> });
                }
                if (!isGpkg) {
                  items.push({ file: 'delta_export.py', desc: d.files?.delta || 'Sync engine', icon: <RefreshCw size={16}/> });
                  items.push({ file: 'nginx-stac.conf', desc: d.files?.nginxStac || 'STAC download server config', icon: <Server size={16}/> });
                  items.push({ file: 'data/output/stac/catalog.json', desc: d.files?.stacCatalog || 'Root STAC catalog', icon: <Layers size={16}/> });
                  const nonAbstract = model.layers.filter(l => !l.isAbstract);
                  if (nonAbstract.length > 0) {
                    const example = toTableName(nonAbstract[0].name);
                    items.push({
                      file: `data/output/stac/${example}/catalog.json (+${nonAbstract.length})`,
                      desc: d.files?.stacLayerCatalogs || `Per-layer STAC catalogs (${nonAbstract.length})`,
                      icon: <Layers size={16}/>,
                    });
                  }
                }
                if (deployTarget === 'docker-compose' || deployTarget === 'ghcr') {
                  items.push({ file: 'docker-compose.yml', desc: d.files?.docker || 'Orchestration', icon: <Cloud size={16}/> });
                }
                if (deployTarget === 'fly') {
                  items.push({ file: 'fly.toml', desc: d.files?.flyToml || 'Fly.io config', icon: <Cloud size={16}/> });
                  if (hasWms) {
                    items.push({ file: 'fly.qgis.toml', desc: d.files?.flyQgisToml || 'Fly.io QGIS app', icon: <Cloud size={16}/> });
                  }
                }
                if (deployTarget === 'railway') {
                  items.push({ file: 'railway.json', desc: d.files?.railwayJson || 'Railway config', icon: <Cloud size={16}/> });
                  if (hasWms) {
                    items.push({ file: 'railway.qgis.json', desc: d.files?.railwayQgisJson || 'Railway config for QGIS Server', icon: <Cloud size={16}/> });
                  }
                }
                items.push(
                  { file: '.gitignore', desc: d.files?.gitignore || 'Excludes secrets and build artifacts', icon: <Shield size={16}/> },
                  { file: '.env.template', desc: d.files?.env || 'Secrets template', icon: <Shield size={16}/> },
                  { file: '.github/workflows/deploy.yml', desc: d.files?.workflow || 'CI/CD pipeline', icon: <Zap size={16}/> },
                  { file: 'README.md', desc: d.files?.readme || 'Documentation', icon: <FileText size={16}/> },
                );
                return items.map((item, i) => (
                  <div key={i} className="flex gap-4 p-5 bg-slate-800/40 border border-slate-700/50 rounded-2xl group hover:bg-slate-800 hover:border-violet-500/30 transition-all duration-300">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-violet-400 border border-slate-700 shrink-0 group-hover:scale-110 transition-transform">{item.icon}</div>
                    <div className="min-w-0">
                      <p className="text-sm font-mono font-bold text-slate-100 mb-0.5 break-all">{item.file}</p>
                      <p className="text-[10px] text-slate-500 font-medium">{item.desc}</p>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* Publish result */}
          {publishStatus === 'success' && publishResult?.success && (
            <div className="mx-8 mb-8 p-8 bg-emerald-900/20 border border-emerald-900/50 rounded-[32px] space-y-6 animate-in zoom-in-95 duration-500">
              <div className="flex items-center gap-3 text-emerald-400">
                <Check size={24} strokeWidth={3} />
                <span className="text-xs font-black uppercase tracking-widest">{d.publishSuccess}</span>
              </div>
              <p className="text-sm text-emerald-100/80 leading-relaxed font-medium">
                {publishResult.prUrl ? d.prCreatedDesc : d.directPushDesc}
              </p>
              {publishResult.prUrl && (
                <a
                  href={publishResult.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-500 transition-all active:scale-95"
                >
                  <ExternalLink size={16} /> {d.viewPR}
                </a>
              )}
              {!publishResult.prUrl && publishResult.commitSha && (
                <a
                  href={`https://github.com/${ghRepo}/commit/${publishResult.commitSha}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-500 transition-all active:scale-95"
                >
                  <ExternalLink size={16} /> {d.viewCommit}
                </a>
              )}
            </div>
          )}

          {publishStatus === 'error' && (
            <div className="mx-8 mb-8 p-8 bg-rose-900/20 border border-rose-900/50 rounded-[32px] space-y-4 animate-in zoom-in-95 duration-500">
              <div className="flex items-center gap-3 text-rose-400">
                <Shield size={24} />
                <span className="text-xs font-black uppercase tracking-widest">{d.publishError}</span>
              </div>
              <p className="text-sm text-rose-200/80 font-mono">{publishResult?.error || 'Unknown error'}</p>
            </div>
          )}

          {/* Preview */}
          <div className="p-8 border-t border-slate-800 bg-black/40">
            <button 
              onClick={() => setShowPreview(!showPreview)} 
              className="text-[10px] text-indigo-400 font-black uppercase tracking-widest flex items-center gap-2 hover:text-indigo-300 transition-colors"
            >
              {showPreview ? <ChevronDown size={16}/> : <ChevronRight size={16}/>} {d.previewConfig}
            </button>
            {showPreview && (
              <pre className="mt-8 bg-black/60 text-indigo-200 text-[11px] font-mono p-10 rounded-[32px] overflow-x-auto max-h-[500px] border border-slate-800 custom-scrollbar leading-relaxed">
                {previewYaml}
              </pre>
            )}
          </div>

          {/* Include data toggle — bare for geopackage med opplastet fil */}
          {sourceType === 'geopackage' && localDataFile && (
            <div className="px-8 py-6 border-t border-slate-800 bg-slate-800/60">
              <label className="flex items-start gap-4 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={includeData} 
                  onChange={e => setIncludeData(e.target.checked)}
                  className="mt-1 w-5 h-5 rounded-lg border-2 border-slate-600 text-indigo-500 focus:ring-indigo-500 cursor-pointer bg-slate-900"
                />
                <div className="flex-1">
                  <span className="text-sm font-black text-white block">{d.includeData}</span>
                  <span className="text-xs text-slate-400 font-medium">
                    {localDataFile.filename} ({localDataFile.blob.size < 1024 * 1024 ? `${(localDataFile.blob.size / 1024).toFixed(1)} KB` : `${(localDataFile.blob.size / (1024 * 1024)).toFixed(1)} MB`}) → <code className="bg-slate-700 px-1.5 py-0.5 rounded text-[10px] font-mono text-indigo-300">data/</code>
                  </span>
                  {localDataFile.blob.size > 50 * 1024 * 1024 && includeData && (
                    <div className="flex items-center gap-2 mt-2 text-amber-400 text-xs font-bold">
                      <AlertTriangle size={14} />
                      {d.includeDataWarnShort}
                    </div>
                  )}
                </div>
              </label>
            </div>
          )}

          {/* Footer with actions */}
          <div className="p-8 bg-slate-900 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
            <button 
              onClick={() => setStep(2)} 
              className="px-10 py-4 rounded-2xl border-2 border-slate-700 text-slate-400 font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all hover:text-white hover:border-slate-500"
            >
              {d.back}
            </button>
            <div className="flex items-center gap-4">
              <button 
                onClick={handleDownloadZip}
                className="px-6 py-4 rounded-2xl border-2 border-slate-700 text-slate-500 font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all hover:text-slate-300 hover:border-slate-500 flex items-center gap-2"
              >
                <Download size={16} /> {d.downloadZip}
              </button>
              <button
                onClick={handlePublish}
                disabled={!isPublishReady() || publishStatus === 'loading'}
                className={`px-12 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.15em] active:scale-95 shadow-2xl transition-all flex items-center gap-3 ${
                  publishStatus === 'success' 
                    ? 'bg-emerald-600 text-white' 
                    : 'bg-violet-600 text-white shadow-violet-900/40 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed'
                }`}
              >
                {publishStatus === 'loading' ? (
                  <React.Fragment><RefreshCw size={18} className="animate-spin" /> {d.publishing}</React.Fragment>
                ) : publishStatus === 'success' ? (
                  <React.Fragment><Check size={18} strokeWidth={3} /> {d.publishSuccess}</React.Fragment>
                ) : (
                  <React.Fragment><Github size={18} /> {d.publishBtn}</React.Fragment>
                )}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default DeployPanel;