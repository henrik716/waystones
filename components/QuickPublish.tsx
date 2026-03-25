import React, { useState, useEffect } from 'react';
import type { Translations } from '../i18n/index';
import {
  ChevronLeft, ChevronDown, ChevronRight, Check, Database, Tag, Github, ArrowRight, Paintbrush, GripVertical, RotateCcw
} from 'lucide-react';
import { DataModel, LayerStyle, ImportValidationResult } from '../types';
import { InferredDataSummary } from '../utils/importUtils';
import { useDragAndDropReorder } from '../hooks/useDragAndDropReorder';
import { useRenderingOrder } from '../hooks/useRenderingOrder';
import LayerStyleEditor from './LayerStyleEditor';
import ImportWarnings from './ImportWarnings';
import MetadataStep from './quickpublish/MetadataStep';
import PublishStep from './quickpublish/PublishStep';

interface QuickPublishProps {
  model: DataModel;
  summary: InferredDataSummary;
  validation?: ImportValidationResult;
  t: Translations;
  lang: string;
  onUpdateModel: (model: DataModel) => void;
  onBack: () => void;
  onOpenEditor: () => void;
  dataBlob?: { blob: Blob; filename: string } | null;
}

const GEOM_ICONS: Record<string, string> = {
  Point: '●', MultiPoint: '●●', LineString: '╱', MultiLineString: '╱╱',
  Polygon: '◆', MultiPolygon: '◆◆', GeometryCollection: '◇', None: '○'
};

