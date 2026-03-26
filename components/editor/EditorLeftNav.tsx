import React, { useState } from 'react';
import {
  Plus, Layers, Box, Settings, AlertCircle, AlertTriangle, X,
  ChevronDown, Link2, Rocket, Github, Globe, Database, Trash2,
} from 'lucide-react';
import { GEOM_ICONS } from '../../constants';
import type { Translations } from '../../i18n/index';
import type { DataModel, Layer } from '../../types';
import type { ModelValidationIssue } from '../../utils/validationUtils';
import type { ModelChange } from '../../utils/diffUtils';

interface EditorLeftNavProps {
  // Active model editor state
  model: DataModel;
  reviewMode: boolean;
  changes: ModelChange[];
  issuesByLayer: Map<string, ModelValidationIssue[]>;
  validationIssues: ModelValidationIssue[];
  displayLayers: (Layer & { isGhost?: boolean })[];
  activeNavSection: 'model' | 'types' | 'layer';
  activeLayerId: string;
  onSelectModel: () => void;
  onSelectTypes: () => void;
  onSelectLayer: (id: string) => void;
  onAddLayer: () => void;
  t: Translations;
  // Mobile overlay
  isOpen?: boolean;
  onClose?: () => void;
  // Desktop collapse
  isCollapsed?: boolean;
  // Model list & actions
  models: DataModel[];
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

const EditorLeftNav: React.FC<EditorLeftNavProps> = ({
  model,
  reviewMode,
  changes,
  issuesByLayer,
  validationIssues,
  displayLayers,
  activeNavSection,
  activeLayerId,
  onSelectModel,
  onSelectTypes,
  onSelectLayer,
  onAddLayer,
  t,
  isOpen,
  onClose,
  isCollapsed,
  models,
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
  const [isModelSwitcherOpen, setIsModelSwitcherOpen] = useState(false);
  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);

  const totalErrors = validationIssues.filter((i) => i.severity === 'error').length;
  const totalWarnings = validationIssues.filter((i) => i.severity === 'warning').length;

  const navItemBase =
    'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all text-left';
  const navItemActive = 'bg-indigo-50 text-indigo-600';
  const navItemInactive = 'text-slate-500 hover:text-slate-700 hover:bg-slate-50';

  const importActions = [
    { label: t.newModel || 'New blank', Icon: Plus, onClick: () => { onNewModel(); setIsImportMenuOpen(false); }, cls: 'text-indigo-600' },
    { label: t.importGis || 'Import GIS file', Icon: Layers, onClick: () => { onImportGis(); setIsImportMenuOpen(false); }, cls: 'text-slate-600' },
    { label: t.importUrl || 'Import from URL', Icon: Globe, onClick: () => { onImportUrl(); setIsImportMenuOpen(false); }, cls: 'text-emerald-600' },
    { label: t.importDatabase?.title || 'Import Database', Icon: Database, onClick: () => { onImportDatabase(); setIsImportMenuOpen(false); }, cls: 'text-slate-600' },
    { label: t.github?.importTitle || 'Import from GitHub', Icon: Github, onClick: () => { onGithubImport(); setIsImportMenuOpen(false); }, cls: 'text-slate-600' },
  ];

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isOpen !== undefined && isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Nav panel */}
      <div
        className={`
          flex flex-col border-r border-slate-200 bg-white
          w-64 xl:w-72 flex-none
          ${isOpen !== undefined
            ? isOpen
              ? 'fixed inset-y-0 left-0 z-30 shadow-2xl lg:relative lg:shadow-none lg:z-auto'
              : 'hidden lg:flex lg:flex-col'
            : 'flex'
          }
          ${isCollapsed ? 'lg:-ml-64 xl:-ml-72 opacity-0 lg:pointer-events-none' : ''}
          transition-all duration-500
        `}
      >
        {/* Mobile close button */}
        {isOpen !== undefined && onClose && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 lg:hidden">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Navigation</span>
            <button onClick={onClose} className="p-2.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
              <X size={16} />
            </button>
          </div>
        )}

        {/* ── MODEL SWITCHER & TOOLS ── */}
        <div className="px-3 pt-4 pb-3 border-b border-slate-100 space-y-2">

          {/* Model switcher row */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => { setIsModelSwitcherOpen(!isModelSwitcherOpen); setIsImportMenuOpen(false); }}
              className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-50 transition-all text-left min-w-0"
              title="Switch model"
            >
              <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
              <span className="text-xs font-black text-slate-800 truncate flex-1 min-w-0">
                {model.name || 'Untitled'}
              </span>
              <ChevronDown
                size={13}
                className={`text-slate-400 shrink-0 transition-transform duration-200 ${isModelSwitcherOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {/* + Import dropdown trigger */}
            <div className="relative shrink-0">
              <button
                onClick={() => { setIsImportMenuOpen(!isImportMenuOpen); setIsModelSwitcherOpen(false); }}
                className="p-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 active:scale-90 transition-all shadow-sm"
                title={t.newModel || 'New / Import'}
              >
                <Plus size={14} />
              </button>

              {/* Import dropdown */}
              {isImportMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setIsImportMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1.5 z-20 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden w-52 animate-in fade-in slide-in-from-top-1 duration-150">
                    {importActions.map(({ label, Icon, onClick, cls }) => (
                      <button
                        key={label}
                        onClick={onClick}
                        className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-[11px] font-bold hover:bg-slate-50 transition-colors text-left ${cls}`}
                      >
                        <Icon size={14} className="shrink-0" />
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Model switcher list (inline expand) */}
          {isModelSwitcherOpen && models.length > 0 && (
            <div className="bg-slate-50 rounded-xl border border-slate-100 overflow-hidden animate-in slide-in-from-top-1 duration-200">
              <div className="max-h-44 overflow-y-auto custom-scrollbar">
                {models.map((m) => (
                  <div key={m.id} className="group relative flex items-center">
                    <button
                      onClick={() => { onSelectModelById(m.id); setIsModelSwitcherOpen(false); }}
                      className={`flex-1 flex items-center gap-2 px-3 py-2.5 pr-8 text-left transition-all ${
                        m.id === model.id
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'text-slate-600 hover:bg-white'
                      }`}
                    >
                      <span className="flex-1 text-[11px] font-bold truncate min-w-0">
                        {m.name || 'Untitled'}
                      </span>
                      <span className="text-[9px] text-slate-400 shrink-0">
                        {m.layers.length} {t.layers?.toLowerCase() || 'layers'}
                      </span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteModel(m.id); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all z-10"
                      title={t.delete || 'Delete'}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mapper + Deploy tool buttons */}
          <div className="flex gap-1.5">
            <button
              onClick={onOpenMapper}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-100 transition-all text-[10px] font-bold"
              title={t.mappingTab || 'Mapper'}
            >
              <Link2 size={13} />
              <span className="hidden xl:inline">{t.mappingTab || 'Mapper'}</span>
            </button>
            <button
              onClick={onOpenDeploy}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl bg-violet-50 text-violet-600 hover:bg-violet-100 border border-violet-100 transition-all text-[10px] font-bold"
              title={t.deploy?.title || 'Deploy'}
            >
              <Rocket size={13} />
              <span className="hidden xl:inline">{t.deploy?.title || 'Deploy'}</span>
            </button>
          </div>
        </div>

        {/* ── TOP NAV ITEMS ── */}
        <div className="px-3 pt-3 space-y-0.5">
          <button
            onClick={onSelectModel}
            className={`${navItemBase} ${activeNavSection === 'model' ? navItemActive : navItemInactive}`}
          >
            <Settings size={14} className="shrink-0" />
            {t.modelSettings || 'Model Settings'}
          </button>
          <button
            onClick={onSelectTypes}
            className={`${navItemBase} ${activeNavSection === 'types' ? navItemActive : navItemInactive}`}
          >
            <Box size={14} className="shrink-0" />
            {t.sharedTypes || 'Shared Types'}
          </button>
        </div>

        {/* ── LAYERS SECTION ── */}
        <div className="flex items-center justify-between px-4 pt-5 pb-2">
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-1.5">
            <Layers size={12} />
            {t.layers}
          </span>
          <button
            onClick={onAddLayer}
            className="text-[10px] font-black text-indigo-600 hover:underline flex items-center gap-1 shrink-0"
          >
            <Plus size={12} />
            {t.addLayer}
          </button>
        </div>

        {/* Layer list */}
        <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-0.5 custom-scrollbar">
          {displayLayers.map((layer) => {
            const isGhost = (layer as any).isGhost;
            const layerChange = changes.find(
              (c) => c.itemType === 'layer' && c.layerId === layer.id
            );
            const layerIssues = issuesByLayer.get(layer.id) || [];
            const layerErrors = layerIssues.filter((i) => i.severity === 'error').length;
            const layerWarnings = layerIssues.filter((i) => i.severity === 'warning').length;
            const isActive = activeNavSection === 'layer' && activeLayerId === layer.id;

            return (
              <button
                key={layer.id}
                onClick={() => onSelectLayer(layer.id)}
                className={`
                  w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all relative
                  ${isActive
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                    : isGhost
                    ? 'text-rose-400 hover:bg-rose-50'
                    : 'text-slate-600 hover:bg-slate-50'
                  }
                `}
              >
                {/* Geometry type icon */}
                {(() => {
                  const GeomIcon = GEOM_ICONS[layer.geometryType || 'None'] || Layers;
                  const color = isActive ? 'white' : (isGhost ? undefined : (layer.style?.simpleColor || '#94a3b8'));
                  return <GeomIcon size={13} className="shrink-0" style={{ color }} />;
                })()}

                {/* Layer name */}
                <span
                  className={`flex-1 text-[11px] font-black uppercase tracking-wider truncate ${
                    isGhost ? 'line-through' : ''
                  }`}
                >
                  {layer.name || 'Untitled Layer'}
                </span>

                {/* Validation badge (normal mode) */}
                {!reviewMode && layerErrors > 0 && (
                  <span className="shrink-0 w-4 h-4 bg-rose-500 rounded-full flex items-center justify-center text-[8px] font-black text-white">
                    {layerErrors}
                  </span>
                )}
                {!reviewMode && layerErrors === 0 && layerWarnings > 0 && (
                  <span className="shrink-0 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center text-[8px] font-black text-white">
                    {layerWarnings}
                  </span>
                )}

                {/* Diff badge (review mode) */}
                {reviewMode && (layerChange || isGhost) && (
                  <span
                    className={`shrink-0 px-1.5 py-0.5 rounded-md text-[8px] font-black text-white ${
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

        {/* Validation summary footer */}
        {!reviewMode && (totalErrors > 0 || totalWarnings > 0) && (
          <div className="px-4 py-3 border-t border-slate-100">
            <div className="flex items-center gap-3 text-[10px] font-black">
              {totalErrors > 0 && (
                <span className="flex items-center gap-1 text-rose-500">
                  <AlertCircle size={12} /> {totalErrors} {totalErrors === 1 ? 'error' : 'errors'}
                </span>
              )}
              {totalWarnings > 0 && (
                <span className="flex items-center gap-1 text-amber-500">
                  <AlertTriangle size={12} /> {totalWarnings} {totalWarnings === 1 ? 'warning' : 'warnings'}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default EditorLeftNav;
