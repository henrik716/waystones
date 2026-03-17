import React, { useState, useMemo } from 'react';
import type { Translations } from '../i18n/index';
import { Plus, Trash2, Layers, Box, Eye, ChevronDown, ChevronUp, Edit3, Palette } from 'lucide-react';
import { DataModel } from '../types';
import { GEOM_ICONS } from '../constants';
import { validateModel, groupIssuesByLayer } from '../utils/validationUtils';
import { getEffectiveProperties } from '../utils/modelUtils';
import { generateModelAbstract, generateLayerDescription } from '../utils/aiService';
import { sanitizeTechnicalName } from '../utils/nameSanitizer';
import { useAiContext } from '../contexts/AiContext';
import { useDragAndDropReorder } from '../hooks/useDragAndDropReorder';
import { useRenderingOrder } from '../hooks/useRenderingOrder';
import { useVersionReview } from '../hooks/useVersionReview';
import { useLayerActions } from '../hooks/useLayerActions';
import { useSharedTypesActions } from '../hooks/useSharedTypesActions';

// Components
import DiffField from './editor/DiffField';
import ValidationBar from './editor/ValidationBar';
import RenderingOrderPanel from './editor/RenderingOrderPanel';
import ModelHeaderSection from './editor/ModelHeaderSection';
import LayerInheritanceSection from './editor/LayerInheritanceSection';
import PropertyEditor from './PropertyEditor';
import StylePreview from './StylePreview';
import LayerStyleEditor from './LayerStyleEditor';
import ChangeReviewBar from './editor/ChangeReviewBar';
import MetadataSection from './editor/MetadataSection';
import LayerConstraintsSection from './editor/LayerConstraintsSection';
import SharedTypesTab from './editor/SharedTypesTab';
import AiTrigger from './ai/AiTrigger';

interface ModelEditorProps {
  model: DataModel;
  baselineModel: DataModel | null;
  githubConfig: { token: string; repo: string; path: string; branch: string };
  onUpdate: (model: DataModel) => void;
  onSetBaseline: (model: DataModel) => void;
  t: Translations;
  lang: string;
}

