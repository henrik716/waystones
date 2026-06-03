import React, { useState, useEffect, useRef } from 'react';
import { useAmbient } from '../contexts/AmbientContext';
import type { Translations } from '../i18n/index';
import {
  Database, ChevronRight, ChevronDown,
  Check, Layers, Tag, Github,
  Link2, Table, Paintbrush, GripVertical, RotateCcw, ArrowRight
} from 'lucide-react';
import { GEOM_ICONS, SERVICE_ICONS } from '../constants';
import {
  DataModel, SourceConnection, SourceType, LayerStyle,
  PostgresConfig, SupabaseConfig, DatabricksConfig, GeopackageConfig, LayerSourceMapping, ImportValidationResult,
  S3StorageConfig
} from '../types';
import { toTableName } from '../utils/nameSanitizer';
import { generateOapifGoConfig } from '../utils/deployUtils';
import { InferredDataSummary } from '../utils/importUtils';
import { useDragAndDropReorder } from '../hooks/useDragAndDropReorder';
import { useRenderingOrder } from '../hooks/useRenderingOrder';
import { QUESTS } from '../constants/ambientManifest';
import ImportWarnings from './ImportWarnings';
import SourceTypePicker from './deploy/SourceTypePicker';
import ConnectionForm from './deploy/ConnectionForm';
import LayerMappingCard from './deploy/LayerMappingCard';
import LayerStyleEditor from './LayerStyleEditor';
import MetadataStep from './quickpublish/MetadataStep';
import PublishStep from './quickpublish/PublishStep';

// Geometry icons removed from local definition to use central constants

interface DeployPanelProps {
  model: DataModel;
  t: Translations;
  lang: string;
  onUpdateModel?: (model: DataModel) => void;
  onSourceChange?: (source: SourceConnection) => void;
  validation?: ImportValidationResult;
  summary?: InferredDataSummary;
}

interface NavButtonsProps {
  onBack: () => void;
  onNext: () => void;
  showBackBg?: boolean;
  t: Translations;
}

const NavButtons: React.FC<NavButtonsProps> = ({ onBack, onNext, showBackBg = false, t }) => {
  const d = t.deploy;
  const q = t.quickPublish || {};
  return (
    <div className="flex items-center justify-between pt-4">
      <button
        type="button"
        onClick={onBack}
        className={`px-6 py-3 rounded-2xl border-2 border-slate-200 text-slate-500 font-black text-xs uppercase tracking-widest active:scale-95 transition-all outline-none focus:ring-4 focus:ring-slate-500/10 ${showBackBg ? 'bg-white hover:bg-slate-50' : 'hover:bg-slate-50'}`}
      >
        {q.back || d.back || 'Back'}
      </button>
      <button
        type="button"
        onClick={onNext}
        className="px-8 py-3.5 rounded-2xl bg-indigo-600 text-white font-black text-xs uppercase tracking-[0.15em] hover:bg-indigo-700 active:scale-95 transition-all shadow-lg flex items-center gap-2 outline-none focus:ring-4 focus:ring-indigo-500/20"
      >
        {q.next || d.next || 'Next'} <ArrowRight size={16} />
      </button>
    </div>
  );
};