const QuickPublish: React.FC<QuickPublishProps> = ({
  model, summary, validation, t, lang, onUpdateModel, onBack, onOpenEditor, dataBlob
}) => {
  const q = t.quickPublish || {};

  const [step, setStep] = useState(0);
  const [selectedLayers, setSelectedLayers] = useState<Set<string>>(
    new Set(model.layers.map(l => l.id))
  );
  const [collapsedPreviews, setCollapsedPreviews] = useState<Set<string>>(
    new Set((model.renderingOrder || model.layers.map(l => l.id)).slice(1).map(id => id)) // All but first layer in custom order collapsed
  );

  // Use custom hooks for rendering order and drag-and-drop
  const { layerOrder, resetOrder, handleReorder } = useRenderingOrder({ model, onUpdateModel: onUpdateModel });
  
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

  // Helper: toggle preview collapse state
  const togglePreviewCollapse = (layerId: string) => {
    const next = new Set(collapsedPreviews);
    if (next.has(layerId)) next.delete(layerId);
    else next.add(layerId);
    setCollapsedPreviews(next);
  };

  // Update collapse state when selected layers change
  useEffect(() => {
    const selectedLayerIds = model.layers.filter(l => selectedLayers.has(l.id)).map(l => l.id);
    setCollapsedPreviews(prev => {
      const next = new Set(prev);
      // Remove collapsed state for layers that are no longer selected
      prev.forEach(layerId => {
        if (!selectedLayerIds.includes(layerId)) {
          next.delete(layerId);
        }
      });
      return next;
    });
  }, [selectedLayers, model.layers]);

  // Update collapsed state when layer order changes - first layer should be expanded
  useEffect(() => {
    const selectedLayerIds = layerOrder.filter(id => selectedLayers.has(id));
    setCollapsedPreviews(prev => {
      const next = new Set(prev);
      // Clear all collapsed states first
      next.clear();
      // Add all layers except the first one to collapsed state
      selectedLayerIds.slice(1).forEach(layerId => {
        next.add(layerId);
      });
      return next;
    });
  }, [layerOrder, selectedLayers]);

  const updateLayerStyle = (layerId: string) => (style: Partial<LayerStyle>) => {
    onUpdateModel({
      ...model,
      layers: model.layers.map(l =>
        l.id === layerId ? { ...l, style: { ...l.style, ...style } } : l
      ),
    });
  };

  // Step indicators
  const st = t.styling || {};
  const steps = [
    { icon: Database, label: q.step1Title },
    { icon: Paintbrush, label: q.stepStyleTitle || st.title },
    { icon: Tag, label: q.step2Title },
    { icon: Github, label: q.step3Title },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-10 lg:p-14 min-w-0 custom-scrollbar scroll-smooth">
      {/* Back + Open Editor buttons */}
      <div className="flex items-center justify-between mb-8">
        <button onClick={onBack} className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-indigo-600 transition-colors group">
          <div className="p-2 rounded-xl bg-white border border-slate-200 shadow-sm group-hover:border-indigo-200 group-hover:bg-indigo-50 transition-all"><ChevronLeft size={16} /></div>
          {q.backToStart}
        </button>
        <button onClick={onOpenEditor} className="text-[10px] font-black uppercase tracking-[0.15em] text-indigo-500 hover:text-indigo-700 transition-colors">
          {q.editModel} →
        </button>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-10">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === step;
          const isDone = i < step;
          return (
            <React.Fragment key={i}>
              {i > 0 && <div className={`flex-1 h-0.5 rounded-full transition-colors ${isDone ? 'bg-indigo-400' : 'bg-slate-200'}`} />}
              <button
                onClick={() => i <= step && setStep(i)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all ${
                  isActive ? 'bg-slate-900 text-white shadow-lg' :
                  isDone ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100' :
                  'bg-slate-100 text-slate-400'
                }`}
              >
                {isDone ? <Check size={14} strokeWidth={3} /> : <Icon size={14} />}
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* STEP 0: Review tables */}
      {step === 0 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-400">
          <div className="space-y-2">
            <h2 className="text-2xl font-black tracking-tight text-slate-900">{q.step1Title}</h2>
            <p className="text-sm text-slate-400 font-medium">{q.step1Desc}</p>
          </div>

          {/* Validation warnings */}
          {validation && (
            <ImportWarnings
              key={`validation-${Date.now()}-${validation.warnings.length}-${validation.errors.length}-${validation.warnings.map(w => `${w.layerName}:${w.type}:${w.message}`).sort().join('|')}-${validation.errors.map(e => `${e.layerName}:${e.type}:${e.message}`).sort().join('|')}`}
              validation={validation}
              t={t}
              lang={lang}
            />
          )}

          {/* Layer selection section */}
          <div className="bg-white rounded-2xl border-2 border-slate-200 p-6 space-y-4">
            <div className="space-y-2">
              <h3 className="text-lg font-black text-slate-900">Select Layers to Include</h3>
              <p className="text-sm text-slate-400 font-medium">Choose which layers you want to include in your published model</p>
            </div>
            
            <div className="space-y-2">
              {layerOrder.map((layerId, index) => {
                const modelLayer = model.layers.find(l => l.id === layerId);
                const summaryLayer = summary.layers.find(l => modelLayer && model.layers.indexOf(modelLayer) === summary.layers.indexOf(l));
                if (!modelLayer || !summaryLayer) return null;
                
                const isSelected = selectedLayers.has(modelLayer.id);
                
                return (
                  <div
                    key={layerId}
                    className={`flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
                      isSelected ? 'ring-2 ring-indigo-400 border-indigo-200 bg-indigo-50' : 'border-slate-200 bg-slate-50'
                    } hover:border-slate-300 hover:bg-white`}
                    onClick={() => {
                      const next = new Set(selectedLayers);
                      if (next.has(modelLayer.id)) {
                        next.delete(modelLayer.id);
                      } else {
                        next.add(modelLayer.id);
                      }
                      setSelectedLayers(next);
                    }}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 transition-colors ${
                        isSelected ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {GEOM_ICONS[summaryLayer.geometryType] || '◇'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-900 truncate">{summaryLayer.tableName}</p>
                        <p className="text-[9px] text-slate-400 font-medium">
                          {summaryLayer.geometryType} · {summaryLayer.featureCount.toLocaleString()} {q.features}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = new Set(selectedLayers);
                        if (isSelected && next.size > 1) next.delete(modelLayer.id);
                        else next.add(modelLayer.id);
                        setSelectedLayers(next);
                      }}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all shrink-0 ${
                        isSelected ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300'
                      }`}
                    >
                      {isSelected && <Check size={12} strokeWidth={3} className="text-white" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between pt-4">
            <span className="text-xs text-slate-400 font-bold">{selectedLayers.size} {q.selectedLayers}</span>
            <button onClick={() => setStep(1)} className="px-8 py-3.5 rounded-2xl bg-slate-900 text-white font-black text-xs uppercase tracking-[0.15em] hover:bg-slate-800 active:scale-95 transition-all shadow-lg flex items-center gap-2">
              {q.next} <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 1: Symbology */}
      {step === 1 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-400">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-slate-900">{q.stepStyleTitle || st.title}</h2>
                <p className="text-sm text-slate-400 font-medium">{q.stepStyleDesc}</p>
                <div className="flex items-center gap-2 text-xs text-indigo-600 font-medium">
                  <GripVertical size={14} />
                  <span>{q.dragToReorderLayers || 'Drag layers to reorder rendering order'}</span>
                </div>
              </div>
              <button 
                onClick={resetOrder} 
                className="text-xs font-black text-slate-500 hover:text-slate-700 flex items-center gap-1.5 shrink-0 px-3 py-2 rounded-lg border border-slate-200 hover:border-slate-300 transition-all"
              >
                <RotateCcw size={12} />
                {q.resetOrder || 'Reset Order'}
              </button>
            </div>
          </div>

          <div className="space-y-6"
             onDragOver={handleDragOver}
             onDrop={(e) => {
               e.preventDefault();
               e.stopPropagation();
               // Custom hook handles state cleanup automatically
             }}
          >
            {layerOrder
              .filter(layerId => selectedLayers.has(layerId))
              .map(layerId => {
                const layer = model.layers.find(l => l.id === layerId);
                if (!layer) return null;
                const isCollapsed = collapsedPreviews.has(layer.id);
                return (
                <div key={layer.id} className={`bg-white rounded-2xl border-2 transition-all duration-200 overflow-hidden relative ${isCollapsed ? 'border-slate-200' : 'border-indigo-200 shadow-md shadow-indigo-50'}`}>
                  {/* Collapsible header with drag functionality */}
                  <div
                    draggable
                    onDragStart={(e) => handleDragStart(e, layer.id)}
                    onDragOver={handleDragOver}
                    onDragEnter={(e) => handleDragEnter(e, layer.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, layer.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => {
                      console.log('Clicked layer:', layer.name, 'collapsed:', isCollapsed);
                      togglePreviewCollapse(layer.id);
                    }}
                    className={`flex items-center gap-3 p-5 transition-all duration-200 cursor-pointer relative z-10 ${
                      draggedLayer === layer.id ? 'opacity-50 scale-95' : ''
                    } ${dragOverLayer === layer.id ? 'border-indigo-400 bg-indigo-50' : ''} ${
                      isCollapsed ? 'hover:bg-slate-50' : 'hover:bg-indigo-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <GripVertical size={16} className="text-slate-400 cursor-move" />
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold transition-colors ${isCollapsed ? 'bg-slate-100 text-slate-500' : 'bg-indigo-100 text-indigo-600'}`}>
                        {GEOM_ICONS[layer.geometryType] || '◇'}
                      </div>
                    </div>
                    <div className="flex-1 flex items-center gap-3">
                      <div className="text-left">
                        <p className={`text-sm font-black transition-colors ${isCollapsed ? 'text-slate-900' : 'text-indigo-900'}`}>{layer.name}</p>
                        <p className="text-[10px] text-slate-400 font-medium">{layer.geometryType}</p>
                      </div>
                    </div>
                    <div className={`transition-transform duration-200 ${isCollapsed ? 'rotate-0' : 'rotate-180'}`}>
                      <ChevronDown size={20} className={`transition-colors ${isCollapsed ? 'text-slate-400' : 'text-indigo-500'}`} />
                    </div>
                  </div>
                  
                  {/* Collapsible content */}
                  <div className={`transition-all duration-300 ease-in-out ${isCollapsed ? 'max-h-0 opacity-0' : 'max-h-screen opacity-100'}`}>
                    <div className={`p-5 pt-0 space-y-4 ${isCollapsed ? 'border-t-0' : 'border-t border-slate-100'}`}>
                      <LayerStyleEditor
                        layer={layer}
                        onUpdate={updateLayerStyle(layer.id)}
                        t={t}
                        variant="light"
                        showPreview={true}
                      />
                    </div>
                  </div>
                  
                  {/* Collapsed state indicator */}
                  {isCollapsed && (
                    <div className="px-5 pb-3 pointer-events-none">
                      <div className="text-xs text-slate-400 font-medium italic">
                        {q.clickToConfigure}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-4">
            <button onClick={() => setStep(0)} className="px-6 py-3 rounded-2xl border-2 border-slate-200 text-slate-500 font-black text-xs uppercase tracking-widest hover:bg-slate-50 active:scale-95 transition-all">
              {q.back}
            </button>
            <button onClick={() => {
              console.log('Next button clicked, going to step 2');
              setStep(2);
            }} className="px-8 py-3.5 rounded-2xl bg-slate-900 text-white font-black text-xs uppercase tracking-[0.15em] hover:bg-slate-800 active:scale-95 transition-all shadow-lg flex items-center gap-2">
              {q.next} <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Metadata */}
      {step === 2 && (
        <MetadataStep
          model={model}
          summary={summary}
          onUpdateModel={onUpdateModel}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
          t={t}
          lang={lang}
        />
      )}

      {/* STEP 3: Publish */}
      {step === 3 && (
        <PublishStep
          model={model}
          summary={summary}
          selectedLayers={selectedLayers}
          dataBlob={dataBlob}
          lang={lang}
          t={t}
          onBack={() => setStep(2)}
        />
      )}
    </div>
  );
};

export default QuickPublish;
