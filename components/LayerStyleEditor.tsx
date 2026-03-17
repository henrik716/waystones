import React from 'react';
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
}

const LayerStyleEditor: React.FC<LayerStyleEditorProps> = ({
  layer, onUpdate, t, variant = 'light', showPreview = true
}) => {
  const st = t.styling || {};
  const style = layer.style;
  const isPoint = layer.geometryType.includes('Point') || layer.geometryType === 'GeometryCollection';
  const isLine = layer.geometryType.includes('Line') || layer.geometryType.includes('Polygon') || layer.geometryType === 'GeometryCollection';
  const isPolygon = layer.geometryType.includes('Polygon') || layer.geometryType === 'GeometryCollection';

  const codelistProps = layer.properties.filter(p => p.fieldType.kind === 'codelist' && p.fieldType.mode === 'inline' && p.fieldType.values.length > 0);

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
    iconActive: isDark ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-indigo-600 border-indigo-600 text-white shadow-md',
    iconInactive: isDark ? 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300' : 'bg-white border-slate-200 text-slate-400 hover:border-indigo-300 hover:text-indigo-400',
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
              <div className="flex flex-wrap gap-2.5">
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

              {/* Line controls */}
              {isLine && (
                <>
                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <label className={`text-[10px] font-black uppercase tracking-widest ${cls.label}`}>{st.lineWidth}</label>
                      <span className={`text-xs font-black ${cls.badge} px-2 py-0.5 rounded-md`}>{style.lineWidth || 2}px</span>
                    </div>
                    <input type="range" min="1" max="24" value={style.lineWidth || 2} onChange={e => onUpdate({ lineWidth: parseInt(e.target.value) })} className={`w-full h-2 ${cls.slider} rounded-full appearance-none cursor-pointer accent-indigo-500`} />
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
              {codelistProps.length > 0 ? (
                <select value={style.propertyId || ''} onChange={e => onUpdate({ propertyId: e.target.value })} className={`w-full border rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:border-indigo-500 transition-all ${cls.select}`}>
                  <option value="">-- {st.selectProperty} --</option>
                  {codelistProps.map(p => <option key={p.id} value={p.id}>{p.title || p.name}</option>)}
                </select>
              ) : (
                <div className={`p-5 rounded-2xl border text-center ${cls.noCodelist}`}>
                  <p className="text-xs font-bold italic">{st.noCodelistProps}</p>
                </div>
              )}
            </div>
            {style.propertyId && (
              <div className={`rounded-2xl p-4 space-y-3 border max-h-[300px] overflow-y-auto custom-scrollbar shadow-inner ${cls.categorizedBg}`}>
                <label className={`text-[10px] font-black uppercase tracking-widest ${cls.categorizedLabel} block mb-2`}>{st.colorsForValues}</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {(() => { const sp = layer.properties.find(p => p.id === style.propertyId); const vals = sp?.fieldType.kind === 'codelist' && sp.fieldType.mode === 'inline' ? sp.fieldType.values : []; return vals; })().map(v => (
                    <div key={v.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${cls.categorizedItem}`}>
                      <span className="text-xs font-bold truncate max-w-[120px]">{v.label || v.code}</span>
                      <input
                        type="color"
                        value={style.categorizedColors?.[v.code] || '#6366F1'}
                        onChange={e => onUpdate({ categorizedColors: { ...(style.categorizedColors || {}), [v.code]: e.target.value } })}
                        className="w-10 h-8 rounded-lg bg-transparent border-none cursor-pointer hover:scale-110 transition-transform"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
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
