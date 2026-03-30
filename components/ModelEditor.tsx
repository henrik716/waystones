import React, { useState, useMemo, useCallback } from 'react';
import type { Translations } from '../i18n/index';
import { Eye, ChevronDown, Menu, Send, Settings2, Plus, Layers, Database, Globe, Github, Trash2 } from 'lucide-react';
import { DataModel } from '../types';
import { reprojectCoordinates } from '../utils/gdalService';
import { validateModel, groupIssuesByLayer } from '../utils/validationUtils';
import { 
  generateModelAbstract, 
  generateLayerDescription,
  suggestLayerKeywords
} from '../utils/aiService';
import { useAiContext } from '../contexts/AiContext';
import { useDragAndDropReorder } from '../hooks/useDragAndDropReorder';
import { useRenderingOrder } from '../hooks/useRenderingOrder';
import { useVersionReview } from '../hooks/useVersionReview';
import { useLayerActions } from '../hooks/useLayerActions';
import { useSharedTypesActions } from '../hooks/useSharedTypesActions';

// Components
import ChangeReviewBar from './editor/ChangeReviewBar';
import ModelHeaderSection from './editor/ModelHeaderSection';
import MetadataSection from './editor/MetadataSection';
import RenderingOrderPanel from './editor/RenderingOrderPanel';
import SharedTypesTab from './editor/SharedTypesTab';
import EditorLeftNav from './editor/EditorLeftNav';
import LayerEditorTabs from './editor/LayerEditorTabs';
import AiTrigger from './ai/AiTrigger';

interface ModelEditorProps {
  model: DataModel;
  baselineModel: DataModel | null;
  githubConfig: { token: string; repo: string; path: string; branch: string };
  onUpdate: (model: DataModel) => void;
  onSetBaseline: (model: DataModel) => void;
  t: Translations;
  lang: string;
  // Unified nav props
  models: DataModel[];
  navCollapsed?: boolean;
  onSelectModelById: (id: string) => void;
  onNewModel: () => void;
  onImportGis: () => void;
  onImportUrl: () => void;
  onImportDatabase: () => void;
  onGithubImport: () => void;
  onDeleteModel: (id: string) => void;
  onOpenMapper: () => void;
  onOpenDeploy: () => void;
  onUpdateGithubConfig: (config: any) => void;
  onOpenGithubPublish: () => void;
}

type NavSection = 'model' | 'types' | 'layer';