const DeployPanel: React.FC<DeployPanelProps> = ({ model, t, lang, onUpdateModel, onSourceChange, validation, summary }) => {
  const d = t.deploy;
  const q = t.quickPublish || {};
  const st = t.styling || {};
  const { updateQuests, triggerQuestWhisper, activeQuests, triggerWhisper } = useAmbient();
  const stuckNudgeRef = useRef<Set<number>>(new Set()); // Track which steps we've nudged
  const onSourceChangeRef = useRef(onSourceChange); // Stable ref so the effect doesn't depend on the prop identity
  useEffect(() => { onSourceChangeRef.current = onSourceChange; }); // Keep ref in sync every render

  const [step, setStep] = useState(0);
  const [sourceType, setSourceType] = useState<SourceType | null>(null);
  const [localDataFile, setLocalDataFile] = useState<{ blob: Blob; filename: string } | null>(null);
  const [includeData, setIncludeData] = useState(false);

  // Connection states
  const [pgConfig, setPgConfig] = useState<PostgresConfig>({
    host: 'localhost', port: '5432', dbname: '', user: 'postgres', password: '', schema: 'public',
  });
  const [supaConfig, setSupaConfig] = useState<SupabaseConfig>({
    connectionString: '', schema: 'public',
  });
  const [dbConfig, setDbConfig] = useState<DatabricksConfig>({
    host: '', httpPath: '', token: '', catalog: 'main', schema: 'default',
  });
  const [gpkgConfig, setGpkgConfig] = useState<GeopackageConfig>({
    filename: `${toTableName(model.name)}.gpkg`
  });
  const [s3Config, setS3Config] = useState<S3StorageConfig | null>(null);

  // Layer mapping state
  const [layerMappings, setLayerMappings] = useState<Record<string, LayerSourceMapping>>(() => {
    const initial: Record<string, LayerSourceMapping> = {};
    model.layers.forEach(l => {
      const tbl = toTableName(l.name);
      const fieldMappings: Record<string, string> = {};
      l.properties.forEach(p => { fieldMappings[p.id] = p.name; });
      const pkProp = l.properties.find(p => p.constraints?.isPrimaryKey);
      initial[l.id] = { sourceTable: tbl, fieldMappings, timestampColumn: '', primaryKeyColumn: l.primaryKeyColumn || pkProp?.name || 'fid' };
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

  // Update collapsed state when layer order changes - first layer should be expanded
  useEffect(() => {
    setCollapsedPreviews(prev => {
      const next = new Set(prev);
      next.clear();
      // Add all layers except the first one to collapsed state
      layerOrder.slice(1).forEach(id => next.add(id));
      return next;
    });
  }, [layerOrder]);

  // Sync step to Quests
  useEffect(() => {
    updateQuests(model, validation, 'deploy', step);
  }, [step, model, validation, updateQuests]);
  
  // Trigger whispers based on step
  useEffect(() => {
    switch (step) {
      case 0: triggerQuestWhisper('DP_SOURCE'); break;
      case 1: triggerQuestWhisper('DP_CONN_ALIGNMENT'); break;
      case 2: triggerQuestWhisper('DP_MAPPING'); break;
      case 3: triggerQuestWhisper('DP_SYMBOLS'); break;
      case 4: triggerQuestWhisper('DP_METADATA'); break;
      case 5: triggerQuestWhisper('DP_PUBLISH'); break;
    }
  }, [step, triggerQuestWhisper]);

  // Stuck detection: nudge after 90s of inactivity on incomplete mandatory quests
  useEffect(() => {
    // Reset nudge tracker when changing steps
    stuckNudgeRef.current.clear();

    const timer = setTimeout(() => {
      const mandatoryQuests = activeQuests.filter(q => {
        const quest = QUESTS.find(qq => qq.id === q.id);
        return quest?.isMandatory && !q.completed;
      });

      if (mandatoryQuests.length > 0 && !stuckNudgeRef.current.has(step)) {
        stuckNudgeRef.current.add(step);
        const nudges = [
          { unit: "peon" as const, text: "Still working on this, are we? Me can help! Click the worker to the right of any quest for guidance." },
          { unit: "peasant" as const, text: "A moment of clarity often comes from asking. The workers have wisdom to share about this alignment." },
          { unit: "acolyte" as const, text: "Should you find yourself uncertain, the workers stand ready to illuminate the path forward." }
        ];
        const random = nudges[Math.floor(Math.random() * nudges.length)];
        triggerWhisper(random.unit, random.text);
      }
    }, 90000); // 90 seconds

    return () => clearTimeout(timer);
  }, [step, activeQuests, triggerWhisper]);

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
    return { type: sourceType, config, layerMappings, s3: s3Config ?? undefined };
  };

  useEffect(() => {
    const source = buildSource();

    // Synchronize to parent for real-time quest updates.
    // Use the ref so this dep array doesn't include onSourceChange
    // (which is an inline arrow in App.tsx and would cause an infinite loop).
    if (source && onSourceChangeRef.current) {
      onSourceChangeRef.current(source);
    }

    // Also regenerate the YAML preview
    const generatePreview = async () => {
      if (source) {
        try {
          const yaml = generateOapifGoConfig(model, source);
          setPreviewYaml(yaml);
        } catch {
          setPreviewYaml('');
        }
      } else {
        setPreviewYaml('');
      }
    };
    generatePreview();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceType, pgConfig, supaConfig, dbConfig, gpkgConfig, layerMappings, s3Config, model.id, lang]);


  const isConnectionValid = (): boolean => {
    if (!sourceType) return false;
    if (sourceType === 'postgis') return !!(pgConfig.host && pgConfig.dbname && pgConfig.user);
    if (sourceType === 'supabase') return !!supaConfig.connectionString;
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
  };

  // 6-step flow
  // 6-step flow - uses d.steps array for all labels if possible, falling back to English defaults
  const steps = [
    { icon: SERVICE_ICONS.Storage,   label: d.steps?.[0] || 'Source' },
    { icon: Link2,                  label: d.steps?.[1] || 'Connection' },
    { icon: SERVICE_ICONS.WMS,       label: d.steps?.[2] || 'Mapping' },
    { icon: Paintbrush,             label: d.steps?.[3] || q.stepStyleTitle || st.title || 'Styling' },
    { icon: SERVICE_ICONS.OAPIF,     label: d.steps?.[4] || q.step2Title     || 'Metadata' },
    { icon: Github,                 label: d.steps?.[5] || d.steps?.[3]     || 'Publish' },
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
                  isActive ? 'bg-indigo-600 text-white shadow-lg' :
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
        <div id="dp-source-picker">
          <SourceTypePicker
              sourceType={sourceType}
              s3Enabled={!!s3Config}
              onSelect={(type, enableS3) => {
                setSourceType(type);
                if (enableS3) {
                  setS3Config({ provider: 'aws', endpointUrl: '', bucketName: '', objectKey: '', region: 'us-east-1' });
                } else {
                  setS3Config(null);
                }
                setStep(1);
              }}
              t={t}
            />
        </div>
      )}

      {/* STEP 1: Connection details */}
      {step === 1 && sourceType && (
        <div id="dp-conn-form">
          <ConnectionForm
            sourceType={sourceType}
            idPrefix="dp"
            pgConfig={pgConfig} supaConfig={supaConfig} dbConfig={dbConfig} gpkgConfig={gpkgConfig}
            onPgChange={setPgConfig} onSupaChange={setSupaConfig} onDbChange={setDbConfig} onGpkgChange={setGpkgConfig}
            localDataFile={localDataFile}
            onLocalDataFileChange={setLocalDataFile}
            onIncludeDataChange={setIncludeData}
            s3Config={s3Config}
            onS3Change={setS3Config}
            isConnectionValid={isConnectionValid()}
            onBack={() => setStep(0)}
            onNext={() => setStep(2)}
            modelCrs={model.crs}
            onBboxDetected={(bbox) => {
              if (onUpdateModel) {
                onUpdateModel({
                  ...model,
                  metadata: {
                    ...(model.metadata || {
                      contactName: '', contactEmail: '', contactOrganization: '',
                      keywords: [], theme: '', license: 'CC-BY-4.0', accessRights: 'public',
                      purpose: '', accrualPeriodicity: 'unknown',
                      spatialExtent: { westBoundLongitude: '', eastBoundLongitude: '', southBoundLatitude: '', northBoundLatitude: '' },
                      temporalExtentFrom: '', temporalExtentTo: '',
                    }),
                    spatialExtent: {
                      westBoundLongitude: bbox.west.toString(),
                      eastBoundLongitude: bbox.east.toString(),
                      southBoundLatitude: bbox.south.toString(),
                      northBoundLatitude: bbox.north.toString(),
                    },
                  },
                });
              }
            }}
            t={t}
          />
        </div>
      )}

      {/* STEP 2: Layer mapping */}
      {step === 2 && (
        <section className="bg-white p-6 md:p-10 rounded-[32px] border border-slate-200 shadow-sm space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-6">
            <div className="w-14 h-14 rounded-2xl bg-fuchsia-50 flex items-center justify-center text-fuchsia-600 border border-fuchsia-100 shrink-0">
              <SERVICE_ICONS.WMS size={28} />
            </div>
            <div>
              <h3 className="text-lg md:text-xl font-black text-slate-800 tracking-tight leading-none mb-1">{d.mappingTitle}</h3>
              <p className="text-xs text-slate-500 font-medium">{d.mappingDesc}</p>
            </div>
          </div>

          <div id="dp-mapping-list" className="space-y-6 pb-20">
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
                idPrefix="dp"
                t={t}
              />
            ))}
          </div>

          <div className="sticky bottom-10 z-[250] p-2 bg-white/80 backdrop-blur-md border border-slate-100 rounded-[28px] shadow-xl">
            <NavButtons onBack={() => setStep(1)} onNext={() => setStep(3)} showBackBg={true} t={t} />
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
            id="dp-style-editor"
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
                     <div id="dp-style-layer-handle" className="flex items-center gap-2">
                      <GripVertical size={16} className="text-slate-400 cursor-move" />
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold transition-colors ${isCollapsed ? 'bg-slate-100 text-slate-500' : 'bg-indigo-100 text-indigo-600'}`}>
                        {(() => {
                          const Icon = GEOM_ICONS[layer.geometryType] || Layers;
                          return typeof Icon === 'string' ? Icon : <Icon size={20} />;
                        })()}
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
                        idPrefix="dp"
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

          <NavButtons onBack={() => setStep(2)} onNext={() => setStep(4)} t={t} />
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
          idPrefix="dp"
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
            idPrefix="dp"
          />
        </div>
      )}
    </div>
  );
};

export default DeployPanel;
