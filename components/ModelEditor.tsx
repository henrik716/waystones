import React, { useState, useEffect } from 'react';
import {
  Plus, Trash2, Layers, LayoutList, MapPin, Globe, Palette, MousePointer2,
  GitCommit, Square, Hash, Shapes, Package,
  ChevronDown, ChevronUp, Edit3, Eye, Box,
  Database, GripVertical, RotateCcw, Sparkles
} from 'lucide-react';
import { DataModel, Layer, Field, GeometryType, SharedType, SharedEnum, CodeValue } from '../types';
import { getEffectiveProperties } from '../utils/modelUtils';
import { createEmptyField, createEmptyLayer, createEmptyCodeValue, COLORS } from '../constants';
import { createEmptySharedEnum } from '../utils/factories';
import { compareModels, getStructuredChanges } from '../utils/diffUtils';
import { fetchModelHistory, fetchModelAtCommit, CommitInfo } from '../utils/githubService';
import { useDragAndDropReorder } from '../hooks/useDragAndDropReorder';
import { useRenderingOrder } from '../hooks/useRenderingOrder';
import { useAiContext } from '../hooks/useAiContext';
import { generateModelAbstract, generateLayerDescription, hasApiKey } from '../utils/aiService';
import { sanitizeTechnicalName } from '../utils/nameSanitizer';
import PropertyEditor from './PropertyEditor';
import StylePreview from './StylePreview';
import LayerStyleEditor from './LayerStyleEditor';
import ChangeReviewBar from './editor/ChangeReviewBar';
import MetadataSection from './editor/MetadataSection';
import LayerConstraintsSection from './editor/LayerConstraintsSection';
import SharedTypesTab from './editor/SharedTypesTab';

interface ModelEditorProps {
  model: DataModel;
  baselineModel: DataModel | null;
  githubConfig: { token: string; repo: string; path: string; branch: string };
  onUpdate: (model: DataModel) => void;
  onSetBaseline: (model: DataModel) => void;
  t: any;
  lang: string;
}

const DiffField: React.FC<{
  label: string;
  currentValue: any;
  baselineValue: any;
  reviewMode: boolean;
  children: React.ReactNode;
  className?: string;
}> = ({ label, currentValue, baselineValue, reviewMode, children, className }) => {
  const isChanged = reviewMode && baselineValue !== undefined && baselineValue !== null && currentValue !== baselineValue;
  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        <label className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.15em] text-slate-400 block">{label}</label>
        {isChanged && (
          <span className="text-[10px] text-rose-500 line-through font-bold animate-in fade-in slide-in-from-right-2">
            {String(baselineValue)}
          </span>
        )}
      </div>
      <div className={`transition-all duration-300 ${isChanged ? 'ring-2 ring-amber-400 bg-amber-50 rounded-[20px] overflow-hidden' : ''}`}>
        {children}
      </div>
    </div>
  );
};

const COMMON_CRS = [
  { code: 'EPSG:4326', name: 'WGS 84 (Global)' },
  { code: 'EPSG:3857', name: 'Web Mercator (Online)' },
  { code: 'EPSG:25832', name: 'EUREF89 UTM 32N (Sør)' },
  { code: 'EPSG:25833', name: 'EUREF89 UTM 33N (Hele)' },
  { code: 'EPSG:25835', name: 'EUREF89 UTM 35N (Øst)' },
  { code: 'EPSG:4258', name: 'ETRS89 (Europa)' },
];

const GEOM_ICONS: Record<string, any> = {
  'Point': MapPin,
  'LineString': GitCommit,
  'Polygon': Square,
  'MultiPoint': Hash,
  'MultiLineString': Shapes,
  'MultiPolygon': LayoutList,
  'GeometryCollection': Package,
  'None': Database // Brukes for atributtabeller
};

const uid = () => Math.random().toString(36).slice(2, 9);
const createEmptySharedType = (name = ""): SharedType => ({
  id: uid(),
  name: name || "Ny Type",
  description: "",
  properties: []
});

