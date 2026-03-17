import React from 'react';
import type { Translations } from '../../i18n/index';
import { ShieldCheck, Plus, Trash2 } from 'lucide-react';
import { Layer } from '../../types';

interface LayerConstraintsSectionProps {
  layer: Layer;
  onUpdateLayer: (update: Partial<Layer>) => void;
  t: Translations;
}

const LayerConstraintsSection: React.FC<LayerConstraintsSectionProps> = ({ layer, onUpdateLayer, t }) => {
  return (
              <div className="mt-8 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                    <ShieldCheck size={16} className="text-emerald-500" />
                    {t.layerValidation?.title || 'Advanced Validation'}
                  </h3>
                </div>

                <div className="p-5 space-y-4">
                  {(!layer.layerConstraints || layer.layerConstraints.length === 0) ? (
                    <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <p className="text-sm text-slate-500 mb-3">{t.layerValidation?.noRules || 'No rules defined'}</p>
                      <button
                        onClick={() => onUpdateLayer({
                          layerConstraints: [{
                            id: Math.random().toString(36).substring(2, 9),
                            type: 'compare',
                            fieldA: layer.properties[0]?.name || '',
                            operator: '>',
                            fieldB: layer.properties.length > 1 ? layer.properties[1]?.name : (layer.properties[0]?.name || ''),
                            errorMessage: ''
                          }]
                        })}
                        className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 hover:border-emerald-500 hover:text-emerald-600 transition-colors shadow-sm"
                      >
                        + {t.layerValidation?.addRule || 'Add Rule'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {layer.layerConstraints.map((constraint, index) => (
                        <div key={constraint.id} className="flex flex-wrap items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 relative group">

                          {/* Field A */}
                          <div className="flex-1 min-w-[120px]">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">{t.layerValidation?.field1 || 'Field 1'}</label>
                            <select
                              value={constraint.fieldA}
                              onChange={(e) => {
                                const newConstraints = [...layer.layerConstraints!];
                                newConstraints[index] = { ...constraint, fieldA: e.target.value };
                                onUpdateLayer({ layerConstraints: newConstraints });
                              }}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                            >
                              <option value="">-- {t.styling?.selectProperty || 'Select'} --</option>
                              {layer.properties.map(p => (
                                <option key={p.id} value={p.name}>{p.name}</option>
                              ))}
                            </select>
                          </div>

                          {/* Operator */}
                          <div className="w-24 shrink-0">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">{t.layerValidation?.operator || 'Operator'}</label>
                            <select
                              value={constraint.operator}
                              onChange={(e) => {
                                const newConstraints = [...layer.layerConstraints!];
                                newConstraints[index] = { ...constraint, operator: e.target.value as any };
                                onUpdateLayer({ layerConstraints: newConstraints });
                              }}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-black text-slate-700 text-center focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 mono"
                            >
                              <option value=">">&gt;</option>
                              <option value="<">&lt;</option>
                              <option value=">=">&ge;</option>
                              <option value="<=">&le;</option>
                              <option value="==">==</option>
                              <option value="!=">!=</option>
                            </select>
                          </div>

                          {/* Field B */}
                          <div className="flex-1 min-w-[120px]">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">{t.layerValidation?.field2 || 'Field 2'}</label>
                            <select
                              value={constraint.fieldB}
                              onChange={(e) => {
                                const newConstraints = [...layer.layerConstraints!];
                                newConstraints[index] = { ...constraint, fieldB: e.target.value };
                                onUpdateLayer({ layerConstraints: newConstraints });
                              }}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                            >
                              <option value="">-- {t.styling?.selectProperty || 'Select'} --</option>
                              {layer.properties.map(p => (
                                <option key={p.id} value={p.name}>{p.name}</option>
                              ))}
                            </select>
                          </div>

                          {/* Custom Error Message */}
                          <div className="w-full sm:flex-1 min-w-[200px]">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">{t.layerValidation?.errorMessage || 'Error Message'}</label>
                            <input
                              type="text"
                              value={constraint.errorMessage || ''}
                              onChange={(e) => {
                                const newConstraints = [...layer.layerConstraints!];
                                newConstraints[index] = { ...constraint, errorMessage: e.target.value };
                                onUpdateLayer({ layerConstraints: newConstraints });
                              }}
                              placeholder={t.layerValidation?.errorMessagePlaceholder || 'Message...'}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 placeholder-slate-400 italic"
                            />
                          </div>

                          {/* Delete Rule Button */}
                          <div className="pt-5 shrink-0">
                            <button
                              onClick={() => {
                                const newConstraints = layer.layerConstraints!.filter(c => c.id !== constraint.id);
                                onUpdateLayer({ layerConstraints: newConstraints });
                              }}
                              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title={t.layerValidation?.deleteRule || 'Delete'}
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>

                        </div>
                      ))}

                      {/* Add Another Rule Button */}
                      <button
                        onClick={() => {
                          const newConstraints = [...(layer.layerConstraints || []), {
                            id: Math.random().toString(36).substring(2, 9),
                            type: 'compare',
                            fieldA: layer.properties[0]?.name || '',
                            operator: '>',
                            fieldB: layer.properties.length > 1 ? layer.properties[1]?.name : (layer.properties[0]?.name || ''),
                            errorMessage: ''
                          }];
                          onUpdateLayer({ layerConstraints: newConstraints as any });
                        }}
                        className="mt-4 px-3 py-1.5 text-sm font-bold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors flex items-center gap-1"
                      >
                        <Plus size={14} /> {t.layerValidation?.addRule || 'Add Rule'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
  );
};

export default LayerConstraintsSection;