const ModelEditor: React.FC<ModelEditorProps> = ({
  model,
  baselineModel,
  githubConfig,
  onUpdate,
  onSetBaseline,
  t,
  lang,
  models,
  navCollapsed,
  onSelectModelById,
  onNewModel,
  onImportGis,
  onImportUrl,
  onImportDatabase,
  onGithubImport,
  onDeleteModel,
  onOpenMapper,
  onOpenDeploy,
  onUpdateGithubConfig,
  onOpenGithubPublish,
}) => {
  // --- UI state
  const [activeNavSection, setActiveNavSection] = useState<'layer' | 'model' | 'types' | 'rules'>('layer');
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isMobileModelSwitcherOpen, setIsMobileModelSwitcherOpen] = useState(false);
  const [isMobileImportMenuOpen, setIsMobileImportMenuOpen] = useState(false);
  const [isModelHeaderOpen, setIsModelHeaderOpen] = useState(true);
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);
  const [isRenderingOrderOpen, setIsRenderingOrderOpen] = useState(true);

  // --- Extracted hooks
  const versionReview = useVersionReview({
    model,
    baselineModel,
    githubConfig,
    onSetBaseline,
    t,
  });

  const sharedTypesActions = useSharedTypesActions({
    model,
    onUpdate,
    t,
  });

  const layerActions = useLayerActions({
    model,
    baselineModel,
    onUpdate,
    t,
    onTypePromoted: (newSharedTypeId) => {
      setActiveNavSection('types');
      sharedTypesActions.setActiveSharedTypeId(newSharedTypeId);
    },
  });

  const { layerOrder, resetOrder, handleReorder } = useRenderingOrder({
    model,
    onUpdate,
  });

  const {
    draggedItem: draggedLayer,
    dragOverItem: dragOverLayer,
    handleDragStart,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
  } = useDragAndDropReorder<string>({
    items: layerOrder,
    onReorder: handleReorder,
    getItemId: (id) => id,
  });

  const aiContext = useAiContext();

  // --- CRS change handler: reproject spatialExtent when CRS changes
  const handleUpdateWithCrsReproject = useCallback(async (updated: DataModel) => {
    const oldCrs = model.crs;
    const newCrs = updated.crs;
    const extent = updated.metadata?.spatialExtent;

    const hasExtent = extent &&
      extent.westBoundLongitude && extent.eastBoundLongitude &&
      extent.southBoundLatitude && extent.northBoundLatitude;

    if (newCrs && oldCrs && newCrs !== oldCrs && hasExtent) {
      const w = parseFloat(extent.westBoundLongitude);
      const e = parseFloat(extent.eastBoundLongitude);
      const s = parseFloat(extent.southBoundLatitude);
      const n = parseFloat(extent.northBoundLatitude);

      try {
        const [[rw, rs], [re, rn]] = await reprojectCoordinates(
          [[w, s], [e, n]], oldCrs, newCrs
        );
        const round4 = (v: number) => Math.round(v * 10000) / 10000;
        onUpdate({
          ...updated,
          metadata: {
            ...updated.metadata!,
            spatialExtent: {
              westBoundLongitude: String(round4(rw)),
              eastBoundLongitude: String(round4(re)),
              southBoundLatitude: String(round4(rs)),
              northBoundLatitude: String(round4(rn)),
            },
          },
        });
      } catch {
        // Reprojection failed — clear the extent to avoid silently wrong coordinates
        onUpdate({
          ...updated,
          metadata: {
            ...updated.metadata!,
            spatialExtent: { westBoundLongitude: '', eastBoundLongitude: '', southBoundLatitude: '', northBoundLatitude: '' },
          },
        });
      }
    } else {
      onUpdate(updated);
    }
  }, [model.crs, onUpdate]);

  // --- Validation
  const validationIssues = useMemo(() => validateModel(model), [model]);
  const issuesByLayer = useMemo(() => groupIssuesByLayer(validationIssues), [validationIssues]);

  // --- AI helpers
  const getLayersForAi = () =>
    model.layers.map((l) => ({
      name: l.name,
      properties: (l.properties || []).map((p) => ({
        name: p.name,
        type: p.fieldType.kind === 'primitive' ? p.fieldType.baseType : p.fieldType.kind,
      })),
    }));

  const handleGenerateDatasetDescription = () => {
    if (!aiContext.ensureApiKey('abstract')) return;
    aiContext.setLoading('abstract', 'Generating dataset description…');
    generateModelAbstract({ modelName: model.name, layers: getLayersForAi(), lang })
      .then((result) => {
        onUpdate({ ...model, description: result });
        aiContext.setSuccess();
      })
      .catch((error) => {
        aiContext.setError(error, 'abstract');
      });
  };

  const handleGenerateLayerDescription = () => {
    if (!layerActions.activeLayer) return;
    if (!aiContext.ensureApiKey('description')) return;
    aiContext.setLoading('description', 'Generating layer description…');
    const layerProperties = layerActions.activeLayer.properties.map((p) => ({
      name: p.name,
      type: p.fieldType.kind === 'primitive' ? p.fieldType.baseType : p.fieldType.kind,
    }));
    generateLayerDescription({
      layerName: layerActions.activeLayer.name,
      geometryType: layerActions.activeLayer.geometryType || 'None',
      properties: layerProperties,
      lang,
    })
      .then((result) => {
        layerActions.handleUpdateLayer({ description: result });
        aiContext.setSuccess();
      })
      .catch((error) => {
        aiContext.setError(error, 'description');
      });
  };


  const handleSuggestLayerKeywords = () => {
    if (!layerActions.activeLayer) return;
    if (!aiContext.ensureApiKey('layerKeywords')) return;
    aiContext.setLoading('layerKeywords', 'Suggesting layer keywords…');
    const layerProperties = layerActions.activeLayer.properties.map((p) => ({
      name: p.name,
      type: p.fieldType.kind === 'primitive' ? p.fieldType.baseType : p.fieldType.kind,
    }));
    suggestLayerKeywords({
      layerName: layerActions.activeLayer.name,
      properties: layerProperties,
      lang,
    })
      .then((result) => {
        const existing = layerActions.activeLayer?.keywords || [];
        const combined = Array.from(new Set([...existing, ...result]));
        layerActions.handleUpdateLayer({ keywords: combined });
        aiContext.setSuccess();
      })
      .catch((error) => {
        aiContext.setError(error, 'layerKeywords');
      });
  };

  const handleAddLayer = () => {
    layerActions.handleAddLayer();
    setActiveNavSection('layer');
  };

  const handleSelectLayer = (id: string) => {
    layerActions.setActiveLayerId(id);
    setActiveNavSection('layer');
    setIsNavOpen(false);
  };

  const issuesForActiveLayer = layerActions.activeLayer
    ? issuesByLayer.get(layerActions.activeLayer.id) || []
    : [];

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden">
      {/* ChangeReviewBar above the split — only in review mode with changes */}
      {versionReview.reviewMode &&
        versionReview.changes.length > 0 &&
        versionReview.structuredChanges && (
          <div className="shrink-0 overflow-y-auto max-h-64 custom-scrollbar">
            <ChangeReviewBar
              changes={versionReview.changes}
              structuredChanges={versionReview.structuredChanges}
              stats={versionReview.stats}
              t={t}
            />
          </div>
        )}

      {/* Body: two-panel split */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {/* Left nav */}
        <EditorLeftNav
          model={model}
          reviewMode={versionReview.reviewMode}
          changes={versionReview.changes}
          issuesByLayer={issuesByLayer}
          validationIssues={validationIssues}
          displayLayers={layerActions.displayLayers}
          activeNavSection={activeNavSection}
          activeLayerId={layerActions.activeLayerId}
          onSelectModel={() => { setActiveNavSection('model'); setIsNavOpen(false); }}
          onSelectTypes={() => { setActiveNavSection('types'); setIsNavOpen(false); }}
          onSelectLayer={handleSelectLayer}
          onAddLayer={handleAddLayer}
          t={t}
          isOpen={isNavOpen}
          onClose={() => setIsNavOpen(false)}
          isCollapsed={navCollapsed}
          models={models}
          onSelectModelById={onSelectModelById}
          onNewModel={onNewModel}
          onImportGis={onImportGis}
          onImportUrl={onImportUrl}
          onImportDatabase={onImportDatabase}
          onGithubImport={onGithubImport}
          onDeleteModel={onDeleteModel}
          onOpenMapper={onOpenMapper}
          onOpenDeploy={onOpenDeploy}
        />

        {/* Right panel */}
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden bg-white">
          {/* Mobile Top Bar */}
          <div className="lg:hidden shrink-0 flex flex-col border-b border-slate-200 bg-white/90 backdrop-blur-md sticky top-0 z-30 pointer-events-auto">
            {/* Top row: Model Switcher & Import */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100/50 relative z-40">
              <button
                onClick={() => { setIsMobileModelSwitcherOpen(!isMobileModelSwitcherOpen); setIsMobileImportMenuOpen(false); }}
                className="flex items-center gap-2 max-w-[70%] px-2 py-1.5 rounded-xl hover:bg-slate-50 transition-all text-left"
              >
                <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                <span className="text-sm font-black text-slate-800 truncate">{model.name || 'Untitled'}</span>
                <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform ${isMobileModelSwitcherOpen ? 'rotate-180' : ''}`} />
              </button>

              <div className="relative shrink-0 flex items-center">
                <button
                  onClick={() => { setIsMobileImportMenuOpen(!isMobileImportMenuOpen); setIsMobileModelSwitcherOpen(false); }}
                  className="p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 transition-all shadow-sm flex items-center justify-center"
                >
                  <Plus size={16} />
                </button>

                {/* Mobile Import Dropdown */}
                {isMobileImportMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsMobileImportMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 z-50 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden w-48 animate-in fade-in slide-in-from-top-1 duration-150">
                      <button onClick={() => { onNewModel(); setIsMobileImportMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[11px] font-bold text-indigo-600 hover:bg-slate-50 text-left"><Plus size={14} /> {t.newModel || 'New blank'}</button>
                      <button onClick={() => { onGithubImport(); setIsMobileImportMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 text-left"><Github size={14} /> {t.github?.importTitle || 'GitHub'}</button>
                      <button onClick={() => { onImportGis(); setIsMobileImportMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 text-left"><Layers size={14} /> {t.importGis || 'Import GIS'}</button>
                      <button onClick={() => { onImportDatabase(); setIsMobileImportMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 text-left"><Database size={14} /> {t.importDatabase?.title || 'Database'}</button>
                      <button onClick={() => { onImportUrl(); setIsMobileImportMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 text-left"><Globe size={14} /> {t.importUrl || 'Import URL'}</button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Bottom row: Hamburger & Context */}
            <div className="flex items-center gap-3 px-4 py-2 bg-slate-50/50">
              <button
                onClick={() => setIsNavOpen(true)}
                className="p-1.5 -ml-1.5 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-white active:scale-95 transition-all shadow-sm border border-transparent hover:border-slate-200"
                aria-label="Open navigation"
              >
                <Menu size={16} />
              </button>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex-1 truncate">
                {activeNavSection === 'model' ? t.modelSettings || 'Model Settings' : 
                 activeNavSection === 'types' ? t.sharedTypes || 'Shared Types' : 
                 layerActions.activeLayer ? layerActions.activeLayer.name || t.layerNamePlaceholder || 'Unnamed Layer' : 
                 t.selectLayer || 'Select Layer'}
              </span>
            </div>

            {/* Mobile Model Switcher Dropdown */}
            {isMobileModelSwitcherOpen && models.length > 0 && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setIsMobileModelSwitcherOpen(false)} />
                <div className="absolute top-[48px] left-0 right-0 z-40 bg-white border-b border-slate-200 shadow-xl overflow-hidden animate-in slide-in-from-top-1 duration-200 max-h-64 overflow-y-auto w-full">
                  <div className="p-2 space-y-1 bg-slate-50/50">
                    {models.map(m => (
                      <div key={m.id} className="relative flex items-center group">
                        <button 
                           onClick={() => { onSelectModelById(m.id); setIsMobileModelSwitcherOpen(false); }}
                           className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition-all ${m.id === model.id ? 'bg-indigo-50 text-indigo-700 font-black' : 'text-slate-600 font-bold hover:bg-white'}`}
                        >
                           <span className="flex-1 text-[11px] truncate">{m.name || 'Untitled'}</span>
                           <span className="text-[9px] text-slate-400 shrink-0">{m.layers.length} {t.layers?.toLowerCase() || 'layers'}</span>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); onDeleteModel(m.id); setIsMobileModelSwitcherOpen(false); }} className="absolute right-2 p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50"><Trash2 size={14}/></button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Review controls header */}
          <div className="shrink-0 flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 border-b border-slate-200 bg-white shadow-sm sm:shadow-none relative z-20">
            <button
              onClick={onOpenGithubPublish}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border bg-white border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-300"
            >
              <Send size={13} />
              {t.github?.push || 'Publish'}
            </button>
            {versionReview.reviewMode && githubConfig.repo && githubConfig.path && (
              <div className="flex items-center gap-1.5">
                <label className="hidden sm:block text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  {t.review.compareWith}
                </label>
                <div className="relative">
                  <select
                    value={versionReview.selectedSha}
                    onChange={(e) => versionReview.handleCompareVersion(e.target.value)}
                    className="appearance-none bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 pr-8 text-[10px] font-bold text-slate-600 outline-none focus:border-indigo-500 transition-all cursor-pointer min-w-[160px]"
                  >
                    <option value="">{t.review.latestBaseline}</option>
                    {versionReview.commitHistory.map((commit) => {
                      const versionMatch = commit.message.match(/^\[(v[\d.]+)\]/);
                      const dateStr = new Date(commit.date).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      });
                      if (versionMatch) {
                        const version = versionMatch[1];
                        const cleanMsg = commit.message.replace(versionMatch[0], '').trim();
                        return (
                          <option key={commit.sha} value={commit.sha}>
                            {version} • {dateStr} • {cleanMsg.substring(0, 30)}...
                          </option>
                        );
                      }
                      return (
                        <option key={commit.sha} value={commit.sha}>
                          {dateStr} • {commit.sha.substring(0, 7)} •{' '}
                          {commit.message.substring(0, 30)}...
                        </option>
                      );
                    })}
                  </select>
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    {versionReview.isFetchingHistory ? (
                      <div className="w-3 h-3 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                    ) : (
                      <ChevronDown size={12} />
                    )}
                  </div>
                </div>
              </div>
            )}
            <button
              onClick={() => versionReview.setReviewMode(!versionReview.reviewMode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                versionReview.reviewMode
                  ? 'bg-amber-500 border-amber-500 text-white shadow-lg shadow-amber-200'
                  : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600'
              }`}
            >
              <Eye size={13} />
              {versionReview.reviewMode ? t.review.exitReview : t.review.reviewChanges}
            </button>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {/* ── MODEL PANEL ── */}
            {activeNavSection === 'model' && (
              <div className="p-6 md:p-8 space-y-6 pb-24">
                <ModelHeaderSection
                  model={model}
                  baselineModel={baselineModel}
                  onUpdate={handleUpdateWithCrsReproject}
                  reviewMode={versionReview.reviewMode}
                  t={t}
                  lang={lang}
                  aiContext={aiContext}
                  onGenerateDescription={handleGenerateDatasetDescription}
                  isOpen={isModelHeaderOpen}
                  onToggle={() => setIsModelHeaderOpen(!isModelHeaderOpen)}
                />
                <MetadataSection
                  model={model}
                  onUpdate={onUpdate}
                  isOpen={isMetadataOpen}
                  onToggle={() => setIsMetadataOpen(!isMetadataOpen)}
                  t={t}
                  lang={lang}
                />
                <RenderingOrderPanel
                  model={model}
                  layerOrder={layerOrder}
                  activeLayerId={layerActions.activeLayerId}
                  onSelectLayer={(id) => handleSelectLayer(id)}
                  draggedLayer={draggedLayer}
                  dragOverLayer={dragOverLayer}
                  handleDragStart={handleDragStart}
                  handleDragOver={handleDragOver}
                  handleDragEnter={handleDragEnter}
                  handleDragLeave={handleDragLeave}
                  handleDrop={handleDrop}
                  handleDragEnd={handleDragEnd}
                  resetOrder={resetOrder}
                  isOpen={isRenderingOrderOpen}
                  onToggle={() => setIsRenderingOrderOpen(!isRenderingOrderOpen)}
                  t={t}
                />
              </div>
            )}

            {/* ── SHARED TYPES PANEL ── */}
            {activeNavSection === 'types' && (
              <SharedTypesTab
                model={model}
                allLayersFull={model.layers}
                sharedTypes={sharedTypesActions.sharedTypes}
                activeSharedType={sharedTypesActions.activeSharedType}
                activeSharedTypeId={sharedTypesActions.activeSharedTypeId}
                onSelectSharedType={sharedTypesActions.setActiveSharedTypeId}
                onAddSharedType={sharedTypesActions.handleAddSharedType}
                onDeleteSharedType={sharedTypesActions.handleDeleteSharedType}
                onUpdateSharedType={sharedTypesActions.handleUpdateSharedType}
                onAddProperty={sharedTypesActions.handleAddSharedProperty}
                onUpdateProperty={sharedTypesActions.handleUpdateSharedProperty}
                onDeleteProperty={sharedTypesActions.handleDeleteSharedProperty}
                onMoveProperty={sharedTypesActions.handleMoveSharedProperty}
                sharedEnums={sharedTypesActions.sharedEnums}
                activeSharedEnumId={sharedTypesActions.activeSharedEnumId}
                onSelectSharedEnum={sharedTypesActions.setActiveSharedEnumId}
                onAddSharedEnum={sharedTypesActions.handleAddSharedEnum}
                onDeleteSharedEnum={sharedTypesActions.handleDeleteSharedEnum}
                onUpdateSharedEnum={sharedTypesActions.handleUpdateSharedEnum}
                onAddEnumValue={sharedTypesActions.handleAddEnumValue}
                onUpdateEnumValue={sharedTypesActions.handleUpdateEnumValue}
                onDeleteEnumValue={sharedTypesActions.handleDeleteEnumValue}
                t={t}
                lang={lang}
              />
            )}

            {/* ── LAYER PANEL ── */}
            {activeNavSection === 'layer' && layerActions.activeLayer && (
              <LayerEditorTabs
                key={layerActions.activeLayerId}
                activeLayer={layerActions.activeLayer}
                baselineLayer={layerActions.baselineLayer}
                isGhostLayer={layerActions.isGhostLayer}
                validationIssues={validationIssues}
                issuesForLayer={issuesForActiveLayer}
                model={model}
                reviewMode={versionReview.reviewMode}
                changes={versionReview.changes}
                lang={lang}
                t={t}
                onUpdateLayer={layerActions.handleUpdateLayer}
                onDeleteLayer={() => layerActions.handleDeleteLayer(layerActions.activeLayer.id)}
                onAddProperty={layerActions.handleAddProperty}
                onUpdateProperty={layerActions.handleUpdateProperty}
                onDeleteProperty={layerActions.handleDeleteProperty}
                onMoveProperty={(id, dir) => layerActions.handleMoveProperty(id, dir)}
                sharedTypes={sharedTypesActions.sharedTypes}
                sharedEnums={sharedTypesActions.sharedEnums}
                onGenerateLayerDescription={handleGenerateLayerDescription}
                onSuggestLayerKeywords={handleSuggestLayerKeywords}
              />
            )}
            
            {activeNavSection === 'layer' && !layerActions.activeLayer && (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in h-full min-h-[400px]">
                <div className="w-16 h-16 rounded-[24px] bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-300 mb-6 shadow-inner mx-auto">
                  <Menu size={24} />
                </div>
                <h3 className="text-sm md:text-base font-black text-slate-800 mb-2 tracking-tight">{t.noLayerSelected || 'No Layer Selected'}</h3>
                <p className="text-[11px] md:text-xs font-medium text-slate-400 max-w-xs mx-auto mb-8 leading-relaxed">
                  {t.selectLayerToEdit || 'Please select a layer from the menu to edit its properties, style, and rules.'}
                </p>
                <div className="flex flex-col gap-3 w-full max-w-[200px] mx-auto">
                  <button
                    onClick={() => setIsNavOpen(true)}
                    className="flex justify-center items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-95 lg:hidden"
                  >
                    <Menu size={14} />
                    {t.openMenu || 'Open Menu'}
                  </button>
                  <button
                    onClick={() => setActiveNavSection('model')}
                    className="flex justify-center items-center gap-2 px-6 py-3 rounded-xl bg-white border border-slate-200 text-slate-600 text-[10px] font-black uppercase tracking-widest hover:border-indigo-300 hover:text-indigo-600 shadow-sm transition-all active:scale-95"
                  >
                    <Settings2 size={14} />
                    {t.modelSettings || 'Model Settings'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModelEditor;