const ModelEditor: React.FC<ModelEditorProps> = ({ model, baselineModel, githubConfig, onUpdate, onSetBaseline, t, lang }) => {
  const [activeTab, setActiveTab] = useState<'layers' | 'types'>('layers');
  const [activeLayerId, setActiveLayerId] = useState<string>(model.layers[0]?.id || "");
  const [activeSharedTypeId, setActiveSharedTypeId] = useState<string>("");
  const [isStylingOpen, setIsStylingOpen] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);
  const [isRenderingOrderOpen, setIsRenderingOrderOpen] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [commitHistory, setCommitHistory] = useState<CommitInfo[]>([]);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const [selectedSha, setSelectedSha] = useState<string>("");

  const changes = reviewMode ? compareModels(baselineModel, model, t) : [];
  const structuredChanges = reviewMode ? getStructuredChanges(changes) : null;

  const stats = {
    added: changes.filter(c => c.type === 'added').length,
    modified: changes.filter(c => c.type === 'modified').length,
    deleted: changes.filter(c => c.type === 'deleted').length,
    total: changes.length
  };

  useEffect(() => {
    if (reviewMode && githubConfig.repo && githubConfig.path && commitHistory.length === 0) {
      loadHistory();
    }
  }, [reviewMode, githubConfig]);

  const loadHistory = async () => {
    setIsFetchingHistory(true);
    try {
      const history = await fetchModelHistory(githubConfig.token, githubConfig.repo, githubConfig.path, githubConfig.branch);
      setCommitHistory(history);
    } catch (e) {
      console.error("Failed to fetch history:", e);
    } finally {
      setIsFetchingHistory(false);
    }
  };

  const handleCompareVersion = async (sha: string) => {
    setSelectedSha(sha);
    if (!sha) return;

    try {
      const historicalModel = await fetchModelAtCommit(githubConfig.token, githubConfig.repo, githubConfig.path, sha);
      if (historicalModel) {
        onSetBaseline(historicalModel);
      }
    } catch (e) {
      console.error("Failed to fetch historical model:", e);
    }
  };

  // --- LAYER LOGIC ---
  const displayLayers = [...model.layers];
  if (reviewMode && baselineModel) {
    baselineModel.layers.forEach(bl => {
      if (!model.layers.find(l => l.id === bl.id)) {
        (displayLayers as any).push({ ...bl, isGhost: true });
      }
    });
  }

  useEffect(() => {
    if (displayLayers.length > 0 && (!activeLayerId || !displayLayers.find(l => l.id === activeLayerId))) {
      setActiveLayerId(displayLayers[0].id);
    }
  }, [model.layers, activeLayerId, displayLayers]);

  const activeLayer = displayLayers.find(l => l.id === activeLayerId) || displayLayers[0];
  const isGhostLayer = (activeLayer as any)?.isGhost;
  const baselineLayer = baselineModel?.layers.find(l => l.id === activeLayerId);

  const handleAddLayer = () => {
    const newLayer = createEmptyLayer(`Layer ${model.layers.length + 1}`);
    onUpdate({
      ...model,
      layers: [...model.layers, newLayer]
    });
    setActiveLayerId(newLayer.id);
  };

  const handleDeleteLayer = (id: string) => {
    if (model.layers.length <= 1) return;
    const newLayers = model.layers.filter(l => l.id !== id);
    onUpdate({ ...model, layers: newLayers });
    if (activeLayerId === id) setActiveLayerId(newLayers[0].id);
  };

  const handleUpdateLayer = (updatedLayer: Partial<Layer>) => {
    onUpdate({
      ...model,
      layers: model.layers.map(l => l.id === (activeLayer?.id || activeLayerId) ? { ...l, ...updatedLayer } : l)
    });
  };

  const handleAddProperty = () => {
    if (!activeLayer) return;
    handleUpdateLayer({
      properties: [...activeLayer.properties, createEmptyField()]
    });
  };

  const handleUpdateProperty = (updatedProp: Field) => {
    handleUpdateLayer({
      properties: activeLayer.properties.map(p => p.id === updatedProp.id ? updatedProp : p)
    });
  };

  const handleDeleteProperty = (id: string) => {
    handleUpdateLayer({
      properties: activeLayer.properties.filter(p => p.id !== id)
    });
  };

  const handleMoveProperty = (id: string, direction: 'up' | 'down') => {
    const index = activeLayer.properties.findIndex(p => p.id === id);
    if (index === -1) return;

    const newProps = [...activeLayer.properties];
    if (direction === 'up' && index > 0) {
      [newProps[index - 1], newProps[index]] = [newProps[index], newProps[index - 1]];
    } else if (direction === 'down' && index < newProps.length - 1) {
      [newProps[index + 1], newProps[index]] = [newProps[index], newProps[index + 1]];
    } else {
      return;
    }

    handleUpdateLayer({ properties: newProps });
  };

  // --- SHARED TYPES LOGIC ---
  const sharedTypes = model.sharedTypes || [];

  useEffect(() => {
    if (activeTab === 'types' && sharedTypes.length > 0 && !activeSharedTypeId) {
      setActiveSharedTypeId(sharedTypes[0].id);
    }
  }, [activeTab, sharedTypes, activeSharedTypeId]);

  const activeSharedType = sharedTypes.find(t => t.id === activeSharedTypeId) || sharedTypes[0];

  const handleAddSharedType = () => {
    const newType = createEmptySharedType(`Type ${sharedTypes.length + 1}`);
    onUpdate({
      ...model,
      sharedTypes: [...sharedTypes, newType]
    });
    setActiveSharedTypeId(newType.id);
  };

  const handleDeleteSharedType = (id: string) => {
    const newTypes = sharedTypes.filter(t => t.id !== id);
    onUpdate({ ...model, sharedTypes: newTypes });
    if (activeSharedTypeId === id) setActiveSharedTypeId(newTypes[0]?.id || "");
  };

  const handleUpdateSharedType = (updatedType: Partial<SharedType>) => {
    onUpdate({
      ...model,
      sharedTypes: sharedTypes.map(t => t.id === (activeSharedType?.id || activeSharedTypeId) ? { ...t, ...updatedType } : t)
    });
  };

  const handleAddSharedProperty = () => {
    if (!activeSharedType) return;
    handleUpdateSharedType({
      properties: [...activeSharedType.properties, createEmptyField()]
    });
  };

  const handleUpdateSharedProperty = (updatedProp: Field) => {
    if (!activeSharedType) return;
    handleUpdateSharedType({
      properties: activeSharedType.properties.map(p => p.id === updatedProp.id ? updatedProp : p)
    });
  };

  const handleDeleteSharedProperty = (id: string) => {
    if (!activeSharedType) return;
    handleUpdateSharedType({
      properties: activeSharedType.properties.filter(p => p.id !== id)
    });
  };

  const handleMoveSharedProperty = (id: string, direction: 'up' | 'down') => {
    if (!activeSharedType) return;
    const index = activeSharedType.properties.findIndex(p => p.id === id);
    if (index === -1) return;

    const newProps = [...activeSharedType.properties];
    if (direction === 'up' && index > 0) {
      [newProps[index - 1], newProps[index]] = [newProps[index], newProps[index - 1]];
    } else if (direction === 'down' && index < newProps.length - 1) {
      [newProps[index + 1], newProps[index]] = [newProps[index], newProps[index + 1]];
    } else {
      return;
    }
    handleUpdateSharedType({ properties: newProps });
  };

  // --- SHARED ENUMS LOGIC ---
  const sharedEnums = model.sharedEnums || [];
  const [activeSharedEnumId, setActiveSharedEnumId] = useState<string>('');
  const activeSharedEnum = sharedEnums.find(e => e.id === activeSharedEnumId) || sharedEnums[0];

  const handleAddSharedEnum = () => {
    const newEnum = createEmptySharedEnum();
    onUpdate({ ...model, sharedEnums: [...sharedEnums, newEnum] });
    setActiveSharedEnumId(newEnum.id);
  };

  const handleDeleteSharedEnum = (id: string) => {
    const remaining = sharedEnums.filter(e => e.id !== id);
    onUpdate({ ...model, sharedEnums: remaining });
    if (activeSharedEnumId === id) setActiveSharedEnumId(remaining[0]?.id || '');
  };

  const handleUpdateSharedEnum = (update: Partial<SharedEnum>) => {
    onUpdate({
      ...model,
      sharedEnums: sharedEnums.map(e => e.id === (activeSharedEnum?.id || activeSharedEnumId) ? { ...e, ...update } : e)
    });
  };

  const handleAddEnumValue = () => {
    if (!activeSharedEnum) return;
    handleUpdateSharedEnum({ values: [...activeSharedEnum.values, createEmptyCodeValue()] });
  };

  const handleUpdateEnumValue = (value: CodeValue) => {
    if (!activeSharedEnum) return;
    handleUpdateSharedEnum({ values: activeSharedEnum.values.map(v => v.id === value.id ? value : v) });
  };

  const handleDeleteEnumValue = (id: string) => {
    if (!activeSharedEnum) return;
    handleUpdateSharedEnum({ values: activeSharedEnum.values.filter(v => v.id !== id) });
  };

  // Use custom hooks for rendering order and drag-and-drop
  const { layerOrder, resetOrder, handleReorder } = useRenderingOrder({ model, onUpdate });

  const {
    draggedItem: draggedLayer,
    dragOverItem: dragOverLayer,
    handleDragStart,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handleDragEnd
  } = useDragAndDropReorder<string>({
    items: layerOrder,
    onReorder: handleReorder,
    getItemId: (id) => id
  });

  const aiContext = useAiContext();

  const getLayersForAi = () => model.layers.map(l => ({
    name: l.name,
    properties: (l.properties || []).map(p => ({ name: p.name, type: p.fieldType.kind === 'primitive' ? p.fieldType.baseType : p.fieldType.kind })),
  }));

  const handleGenerateDatasetDescription = () => {
    if (!hasApiKey()) {
      window.dispatchEvent(new CustomEvent('ai-configure-required', {
        detail: { operation: 'abstract' }
      }));
      return;
    }

    aiContext.setLoading('abstract', 'Generating dataset description…');
    generateModelAbstract({ modelName: model.name, layers: getLayersForAi(), lang }).then(result => {
      onUpdate({ ...model, description: result });
      aiContext.setSuccess();
    }).catch(error => {
      aiContext.setError(error, 'abstract');
    });
  };

  const handleGenerateLayerDescription = () => {
    if (!activeLayer) return;

    if (!hasApiKey()) {
      window.dispatchEvent(new CustomEvent('ai-configure-required', {
        detail: { operation: 'description' }
      }));
      return;
    }

    aiContext.setLoading('description', 'Generating layer description…');
    const layerProperties = activeLayer.properties.map(p => ({ name: p.name, type: p.fieldType.kind === 'primitive' ? p.fieldType.baseType : p.fieldType.kind }));
    generateLayerDescription({
      layerName: activeLayer.name,
      geometryType: activeLayer.geometryType || 'None',
      properties: layerProperties,
      lang
    }).then(result => {
      handleUpdateLayer({ description: result });
      aiContext.setSuccess();
    }).catch(error => {
      aiContext.setError(error, 'description');
    });
  };

  const AiBtn: React.FC<{ feature: 'abstract' | 'description'; label: string; onClick: () => void }> = ({ feature, label, onClick }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={aiContext.isLoading}
      className={`absolute bottom-2 right-2 z-10 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg transition-all ${aiContext.error ? 'text-rose-400 bg-rose-50' : 'text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50'
        } ${aiContext.isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <Sparkles size={10} className={aiContext.currentOperation === feature ? 'animate-pulse' : ''} />
      {aiContext.currentOperation === feature ? (t.ai?.generating || 'Generating…') : label}
    </button>
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 lg:p-12 w-full custom-scrollbar scroll-smooth">
      {reviewMode && changes.length > 0 && structuredChanges && (
        <ChangeReviewBar changes={changes} structuredChanges={structuredChanges} stats={stats} t={t} />
      )}

      {/* --- TOP TABS (LAYERS VS TYPES) --- */}
      <div className="flex items-center gap-4 mb-8">
        <div className="flex bg-slate-200/50 p-1.5 rounded-2xl">
          <button
            onClick={() => setActiveTab('layers')}
            className={`px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'layers' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Layers size={16} /> {t.layers}
          </button>
          <button
            onClick={() => setActiveTab('types')}
            className={`px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'types' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
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
                {reviewMode && githubConfig.repo && githubConfig.path && (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 w-full sm:w-auto animate-in fade-in slide-in-from-right-4 duration-300">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t.review.compareWith}</label>
                    <div className="relative">
                      <select
                        value={selectedSha}
                        onChange={e => handleCompareVersion(e.target.value)}
                        className="w-full sm:min-w-[180px] appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 pr-10 text-[10px] font-bold text-slate-600 outline-none focus:border-indigo-500 transition-all cursor-pointer"
                      >
                        <option value="">{t.review.latestBaseline}</option>
                        {commitHistory.map(commit => {
                          const versionMatch = commit.message.match(/^\[(v[\d\.]+)\]/);
                          const dateStr = new Date(commit.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

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
                              {dateStr} • {commit.sha.substring(0, 7)} • {commit.message.substring(0, 30)}...
                            </option>
                          );
                        })}
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                        {isFetchingHistory ? (
                          <div className="w-3 h-3 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                        ) : (
                          <ChevronDown size={14} />
                        )}
                      </div>
                    </div>
                  </div>
                )}
                <button
                  onClick={() => setReviewMode(!reviewMode)}
                  className={`w-full sm:w-auto justify-center flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${reviewMode ? 'bg-amber-500 border-amber-500 text-white shadow-lg shadow-amber-200' : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600'}`}
                >
                  <Eye size={14} />
                  {reviewMode ? t.review.exitReview : t.review.reviewChanges}
                </button>
              </div>
              <div className="flex-1 space-y-4 sm:space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                  <DiffField label={t.modelName} currentValue={model.name} baselineValue={baselineModel?.name} reviewMode={reviewMode} className="lg:col-span-2">
                    <input type="text" placeholder={t.modelNamePlaceholder} value={model.name} onChange={e => onUpdate({ ...model, name: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-[18px] md:rounded-[20px] px-4 py-3 text-sm md:text-base font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all" />
                  </DiffField>
                  <DiffField
                    label={
                      <div className="flex items-center gap-2">
                        {t.version}
                        <span className="bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded text-[8px] tracking-widest uppercase font-black">AUTO</span>
                      </div>
                    }
                    currentValue={model.version}
                    baselineValue={baselineModel?.version}
                    reviewMode={reviewMode}
                  >
                    <input
                      type="text"
                      value={model.version}
                      readOnly
                      title="Version is updated automatically when publishing"
                      className="w-full bg-slate-100 text-slate-500 cursor-not-allowed shadow-inner border border-slate-200 rounded-[18px] md:rounded-[20px] px-4 py-3 text-sm md:text-base font-bold outline-none transition-all"
                    />
                  </DiffField>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                  <DiffField label={t.namespace} currentValue={model.namespace} baselineValue={baselineModel?.namespace} reviewMode={reviewMode}>
                    <input type="text" placeholder={t.namespacePlaceholder} value={model.namespace} onChange={e => onUpdate({ ...model, namespace: sanitizeTechnicalName(e.target.value).replace(/_/g, '-') })} className="w-full bg-slate-50 border border-slate-200 rounded-[18px] md:rounded-[20px] px-4 py-3 text-xs md:text-sm font-mono text-indigo-700 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all" />
                  </DiffField>
                  <DiffField label={t.crsLabel} currentValue={model.crs} baselineValue={baselineModel?.crs} reviewMode={reviewMode}>
                    <div className="space-y-3">
                      <input type="text" list="crs-presets" placeholder={t.crsPlaceholder} value={model.crs || ''} onChange={e => onUpdate({ ...model, crs: e.target.value.toUpperCase() })} className="w-full bg-slate-50 border border-slate-200 rounded-[18px] md:rounded-[20px] px-4 py-3 text-sm md:text-base font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all" />
                      <div className="flex flex-wrap gap-1.5 md:gap-2">
                        {COMMON_CRS.slice(0, 5).map(crs => (
                          <button key={crs.code} onClick={() => onUpdate({ ...model, crs: crs.code })} className={`px-2 md:px-2.5 py-1 rounded-lg text-[9px] md:text-[10px] font-black border transition-all ${model.crs === crs.code ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300'}`}>
                            {crs.code}
                          </button>
                        ))}
                      </div>
                    </div>
                    <datalist id="crs-presets">{COMMON_CRS.map(crs => <option key={crs.code} value={crs.code}>{crs.name}</option>)}</datalist>
                  </DiffField>
                </div>

                <DiffField label={t.description} currentValue={model.description} baselineValue={baselineModel?.description} reviewMode={reviewMode}>
                  <div className="relative">
                    <textarea
                      placeholder={t.descriptionPlaceholder}
                      value={model.description}
                      onChange={e => onUpdate({ ...model, description: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-[18px] md:rounded-[20px] px-4 py-3 pb-10 text-xs md:text-sm min-h-[60px] md:min-h-[80px] focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all resize-none leading-relaxed"
                    />
                    <AiBtn
                      feature="abstract"
                      label={t.ai?.generateDescription || 'Generate description'}
                      onClick={handleGenerateDatasetDescription}
                    />
                  </div>
                </DiffField>
              </div>
            </div>
          </section>

          <MetadataSection model={model} onUpdate={onUpdate} isOpen={isMetadataOpen} onToggle={() => setIsMetadataOpen(!isMetadataOpen)} t={t} lang={lang} />

          <section className="mb-6 md:mb-8 pb-2">
            <div className="flex items-center justify-between mb-4 px-2">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{t.layers}</h3>
              <button onClick={handleAddLayer} className="text-xs font-black text-indigo-600 hover:underline flex items-center gap-1.5 shrink-0"><Plus size={14} /> {t.addLayer}</button>
            </div>

            {/* Rendering order interface */}
            <div className="bg-white rounded-2xl border border-slate-200 mb-4">
              <button
                onClick={() => setIsRenderingOrderOpen(!isRenderingOrderOpen)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-all rounded-t-2xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center">
                    <Layers size={16} className="text-indigo-600" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-700">{t.quickPublish?.renderingOrder || 'Rendering Order'}</h4>
                    <span className="text-[9px] text-slate-400 font-medium">{t.quickPublish?.dragToReorderLayers || 'Drag layers to reorder rendering order'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isRenderingOrderOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </div>
              </button>

              {isRenderingOrderOpen && (
                <div
                  className="px-4 pb-4"
                  onDragOver={handleDragOver}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // Custom hook handles state cleanup automatically
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[9px] text-slate-400 font-medium">
                      {layerOrder.length} {layerOrder.length === 1 ? 'layer' : 'layers'}
                    </div>
                    <button onClick={resetOrder} className="text-xs font-black text-slate-500 hover:text-slate-700 flex items-center gap-1.5 shrink-0">
                      <RotateCcw size={12} />
                      {t.quickPublish?.resetOrder || 'Reset'}
                    </button>
                  </div>
                  <div className="space-y-1">
                    {layerOrder.map(layerId => {
                      const layer = model.layers.find(l => l.id === layerId);
                      if (!layer) return null;
                      const isActive = activeLayerId === layerId;
                      const isDragged = draggedLayer === layerId;
                      const isDragOver = dragOverLayer === layerId;

                      return (
                        <div
                          key={layerId}
                          draggable
                          onDragStart={(e) => handleDragStart(e, layerId)}
                          onDragOver={handleDragOver}
                          onDragEnter={(e) => handleDragEnter(e, layerId)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, layerId)}
                          onDragEnd={handleDragEnd}
                          onClick={() => setActiveLayerId(layerId)}
                          className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all cursor-move ${isDragged ? 'opacity-50 scale-95' : ''
                            } ${isDragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-100 bg-slate-50'} ${isActive ? 'ring-2 ring-indigo-500 bg-indigo-50' : ''
                            } hover:border-slate-300 hover:bg-white`}
                        >
                          <GripVertical size={14} className="text-slate-400" />
                          <div className="w-3 h-3 rounded-full border border-white/30 shrink-0" style={{ backgroundColor: layer.style?.simpleColor || '#ccc' }} />
                          <span className="text-sm font-black text-slate-900 truncate flex-1">{layer.name || "Untitled Layer"}</span>
                          <div className="w-2 h-2 rounded-full bg-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Original layer tabs for compatibility */}
            <div className="flex flex-wrap gap-2 md:gap-3 px-1">
              {displayLayers.map(layer => {
                const isGhost = (layer as any).isGhost;
                const layerChange = changes.find(c => c.itemType === 'layer' && c.layerId === layer.id);
                return (
                  <button
                    key={layer.id}
                    onClick={() => setActiveLayerId(layer.id)}
                    className={`
                        px-4 py-3 md:px-6 md:py-3.5 rounded-[16px] md:rounded-[20px] text-xs md:text-sm font-black transition-all border flex items-center gap-2 md:gap-3 whitespace-nowrap shrink-0 relative
                        ${activeLayerId === layer.id ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-200' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:shadow-md'}
                        ${isGhost ? 'opacity-50 border-rose-200 text-rose-500 line-through' : ''}
                      `}
                  >
                    <div className="w-3 h-3 md:w-3.5 md:h-3.5 rounded-full border border-white/30" style={{ backgroundColor: layer.style?.simpleColor || '#ccc' }} />
                    {layer.name || "Untitled Layer"}
                    {reviewMode && (layerChange || isGhost) && (
                      <span className={`absolute -top-2 -right-2 px-1.5 py-0.5 rounded-md text-[8px] font-black text-white shadow-sm ${isGhost ? 'bg-rose-600' : (layerChange?.type === 'added' ? 'bg-emerald-500' : 'bg-amber-500')}`}>
                        {isGhost ? t.review.deleted.toUpperCase() : (layerChange?.type === 'added' ? t.review.added.toUpperCase() : t.review.modified.toUpperCase())}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {activeLayer && (
            <section className={`space-y-6 md:space-y-8 animate-in fade-in duration-300 pb-24 ${isGhostLayer ? 'pointer-events-none grayscale-[0.5]' : ''}`}>
              <div className="bg-white rounded-[24px] md:rounded-[32px] border border-slate-200 shadow-sm p-4 sm:p-6 md:p-8">
                <div className="flex items-center justify-between mb-5 md:mb-6">
                  <div className="flex-1 relative group/layername">
                    <DiffField label={t.layerName} currentValue={activeLayer.name} baselineValue={baselineLayer?.name} reviewMode={reviewMode}>
                      <div className="flex items-center gap-2 group">
                        <div className="relative flex-1">
                          <input type="text" value={activeLayer.name} onChange={e => handleUpdateLayer({ name: e.target.value })} className={`w-full bg-slate-50 border-2 border-slate-100 hover:border-indigo-200 text-lg sm:text-xl md:text-2xl font-black px-4 py-3 rounded-2xl focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 outline-none placeholder:text-slate-200 transition-all ${isGhostLayer ? 'line-through text-rose-500' : ''}`} placeholder={t.layerNamePlaceholder} />
                          {!isGhostLayer && <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 group-hover:text-indigo-400 transition-colors pointer-events-none"><Edit3 size={18} /></div>}
                        </div>
                      </div>
                    </DiffField>
                  </div>
                  {model.layers.length > 1 && !isGhostLayer && (
                    <button onClick={() => handleDeleteLayer(activeLayer.id)} className="ml-3 sm:ml-4 p-3 rounded-xl text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-all"><Trash2 size={20} /></button>
                  )}
                </div>

                <div className="bg-indigo-50/40 p-4 md:p-6 rounded-[20px] md:rounded-[28px] border border-indigo-100 mb-5 md:mb-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                    <div className="space-y-3 md:space-y-4">
                      <DiffField label={t.propGeometryType} currentValue={activeLayer.geometryType} baselineValue={baselineLayer?.geometryType} reviewMode={reviewMode}>
                        {/* Updated 4x2 responsive grid for geometry types */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3">
                          {Object.keys(t.geometryTypes).map((key) => {
                            const Icon = GEOM_ICONS[key] || MousePointer2;
                            const isNone = key === 'None';
                            const isActive = activeLayer.geometryType === key;
                            return (
                              <button
                                key={key}
                                onClick={() => handleUpdateLayer({ geometryType: key as GeometryType })}
                                className={`flex flex-col items-center justify-center gap-2 p-3 md:p-4 rounded-xl md:rounded-2xl text-[9px] md:text-[10px] font-black uppercase tracking-wider border transition-all min-h-[70px] md:min-h-[80px]
                                      ${isActive
                                    ? (isNone ? 'bg-slate-700 border-slate-700 text-white shadow-lg scale-[1.02]' : 'bg-indigo-600 border-indigo-600 text-white shadow-lg scale-[1.02]')
                                    : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:shadow-sm'}`}
                              >
                                <Icon size={20} className={isActive ? 'text-white' : 'text-slate-400'} />
                                <span className="w-full text-center leading-tight truncate px-1">
                                  {t.geometryTypes[key as keyof typeof t.geometryTypes]}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </DiffField>
                    </div>

                    {activeLayer.geometryType !== 'None' ? (
                      <div className="space-y-3 md:space-y-4">
                        <DiffField label={t.geomColumnName} currentValue={activeLayer.geometryColumnName} baselineValue={baselineLayer?.geometryColumnName} reviewMode={reviewMode}>
                          <input type="text" value={activeLayer.geometryColumnName} onChange={e => handleUpdateLayer({ geometryColumnName: sanitizeTechnicalName(e.target.value) })} className="w-full bg-white border border-slate-200 rounded-[16px] md:rounded-[20px] px-4 py-3 text-xs md:text-sm font-mono text-indigo-700 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all shadow-sm" />
                        </DiffField>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Globe size={12} /> {t.styling.followingModel} {model.crs}</p>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full bg-slate-100/50 rounded-2xl border-2 border-dashed border-slate-200 p-6 animate-in fade-in zoom-in-95 duration-300">
                        <div className="text-center">
                          <Database size={24} className="mx-auto text-slate-400 mb-2" />
                          <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                            {lang === 'no' ? 'Ren atributtabell' : 'Attribute Table Only'}
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
                  <button onClick={() => setIsStylingOpen(!isStylingOpen)} className="w-full flex items-center justify-between p-5 sm:p-6 md:p-8 text-left hover:bg-white/5 transition-all">
                    <div className="flex items-center gap-3 sm:gap-4 md:gap-5">
                      <div className="w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded-[14px] md:rounded-[20px] bg-indigo-600 flex items-center justify-center shadow-2xl shadow-indigo-600/40 shrink-0"><Palette size={20} className="text-white md:w-[24px] md:h-[24px]" /></div>
                      <div>
                        <h4 className="text-xs sm:text-sm md:text-base font-black uppercase tracking-[0.1em] leading-none">{t.styling.title}</h4>
                        <p className="text-[8px] sm:text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-[0.15em] mt-1.5 md:mt-2 opacity-60">{t.styling.unitHint}</p>
                      </div>
                    </div>
                    {isStylingOpen ? <ChevronUp size={20} className="text-slate-500" /> : <ChevronDown size={20} className="text-slate-500" />}
                  </button>

                  {isStylingOpen && (
                    <div className="px-4 sm:px-6 md:px-8 pb-6 sm:pb-8 md:pb-10 pt-2 animate-in slide-in-from-top-4 duration-500">
                      <LayerStyleEditor
                        layer={activeLayer}
                        onUpdate={(partial) => handleUpdateLayer({ style: { ...activeLayer.style, ...partial } })}
                        t={t}
                        variant="dark"
                        showPreview={true}
                      />
                    </div>
                  )}
                </div>

                <DiffField label={t.description} currentValue={activeLayer.description} baselineValue={baselineLayer?.description} reviewMode={reviewMode}>
                  <div className="relative">
                    <textarea
                      placeholder={t.descriptionPlaceholder}
                      value={activeLayer.description}
                      onChange={e => handleUpdateLayer({ description: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-[18px] md:rounded-[20px] px-4 py-4 pb-10 md:px-5 md:py-4 md:pb-10 text-xs md:text-sm min-h-[60px] md:min-h-[80px] focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all resize-none leading-relaxed"
                    />
                    <AiBtn
                      feature="description"
                      label={t.ai?.generateDescription || 'Generate description'}
                      onClick={handleGenerateLayerDescription}
                    />
                  </div>
                </DiffField>

                {/* Advanced / OO section — collapsed by default */}
                {!isGhostLayer && (
                  <div className="mt-4 border border-slate-200 rounded-[20px] md:rounded-[24px] overflow-hidden">
                    <button
                      onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                      className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-slate-50 transition-all"
                    >
                      <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 flex items-center gap-2">
                        <Box size={13} />
                        {lang === 'no' ? 'Avansert / Arv' : 'Advanced / Inheritance'}
                        {(activeLayer.extends || activeLayer.isAbstract) && (
                          <span className="bg-violet-100 text-violet-600 text-[9px] font-black px-2 py-0.5 rounded-full">
                            {lang === 'no' ? 'Aktiv' : 'Active'}
                          </span>
                        )}
                      </span>
                      {isAdvancedOpen ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                    </button>

                    {isAdvancedOpen && (
                      <div className="px-5 pb-5 pt-2 space-y-4 animate-in slide-in-from-top-2 duration-200 border-t border-slate-100">
                        {/* Extends dropdown */}
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 block mb-2">
                            {lang === 'no' ? 'Arver fra' : 'Extends'}
                          </label>
                          <select
                            value={activeLayer.extends ?? ''}
                            onChange={e => handleUpdateLayer({ extends: e.target.value || undefined })}
                            className="w-full bg-white border border-slate-200 rounded-[14px] px-4 py-2.5 text-xs font-mono text-slate-700 outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-400 transition-all"
                          >
                            <option value="">{lang === 'no' ? '— Ingen arv —' : '— No parent —'}</option>
                            {model.layers
                              .filter(l => l.id !== activeLayer.id && l.extends !== activeLayer.id)
                              .map(l => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                              ))}
                          </select>
                          {activeLayer.extends && (
                            <p className="text-[9px] text-violet-500 font-bold mt-1.5 flex items-center gap-1">
                              ↑ {lang === 'no' ? 'Egenskaper arves fra' : 'Properties inherited from'} <span className="font-black">{model.layers.find(l => l.id === activeLayer.extends)?.name}</span>
                            </p>
                          )}
                        </div>

                        {/* Abstract toggle */}
                        <div>
                          <label className="flex items-center gap-3 cursor-pointer select-none">
                            <div
                              onClick={() => handleUpdateLayer({ isAbstract: !activeLayer.isAbstract })}
                              className={`w-10 h-5 rounded-full transition-all relative shrink-0 ${activeLayer.isAbstract ? 'bg-violet-500' : 'bg-slate-200'}`}
                            >
                              <div className={`w-4 h-4 rounded-full bg-white shadow absolute top-0.5 transition-all ${activeLayer.isAbstract ? 'left-5' : 'left-0.5'}`} />
                            </div>
                            <div>
                              <span className="text-xs font-black text-slate-700">
                                {lang === 'no' ? 'Abstrakt lag' : 'Abstract layer'}
                              </span>
                              <p className="text-[9px] text-slate-400 mt-0.5">
                                {lang === 'no'
                                  ? 'Abstrakte lag eksporteres ikke som tabeller — de fungerer kun som maler.'
                                  : 'Abstract layers are not exported as tables — they serve as templates only.'}
                              </p>
                            </div>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-4 md:space-y-6">
                <div className="flex items-center justify-between mb-2 px-2">
                  <div className="flex items-center gap-2 md:gap-3">
                    <h2 className="text-base md:text-lg font-black text-slate-800 tracking-tight">{t.properties}</h2>
                    <span className="bg-slate-100 text-slate-500 text-[10px] md:text-xs font-black px-3 py-1 rounded-full border border-slate-200 shadow-inner">{activeLayer.properties.length}</span>
                  </div>
                  <button onClick={handleAddProperty} className="text-xs font-black text-indigo-600 hover:underline flex items-center gap-1.5 shrink-0"><Plus size={14} /> {t.addProperty}</button>
                </div>

                {/* Inherited properties — shown read-only when layer has a parent */}
                {activeLayer.extends && (() => {
                  const parentLayer = model.layers.find(l => l.id === activeLayer.extends);
                  if (!parentLayer) return null;
                  const inheritedProps = getEffectiveProperties(parentLayer, model.layers);
                  if (inheritedProps.length === 0) return null;
                  return (
                    <div className="mb-4 opacity-60 pointer-events-none select-none">
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-violet-500 mb-2 flex items-center gap-1.5 px-1">
                        ↑ {lang === 'no' ? `Arvet fra ${parentLayer.name}` : `Inherited from ${parentLayer.name}`}
                      </p>
                      <div className="space-y-2 border-l-2 border-violet-200 pl-3">
                        {inheritedProps.map(p => (
                          <div key={p.id} className="bg-violet-50/60 border border-violet-100 rounded-[14px] px-4 py-2.5 flex items-center justify-between gap-2">
                            <span className="text-xs font-mono font-bold text-slate-600">{p.name}</span>
                            <span className="text-[9px] font-black uppercase tracking-wide text-violet-400">{p.fieldType.kind === 'primitive' ? (t.types?.[p.fieldType.baseType] || p.fieldType.baseType) : (t.types?.[p.fieldType.kind] || p.fieldType.kind)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {activeLayer.properties.length === 0 && !reviewMode ? (
                  <div className="bg-white border-2 border-dashed border-slate-200 rounded-[24px] md:rounded-[40px] p-10 sm:p-16 md:p-24 text-center">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-[20px] md:rounded-[28px] bg-slate-50 flex items-center justify-center text-slate-200 mx-auto mb-6 md:mb-8 shadow-inner"><LayoutList size={40} /></div>
                    <p className="text-xs md:text-base font-bold text-slate-400 mb-6 md:mb-10">{t.noPropertiesHint}</p>
                    <button onClick={handleAddProperty} className="bg-indigo-600 text-white font-black text-[10px] md:text-xs px-8 md:px-10 py-4 md:py-5 rounded-xl md:rounded-[24px] shadow-2xl shadow-indigo-200 hover:scale-105 transition-all uppercase tracking-[0.2em]">{t.addProperty}</button>
                  </div>
                ) : (
                  <div className="space-y-3 md:space-y-5 pb-16">
                    {(() => {
                      const displayProperties = [...activeLayer.properties];
                      if (reviewMode && baselineLayer) {
                        baselineLayer.properties.forEach(bp => {
                          if (!activeLayer.properties.find(p => p.id === bp.id)) {
                            (displayProperties as any).push({ ...bp, isGhost: true });
                          }
                        });
                      }

                      return displayProperties.map((prop, idx) => {
                        const isGhost = (prop as any).isGhost;
                        const propChange = changes.find(c => c.itemType === 'property' && c.propertyId === prop.id);
                        const baselineProp = baselineLayer?.properties.find(p => p.id === prop.id);

                        return (
                          <PropertyEditor
                            key={prop.id}
                            prop={prop}
                            baselineProp={baselineProp}
                            onUpdate={handleUpdateProperty}
                            onDelete={handleDeleteProperty}
                            onMove={(dir) => handleMoveProperty(prop.id, dir)}
                            isFirst={idx === 0}
                            isLast={idx === displayProperties.length - 1}
                            t={t}
                            allLayers={model.layers.map(l => ({ id: l.id, name: l.name }))}
                            sharedTypes={sharedTypes}
                            sharedEnums={sharedEnums}
                            change={isGhost ? { type: 'deleted', itemType: 'property', itemName: prop.name } : propChange}
                            isGhost={isGhost}
                            reviewMode={reviewMode}
                            layerName={activeLayer.name}
                            lang={lang}
                          />
                        );
                      });
                    })()}
                    {!isGhostLayer && <button onClick={handleAddProperty} className="w-full py-6 md:py-8 border-2 border-dashed border-slate-200 rounded-[18px] md:rounded-[24px] text-slate-400 font-black text-[10px] uppercase tracking-[0.2em] hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all flex items-center justify-center gap-3 active:scale-[0.99]"><Plus size={18} />{t.addProperty}</button>}
                  </div>
                )}
              </div>

              <LayerConstraintsSection layer={activeLayer} onUpdateLayer={handleUpdateLayer} t={t} />
            </section>
          )}
        </>
      ) : (
        <SharedTypesTab
          model={model}
          sharedTypes={sharedTypes}
          activeSharedType={activeSharedType}
          activeSharedTypeId={activeSharedTypeId}
          onSelectSharedType={setActiveSharedTypeId}
          onAddSharedType={handleAddSharedType}
          onDeleteSharedType={handleDeleteSharedType}
          onUpdateSharedType={handleUpdateSharedType}
          onAddProperty={handleAddSharedProperty}
          onUpdateProperty={handleUpdateSharedProperty}
          onDeleteProperty={handleDeleteSharedProperty}
          onMoveProperty={handleMoveSharedProperty}
          sharedEnums={sharedEnums}
          activeSharedEnumId={activeSharedEnumId}
          onSelectSharedEnum={setActiveSharedEnumId}
          onAddSharedEnum={handleAddSharedEnum}
          onDeleteSharedEnum={handleDeleteSharedEnum}
          onUpdateSharedEnum={handleUpdateSharedEnum}
          onAddEnumValue={handleAddEnumValue}
          onUpdateEnumValue={handleUpdateEnumValue}
          onDeleteEnumValue={handleDeleteEnumValue}
          t={t}
          lang={lang}
        />
      )}
    </div>
  );
};

export default ModelEditor;