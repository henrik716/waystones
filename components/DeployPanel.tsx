import React, { useState, useEffect } from 'react';
import type { Translations } from '../i18n/index';
import {
  Database, ChevronRight, ChevronDown,
  Check, Layers, Tag, Github,
  Link2, Table, Paintbrush, GripVertical, RotateCcw,
} from 'lucide-react';
import {
  DataModel, SourceConnection, SourceType, LayerStyle,
  PostgresConfig, SupabaseConfig, DatabricksConfig, GeopackageConfig, LayerSourceMapping, ImportValidationResult
} from '../types';
import { toTableName } from '../utils/nameSanitizer';
import { generatePygeoapiConfig } from '../utils/deployUtils';
import { InferredDataSummary } from '../utils/importUtils';
import { useDragAndDropReorder } from '../hooks/useDragAndDropReorder';
import { useRenderingOrder } from '../hooks/useRenderingOrder';
import ImportWarnings from './ImportWarnings';
import SourceTypePicker from './deploy/SourceTypePicker';
import ConnectionForm from './deploy/ConnectionForm';
import LayerMappingCard from './deploy/LayerMappingCard';
import LayerStyleEditor from './LayerStyleEditor';
import MetadataStep from './quickpublish/MetadataStep';
import PublishStep from './quickpublish/PublishStep';

const GEOM_ICONS: Record<string, string> = {
  Point: '●', MultiPoint: '●●', LineString: '╱', MultiLineString: '╱╱',
  Polygon: '◆', MultiPolygon: '◆◆', GeometryCollection: '◇', None: '○'
};

interface DeployPanelProps {
  model: DataModel;
  t: Translations;
  lang: string;
  onUpdateModel?: (model: DataModel) => void;
  onSourceChange?: (source: SourceConnection) => void;
  validation?: ImportValidationResult;
  summary?: InferredDataSummary;
}

