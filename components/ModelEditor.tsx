import React, { useState, useMemo } from 'react';
import type { Translations } from '../i18n/index';
import { Eye, ChevronDown, Menu } from 'lucide-react';
import { DataModel } from '../types';
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
}) => {
  // --- UI state
  const [activeNavSection, setActiveNavSection] = useState<NavSection>('layer');
  const [isNavOpen, setIsNavOpen] = useState(false);
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
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Mobile nav toggle button */}
        <button
          onClick={() => setIsNavOpen(true)}
          className="lg:hidden fixed bottom-6 left-4 z-40 w-11 h-11 bg-white border border-slate-200 rounded-2xl shadow-lg flex items-center justify-center text-slate-500 hover:text-indigo-600 transition-all"
          aria-label="Open navigation"
        >
          <Menu size={18} />
        </button>

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
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          {/* Review controls header */}
          <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 px-4 py-2 border-b border-slate-200 bg-white">
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
                  onUpdate={onUpdate}
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModelEditor;
