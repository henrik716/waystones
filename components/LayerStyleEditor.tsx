import React, { useState } from 'react';
import type { Translations } from '../i18n/index';
import { Palette } from 'lucide-react';
import { Layer, LayerStyle } from '../types';
import StylePreview from './StylePreview';

const PRESET_COLORS = ['#6366F1', '#4F46E5', '#1A4B8C', '#1B6B4A', '#D97706', '#DC2626', '#7C3AED', '#475569'];

interface LayerStyleEditorProps {
  layer: Layer;
  onUpdate: (style: Partial<LayerStyle>) => void;
  t: Translations;
  /** 'dark' for ModelEditor accordion, 'light' for QuickPublish / standalone */
  variant?: 'dark' | 'light';
  /** Show the SVG preview panel */
  showPreview?: boolean;
  idPrefix?: string;
}

const LayerStyleEditor: React.FC<LayerStyleEditorProps> = ({
  layer, onUpdate, t, variant = 'light', showPreview = true, idPrefix = 'qp'
}) => {
  const st = t.styling || {};
  const style = layer.style;
  const isPoint = layer.geometryType.includes('Point') || layer.geometryType === 'GeometryCollection';
  const isLine = layer.geometryType.includes('Line') || layer.geometryType.includes('Polygon') || layer.geometryType === 'GeometryCollection';
  const isPolygon = layer.geometryType.includes('Polygon') || layer.geometryType === 'GeometryCollection';

  const [newCatValue, setNewCatValue] = useState('');

  const categorizableProps = layer.properties.filter(p => ['primitive', 'codelist'].includes(p.fieldType.kind));

  // Theme classes
  const isDark = variant === 'dark';
  const cls = {
    toggle: isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200',
    toggleActive: isDark ? 'bg-indigo-600 text-white shadow-xl' : 'bg-indigo-600 text-white shadow-lg',
    toggleInactive: isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600',
    label: isDark ? 'text-slate-500' : 'text-slate-400',
    badge: isDark ? 'text-indigo-500 bg-indigo-500/10' : 'text-indigo-600 bg-indigo-50',
    slider: isDark ? 'bg-slate-800' : 'bg-slate-200',
    select: isDark
      ? 'bg-slate-800 border-slate-700 hover:border-slate-500'
      : 'bg-white border-slate-200 hover:border-slate-300',
    colorBorder: isDark ? 'border-transparent' : 'border-slate-200',
    colorActive: isDark ? 'border-white' : 'border-indigo-500',
    colorPickerBg: isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200',
    divider: isDark ? 'border-slate-800/60' : 'border-slate-200',
    categorizedBg: isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200',
    categorizedItem: isDark ? 'bg-black/30 border-slate-700/40 hover:border-slate-600' : 'bg-white border-slate-200 hover:border-slate-300',
    categorizedLabel: isDark ? 'text-slate-400' : 'text-slate-500',
    noCodelist: isDark ? 'bg-slate-800/40 border-slate-700/50 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-400',
    input: isDark
      ? 'bg-slate-900 border-slate-700 text-slate-200 focus:border-indigo-500'
      : 'bg-white border-slate-200 text-slate-900 focus:border-indigo-400',
    iconActive: isDark ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-indigo-600 border-indigo-600 text-white shadow-md',
    iconInactive: isDark ? 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300' : 'bg-white border-slate-200 text-slate-400 hover:border-indigo-300 hover:text-indigo-400',
  };

  const updateCategory = (code: string, settings: any) => {
    const current = style.categorizedSettings || {};
    const existing = current[code] || {};

    // Legacy fallback for color
    if (!existing.color && style.categorizedColors?.[code]) {
      existing.color = style.categorizedColors[code];
    }

    onUpdate({
      categorizedSettings: {
        ...current,
        [code]: { ...existing, ...settings }
      }
    });
  };

  return (
    <div className={`grid grid-cols-1 ${showPreview ? 'xl:grid-cols-3' : ''} gap-6`}>
      <div className={`${showPreview ? 'xl:col-span-2' : ''} space-y-6`}>

        {/* Simple / Categorized toggle */}
        <div className={`flex p-1 rounded-2xl border shadow-inner overflow-hidden ${cls.toggle}`}>
          <button
            onClick={() => onUpdate({ type: 'simple' })}
            className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all ${style.type === 'simple' ? cls.toggleActive : cls.toggleInactive}`}
          >
            {st.modeSimple}
          </button>
          <button
            onClick={() => onUpdate({ type: 'categorized' })}
            className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${style.type === 'categorized' ? cls.toggleActive : cls.toggleInactive}`}
          >
            {st.modeCategorized}
          </button>
        </div>

        {style.type === 'simple' ? (
          <div className="space-y-6">
            {/* Color palette */}
            <div>
              <label className={`text-[10px] font-black uppercase tracking-widest ${cls.label} block mb-3`}>{st.pickColor}</label>
              <div id={`${idPrefix}-color-palette`} className="flex flex-wrap gap-2.5">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => onUpdate({ simpleColor: c })}
                    className={`w-9 h-9 rounded-xl border-2 transition-all hover:scale-110 ${style.simpleColor === c ? `${cls.colorActive} scale-110 shadow-xl` : `${cls.colorBorder} opacity-80 hover:opacity-100`}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <div className={`w-9 h-9 rounded-xl border-2 flex items-center justify-center relative overflow-hidden group/color ${cls.colorPickerBg}`}>
                  <input
                    type="color"
                    value={style.simpleColor}
                    onChange={e => onUpdate({ simpleColor: e.target.value })}
                    className="absolute inset-0 w-full h-full scale-150 cursor-pointer border-none bg-transparent"
                  />
                  <Palette size={16} className="text-slate-400 pointer-events-none z-10 group-hover/color:text-slate-600 transition-colors" />
                </div>
              </div>
            </div>

            {/* Geometry-specific controls */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-6 pt-6 border-t ${cls.divider}`}>
              {/* Point controls */}
              {isPoint && (
                <>
                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <label className={`text-[10px] font-black uppercase tracking-widest ${cls.label}`}>{st.pointSize}</label>
                      <span className={`text-xs font-black ${cls.badge} px-2 py-0.5 rounded-md`}>{style.pointSize || 8}px</span>
                    </div>
                    <input type="range" min="2" max="48" value={style.pointSize || 8} onChange={e => onUpdate({ pointSize: parseInt(e.target.value) })} className={`w-full h-2 ${cls.slider} rounded-full appearance-none cursor-pointer accent-indigo-500`} />
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <label className={`text-[10px] font-black uppercase tracking-widest ${cls.label}`}>{st.pointOpacity || 'Opacity'}</label>
                      <span className={`text-xs font-black ${cls.badge} px-2 py-0.5 rounded-md`}>{Math.round((style.pointOpacity ?? 1) * 100)}%</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.01" value={style.pointOpacity ?? 1} onChange={e => onUpdate({ pointOpacity: parseFloat(e.target.value) })} className={`w-full h-2 ${cls.slider} rounded-full appearance-none cursor-pointer accent-indigo-500`} />
                  </div>
                  <div className="space-y-3">
                    <label className={`text-[10px] font-black uppercase tracking-widest ${cls.label}`}>{st.pointIcon}</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {Object.entries(st.icons || {}).map(([k, v]) => (
                        <button key={k} onClick={() => onUpdate({ pointIcon: k as any })} className={`py-2.5 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all h-10 flex items-center justify-center ${style.pointIcon === k ? cls.iconActive : cls.iconInactive}`}>
                          {v as string}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Line controls — hidden for polygon-only layers when outline is off */}
              {isLine && !(isPolygon && !layer.geometryType.includes('Line') && style.showOutline === false) && (
                <>
                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <label className={`text-[10px] font-black uppercase tracking-widest ${cls.label}`}>{st.lineWidth}</label>
                      <span className={`text-xs font-black ${cls.badge} px-2 py-0.5 rounded-md`}>{style.lineWidth || 2}px</span>
                    </div>
                    <input type="range" min="1" max="24" value={style.lineWidth || 2} onChange={e => onUpdate({ lineWidth: parseInt(e.target.value) })} className={`w-full h-2 ${cls.slider} rounded-full appearance-none cursor-pointer accent-indigo-500`} />
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <label className={`text-[10px] font-black uppercase tracking-widest ${cls.label}`}>{st.lineOpacity || 'Opacity'}</label>
                      <span className={`text-xs font-black ${cls.badge} px-2 py-0.5 rounded-md`}>{Math.round((style.lineOpacity ?? 1) * 100)}%</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.01" value={style.lineOpacity ?? 1} onChange={e => onUpdate({ lineOpacity: parseFloat(e.target.value) })} className={`w-full h-2 ${cls.slider} rounded-full appearance-none cursor-pointer accent-indigo-500`} />
                  </div>
                  <div className="space-y-3">
                    <label className={`text-[10px] font-black uppercase tracking-widest ${cls.label}`}>{st.lineDash}</label>
                    <select value={style.lineDash || 'solid'} onChange={e => onUpdate({ lineDash: e.target.value as any })} className={`w-full border rounded-xl px-4 py-3 text-xs font-bold outline-none cursor-pointer transition-all ${cls.select}`}>
                      {Object.entries(st.dashes || {}).map(([k, v]) => <option key={k} value={k}>{v as string}</option>)}
                    </select>
                  </div>
                </>
              )}

              {/* Polygon controls */}
              {isPolygon && (
                <>
                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <label className={`text-[10px] font-black uppercase tracking-widest ${cls.label}`}>{st.fillOpacity}</label>
                      <span className={`text-xs font-black ${cls.badge} px-2 py-0.5 rounded-md`}>{Math.round((style.fillOpacity || 0.5) * 100)}%</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.01" value={style.fillOpacity || 0.5} onChange={e => onUpdate({ fillOpacity: parseFloat(e.target.value) })} className={`w-full h-2 ${cls.slider} rounded-full appearance-none cursor-pointer accent-indigo-500`} />
                  </div>
                  <div className="space-y-3">
                    <label className={`text-[10px] font-black uppercase tracking-widest ${cls.label}`}>{st.hatchStyle}</label>
                    <select value={style.hatchStyle || 'solid'} onChange={e => onUpdate({ hatchStyle: e.target.value as any })} className={`w-full border rounded-xl px-4 py-3 text-xs font-bold outline-none cursor-pointer transition-all ${cls.select}`}>
                      {Object.entries(st.hatches || {}).map(([k, v]) => <option key={k} value={k}>{v as string}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center justify-between col-span-full">
                    <label className={`text-[10px] font-black uppercase tracking-widest ${cls.label}`}>{st.showOutline || 'Show border'}</label>
                    <button
                      onClick={() => onUpdate({ showOutline: style.showOutline === false ? true : false })}
                      className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${style.showOutline !== false ? 'bg-indigo-600' : 'bg-slate-300'}`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${style.showOutline !== false ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </div>
                  {(style.hatchStyle && style.hatchStyle !== 'solid') && (
                    <>
                      <div className="space-y-3">
                        <div className="flex justify-between items-end">
                          <label className={`text-[10px] font-black uppercase tracking-widest ${cls.label}`}>{st.hatchSpacing || 'Spacing'}</label>
                          <span className={`text-xs font-black ${cls.badge} px-2 py-0.5 rounded-md`}>{style.hatchSpacing || 6}px</span>
                        </div>
                        <input type="range" min="2" max="20" value={style.hatchSpacing || 6} onChange={e => onUpdate({ hatchSpacing: parseInt(e.target.value) })} className={`w-full h-2 ${cls.slider} rounded-full appearance-none cursor-pointer accent-indigo-500`} />
                      </div>
                      <div className="space-y-3">
                        <div className="flex justify-between items-end">
                          <label className={`text-[10px] font-black uppercase tracking-widest ${cls.label}`}>{st.hatchThickness || 'Thickness'}</label>
                          <span className={`text-xs font-black ${cls.badge} px-2 py-0.5 rounded-md`}>{style.hatchThickness || 1}px</span>
                        </div>
                        <input type="range" min="0.5" max="5" step="0.5" value={style.hatchThickness || 1} onChange={e => onUpdate({ hatchThickness: parseFloat(e.target.value) })} className={`w-full h-2 ${cls.slider} rounded-full appearance-none cursor-pointer accent-indigo-500`} />
                      </div>
                                          </>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          /* Categorized mode */
          <div className="space-y-5">
            <div>
              <label className={`text-[10px] font-black uppercase tracking-widest ${cls.label} block mb-3`}>{st.selectProperty}</label>
              {categorizableProps.length > 0 ? (
                <select value={style.propertyId || ''} onChange={e => onUpdate({ propertyId: e.target.value, categorizedValues: [] })} className={`w-full border rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:border-indigo-500 transition-all ${cls.select}`}>
                  <option value="">-- {st.selectProperty} --</option>
                  {categorizableProps.map(p => <option key={p.id} value={p.id}>{p.title || p.name}</option>)}
                </select>
              ) : (
                <div className={`p-5 rounded-2xl border text-center ${cls.noCodelist}`}>
                  <p className="text-xs font-bold italic">{st.noPropsForCategorized || st.noCodelistProps}</p>
                </div>
              )}
            </div>
            {style.propertyId && (() => {
              const sp = layer.properties.find(p => p.id === style.propertyId);
              const codelistVals = sp?.fieldType.kind === 'codelist' && sp.fieldType.mode === 'inline' ? sp.fieldType.values : [];
              const isFreeForm = codelistVals.length === 0;
              const freeVals = style.categorizedValues || [];

              const renderCategoryCard = (code: string, label: string, canDelete = false) => (
                <div key={code} className={`p-3.5 rounded-xl border transition-all ${cls.categorizedItem} space-y-4`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold truncate flex-1" title={label}>{label}</span>
                    <input
                      type="color"
                      value={style.categorizedSettings?.[code]?.color || style.categorizedColors?.[code] || '#6366F1'}
                      onChange={e => updateCategory(code, { color: e.target.value })}
                      className="w-8 h-8 rounded-lg bg-transparent border-none cursor-pointer hover:scale-110 transition-transform shrink-0"
                    />
                    {canDelete && (
                      <button
                        onClick={() => {
                          const newVals = freeVals.filter(v => v !== code);
                          const newSettings = { ...(style.categorizedSettings || {}) };
                          delete newSettings[code];
                          onUpdate({ categorizedValues: newVals, categorizedSettings: newSettings });
                        }}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0 text-xs font-bold"
                        title="Remove"
                      >×</button>
                    )}
                  </div>

                  {isPolygon && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest">
                        <span className="text-slate-400">{st.fillOpacity || 'Opacity'}</span>
                        <span className="text-indigo-500">{Math.round((style.categorizedSettings?.[code]?.fillOpacity ?? 0.5) * 100)}%</span>
                      </div>
                      <input
                        type="range" min="0" max="1" step="0.01"
                        value={style.categorizedSettings?.[code]?.fillOpacity ?? 0.5}
                        onChange={e => updateCategory(code, { fillOpacity: parseFloat(e.target.value) })}
                        className={`w-full h-1.5 ${cls.slider} rounded-full appearance-none cursor-pointer accent-indigo-500`}
                      />
                    </div>
                  )}

                  {isPoint && (
                    <>
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest">
                          <span className="text-slate-400">{st.pointSize || 'Size'}</span>
                          <span className="text-indigo-500">{style.categorizedSettings?.[code]?.pointSize ?? style.pointSize ?? 8}px</span>
                        </div>
                        <input
                          type="range" min="2" max="48"
                          value={style.categorizedSettings?.[code]?.pointSize ?? style.pointSize ?? 8}
                          onChange={e => updateCategory(code, { pointSize: parseInt(e.target.value) })}
                          className={`w-full h-1.5 ${cls.slider} rounded-full appearance-none cursor-pointer accent-indigo-500`}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest">
                          <span className="text-slate-400">{st.pointOpacity || 'Opacity'}</span>
                          <span className="text-indigo-500">{Math.round((style.categorizedSettings?.[code]?.pointOpacity ?? 1) * 100)}%</span>
                        </div>
                        <input
                          type="range" min="0" max="1" step="0.01"
                          value={style.categorizedSettings?.[code]?.pointOpacity ?? 1}
                          onChange={e => updateCategory(code, { pointOpacity: parseFloat(e.target.value) })}
                          className={`w-full h-1.5 ${cls.slider} rounded-full appearance-none cursor-pointer accent-indigo-500`}
                        />
                      </div>
                    </>
                  )}

                  {(isLine || isPolygon) && (
                    <>
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest">
                          <span className="text-slate-400">{st.lineWidth || 'Width'}</span>
                          <span className="text-indigo-500">{style.categorizedSettings?.[code]?.lineWidth ?? style.lineWidth ?? 2}px</span>
                        </div>
                        <input
                          type="range" min="1" max="24"
                          value={style.categorizedSettings?.[code]?.lineWidth ?? style.lineWidth ?? 2}
                          onChange={e => updateCategory(code, { lineWidth: parseInt(e.target.value) })}
                          className={`w-full h-1.5 ${cls.slider} rounded-full appearance-none cursor-pointer accent-indigo-500`}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest">
                          <span className="text-slate-400">{st.lineOpacity || 'Opacity'}</span>
                          <span className="text-indigo-500">{Math.round((style.categorizedSettings?.[code]?.lineOpacity ?? 1) * 100)}%</span>
                        </div>
                        <input
                          type="range" min="0" max="1" step="0.01"
                          value={style.categorizedSettings?.[code]?.lineOpacity ?? 1}
                          onChange={e => updateCategory(code, { lineOpacity: parseFloat(e.target.value) })}
                          className={`w-full h-1.5 ${cls.slider} rounded-full appearance-none cursor-pointer accent-indigo-500`}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">{st.lineDash}</label>
                        <select
                          value={style.categorizedSettings?.[code]?.lineDash ?? style.lineDash ?? 'solid'}
                          onChange={e => updateCategory(code, { lineDash: e.target.value })}
                          className={`w-full text-[10px] p-2 rounded-lg border outline-none transition-colors ${cls.input}`}
                        >
                          {Object.entries(st.dashes || {}).map(([k, dv]) => (
                            <option key={k} value={k}>{dv as string}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}

                  {isPolygon && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">{st.hatchStyle}</label>
                        <select
                          value={style.categorizedSettings?.[code]?.hatchStyle ?? style.hatchStyle ?? 'solid'}
                          onChange={e => updateCategory(code, { hatchStyle: e.target.value })}
                          className={`w-full text-[10px] p-2 rounded-lg border outline-none transition-colors ${cls.input}`}
                        >
                          {Object.entries(st.hatches || {}).map(([k, hv]) => (
                            <option key={k} value={k}>{hv as string}</option>
                          ))}
                        </select>
                      </div>

                      {(style.categorizedSettings?.[code]?.hatchStyle ?? style.hatchStyle ?? 'solid') !== 'solid' && (
                        <div className="grid grid-cols-2 gap-3 pt-1">
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest">
                              <span className="text-slate-400">{st.hatchSpacing}</span>
                              <span className="text-indigo-500">{style.categorizedSettings?.[code]?.hatchSpacing ?? style.hatchSpacing ?? 6}px</span>
                            </div>
                            <input
                              type="range" min="2" max="24"
                              value={style.categorizedSettings?.[code]?.hatchSpacing ?? style.hatchSpacing ?? 6}
                              onChange={e => updateCategory(code, { hatchSpacing: parseInt(e.target.value) })}
                              className={`w-full h-1.5 ${cls.slider} rounded-full appearance-none cursor-pointer accent-indigo-500`}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest">
                              <span className="text-slate-400">{st.hatchThickness}</span>
                              <span className="text-indigo-500">{style.categorizedSettings?.[code]?.hatchThickness ?? style.hatchThickness ?? 1}px</span>
                            </div>
                            <input
                              type="range" min="1" max="5"
                              value={style.categorizedSettings?.[code]?.hatchThickness ?? style.hatchThickness ?? 1}
                              onChange={e => updateCategory(code, { hatchThickness: parseInt(e.target.value) })}
                              className={`w-full h-1.5 ${cls.slider} rounded-full appearance-none cursor-pointer accent-indigo-500`}
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );

              return (
                <div className={`rounded-2xl p-4 space-y-3 border max-h-[500px] overflow-y-auto custom-scrollbar shadow-inner ${cls.categorizedBg}`}>
                  <label className={`text-[10px] font-black uppercase tracking-widest ${cls.categorizedLabel} block mb-2`}>{st.colorsForValues}</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {isFreeForm
                      ? freeVals.map(v => renderCategoryCard(v, v, true))
                      : codelistVals.map(v => renderCategoryCard(v.code, v.label || v.code, false))
                    }
                  </div>
                  {isFreeForm && (
                    <div className="flex gap-2 pt-2">
                      <input
                        type="text"
                        value={newCatValue}
                        onChange={e => setNewCatValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && newCatValue.trim() && !freeVals.includes(newCatValue.trim())) {
                            onUpdate({ categorizedValues: [...freeVals, newCatValue.trim()] });
                            setNewCatValue('');
                          }
                        }}
                        placeholder={st.valuePlaceholder || 'Type a value…'}
                        className={`flex-1 border rounded-xl px-3 py-2 text-xs font-bold outline-none transition-all ${cls.input}`}
                      />
                      <button
                        onClick={() => {
                          if (newCatValue.trim() && !freeVals.includes(newCatValue.trim())) {
                            onUpdate({ categorizedValues: [...freeVals, newCatValue.trim()] });
                            setNewCatValue('');
                          }
                        }}
                        className="px-3 py-2 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 transition-colors shrink-0"
                      >
                        {st.addValue || 'Add'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

          </div>
        )}

        {/* Labeling Section */}
        <div className={`pt-6 border-t ${cls.divider} space-y-6`}>
          <div className="flex items-center justify-between">
            <label className={`text-[10px] font-black uppercase tracking-widest ${cls.label}`}>{st.enableLabels || 'Enable Labels'}</label>
            <button
              onClick={() => onUpdate({ labelSettings: { ...(style.labelSettings || { fontSize: 10, color: '#000000', fontFamily: 'Arial', haloEnabled: false, haloSize: 1, haloColor: '#ffffff' }), enabled: !style.labelSettings?.enabled } })}
              className={`w-12 h-6 rounded-full transition-colors relative ${style.labelSettings?.enabled ? 'bg-indigo-600' : 'bg-slate-300'}`}
            >
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${style.labelSettings?.enabled ? 'left-7' : 'left-1'}`} />
            </button>
          </div>

          {style.labelSettings?.enabled && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="space-y-3">
                <label className={`text-[10px] font-black uppercase tracking-widest ${cls.label}`}>{st.labelProperty || 'Label Property'}</label>
                <select
                  value={style.labelSettings.propertyId || ''}
                  onChange={e => onUpdate({ labelSettings: { ...style.labelSettings!, propertyId: e.target.value } })}
                  className={`w-full border rounded-xl px-4 py-3 text-xs font-bold outline-none cursor-pointer transition-all ${cls.select}`}
                >
                  <option value="">-- {st.selectProperty} --</option>
                  {layer.properties.filter(p => ['primitive', 'codelist'].includes(p.fieldType.kind)).map(p => (
                    <option key={p.id} value={p.id}>{p.title || p.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                <label className={`text-[10px] font-black uppercase tracking-widest ${cls.label}`}>{st.fontFamily || 'Font Family'}</label>
                <select
                  value={style.labelSettings.fontFamily || 'Arial'}
                  onChange={e => onUpdate({ labelSettings: { ...style.labelSettings!, fontFamily: e.target.value } })}
                  className={`w-full border rounded-xl px-4 py-3 text-xs font-bold outline-none cursor-pointer transition-all ${cls.select}`}
                >
                  {['Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Times New Roman', 'Georgia', 'Courier New'].map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <label className={`text-[10px] font-black uppercase tracking-widest ${cls.label}`}>{st.fontSize || 'Font Size'}</label>
                  <span className={`text-xs font-black ${cls.badge} px-2 py-0.5 rounded-md`}>{style.labelSettings.fontSize || 10}pt</span>
                </div>
                <input
                  type="range" min="6" max="72"
                  value={style.labelSettings.fontSize || 10}
                  onChange={e => onUpdate({ labelSettings: { ...style.labelSettings!, fontSize: parseInt(e.target.value) } })}
                  className={`w-full h-2 ${cls.slider} rounded-full appearance-none cursor-pointer accent-indigo-500`}
                />
              </div>

              <div className="space-y-3">
                <label className={`text-[10px] font-black uppercase tracking-widest ${cls.label}`}>{st.labelColor || 'Label Color'}</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={style.labelSettings.color || '#000000'}
                    onChange={e => onUpdate({ labelSettings: { ...style.labelSettings!, color: e.target.value } })}
                    className="w-10 h-10 rounded-xl bg-transparent border-none cursor-pointer p-0 overflow-hidden"
                  />
                  <span className="text-xs font-mono opacity-50 uppercase">{style.labelSettings.color || '#000000'}</span>
                </div>
              </div>

              <div className="space-y-3">
                <label className={`text-[10px] font-black uppercase tracking-widest ${cls.label}`}>{st.labelPlacement || 'Label Placement'}</label>
                <select
                  value={style.labelSettings.placement || 'around'}
                  onChange={e => onUpdate({ labelSettings: { ...style.labelSettings!, placement: e.target.value } })}
                  className={`w-full border rounded-xl px-4 py-3 text-xs font-bold outline-none cursor-pointer transition-all ${cls.select}`}
                >
                  {isPoint && (
                    <>
                      <option value="around">{st.aroundPoint || 'Around Point'}</option>
                      <option value="over">{st.overPoint || 'Over Point'}</option>
                    </>
                  )}
                  {isLine && (
                    <>
                      <option value="parallel">{st.parallel || 'Parallel'}</option>
                      <option value="curved">{st.curved || 'Curved'}</option>
                    </>
                  )}
                  {isPolygon && (
                    <>
                      <option value="around">{st.aroundCentroid || 'Centroid (Flexible)'}</option>
                      <option value="horizontal">{st.horizontal || 'Horizontal (Inside)'}</option>
                    </>
                  )}
                  {!isPoint && !isLine && !isPolygon && <option value="around">{st.around || 'Around'}</option>}
                </select>
                
                {/* Placement Description Helper */}
                <p className="text-[10px] text-slate-400 italic px-1 leading-relaxed">
                  {(() => {
                    const mode = style.labelSettings.placement || 'around';
                    if (isPoint) return mode === 'over' ? "Label sits directly on the point (ideal for symbols)." : "Label is placed in a tight circle around the point.";
                    if (isLine) return mode === 'curved' ? "Label bends to follow the curvature of the line." : "Label stays straight and parallel to the line.";
                    if (isPolygon) return mode === 'horizontal' ? "Forces label to stay horizontal and strictly inside the polygon." : "Places label near the center; may move outside if space is limited.";
                    return "";
                  })()}
                </p>
              </div>

              <div className="sm:col-span-2 space-y-4 pt-2">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="halo-enabled"
                    checked={style.labelSettings.haloEnabled}
                    onChange={e => onUpdate({ labelSettings: { ...style.labelSettings!, haloEnabled: e.target.checked } })}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <label htmlFor="halo-enabled" className={`text-[10px] font-black uppercase tracking-widest ${cls.label} cursor-pointer`}>
                    {st.haloEnabled || 'Text Buffer (Halo)'}
                  </label>
                </div>

                {style.labelSettings.haloEnabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-4 rounded-2xl bg-slate-50 border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
                    <div className="space-y-3">
                      <div className="flex justify-between items-end">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">{st.haloSize || 'Buffer Size'}</label>
                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md">{style.labelSettings.haloSize || 1}pt</span>
                      </div>
                      <input
                        type="range" min="0.5" max="10" step="0.1"
                        value={style.labelSettings.haloSize || 1}
                        onChange={e => onUpdate({ labelSettings: { ...style.labelSettings!, haloSize: parseFloat(e.target.value) } })}
                        className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">{st.haloColor || 'Buffer Color'}</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={style.labelSettings.haloColor || '#ffffff'}
                          onChange={e => onUpdate({ labelSettings: { ...style.labelSettings!, haloColor: e.target.value } })}
                          className="w-8 h-8 rounded-lg bg-transparent border-none cursor-pointer p-0 overflow-hidden"
                        />
                        <span className="text-xs font-mono opacity-50 uppercase">{style.labelSettings.haloColor || '#ffffff'}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Preview */}
      {showPreview && (
        <div className="flex flex-col gap-4 h-full justify-between">
          <StylePreview layer={layer} t={t} />
        </div>
      )}
    </div>
  );
};

export default React.memo(LayerStyleEditor);