const DeployPanel: React.FC<DeployPanelProps> = ({ model, t, lang, onUpdateModel, onSourceChange, validation, summary }) => {
  const d = t.deploy;
  const q = t.quickPublish || {};
  const st = t.styling || {};

  const [step, setStep] = useState(0);
  const [sourceType, setSourceType] = useState<SourceType | null>(null);
  const [localDataFile, setLocalDataFile] = useState<{ blob: Blob; filename: string } | null>(null);
  const [includeData, setIncludeData] = useState(false);

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
  const [previewYaml, setPreviewYaml] = useState<string>('');

  // Styling step state
  const [collapsedPreviews, setCollapsedPreviews] = useState<Set<string>>(
    new Set(model.layers.slice(1).map(l => l.id))
  );

  const { layerOrder, resetOrder, handleReorder } = useRenderingOrder({ model, onUpdateModel: onUpdateModel || (() => {}) });

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

  // Reset collapse state when layer order changes
  useEffect(() => {
    setCollapsedPreviews(prev => {
      const next = new Set(prev);
      next.clear();
      layerOrder.slice(1).forEach(id => next.add(id));
      return next;
    });
  }, [layerOrder]);

  const togglePreviewCollapse = (layerId: string) => {
    setCollapsedPreviews(prev => {
      const next = new Set(prev);
      if (next.has(layerId)) next.delete(layerId); else next.add(layerId);
      return next;
    });
  };

  const updateLayerStyle = (layerId: string) => (style: Partial<LayerStyle>) => {
    if (!onUpdateModel) return;
    onUpdateModel({
      ...model,
      layers: model.layers.map(l => l.id === layerId ? { ...l, style: { ...l.style, ...style } } : l),
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

  useEffect(() => {
    const generatePreview = async () => {
      const source = buildSource();
      if (source) {
        try {
          const yaml = await generatePygeoapiConfig(model, source, lang);
          setPreviewYaml(yaml);
        } catch {
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

  const updateMapping = (layerId: string, updates: Partial<LayerSourceMapping>) => {
    setLayerMappings(prev => ({ ...prev, [layerId]: { ...prev[layerId], ...updates } }));
  };

  const handleFieldChange = (layerId: string, propId: string, val: string) => {
    setLayerMappings(prev => {
      const layer = prev[layerId];
      return { ...prev, [layerId]: { ...layer, fieldMappings: { ...layer.fieldMappings, [propId]: val } } };
    });
  };

  // Build a minimal summary stub for MetadataStep when no real summary is provided
  const summaryForMeta: InferredDataSummary = summary ?? {
    filename: gpkgConfig.filename || `${toTableName(model.name)}.gpkg`,
    srid: 4326,
    layers: model.layers.map(l => ({
      tableName: l.name,
      featureCount: 0,
      geometryType: l.geometryType,
      columnCount: l.properties.length,
      srid: 4326,
      primaryKeyColumn: layerMappings[l.id]?.primaryKeyColumn || 'fid',
    })),
  };

  const handleUpdateModel = (updated: DataModel) => {
    onUpdateModel?.(updated);
    if (updated.sourceConnection) onSourceChange?.(updated.sourceConnection);
  };

  // 6-step flow
  const steps = [
    { icon: Database,   label: d.steps?.[0]         || 'Source' },
    { icon: Link2,      label: d.steps?.[1]         || 'Connection' },
    { icon: Table,      label: d.steps?.[2]         || 'Mapping' },
    { icon: Paintbrush, label: q.stepStyleTitle     || st.title || 'Styling' },
    { icon: Tag,        label: q.step2Title         || 'Metadata' },
    { icon: Github,     label: d.steps?.[3]         || 'Publish' },
  ];

  return (
    <div className="space-y-8 pb-20">

      {/* Pill-style step indicator */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === step;
          const isDone = i < step;
          return (
            <React.Fragment key={i}>
              {i > 0 && (
                <div className={`flex-1 h-0.5 rounded-full transition-colors ${isDone ? 'bg-indigo-400' : 'bg-slate-200'}`} />
              )}
              <button
                onClick={() => isDone && setStep(i)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all ${
                  isActive ? 'bg-slate-900 text-white shadow-lg' :
                  isDone   ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 cursor-pointer' :
                             'bg-slate-100 text-slate-400 cursor-default'
                }`}
              >
                {isDone ? <Check size={14} strokeWidth={3} /> : <Icon size={14} />}
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Validation warnings */}
      {validation && validation.warnings.length > 0 && (
        <ImportWarnings validation={validation} t={t} lang={lang} />
      )}

      {/* STEP 0: Source selection */}
      {step === 0 && (
        <SourceTypePicker sourceType={sourceType} onSelect={(type) => { setSourceType(type); setStep(1); }} t={t} />
      )}

      {/* STEP 1: Connection details */}
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

      {/* STEP 2: Layer mapping */}
      {step === 2 && (
        <section className="bg-white p-6 md:p-10 rounded-[32px] border border-slate-200 shadow-sm space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-6">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 border border-amber-100 shrink-0">
              <Layers size={28} />
            </div>
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

          <div className="sticky bottom-6 z-20 flex gap-4 p-2 bg-white/80 backdrop-blur-md border border-slate-100 rounded-[28px] shadow-xl">
            <button onClick={() => setStep(1)} className="px-10 py-4 rounded-2xl border-2 bg-white border-slate-200 text-slate-500 font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all hover:bg-slate-50">{d.back}</button>
            <button onClick={() => setStep(3)} className="flex-1 px-10 py-4 rounded-2xl bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest active:scale-95 shadow-lg transition-all hover:bg-slate-800">{d.next}</button>
          </div>
        </section>
      )}

      {/* STEP 3: Styling */}
      {step === 3 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-400">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-slate-900">{q.stepStyleTitle || st.title || 'Styling'}</h2>
              <p className="text-sm text-slate-400 font-medium">{q.stepStyleDesc}</p>
              <div className="flex items-center gap-2 text-xs text-indigo-600 font-medium mt-1">
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

          <div
            className="space-y-6"
            onDragOver={handleDragOver}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            {layerOrder.map(layerId => {
              const layer = model.layers.find(l => l.id === layerId);
              if (!layer) return null;
              const isCollapsed = collapsedPreviews.has(layer.id);
              return (
                <div
                  key={layer.id}
                  className={`bg-white rounded-2xl border-2 transition-all duration-200 overflow-hidden ${isCollapsed ? 'border-slate-200' : 'border-indigo-200 shadow-md shadow-indigo-50'}`}
                >
                  <div
                    draggable
                    onDragStart={(e) => handleDragStart(e, layer.id)}
                    onDragOver={handleDragOver}
                    onDragEnter={(e) => handleDragEnter(e, layer.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, layer.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => togglePreviewCollapse(layer.id)}
                    className={`flex items-center gap-3 p-5 transition-all duration-200 cursor-pointer ${
                      draggedLayer === layer.id ? 'opacity-50 scale-95' : ''
                    } ${dragOverLayer === layer.id ? 'bg-indigo-50' : ''} ${
                      isCollapsed ? 'hover:bg-slate-50' : 'hover:bg-indigo-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <GripVertical size={16} className="text-slate-400 cursor-move" />
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold transition-colors ${isCollapsed ? 'bg-slate-100 text-slate-500' : 'bg-indigo-100 text-indigo-600'}`}>
                        {GEOM_ICONS[layer.geometryType] || '◇'}
                      </div>
                    </div>
                    <div className="flex-1 text-left">
                      <p className={`text-sm font-black transition-colors ${isCollapsed ? 'text-slate-900' : 'text-indigo-900'}`}>{layer.name}</p>
                      <p className="text-[10px] text-slate-400 font-medium">{layer.geometryType}</p>
                    </div>
                    <div className={`transition-transform duration-200 ${isCollapsed ? 'rotate-0' : 'rotate-180'}`}>
                      <ChevronDown size={20} className={`transition-colors ${isCollapsed ? 'text-slate-400' : 'text-indigo-500'}`} />
                    </div>
                  </div>

                  <div className={`transition-all duration-300 ease-in-out ${isCollapsed ? 'max-h-0 opacity-0' : 'max-h-screen opacity-100'}`}>
                    <div className={`p-5 pt-0 space-y-4 ${isCollapsed ? '' : 'border-t border-slate-100'}`}>
                      <LayerStyleEditor
                        layer={layer}
                        onUpdate={updateLayerStyle(layer.id)}
                        t={t}
                        variant="light"
                        showPreview={true}
                      />
                    </div>
                  </div>

                  {isCollapsed && (
                    <div className="px-5 pb-3 pointer-events-none">
                      <div className="text-xs text-slate-400 font-medium italic">{q.clickToConfigure}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-4">
            <button onClick={() => setStep(2)} className="px-6 py-3 rounded-2xl border-2 border-slate-200 text-slate-500 font-black text-xs uppercase tracking-widest hover:bg-slate-50 active:scale-95 transition-all">
              {q.back || d.back}
            </button>
            <button onClick={() => setStep(4)} className="px-8 py-3.5 rounded-2xl bg-slate-900 text-white font-black text-xs uppercase tracking-[0.15em] hover:bg-slate-800 active:scale-95 transition-all shadow-lg flex items-center gap-2">
              {q.next || d.next} <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Metadata */}
      {step === 4 && (
        <MetadataStep
          model={model}
          summary={summaryForMeta}
          onUpdateModel={handleUpdateModel}
          onBack={() => setStep(3)}
          onNext={() => setStep(5)}
          t={t}
          lang={lang}
        />
      )}

      {/* STEP 5: Publish */}
      {step === 5 && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-400">
          {/* YAML config preview */}
          {previewYaml && (
            <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 space-y-3">
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-700 transition-colors"
              >
                {showPreview ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {d.previewConfig}
              </button>
              {showPreview && (
                <pre className="bg-slate-50 text-slate-700 text-[11px] font-mono p-5 rounded-xl overflow-x-auto max-h-[400px] border border-slate-200 custom-scrollbar leading-relaxed">
                  {previewYaml}
                </pre>
              )}
            </div>
          )}

          <PublishStep
            model={model}
            selectedLayers={new Set(model.layers.map(l => l.id))}
            sourceOverride={buildSource() ?? undefined}
            dataBlob={sourceType === 'geopackage' ? localDataFile : null}
            lang={lang}
            t={t}
            onBack={() => setStep(4)}
          />
        </div>
      )}
    </div>
  );
};

export default DeployPanel;
