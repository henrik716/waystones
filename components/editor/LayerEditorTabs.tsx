import React, { useState } from 'react';
import { Plus, Trash2, Layers, Edit3, ShieldCheck, Settings2, Palette } from 'lucide-react';
import type { Translations } from '../../i18n/index';
import type { DataModel, Layer, Field, SharedType, SharedEnum } from '../../types';
import { GEOM_ICONS } from '../../constants';
import { getEffectiveProperties } from '../../utils/modelUtils';
import { sanitizeTechnicalName } from '../../utils/nameSanitizer';
import { useAiContext } from '../../contexts/AiContext';
import type { ModelChange } from '../../utils/diffUtils';
import type { ModelValidationIssue } from '../../utils/validationUtils';
import { ChevronDown, ChevronUp } from 'lucide-react';

import DiffField from './DiffField';
import ValidationBar from './ValidationBar';
import LayerInheritanceSection from './LayerInheritanceSection';
import LayerConstraintsSection from './LayerConstraintsSection';
import PropertyEditor from '../PropertyEditor';
import LayerStyleEditor from '../LayerStyleEditor';
import AiTrigger from '../ai/AiTrigger';

type LayerTab = 'fields' | 'style' | 'rules' | 'settings';

interface LayerEditorTabsProps {
  activeLayer: Layer;
  baselineLayer: Layer | undefined;
  isGhostLayer: boolean;
  validationIssues: ModelValidationIssue[];
  issuesForLayer: ModelValidationIssue[];
  model: DataModel;
  reviewMode: boolean;
  changes: ModelChange[];
  lang: string;
  t: Translations;
  onUpdateLayer: (partial: Partial<Layer>) => void;
  onDeleteLayer: () => void;
  onAddProperty: () => void;
  onUpdateProperty: (prop: Field) => void;
  onDeleteProperty: (id: string) => void;
  onMoveProperty: (id: string, dir: 'up' | 'down') => void;
  sharedTypes: SharedType[];
  sharedEnums: SharedEnum[];
  onGenerateLayerDescription: () => void;
}

