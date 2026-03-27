import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Plus, ChevronLeft, ChevronRight, Layers, Upload, Globe, Github, Database, Send, X } from 'lucide-react';
import { DataModel, ViewTab, Language, ImportValidationResult, ImportWarning } from './types';
import { i18n, createEmptyModel } from './constants';
import { AiProvider } from './contexts/AiContext';
import ModelEditor from './components/ModelEditor';
import PreviewPanel from './components/PreviewPanel';
import DataMapper from './components/DataMapper';
import Guide from './components/Guide';
import DeployPanel from './components/DeployPanel';
import LandingScreen from './components/LandingScreen';
import QuickPublish from './components/QuickPublish';
import Header from './components/Header';
import MobileNav from './components/MobileNav';
import { ConfirmDeleteDialog, GithubImportDialog, UrlImportDialog } from './components/dialogs';
import DatabaseImportDialog from './components/dialogs/DatabaseImportDialog';
import GithubTab from './components/preview/GithubTab';
import { useHistory } from './hooks/useHistory';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { usePanelResize } from './hooks/usePanelResize';
import { usePersistedState } from './hooks/usePersistedState';
import { getEffectiveProperties } from './utils/modelUtils';
import { useWindowWidth } from './hooks/useWindowWidth';
import {
  processGeoJsonToModel,
  processOpenApiToModel,
  processOgcCollectionsToModel,
  processSqlToModel,
  processAnyFile,
  processModelJsonFile,
  processModelYamlFile,
  isDataModel,
  InferredDataSummary,
} from './utils/importUtils';

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>('no');
  const t = i18n[lang] || i18n.no;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [showGuide, setShowGuide] = useState(() => !localStorage.getItem('guide_seen'));
  const [showGithubImport, setShowGithubImport] = useState(false);
  const [showUrlImport, setShowUrlImport] = useState(false);
  const [showDatabaseImport, setShowDatabaseImport] = useState(false);
  const [showDatabaseImportForEditor, setShowDatabaseImportForEditor] = useState(false);
  const [databaseSourceType, setDatabaseSourceType] = useState<'postgis' | 'supabase'>('postgis');
  const [modelToDelete, setModelToDelete] = useState<string | null>(null);
  const [showGithubPublish, setShowGithubPublish] = useState(false);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);

  const { previewWidth, isResizingPreview, setIsResizingPreview } = usePanelResize();
  const { isDesktop } = useWindowWidth();

  const [models, setModels] = usePersistedState<DataModel[]>('models', []);
  const [baselineModels, setBaselineModels] = usePersistedState<Record<string, DataModel>>('baselineModels', {});
  const [githubConfig, setGithubConfig] = usePersistedState('githubConfig', { token: '', repo: '', path: '', branch: 'main' });

  const { pushToHistory, undo, redo, historyIndex, historyLength } = useHistory(models);

  const [selectedId, setSelectedId] = useState<string | null>(models[0]?.id || null);
  const [activeTab, setActiveTab] = useState<ViewTab>(() => {
    // After a full-page OAuth redirect the page reloads from scratch.
    // Detect this and send the user straight to the editor instead of the
    // landing page so they can continue where they left off.
    const oauthPending = localStorage.getItem('github_oauth_redirect_pending');
    if (oauthPending) {
      localStorage.removeItem('github_oauth_redirect_pending');
      if (localStorage.getItem('github_oauth_token') && models.length > 0) {
        return 'editor';
      }
    }
    return 'landing';
  });
  const [dirty, setDirty] = useState(false);
  const [quickPublishSummary, setQuickPublishSummary] = useState<InferredDataSummary | null>(null);
  const [quickPublishValidation, setQuickPublishValidation] = useState<ImportValidationResult | null>(null);
  const [deployValidation, setDeployValidation] = useState<ImportValidationResult | null>(null);
  const [isParsingGpkg, setIsParsingGpkg] = useState(false);
  const [transformedData, setTransformedData] = useState<{ blob: Blob; filename: string } | null>(null);

  useKeyboardShortcuts({
    onUndo: () => { const prev = undo(); if (prev) { setModels(prev); setDirty(false); } },
    onRedo: () => { const next = redo(); if (next) { setModels(next); setDirty(false); } },
    onToggleSidebar: () => setSidebarCollapsed(prev => !prev),
    onTogglePreview: () => setPreviewCollapsed(prev => !prev),
  }, [historyIndex, historyLength]);

  const selectedModel = models.find(m => m.id === selectedId);

  // Validate when switching to deploy tab
  useEffect(() => {
    if (activeTab === 'deploy' && selectedModel) {
      validateForDeploy(selectedModel);
    }
  }, [activeTab, selectedModel]);

  const handleNewModel = () => {
    const m = createEmptyModel();
    setModels(prev => {
      const updated = [...prev, m];
      pushToHistory(updated, true);
      return updated;
    });
    setSelectedId(m.id);
    setDirty(false);
    setActiveTab('editor');
    setSidebarCollapsed(false);
  };

  const handleUpdateModel = useCallback((updated: DataModel) => {
    setModels(prev => {
      const next = prev.map(m => m.id === updated.id ? { ...updated, updatedAt: new Date().toISOString() } : m);
      pushToHistory(next, false);
      return next;
    });
    setDirty(true);
  }, [pushToHistory]);

  const handleSetBaseline = useCallback((model: DataModel) => {
    setBaselineModels(prev => ({
      ...prev,
      [model.id]: JSON.parse(JSON.stringify(model))
    }));
  }, []);

  const handleDeleteModel = (id: string) => {
    setModels(prev => {
      const updated = prev.filter(m => m.id !== id);
      setTimeout(() => pushToHistory(updated, true), 0);
      if (selectedId === id) {
        if (updated.length > 0) {
          setSelectedId(updated[0].id);
          setActiveTab('editor');
        } else {
          setSelectedId(null);
          setActiveTab('models');
        }
      }
      return updated;
    });
    setDirty(false);
    setModelToDelete(null);
  };

  const handleImportModel = (imported: DataModel, meta?: { repo: string; path: string; branch: string }) => {
    const modelWithMeta = meta ? { ...imported, githubMeta: meta } : imported;

    setModels(prev => {
      const updated = [...prev, modelWithMeta];
      pushToHistory(updated, true);
      return updated;
    });
    setBaselineModels(prev => ({
      ...prev,
      [modelWithMeta.id]: JSON.parse(JSON.stringify(modelWithMeta))
    }));

    if (meta) {
      setGithubConfig((prev: any) => ({ ...prev, ...meta }));
    }

    setSelectedId(modelWithMeta.id);
    setActiveTab('editor');
    setDirty(false);
  };

  const handleDatabaseImport = (model: DataModel) => {
    // Infer summary from the model
    const srid = parseInt(model.crs?.replace('EPSG:', '') || '4326');
    const summary: InferredDataSummary = {
      filename: `${model.name || 'imported'}-db`,
      layers: model.layers.map(layer => ({
        tableName: layer.name,
        geometryType: layer.geometryType,
        featureCount: 0, // Unknown for DB sources
        srid: srid,
        columnCount: layer.properties.length,
        primaryKeyColumn: layer.properties.find(p => p.constraints?.isPrimaryKey)?.name || 'id'
      })),
      srid: srid,
      bbox: model.metadata?.spatialExtent ? {
        west: parseFloat(model.metadata.spatialExtent.westBoundLongitude) || 0,
        south: parseFloat(model.metadata.spatialExtent.southBoundLatitude) || 0,
        east: parseFloat(model.metadata.spatialExtent.eastBoundLongitude) || 0,
        north: parseFloat(model.metadata.spatialExtent.northBoundLatitude) || 0
      } : undefined
    };

    setModels(prev => {
      const updated = [...prev, model];
      pushToHistory(updated, true);
      return updated;
    });
    setBaselineModels(prev => ({
      ...prev,
      [model.id]: JSON.parse(JSON.stringify(model))
    }));

    setSelectedId(model.id);
    setQuickPublishSummary(summary);
    setQuickPublishValidation(undefined);
    setTransformedData(null); // No file blob for live sources
    setActiveTab('quick-publish');
    setShowDatabaseImport(false);
    setDirty(false);
  };

  const handleDatabaseImportToEditor = (model: DataModel) => {
    setModels(prev => {
      const updated = [...prev, model];
      pushToHistory(updated, true);
      return updated;
    });
    setBaselineModels(prev => ({
      ...prev,
      [model.id]: JSON.parse(JSON.stringify(model))
    }));

    setSelectedId(model.id);
    setActiveTab('editor');
    setShowDatabaseImportForEditor(false);
    setDirty(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);

    try {
      const name = file.name.toLowerCase();

      // Handle YAML files (including browser-renamed ones like model(1).yaml)
      if (name.endsWith('.yaml') || name.endsWith('.yml')) {
        const model = await processModelYamlFile(file);
        handleImportModel(model);
      }
      // Handle JSON files (try as model first, fall back to GeoJSON/GDAL if not a DataModel)
      else if (name.endsWith('.json') && !name.endsWith('.geojson')) {
        try {
          const model = await processModelJsonFile(file);
          handleImportModel(model);
        } catch {
          // Not a DataModel, try as GeoJSON via GDAL
          const { model } = await processAnyFile(file);
          handleImportModel(model);
        }
      }
      // SQL DDL files
      else if (name.endsWith('.sql')) {
        const text = await file.text();
        handleImportModel(processSqlToModel(text, file.name));
      }
      // Everything else (GPKG, GeoJSON, GML, KML, Shapefile, etc)
      else {
        const { model } = await processAnyFile(file);
        handleImportModel(model);
      }
    } catch (err) {
      alert(t.importGisError || "Could not read file");
      console.error(err);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Quick publish: drop a GeoPackage → infer → quick-publish flow
  const handleGpkgDrop = async (file: File) => {
    setIsParsingGpkg(true);
    // Clear any existing validation state to prevent stale data
    setQuickPublishValidation(null);
    try {
      const { model, summary, validation } = await processAnyFile(file);
      // Auto-fill bbox into metadata if available
      if (summary.bbox) {
        model.metadata = {
          ...(model.metadata || {
            contactName: '', contactEmail: '', contactOrganization: '',
            keywords: [], theme: '', license: 'CC-BY-4.0', accessRights: 'public',
            purpose: '', accrualPeriodicity: 'unknown',
            spatialExtent: { westBoundLongitude: '', eastBoundLongitude: '', southBoundLatitude: '', northBoundLatitude: '' },
            temporalExtentFrom: '', temporalExtentTo: '',
          }),
          spatialExtent: {
            westBoundLongitude: summary.bbox.west.toString(),
            eastBoundLongitude: summary.bbox.east.toString(),
            southBoundLatitude: summary.bbox.south.toString(),
            northBoundLatitude: summary.bbox.north.toString(),
          },
        };
      }
      // Add model to list
      setModels(prev => {
        const updated = [...prev, model];
        pushToHistory(updated, true);
        return updated;
      });
      setSelectedId(model.id);
      setQuickPublishSummary(summary);
      setQuickPublishValidation(validation);
      // Gjør den droppede filen tilgjengelig for "inkluder data i repo"
      setTransformedData({ blob: file, filename: file.name });
      setActiveTab('quick-publish');
    } catch (err) {
      alert(t.importGisError || "Could not read file");
      console.error(err);
    } finally {
      setIsParsingGpkg(false);
    }
  };

  const handleUrlImportSuccess = async (json: any, name: string, url: string) => {
    if (json.collections && Array.isArray(json.collections)) {
      handleImportModel(await processOgcCollectionsToModel(json, name, url));
    } else if (json.openapi || json.swagger || json.definitions || json.components?.schemas) {
      handleImportModel(processOpenApiToModel(json, name));
    } else {
      handleImportModel(processGeoJsonToModel(json, name));
    }
  };

  // Validate current model for deploy tab
  const validateForDeploy = async (model: DataModel) => {
    try {
      // Create a simple validation based on model layers
      const warnings: ImportWarning[] = [];

      model.layers.filter(layer => !layer.isAbstract).forEach(layer => {
        const effectiveProps = getEffectiveProperties(layer, model.layers);
        const hasIdField = !!layer.primaryKeyColumn ||
          effectiveProps.some(p => p.constraints?.isPrimaryKey);

        if (!hasIdField) {
          warnings.push({
            type: 'no_primary_key',
            layerName: layer.name,
            columnName: 'none',
            message: `Layer '${layer.name}' has no primary key defined.`,
            suggestion: "Set a primary key column in the layer editor before deploying",
            severity: 'error'
          });
        }
      });

      const validation: ImportValidationResult = {
        warnings,
        errors: [],
        isValid: warnings.filter(w => w.severity === 'error').length === 0,
        canProceed: warnings.filter(w => w.severity === 'error').length === 0,
      };

      setDeployValidation(validation);
    } catch (error) {
      console.error('Validation error:', error);
      setDeployValidation(null);
    }
  };

  const getTabLabel = (key: string) => {
    const tabs = (t.tabs || {}) as Record<string, string>;
    if (tabs && tabs[key]) return tabs[key];
    const map: Record<string, string> = { models: "Models", editor: "Edit", preview: "View", deploy: "Deploy" };
    return map[key] || key;
  };

  return (
    <AiProvider>
      <div className="flex flex-col h-screen bg-slate-50 overflow-hidden text-slate-900 font-sans selection:bg-indigo-500/20">
        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".geojson,.json,.gpkg,.sqlite,.sql,.gml,.kml,.kmz,.shp,.fgb,.parquet,.csv,.gpx,.tab,.mif,.dxf,.yaml,.yml" className="hidden" />
        {showGuide && <Guide onClose={() => { setShowGuide(false); localStorage.setItem('guide_seen', 'true'); }} t={t} />}
        {showGithubImport && <GithubImportDialog t={t} onClose={() => setShowGithubImport(false)} onImport={handleImportModel} />}
        {showUrlImport && <UrlImportDialog t={t} onClose={() => setShowUrlImport(false)} onImport={handleUrlImportSuccess} />}
        {showDatabaseImport && <DatabaseImportDialog t={t} onClose={() => setShowDatabaseImport(false)} onImport={handleDatabaseImport} initialSourceType={databaseSourceType} />}
        {showDatabaseImportForEditor && <DatabaseImportDialog t={t} onClose={() => setShowDatabaseImportForEditor(false)} onImport={handleDatabaseImportToEditor} />}
        {modelToDelete && <ConfirmDeleteDialog t={t} onClose={() => setModelToDelete(null)} onConfirm={() => handleDeleteModel(modelToDelete)} />}

        <Header t={t} lang={lang} onLangChange={setLang} onShowGuide={() => setShowGuide(true)} onHome={() => setActiveTab('landing')} />

        {/* Landing screen — full width, no panels */}
        {activeTab === 'landing' && (
          <LandingScreen
            t={t}
            models={models}
            onDropGpkg={handleGpkgDrop}
            onNewModel={handleNewModel}
            onImportFile={() => fileInputRef.current?.click()}
            onImportUrl={() => setShowUrlImport(true)}
            onImportGithub={() => setShowGithubImport(true)}
            onImportDatabase={(sourceType) => {
              setDatabaseSourceType(sourceType);
              setShowDatabaseImport(true);
            }}
            onSelectModel={(id) => {
              setSelectedId(id);
              setActiveTab('editor');
            }}
            isParsing={isParsingGpkg}
          />
        )}

        {/* Quick publish — full width, no panels */}
        {activeTab === 'quick-publish' && selectedModel && quickPublishSummary && (
          <QuickPublish
            model={selectedModel}
            summary={quickPublishSummary}
            validation={quickPublishValidation}
            t={t}
            lang={lang}
            onUpdateModel={handleUpdateModel}
            onBack={() => setActiveTab('landing')}
            onOpenEditor={() => setActiveTab('editor')}
            dataBlob={transformedData}
          />
        )}

        {/* Standard 3-panel layout */}
        {activeTab !== 'landing' && activeTab !== 'quick-publish' && (
          <div className="flex-1 flex overflow-hidden relative min-w-0">
            {activeTab === 'editor' && (
              <button
                aria-label="Toggle Sidebar"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className={`hidden lg:flex absolute top-1/2 -translate-y-1/2 left-0 z-[150] w-6 h-12 bg-white border border-slate-200 items-center justify-center rounded-r-xl shadow-md text-slate-400 hover:text-indigo-600 hover:bg-slate-50 transition-all duration-500
              ${sidebarCollapsed ? 'translate-x-0' : 'translate-x-64 xl:translate-x-72'}
            `}
              >
                {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </button>
            )}

            <main className={`
          ${(activeTab === 'editor' || activeTab === 'mapper' || activeTab === 'deploy') ? 'flex' : 'hidden lg:flex'} 
          flex-1 flex-col overflow-hidden bg-slate-50 z-10 transition-all duration-300 relative min-w-0 h-full
        `}>
              {selectedModel ? (
                activeTab === 'mapper' ? (
                  <div className="flex-1 overflow-y-auto p-4 md:p-10 lg:p-14 min-w-0 custom-scrollbar scroll-smooth">
                    <button onClick={() => setActiveTab('editor')} className="mb-6 md:mb-10 flex items-center gap-3 text-[9px] md:text-xs font-black uppercase tracking-[0.2em] text-slate-400 hover:text-indigo-600 transition-colors group">
                      <div className="p-2 rounded-xl bg-white border border-slate-200 shadow-sm group-hover:border-indigo-200 group-hover:bg-indigo-50 transition-all"><ChevronLeft size={16} /></div>
                      {t.cancel}
                    </button>
                    <DataMapper model={selectedModel} t={t} onTransformedData={(blob: Blob, filename: string) => {
                      setTransformedData({ blob, filename });
                      // Generer summary fra modellen slik at QuickPublish har det den trenger
                      const summary = {
                        filename,
                        layers: selectedModel.layers.map(l => ({
                          tableName: l.name,
                          featureCount: 0,
                          geometryType: l.geometryType,
                          columnCount: l.properties.length,
                          srid: parseInt(selectedModel.crs?.replace('EPSG:', '') || '25833'),
                        })),
                        srid: parseInt(selectedModel.crs?.replace('EPSG:', '') || '25833'),
                      };
                      setQuickPublishSummary(summary);
                      setActiveTab('quick-publish');
                    }} />
                  </div>
                ) : activeTab === 'deploy' ? (
                  <div className="flex-1 overflow-y-auto p-4 md:p-10 lg:p-14 min-w-0 custom-scrollbar scroll-smooth">
                    <button onClick={() => setActiveTab('editor')} className="mb-6 md:mb-10 flex items-center gap-3 text-[9px] md:text-xs font-black uppercase tracking-[0.2em] text-slate-400 hover:text-indigo-600 transition-colors group">
                      <div className="p-2 rounded-xl bg-white border border-slate-200 shadow-sm group-hover:border-indigo-200 group-hover:bg-indigo-50 transition-all"><ChevronLeft size={16} /></div>
                      {t.cancel}
                    </button>
                    <DeployPanel
                      model={selectedModel}
                      t={t}
                      lang={lang}
                      validation={deployValidation}
                      onUpdateModel={handleUpdateModel}
                      onSourceChange={(source) => {
                        handleUpdateModel({ ...selectedModel, sourceConnection: source });
                      }}
                    />
                  </div>
                ) : (
                  <ModelEditor
                    model={selectedModel}
                    baselineModel={baselineModels[selectedModel.id] || null}
                    githubConfig={githubConfig}
                    onUpdate={handleUpdateModel}
                    onSetBaseline={handleSetBaseline}
                    t={t}
                    lang={lang}
                    models={models}
                    navCollapsed={sidebarCollapsed}
                    onSelectModelById={(id: string) => {
                      const m = models.find(model => model.id === id);
                      if (m?.githubMeta) {
                        setGithubConfig((prev: any) => ({ ...prev, ...m.githubMeta }));
                      }
                      setSelectedId(id);
                      setDirty(false);
                      setTransformedData(null);
                      setQuickPublishSummary(null);
                      setQuickPublishValidation(null);
                      setDeployValidation(null);
                      setActiveTab('editor');
                    }}
                    onNewModel={handleNewModel}
                    onImportGis={() => fileInputRef.current?.click()}
                    onImportUrl={() => setShowUrlImport(true)}
                    onImportDatabase={() => setShowDatabaseImportForEditor(true)}
                    onGithubImport={() => setShowGithubImport(true)}
                    onDeleteModel={(id: string) => setModelToDelete(id)}
                    onOpenMapper={() => setActiveTab('mapper')}
                    onOpenDeploy={() => setActiveTab('deploy')}
                    onUpdateGithubConfig={setGithubConfig}
                    onOpenGithubPublish={() => setShowGithubPublish(true)}
                  />
                )
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-8 text-center bg-slate-50 animate-in fade-in zoom-in-95 duration-700">
                  <div className="w-full max-w-2xl space-y-6">
                    <div>
                      <div className="w-16 h-16 md:w-24 md:h-24 rounded-[28px] md:rounded-[40px] bg-white border border-slate-200 flex items-center justify-center text-slate-200 mb-6 md:mb-10 shadow-inner mx-auto"><Layers size={32} className="md:w-12 md:h-12" /></div>
                      <h2 className="text-lg md:text-3xl font-black text-slate-800 mb-2 md:mb-4 tracking-tight">{t.noModels}</h2>
                      <p className="text-slate-400 text-[10px] md:sm font-medium mb-8 md:mb-12">{t.noModelsHint}</p>
                    </div>

                    <div className="space-y-3">
                      <button
                        onClick={handleNewModel}
                        className="w-full flex items-center gap-4 px-5 py-3 rounded-2xl border-2 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 text-left transition-all group/btn"
                      >
                        <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-500 group-hover/btn:bg-indigo-200 transition-colors">
                          <Plus size={16} />
                        </div>
                        <span className="text-sm font-bold text-slate-700">{t.landing?.modelNew || 'New model'}</span>
                      </button>

                      <button
                        onClick={() => setShowGithubImport(true)}
                        className="w-full flex items-center gap-4 px-5 py-3 rounded-2xl border-2 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 text-left transition-all group/btn"
                      >
                        <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover/btn:bg-indigo-100 group-hover/btn:text-indigo-500 transition-colors">
                          <Github size={16} />
                        </div>
                        <span className="text-sm font-bold text-slate-700">{t.landing?.modelImportGithub || 'Import from GitHub'}</span>
                      </button>

                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full flex items-center gap-4 px-5 py-3 rounded-2xl border-2 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 text-left transition-all group/btn"
                      >
                        <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover/btn:bg-indigo-100 group-hover/btn:text-indigo-500 transition-colors">
                          <Upload size={16} />
                        </div>
                        <span className="text-sm font-bold text-slate-700">{t.landing?.modelImportFile || 'Import from file'}</span>
                      </button>

                      <button
                        onClick={() => { setShowDatabaseImportForEditor(true); setDatabaseSourceType('postgis'); }}
                        className="w-full flex items-center gap-4 px-5 py-3 rounded-2xl border-2 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 text-left transition-all group/btn"
                      >
                        <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover/btn:bg-indigo-100 group-hover/btn:text-indigo-500 transition-colors">
                          <Database size={16} />
                        </div>
                        <span className="text-sm font-bold text-slate-700">{t.landing?.modelImportDatabase || 'Import from database'}</span>
                      </button>

                      <button
                        onClick={() => setShowUrlImport(true)}
                        className="w-full flex items-center gap-4 px-5 py-3 rounded-2xl border-2 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 text-left transition-all group/btn"
                      >
                        <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover/btn:bg-indigo-100 group-hover/btn:text-indigo-500 transition-colors">
                          <Globe size={16} />
                        </div>
                        <span className="text-sm font-bold text-slate-700">{t.landing?.modelImportUrl || 'Import from URL'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </main>

            {activeTab === 'editor' && (
              <button
                aria-label="Toggle Preview"
                onClick={() => setPreviewCollapsed(!previewCollapsed)}
                style={isDesktop ? {
                  transform: `translateY(-50%) translateX(${previewCollapsed ? 0 : -previewWidth}px)`,
                  transition: isResizingPreview ? 'none' : 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
                } : {}}
                className={`hidden lg:flex absolute top-1/2 right-0 z-[150] w-6 h-12 bg-white border border-slate-200 items-center justify-center rounded-l-xl shadow-md text-slate-400 hover:text-indigo-600 hover:bg-slate-50`}
              >
                {previewCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
              </button>
            )}

            {activeTab === 'editor' && (
            <aside
              style={isDesktop ? {
                width: `${previewWidth}px`,
                marginRight: previewCollapsed ? `-${previewWidth}px` : '0px',
              } : {}}
              className={`
            ${activeTab === 'preview' ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'} 
            fixed lg:relative top-14 md:top-16 lg:top-0 bottom-16 lg:bottom-0 right-0 lg:right-auto w-full 
            flex-none border-l border-slate-200 bg-white z-[130] lg:z-20 overflow-hidden
            ${previewCollapsed ? 'opacity-0 pointer-events-none' : ''}
            ${!isResizingPreview ? 'transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1)' : ''}
          `}
            >
              {/* Resizer Handle */}
              <div
                onMouseDown={() => setIsResizingPreview(true)}
                className={`hidden lg:block absolute top-0 left-0 w-1.5 h-full cursor-col-resize z-[160] hover:bg-indigo-400 transition-colors duration-150 ${isResizingPreview ? 'bg-indigo-500' : 'bg-transparent'}`}
              />

              {selectedModel && (
                <PreviewPanel
                  model={selectedModel}
                  t={t}
                  lang={lang}
                />
              )}
              <button onClick={() => setActiveTab('editor')} className="lg:hidden absolute top-4 left-4 p-2.5 bg-white border border-slate-200 rounded-xl shadow-xl text-slate-500 z-[140] hover:bg-slate-50 transition-colors"><ChevronLeft size={18} /></button>
            </aside>
            )}
          </div>
        )}

        {activeTab !== 'landing' && activeTab !== 'quick-publish' && (
          <MobileNav
            activeTab={activeTab}
            selectedId={selectedId}
            onTabChange={setActiveTab}
            getTabLabel={getTabLabel}
          />
        )}
      </div>

      {/* GitHub Publish Drawer — rendered at root level to escape stacking contexts */}
      {showGithubPublish && selectedModel && (
        <>
          <div
            className="fixed inset-0 z-[400] bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setShowGithubPublish(false)}
          />
          <div className="fixed inset-y-0 right-0 z-[410] w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
            <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-indigo-200">
                  <Send size={16} />
                </div>
                <span className="text-xs font-black uppercase tracking-widest text-slate-700">
                  {t.github.push}
                </span>
              </div>
              <button
                onClick={() => setShowGithubPublish(false)}
                className="p-2 rounded-xl hover:bg-slate-200 text-slate-400 transition-all"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <GithubTab
                model={selectedModel}
                baselineModel={baselineModels[selectedModel.id] || null}
                githubConfig={githubConfig}
                onSetBaseline={handleSetBaseline}
                onUpdate={handleUpdateModel}
                onUpdateGithubConfig={setGithubConfig}
                t={t}
              />
            </div>
          </div>
        </>
      )}
    </AiProvider>
  );
};

export default App;