const ModelEditor: React.FC<ModelEditorProps> = ({
  model,
  baselineModel,
  githubConfig,
  onUpdate,
  onSetBaseline,
  t,
  lang,
}) => {
  // --- UI state for tabs and panels
  const [activeTab, setActiveTab] = useState<'layers' | 'types'>('layers');
  const [isStylingOpen, setIsStylingOpen] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);
  const [isRenderingOrderOpen, setIsRenderingOrderOpen] = useState(false);
  const [isIssuesExpanded, setIsIssuesExpanded] = useState(false);
  const [showValidationHints, setShowValidationHints] = useState(false);
  const [isInheritedPropertiesExpanded, setIsInheritedPropertiesExpanded] = useState(false);

  // --- Extracted hooks for state management
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
      setActiveTab('types');
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
        type:
          p.fieldType.kind === 'primitive' ? p.fieldType.baseType : p.fieldType.kind,
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

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 lg:p-12 w-full custom-scrollbar scroll-smooth">
      {versionReview.reviewMode &&
        versionReview.changes.length > 0 &&
        versionReview.structuredChanges && (
          <ChangeReviewBar
            changes={versionReview.changes}
            structuredChanges={versionReview.structuredChanges}
            stats={versionReview.stats}
            t={t}
          />
        )}

      {/* --- TOP TABS (LAYERS VS TYPES) --- */}
      <div className="flex items-center gap-4 mb-8">
        <div className="flex bg-slate-200/50 p-1.5 rounded-2xl">
          <button
            onClick={() => setActiveTab('layers')}
            className={`px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
              activeTab === 'layers'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Layers size={16} /> {t.layers}
          </button>
          <button
            onClick={() => setActiveTab('types')}
            className={`px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
              activeTab === 'types'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Box size={16} /> {t.sharedTypes || 'Datatyper'}
          </button>
        </div>
      </div>

      {activeTab === 'layers' ? (
        <>
          <section className="bg-white rounded-[24px] md:rounded-[32px] border border-slate-200 shadow-sm p-5 md:p-8 mb-6 md:mb-10 relative">
            <div className="flex flex-col gap-6 md:gap-8">
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 sm:gap-4 w-full border-b border-slate-100 pb-4 mb-2">
                {versionReview.reviewMode &&
                  githubConfig.repo &&
                  githubConfig.path && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 w-full sm:w-auto animate-in fade-in slide-in-from-right-4 duration-300">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        {t.review.compareWith}
                      </label>
                      <div className="relative">
                        <select
                          value={versionReview.selectedSha}
                          onChange={(e) => versionReview.handleCompareVersion(e.target.value)}
                          className="w-full sm:min-w-[180px] appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 pr-10 text-[10px] font-bold text-slate-600 outline-none focus:border-indigo-500 transition-all cursor-pointer"
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
                              const cleanMsg = commit.message
                                .replace(versionMatch[0], '')
                                .trim();
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
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                          {versionReview.isFetchingHistory ? (
                            <div className="w-3 h-3 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                          ) : (
                            <ChevronDown size={14} />
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                <button
                  onClick={() => versionReview.setReviewMode(!versionReview.reviewMode)}
                  className={`w-full sm:w-auto justify-center flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                    versionReview.reviewMode
                      ? 'bg-amber-500 border-amber-500 text-white shadow-lg shadow-amber-200'
                      : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <Eye size={14} />
                  {versionReview.reviewMode
                    ? t.review.exitReview
                    : t.review.reviewChanges}
                </button>
              </div>
            </div>
          </section>

          <ModelHeaderSection
            model={model}
            baselineModel={baselineModel}
            onUpdate={onUpdate}
            reviewMode={versionReview.reviewMode}
            t={t}
            lang={lang}
            aiContext={aiContext}
            onGenerateDescription={handleGenerateDatasetDescription}
          />

          <MetadataSection
            model={model}
            onUpdate={onUpdate}
            isOpen={isMetadataOpen}
            onToggle={() => setIsMetadataOpen(!isMetadataOpen)}
            t={t}
            lang={lang}
          />

          <section className="mb-6 md:mb-8 pb-2">
            <div className="flex items-center justify-between mb-4 px-2">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                {t.layers}
              </h3>
              <button
                onClick={layerActions.handleAddLayer}
                className="text-xs font-black text-indigo-600 hover:underline flex items-center gap-1.5 shrink-0"
              >
                <Plus size={14} /> {t.addLayer}
              </button>
            </div>

            <RenderingOrderPanel
              model={model}
              layerOrder={layerOrder}
              activeLayerId={layerActions.activeLayerId}
              onSelectLayer={layerActions.setActiveLayerId}
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

            <ValidationBar
              validationIssues={validationIssues}
              model={model}
              isExpanded={isIssuesExpanded}
              onToggle={() => setIsIssuesExpanded(!isIssuesExpanded)}
              lang={lang}
              showHints={showValidationHints}
              onToggleHints={() => setShowValidationHints(!showValidationHints)}
            />

            {/* Layer tab buttons strip */}
            <div className="flex flex-wrap gap-2 md:gap-3 px-1">
              {layerActions.displayLayers.map((layer) => {
                const isGhost = (layer as any).isGhost;
                const layerChange = versionReview.changes.find(
                  (c) => c.itemType === 'layer' && c.layerId === layer.id
                );
                const layerIssues = issuesByLayer.get(layer.id) || [];
                const layerErrors = layerIssues.filter((i) => i.severity === 'error').length;
                const layerWarnings = layerIssues.filter((i) => i.severity === 'warning').length;
                return (
                  <button
                    key={layer.id}
                    onClick={() => layerActions.setActiveLayerId(layer.id)}
                    className={`
                      px-4 py-3 md:px-6 md:py-3.5 rounded-[16px] md:rounded-[20px] text-xs md:text-sm font-black transition-all border flex items-center gap-2 md:gap-3 whitespace-nowrap shrink-0 relative
                      ${
                        layerActions.activeLayerId === layer.id
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-200'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:shadow-md'
                      }
                      ${isGhost ? 'opacity-50 border-rose-200 text-rose-500 line-through' : ''}
                    `}
                  >
                    <div
                      className="w-3 h-3 md:w-3.5 md:h-3.5 rounded-full border border-white/30"
                      style={{ backgroundColor: layer.style?.simpleColor || '#ccc' }}
                    />
                    {layer.name || 'Untitled Layer'}
                    {!versionReview.reviewMode && layerErrors > 0 && (
                      <span className="absolute -top-2 -right-2 w-4 h-4 bg-rose-500 rounded-full flex items-center justify-center text-[8px] font-black text-white">
                        {layerErrors}
                      </span>
                    )}
                    {!versionReview.reviewMode &&
                      layerErrors === 0 &&
                      layerWarnings > 0 && (
                        <span className="absolute -top-2 -right-2 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center text-[8px] font-black text-white">
                          {layerWarnings}
                        </span>
                      )}
                    {versionReview.reviewMode && (layerChange || isGhost) && (
                      <span
                        className={`absolute -top-2 -right-2 px-1.5 py-0.5 rounded-md text-[8px] font-black text-white shadow-sm ${
                          isGhost
                            ? 'bg-rose-600'
                            : layerChange?.type === 'added'
                              ? 'bg-emerald-500'
                              : 'bg-amber-500'
                        }`}
                      >
                        {isGhost
                          ? t.review.deleted.toUpperCase()
                          : layerChange?.type === 'added'
                            ? t.review.added.toUpperCase()
                            : t.review.modified.toUpperCase()}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {layerActions.activeLayer && (
            <section
              className={`space-y-6 md:space-y-8 animate-in fade-in duration-300 pb-24 ${
                layerActions.isGhostLayer ? 'pointer-events-none grayscale-[0.5]' : ''
              }`}
            >
              <div className="bg-white rounded-[24px] md:rounded-[32px] border border-slate-200 shadow-sm p-4 sm:p-6 md:p-8">
                <div className="flex items-center justify-between mb-5 md:mb-6">
                  <div className="flex-1 relative group/layername">
                    <DiffField
                      label={t.layerName}
                      currentValue={layerActions.activeLayer.name}
                      baselineValue={layerActions.baselineLayer?.name}
                      reviewMode={versionReview.reviewMode}
                    >
                      <div className="flex items-center gap-2 group">
                        <div className="relative flex-1">
                          <input
                            type="text"
                            value={layerActions.activeLayer.name}
                            onChange={(e) =>
                              layerActions.handleUpdateLayer({ name: e.target.value })
                            }
                            className={`w-full bg-slate-50 border-2 border-slate-100 hover:border-indigo-200 text-lg sm:text-xl md:text-2xl font-black px-4 py-3 rounded-2xl focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 outline-none placeholder:text-slate-200 transition-all ${
                              layerActions.isGhostLayer ? 'line-through text-rose-500' : ''
                            }`}
                            placeholder={t.layerNamePlaceholder}
                          />
                          {!layerActions.isGhostLayer && (
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 group-hover:text-indigo-400 transition-colors pointer-events-none">
                              <Edit3 size={18} />
                            </div>
                          )}
                        </div>
                      </div>
                    </DiffField>
                  </div>
                  {model.layers.length > 1 && !layerActions.isGhostLayer && (
                    <button
                      onClick={() => layerActions.handleDeleteLayer(layerActions.activeLayer.id)}
                      className="ml-3 sm:ml-4 p-3 rounded-xl text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-all"
                    >
                      <Trash2 size={20} />
                    </button>
                  )}
                </div>

                <div className="bg-indigo-50/40 p-4 md:p-6 rounded-[20px] md:rounded-[28px] border border-indigo-100 mb-5 md:mb-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                    <div className="space-y-3 md:space-y-4">
                      <DiffField
                        label={t.propGeometryType}
                        currentValue={layerActions.activeLayer.geometryType}
                        baselineValue={layerActions.baselineLayer?.geometryType}
                        reviewMode={versionReview.reviewMode}
                      >
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3">
                          {Object.keys(t.geometryTypes).map((key) => {
                            const Icon = GEOM_ICONS[key] || Layers;
                            const isNone = key === 'None';
                            const isActive = layerActions.activeLayer.geometryType === key;
                            return (
                              <button
                                key={key}
                                onClick={() =>
                                  layerActions.handleUpdateLayer({
                                    geometryType: key as any,
                                  })
                                }
                                className={`flex flex-col items-center justify-center gap-2 p-3 md:p-4 rounded-xl md:rounded-2xl text-[9px] md:text-[10px] font-black uppercase tracking-wider border transition-all min-h-[70px] md:min-h-[80px]
                                  ${
                                    isActive
                                      ? isNone
                                        ? 'bg-slate-700 border-slate-700 text-white shadow-lg scale-[1.02]'
                                        : 'bg-indigo-600 border-indigo-600 text-white shadow-lg scale-[1.02]'
                                      : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:shadow-sm'
                                  }`}
                              >
                                <Icon
                                  size={20}
                                  className={isActive ? 'text-white' : 'text-slate-400'}
                                />
                                <span className="w-full text-center leading-tight truncate px-1">
                                  {
                                    t.geometryTypes[
                                      key as keyof typeof t.geometryTypes
                                    ]
                                  }
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </DiffField>
                    </div>

                    {layerActions.activeLayer.geometryType !== 'None' ? (
                      <div className="space-y-3 md:space-y-4">
                        <DiffField
                          label={t.geomColumnName}
                          currentValue={layerActions.activeLayer.geometryColumnName}
                          baselineValue={layerActions.baselineLayer?.geometryColumnName}
                          reviewMode={versionReview.reviewMode}
                        >
                          <input
                            type="text"
                            value={layerActions.activeLayer.geometryColumnName}
                            onChange={(e) =>
                              layerActions.handleUpdateLayer({
                                geometryColumnName: sanitizeTechnicalName(e.target.value),
                              })
                            }
                            className="w-full bg-white border border-slate-200 rounded-[16px] md:rounded-[20px] px-4 py-3 text-xs md:text-sm font-mono text-indigo-700 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all shadow-sm"
                          />
                        </DiffField>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full bg-slate-100/50 rounded-2xl border-2 border-dashed border-slate-200 p-6 animate-in fade-in zoom-in-95 duration-300">
                        <div className="text-center">
                          <Layers size={24} className="mx-auto text-slate-400 mb-2" />
                          <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                            {lang === 'no'
                              ? 'Ren atributtabell'
                              : 'Attribute Table Only'}
                          </p>
                          <p className="text-[9px] text-slate-400">
                            {lang === 'no'
                              ? 'Dette laget vil ikke ha geografiske egenskaper.'
                              : 'This layer will not contain any spatial geometry features.'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-slate-900 rounded-[24px] md:rounded-[32px] mb-6 text-white overflow-hidden shadow-2xl transition-all">
                  <button
                    onClick={() => setIsStylingOpen(!isStylingOpen)}
                    className="w-full flex items-center justify-between p-5 sm:p-6 md:p-8 text-left hover:bg-white/5 transition-all"
                  >
                    <div className="flex items-center gap-3 sm:gap-4 md:gap-5">
                      <div className="w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded-[14px] md:rounded-[20px] bg-indigo-600 flex items-center justify-center shadow-2xl shadow-indigo-600/40 shrink-0">
                        <Palette size={20} className="text-white md:w-[24px] md:h-[24px]" />
                      </div>
                      <div>
                        <h4 className="text-xs sm:text-sm md:text-base font-black uppercase tracking-[0.1em] leading-none">
                          {t.styling.title}
                        </h4>
                        <p className="text-[8px] sm:text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-[0.15em] mt-1.5 md:mt-2 opacity-60">
                          {t.styling.unitHint}
                        </p>
                      </div>
                    </div>
                    {isStylingOpen ? (
                      <ChevronUp size={20} className="text-slate-500" />
                    ) : (
                      <ChevronDown size={20} className="text-slate-500" />
                    )}
                  </button>

                  {isStylingOpen && (
                    <div className="px-4 sm:px-6 md:px-8 pb-6 sm:pb-8 md:pb-10 pt-2 animate-in slide-in-from-top-4 duration-500">
                      <LayerStyleEditor
                        layer={layerActions.activeLayer}
                        onUpdate={(partial) =>
                          layerActions.handleUpdateLayer({
                            style: {
                              ...layerActions.activeLayer.style,
                              ...partial,
                            },
                          })
                        }
                        t={t}
                        variant="dark"
                        showPreview={true}
                      />
                    </div>
                  )}
                </div>

                <DiffField
                  label={t.description}
                  currentValue={layerActions.activeLayer.description}
                  baselineValue={layerActions.baselineLayer?.description}
                  reviewMode={versionReview.reviewMode}
                  action={
                    <AiTrigger
                      onClick={handleGenerateLayerDescription}
                      isLoading={aiContext.isLoading}
                      isActive={aiContext.currentOperation === 'description'}
                      hasError={!!aiContext.error}
                      label={t.ai?.generateDescription || 'Generate description'}
                      t={t}
                    />
                  }
                >
                  <textarea
                    placeholder={t.descriptionPlaceholder}
                    value={layerActions.activeLayer.description}
                    onChange={(e) =>
                      layerActions.handleUpdateLayer({ description: e.target.value })
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-[18px] md:rounded-[20px] px-4 py-4 md:px-5 md:py-4 text-xs md:text-sm min-h-[60px] md:min-h-[80px] focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all resize-none leading-relaxed"
                  />
                </DiffField>

                {!layerActions.isGhostLayer && (
                  <LayerInheritanceSection
                    layer={layerActions.activeLayer}
                    allLayers={model.layers}
                    onUpdateLayer={layerActions.handleUpdateLayer}
                    isOpen={isAdvancedOpen}
                    onToggle={() => setIsAdvancedOpen(!isAdvancedOpen)}
                    lang={lang}
                  />
                )}
              </div>

              <div className="space-y-4 md:space-y-6">
                <div className="flex items-center justify-between mb-2 px-2">
                  <div className="flex items-center gap-2 md:gap-3">
                    <h2 className="text-base md:text-lg font-black text-slate-800 tracking-tight">
                      {t.properties}
                    </h2>
                    <span className="bg-slate-100 text-slate-500 text-[10px] md:text-xs font-black px-3 py-1 rounded-full border border-slate-200 shadow-inner">
                      {layerActions.activeLayer.properties.length}
                    </span>
                  </div>
                  <button
                    onClick={layerActions.handleAddProperty}
                    className="text-xs font-black text-indigo-600 hover:underline flex items-center gap-1.5 shrink-0"
                  >
                    <Plus size={14} /> {t.addProperty}
                  </button>
                </div>

                {layerActions.activeLayer.properties.length === 0 &&
                !versionReview.reviewMode ? (
                  <div className="bg-white border-2 border-dashed border-slate-200 rounded-[24px] md:rounded-[40px] p-10 sm:p-16 md:p-24 text-center">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-[20px] md:rounded-[28px] bg-slate-50 flex items-center justify-center text-slate-200 mx-auto mb-6 md:mb-8 shadow-inner">
                      <Layers size={40} />
                    </div>
                    <p className="text-xs md:text-base font-bold text-slate-400 mb-6 md:mb-10">
                      {t.noPropertiesHint}
                    </p>
                    <button
                      onClick={layerActions.handleAddProperty}
                      className="bg-indigo-600 text-white font-black text-[10px] md:text-xs px-8 md:px-10 py-4 md:py-5 rounded-xl md:rounded-[24px] shadow-2xl shadow-indigo-200 hover:scale-105 transition-all uppercase tracking-[0.2em]"
                    >
                      {t.addProperty}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 md:space-y-5 pb-16">
                    {/* Inherited properties — shown read-only when layer has a parent */}
                    {layerActions.activeLayer.extends && (() => {
                      const parentLayer = model.layers.find(
                        (l) => l.id === layerActions.activeLayer.extends
                      );
                      if (!parentLayer) return null;
                      const inheritedProps = getEffectiveProperties(parentLayer, model.layers);
                      if (inheritedProps.length === 0) return null;
                      return (
                        <div className="mb-4 border border-violet-100 rounded-[14px] overflow-hidden bg-violet-50/40">
                          <button
                            onClick={() =>
                              setIsInheritedPropertiesExpanded(!isInheritedPropertiesExpanded)
                            }
                            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-violet-50/60 transition-colors"
                          >
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-violet-500 flex items-center gap-1.5">
                              ↑{' '}
                              {lang === 'no'
                                ? `Arvet fra ${parentLayer.name}`
                                : `Inherited from ${parentLayer.name}`}
                            </span>
                            {isInheritedPropertiesExpanded ? (
                              <ChevronUp size={14} className="text-violet-400 shrink-0" />
                            ) : (
                              <ChevronDown size={14} className="text-violet-400 shrink-0" />
                            )}
                          </button>

                          {isInheritedPropertiesExpanded && (
                            <div className="px-4 pb-4 pt-2 space-y-2 border-t border-violet-100 animate-in slide-in-from-top-1 duration-200">
                              {inheritedProps.map((p) => (
                                <div
                                  key={p.id}
                                  className="bg-white border border-violet-100 rounded-[12px] px-4 py-2.5 flex items-center justify-between gap-2"
                                >
                                  <span className="text-xs font-mono font-bold text-slate-600">
                                    {p.name}
                                  </span>
                                  <span className="text-[9px] font-black uppercase tracking-wide text-violet-500">
                                    {p.fieldType.kind === 'primitive'
                                      ? t.types?.[p.fieldType.baseType] ||
                                        p.fieldType.baseType
                                      : t.types?.[p.fieldType.kind] || p.fieldType.kind}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {(() => {
                      const displayProperties = [...layerActions.activeLayer.properties];
                      if (versionReview.reviewMode && layerActions.baselineLayer) {
                        layerActions.baselineLayer.properties.forEach((bp) => {
                          if (
                            !layerActions.activeLayer.properties.find(
                              (p) => p.id === bp.id
                            )
                          ) {
                            (displayProperties as any).push({ ...bp, isGhost: true });
                          }
                        });
                      }

                      return displayProperties.map((prop, idx) => {
                        const isGhost = (prop as any).isGhost;
                        const propChange = versionReview.changes.find(
                          (c) => c.itemType === 'property' && c.propertyId === prop.id
                        );
                        const baselineProp = layerActions.baselineLayer?.properties.find(
                          (p) => p.id === prop.id
                        );

                        return (
                          <PropertyEditor
                            key={prop.id}
                            prop={prop}
                            baselineProp={baselineProp}
                            onUpdate={layerActions.handleUpdateProperty}
                            onDelete={layerActions.handleDeleteProperty}
                            onMove={(dir) => layerActions.handleMoveProperty(prop.id, dir)}
                            isFirst={idx === 0}
                            isLast={idx === displayProperties.length - 1}
                            t={t}
                            allLayers={model.layers.map((l) => ({
                              id: l.id,
                              name: l.name,
                            }))}
                            allLayersFull={model.layers}
                            sharedTypes={sharedTypesActions.sharedTypes}
                            sharedEnums={sharedTypesActions.sharedEnums}
                            change={
                              isGhost
                                ? {
                                    type: 'deleted',
                                    itemType: 'property',
                                    itemName: prop.name,
                                  }
                                : propChange
                            }
                            isGhost={isGhost}
                            reviewMode={versionReview.reviewMode}
                            layerName={layerActions.activeLayer.name}
                            lang={lang}
                          />
                        );
                      });
                    })()}
                    {!layerActions.isGhostLayer && (
                      <button
                        onClick={layerActions.handleAddProperty}
                        className="w-full py-6 md:py-8 border-2 border-dashed border-slate-200 rounded-[18px] md:rounded-[24px] text-slate-400 font-black text-[10px] uppercase tracking-[0.2em] hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all flex items-center justify-center gap-3 active:scale-[0.99]"
                      >
                        <Plus size={18} />
                        {t.addProperty}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <LayerConstraintsSection
                layer={layerActions.activeLayer}
                onUpdateLayer={layerActions.handleUpdateLayer}
                t={t}
              />
            </section>
          )}
        </>
      ) : (
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
    </div>
  );
};

export default ModelEditor;
