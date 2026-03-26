import React from 'react';
import { Plus, Layers, Box, Settings, AlertCircle, AlertTriangle, X, Menu } from 'lucide-react';
import type { Translations } from '../../i18n/index';
import type { DataModel, Layer } from '../../types';
import type { ModelValidationIssue } from '../../utils/validationUtils';
import type { ModelChange } from '../../utils/diffUtils';

interface EditorLeftNavProps {
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
  isOpen?: boolean;
  onClose?: () => void;
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
}) => {
  const totalErrors = validationIssues.filter((i) => i.severity === 'error').length;
  const totalWarnings = validationIssues.filter((i) => i.severity === 'warning').length;

  const navItemBase =
    'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all text-left';
  const navItemActive = 'bg-indigo-50 text-indigo-600';
  const navItemInactive = 'text-slate-500 hover:text-slate-700 hover:bg-slate-50';

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

        {/* Model name */}
        <div className="px-4 pt-5 pb-3">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">Model</p>
          <p className="text-sm font-black text-slate-800 truncate">{model.name || 'Untitled'}</p>
        </div>

        {/* Top nav items */}
        <div className="px-3 space-y-0.5">
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

        {/* Layers section */}
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
                {/* Color swatch */}
                <div
                  className="w-3 h-3 rounded-full shrink-0 border border-black/10"
                  style={{ backgroundColor: layer.style?.simpleColor || '#ccc' }}
                />

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