const LayerEditorTabs: React.FC<LayerEditorTabsProps> = ({
  activeLayer,
  baselineLayer,
  isGhostLayer,
  validationIssues,
  issuesForLayer,
  model,
  reviewMode,
  changes,
  lang,
  t,
  onUpdateLayer,
  onDeleteLayer,
  onAddProperty,
  onUpdateProperty,
  onDeleteProperty,
  onMoveProperty,
  sharedTypes,
  sharedEnums,
  onGenerateLayerDescription,
}) => {
  const [activeTab, setActiveTab] = useState<LayerTab>('fields');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isInheritedExpanded, setIsInheritedExpanded] = useState(false);
  const [isValidationExpanded, setIsValidationExpanded] = useState(false);

  const aiContext = useAiContext();

  const tabBase =
    'flex items-center gap-1.5 px-2.5 sm:px-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all border-b-2';
  const tabActive = 'border-indigo-600 text-indigo-600';
  const tabInactive = 'border-transparent text-slate-400 hover:text-slate-600';

  const rulesCount = activeLayer.layerConstraints?.length ?? 0;
  const fieldIssues = issuesForLayer.filter((i) => i.severity === 'error' || i.severity === 'warning').length;

  // Ghost properties in review mode
  const displayProperties = [...activeLayer.properties];
  if (reviewMode && baselineLayer) {
    baselineLayer.properties.forEach((bp) => {
      if (!activeLayer.properties.find((p) => p.id === bp.id)) {
        (displayProperties as any).push({ ...bp, isGhost: true });
      }
    });
  }

  return (
    <div className={`flex flex-col h-full ${isGhostLayer ? 'pointer-events-none grayscale-[0.5]' : ''}`}>
      {/* Persistent layer header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 md:px-8 pt-4 sm:pt-6 pb-0">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 relative group/layername">
            <DiffField
              label={t.layerName}
              currentValue={activeLayer.name}
              baselineValue={baselineLayer?.name}
              reviewMode={reviewMode}
            >
              <div className="relative flex-1">
                <input
                  type="text"
                  value={activeLayer.name}
                  onChange={(e) => onUpdateLayer({ name: e.target.value })}
                  className={`w-full bg-slate-50 border-2 border-slate-100 hover:border-indigo-200 text-base sm:text-lg md:text-xl lg:text-2xl font-black px-3 py-2.5 sm:px-4 sm:py-3 rounded-2xl focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 outline-none placeholder:text-slate-200 transition-all ${
                    isGhostLayer ? 'line-through text-rose-500' : ''
                  }`}
                  placeholder={t.layerNamePlaceholder}
                />
                {!isGhostLayer && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 group-hover/layername:text-indigo-400 transition-colors pointer-events-none">
                    <Edit3 size={18} />
                  </div>
                )}
              </div>
            </DiffField>
          </div>
          {model.layers.length > 1 && !isGhostLayer && (
            <button
              onClick={onDeleteLayer}
              className="p-3 rounded-xl text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-all shrink-0"
            >
              <Trash2 size={20} />
            </button>
          )}
        </div>

        {/* Geometry row — always visible */}
        <div className="mb-4 space-y-2">
          <DiffField
            label={t.propGeometryType}
            currentValue={activeLayer.geometryType}
            baselineValue={baselineLayer?.geometryType}
            reviewMode={reviewMode}
          >
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(t.geometryTypes).map((key) => {
                const Icon = GEOM_ICONS[key] || Layers;
                const isNone = key === 'None';
                const isActive = activeLayer.geometryType === key;
                return (
                  <button
                    key={key}
                    onClick={() => onUpdateLayer({ geometryType: key as any })}
                    className={`flex items-center gap-1 sm:gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[9px] sm:text-[10px] font-black uppercase tracking-wider border transition-all ${
                      isActive
                        ? isNone
                          ? 'bg-slate-700 border-slate-700 text-white shadow-sm'
                          : 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                        : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-indigo-200 hover:text-slate-700'
                    }`}
                  >
                    <Icon size={13} />
                    <span>{t.geometryTypes[key as keyof typeof t.geometryTypes]}</span>
                  </button>
                );
              })}
            </div>
          </DiffField>

          {activeLayer.geometryType !== 'None' && (
            <DiffField
              label={t.geomColumnName}
              currentValue={activeLayer.geometryColumnName}
              baselineValue={baselineLayer?.geometryColumnName}
              reviewMode={reviewMode}
            >
              <input
                type="text"
                value={activeLayer.geometryColumnName}
                onChange={(e) =>
                  onUpdateLayer({ geometryColumnName: sanitizeTechnicalName(e.target.value) })
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-indigo-700 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all"
              />
            </DiffField>
          )}
        </div>

        {/* Tab strip */}
        <div className="flex gap-0 border-b border-slate-200 -mb-px">
          <button
            onClick={() => setActiveTab('fields')}
            className={`${tabBase} ${activeTab === 'fields' ? tabActive : tabInactive} relative`}
          >
            <Layers size={14} />
            <span className="hidden sm:inline">{t.properties || 'Fields'}</span>
            {!reviewMode && fieldIssues > 0 && (
              <span className="w-3.5 h-3.5 bg-rose-500 rounded-full text-[7px] font-black text-white flex items-center justify-center">
                {fieldIssues}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('style')}
            className={`${tabBase} ${activeTab === 'style' ? tabActive : tabInactive}`}
          >
            <Palette size={14} />
            <span className="hidden sm:inline">{t.styling?.title || 'Style'}</span>
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`${tabBase} ${activeTab === 'rules' ? tabActive : tabInactive}`}
          >
            <ShieldCheck size={14} />
            <span className="hidden sm:inline">{t.layerValidation?.title || 'Rules'}</span>
            {rulesCount > 0 && (
              <span className="w-3.5 h-3.5 bg-indigo-400 rounded-full text-[7px] font-black text-white flex items-center justify-center">
                {rulesCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`${tabBase} ${activeTab === 'settings' ? tabActive : tabInactive}`}
          >
            <Settings2 size={14} />
            <span className="hidden sm:inline">{t.layerSettings || 'Settings'}</span>
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">

        {/* ── FIELDS TAB ── */}
        {activeTab === 'fields' && (
          <div className="p-4 sm:p-6 md:p-8 space-y-4 pb-24">
            {/* Validation bar (filtered to this layer) */}
            {issuesForLayer.length > 0 && (
              <ValidationBar
                validationIssues={issuesForLayer}
                model={model}
                isExpanded={isValidationExpanded}
                onToggle={() => setIsValidationExpanded(!isValidationExpanded)}
                lang={lang}
              />
            )}

            {/* Inherited properties */}
            {activeLayer.extends && (() => {
              const parentLayer = model.layers.find((l) => l.id === activeLayer.extends);
              if (!parentLayer) return null;
              const inheritedProps = getEffectiveProperties(parentLayer, model.layers);
              if (inheritedProps.length === 0) return null;
              return (
                <div className="border border-violet-100 rounded-[14px] overflow-hidden bg-violet-50/40">
                  <button
                    onClick={() => setIsInheritedExpanded(!isInheritedExpanded)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-violet-50/60 transition-colors"
                  >
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-violet-500 flex items-center gap-1.5">
                      ↑ {lang === 'no' ? `Arvet fra ${parentLayer.name}` : `Inherited from ${parentLayer.name}`}
                    </span>
                    {isInheritedExpanded
                      ? <ChevronUp size={14} className="text-violet-400 shrink-0" />
                      : <ChevronDown size={14} className="text-violet-400 shrink-0" />
                    }
                  </button>
                  {isInheritedExpanded && (
                    <div className="px-4 pb-4 pt-2 space-y-2 border-t border-violet-100 animate-in slide-in-from-top-1 duration-200">
                      {inheritedProps.map((p) => (
                        <div
                          key={p.id}
                          className="bg-white border border-violet-100 rounded-[12px] px-4 py-2.5 flex items-center justify-between gap-2"
                        >
                          <span className="text-xs font-mono font-bold text-slate-600">{p.name}</span>
                          <span className="text-[9px] font-black uppercase tracking-wide text-violet-500">
                            {p.fieldType.kind === 'primitive'
                              ? t.types?.[p.fieldType.baseType] || p.fieldType.baseType
                              : t.types?.[p.fieldType.kind] || p.fieldType.kind}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Properties list */}
            {activeLayer.properties.length === 0 && !reviewMode ? (
              <div className="bg-white border-2 border-dashed border-slate-200 rounded-[24px] md:rounded-[40px] p-6 sm:p-10 md:p-16 text-center">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-[20px] bg-slate-50 flex items-center justify-center text-slate-200 mx-auto mb-6 shadow-inner">
                  <Layers size={40} />
                </div>
                <p className="text-xs md:text-base font-bold text-slate-400 mb-6">{t.noPropertiesHint}</p>
                <button
                  onClick={onAddProperty}
                  className="bg-indigo-600 text-white font-black text-[10px] md:text-xs px-8 py-4 rounded-xl md:rounded-[24px] shadow-2xl shadow-indigo-200 hover:scale-105 transition-all uppercase tracking-[0.2em]"
                >
                  {t.addProperty}
                </button>
              </div>
            ) : (
              <div className="space-y-3 md:space-y-5">
                {displayProperties.map((prop, idx) => {
                  const isGhost = (prop as any).isGhost;
                  const propChange = changes.find(
                    (c) => c.itemType === 'property' && c.propertyId === prop.id
                  );
                  const baselineProp = baselineLayer?.properties.find((p) => p.id === prop.id);
                  return (
                    <PropertyEditor
                      key={prop.id}
                      prop={prop}
                      baselineProp={baselineProp}
                      onUpdate={onUpdateProperty}
                      onDelete={onDeleteProperty}
                      onMove={(dir) => onMoveProperty(prop.id, dir)}
                      isFirst={idx === 0}
                      isLast={idx === displayProperties.length - 1}
                      t={t}
                      allLayers={model.layers.map((l) => ({ id: l.id, name: l.name }))}
                      allLayersFull={model.layers}
                      sharedTypes={sharedTypes}
                      sharedEnums={sharedEnums}
                      change={isGhost ? { type: 'deleted', itemType: 'property', itemName: prop.name } : propChange}
                      isGhost={isGhost}
                      reviewMode={reviewMode}
                      layerName={activeLayer.name}
                      lang={lang}
                    />
                  );
                })}
                {!isGhostLayer && (
                  <button
                    onClick={onAddProperty}
                    className="w-full py-6 md:py-8 border-2 border-dashed border-slate-200 rounded-[18px] md:rounded-[24px] text-slate-400 font-black text-[10px] uppercase tracking-[0.2em] hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all flex items-center justify-center gap-3 active:scale-[0.99]"
                  >
                    <Plus size={18} />
                    {t.addProperty}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── STYLE TAB ── */}
        {activeTab === 'style' && (
          <div className="p-4 sm:p-6 md:p-8">
            <LayerStyleEditor
              layer={activeLayer}
              onUpdate={(partial) =>
                onUpdateLayer({ style: { ...activeLayer.style, ...partial } })
              }
              t={t}
              variant="light"
              showPreview={true}
            />
          </div>
        )}

        {/* ── RULES TAB ── */}
        {activeTab === 'rules' && (
          <div className="p-4 sm:p-6 md:p-8">
            <LayerConstraintsSection
              layer={activeLayer}
              onUpdateLayer={onUpdateLayer}
              t={t}
            />
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {activeTab === 'settings' && (
          <div className="p-4 sm:p-6 md:p-8 space-y-6">
            {/* Description */}
            <DiffField
              label={t.description}
              currentValue={activeLayer.description}
              baselineValue={baselineLayer?.description}
              reviewMode={reviewMode}
              action={
                <AiTrigger
                  onClick={onGenerateLayerDescription}
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
                value={activeLayer.description}
                onChange={(e) => onUpdateLayer({ description: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-[18px] md:rounded-[20px] px-4 py-4 md:px-5 text-xs md:text-sm min-h-[60px] md:min-h-[80px] focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all resize-none leading-relaxed"
              />
            </DiffField>

            {/* Layer inheritance */}
            {!isGhostLayer && (
              <LayerInheritanceSection
                layer={activeLayer}
                allLayers={model.layers}
                onUpdateLayer={onUpdateLayer}
                isOpen={isAdvancedOpen}
                onToggle={() => setIsAdvancedOpen(!isAdvancedOpen)}
                lang={lang}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LayerEditorTabs;
