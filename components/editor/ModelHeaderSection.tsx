import React from 'react';
import { Database, ChevronUp, ChevronDown } from 'lucide-react';
import { COMMON_CRS } from '../../constants';
import { sanitizeTechnicalName } from '../../utils/nameSanitizer';
import DiffField from './DiffField';
import AiTrigger from '../ai/AiTrigger';
import type { DataModel } from '../../types';
import type { Translations } from '../../i18n/index';

interface ModelHeaderSectionProps {
  model: DataModel;
  baselineModel: DataModel | null;
  onUpdate: (model: DataModel) => void;
  reviewMode: boolean;
  t: Translations;
  lang: string;
  aiContext: any;
  onGenerateDescription: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

const ModelHeaderSection: React.FC<ModelHeaderSectionProps> = ({
  model,
  baselineModel,
  onUpdate,
  reviewMode,
  t,
  lang,
  aiContext,
  onGenerateDescription,
  isOpen,
  onToggle,
}) => {
  return (
    <section className="bg-white rounded-[24px] md:rounded-[32px] border border-slate-200 shadow-sm mb-6 md:mb-10 overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 md:p-5 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center">
            <Database size={16} className="text-indigo-600" />
          </div>
          <div className="text-left">
            <h3 className="text-sm md:text-base font-bold text-slate-900">
              {model.name || t.modelNamePlaceholder}
            </h3>
            {model.crs && (
              <span className="text-[9px] md:text-[10px] font-mono text-slate-500">{model.crs}</span>
            )}
          </div>
        </div>
        {isOpen ? (
          <ChevronUp size={16} className="text-slate-400 flex-shrink-0" />
        ) : (
          <ChevronDown size={16} className="text-slate-400 flex-shrink-0" />
        )}
      </button>

      {/* Content */}
      {isOpen && (
        <div className="px-5 md:px-8 pb-6 md:pb-8 border-t border-slate-100 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex flex-col gap-6 md:gap-8">
        <div className="flex-1 space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            <DiffField
              label={t.modelName}
              currentValue={model.name}
              baselineValue={baselineModel?.name}
              reviewMode={reviewMode}
              className="lg:col-span-2"
            >
              <input
                type="text"
                placeholder={t.modelNamePlaceholder}
                value={model.name}
                onChange={(e) => onUpdate({ ...model, name: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-[18px] md:rounded-[20px] px-4 py-3 text-sm md:text-base font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
              />
            </DiffField>
            <DiffField
              label={
                <div className="flex items-center gap-2">
                  {t.version}
                  <span className="bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded text-[8px] tracking-widest uppercase font-black">
                    AUTO
                  </span>
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
            <DiffField
              label={t.namespace}
              currentValue={model.namespace}
              baselineValue={baselineModel?.namespace}
              reviewMode={reviewMode}
            >
              <input
                type="text"
                placeholder={t.namespacePlaceholder}
                value={model.namespace}
                onChange={(e) =>
                  onUpdate({
                    ...model,
                    namespace: sanitizeTechnicalName(e.target.value).replace(
                      /_/g,
                      '-'
                    ),
                  })
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-[18px] md:rounded-[20px] px-4 py-3 text-xs md:text-sm font-mono text-indigo-700 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
              />
            </DiffField>
            <DiffField
              label={t.crsLabel}
              currentValue={model.crs}
              baselineValue={baselineModel?.crs}
              reviewMode={reviewMode}
            >
              <div className="space-y-3">
                <input
                  type="text"
                  list="crs-presets"
                  placeholder={t.crsPlaceholder}
                  value={model.crs || ''}
                  onChange={(e) =>
                    onUpdate({ ...model, crs: e.target.value.toUpperCase() })
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-[18px] md:rounded-[20px] px-4 py-3 text-sm md:text-base font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                />
                <div className="flex flex-wrap gap-1.5 md:gap-2">
                  {COMMON_CRS.slice(0, 5).map((crs) => (
                    <button
                      key={crs.code}
                      onClick={() => onUpdate({ ...model, crs: crs.code })}
                      className={`px-2 md:px-2.5 py-1 rounded-lg text-[9px] md:text-[10px] font-black border transition-all ${
                        model.crs === crs.code
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                          : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300'
                      }`}
                    >
                      {crs.code}
                    </button>
                  ))}
                </div>
              </div>
              <datalist id="crs-presets">
                {COMMON_CRS.map((crs) => (
                  <option key={crs.code} value={crs.code}>
                    {crs.name}
                  </option>
                ))}
              </datalist>
            </DiffField>
          </div>

          <DiffField
            label={t.description}
            currentValue={model.description}
            baselineValue={baselineModel?.description}
            reviewMode={reviewMode}
            action={
              <AiTrigger
                onClick={onGenerateDescription}
                isLoading={aiContext.isLoading}
                isActive={aiContext.currentOperation === 'abstract'}
                hasError={!!aiContext.error}
                label={t.ai?.generateDescription || 'Generate description'}
                t={t}
              />
            }
          >
            <textarea
              placeholder={t.descriptionPlaceholder}
              value={model.description}
              onChange={(e) => onUpdate({ ...model, description: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-[18px] md:rounded-[20px] px-4 py-3 text-xs md:text-sm min-h-[60px] md:min-h-[80px] focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all resize-none leading-relaxed"
            />
          </DiffField>
        </div>
      </div>
        </div>
      )}
    </section>
  );
};

export default ModelHeaderSection;
