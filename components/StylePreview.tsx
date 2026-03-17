import React from 'react';
import type { Translations } from '../i18n/index';
import { Zap } from 'lucide-react';
import { Layer } from '../types';

interface StylePreviewProps {
  layer: Layer;
  t: Translations;
}

const getDashArray = (type: string, width: number) => {
  const w = width || 2;
  switch (type) {
    case 'dashed': return `${w * 4}, ${w * 4}`;
    case 'dotted': return `${w}, ${w * 2}`;
    case 'dash-dot': return `${w * 6}, ${w * 2}, ${w}, ${w * 2}`;
    case 'dash-dot-dot': return `${w * 6}, ${w * 2}, ${w}, ${w * 1.5}, ${w}, ${w * 1.5}`;
    case 'long-dash': return `${w * 10}, ${w * 4}`;
    default: return 'none';
  }
};

const StylePreview: React.FC<StylePreviewProps> = ({ layer, t }) => {
  if (!layer) return null;
  const style = layer.style;
  const color = style.simpleColor || '#6366F1';
  const isPoint = layer.geometryType.includes('Point');
  const isLine = layer.geometryType.includes('LineString');
  const isPolygon = layer.geometryType.includes('Polygon');
  const isCollection = layer.geometryType === 'GeometryCollection';

  const dashArray = getDashArray(style.lineDash || 'solid', style.lineWidth || 2);
  const s = style.hatchSpacing || 6;
  const t_val = style.hatchThickness || 1;

  return (
    <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 h-full flex flex-col items-center justify-center relative group min-h-[140px] md:min-h-[160px] shadow-inner">
      <div className="absolute top-3 left-3 flex items-center gap-1.5">
        <Zap size={10} className="text-indigo-500" />
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{t.styling.preview}</span>
      </div>
      <svg viewBox="0 0 100 100" className="w-20 h-20 sm:w-32 sm:h-32 overflow-visible">
        <defs>
          {/* Straight patterns extended slightly past the box to avoid 1px anti-alias gaps */}
          <pattern id={`hatch-horizontal-${layer.id}`} width={s} height={s} patternUnits="userSpaceOnUse">
            <path d={`M -2 ${s / 2} H ${s + 2}`} stroke={color} strokeWidth={t_val} />
          </pattern>
          <pattern id={`hatch-vertical-${layer.id}`} width={s} height={s} patternUnits="userSpaceOnUse">
            <path d={`M ${s / 2} -2 V ${s + 2}`} stroke={color} strokeWidth={t_val} />
          </pattern>
          <pattern id={`hatch-cross-${layer.id}`} width={s} height={s} patternUnits="userSpaceOnUse">
            <path d={`M -2 ${s / 2} H ${s + 2} M ${s / 2} -2 V ${s + 2}`} stroke={color} strokeWidth={t_val} />
          </pattern>
          
          {/* Diagonal patterns rotated cleanly using patternTransform */}
          <pattern id={`hatch-b_diagonal-${layer.id}`} width={s} height={s} patternTransform="rotate(-45)" patternUnits="userSpaceOnUse">
            <path d={`M -2 ${s / 2} H ${s + 2}`} stroke={color} strokeWidth={t_val} />
          </pattern>
          <pattern id={`hatch-f_diagonal-${layer.id}`} width={s} height={s} patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <path d={`M -2 ${s / 2} H ${s + 2}`} stroke={color} strokeWidth={t_val} />
          </pattern>
          <pattern id={`hatch-diagonal_x-${layer.id}`} width={s} height={s} patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <path d={`M -2 ${s / 2} H ${s + 2} M ${s / 2} -2 V ${s + 2}`} stroke={color} strokeWidth={t_val} />
          </pattern>
        </defs>
        
        {(isPolygon || isCollection) && (
          <g transform={isCollection ? "translate(10,10) scale(0.8)" : ""}>
            <path d="M 20 20 L 80 20 L 90 80 L 10 90 Z" fill={style.hatchStyle && style.hatchStyle !== 'solid' ? `url(#hatch-${style.hatchStyle}-${layer.id})` : color} fillOpacity={style.fillOpacity || 0.5} />
            <path d="M 20 20 L 80 20 L 90 80 L 10 90 Z" fill="none" stroke={color} strokeWidth={style.lineWidth || 2} strokeDasharray={dashArray} strokeLinejoin="round" strokeLinecap="round" />
          </g>
        )}
        {(isLine || isCollection) && (
          <path d={isCollection ? "M 5 50 Q 50 10 95 50" : "M 10 70 Q 50 10 90 70"} fill="none" stroke={color} strokeWidth={style.lineWidth || 2} strokeDasharray={dashArray} strokeLinecap="round" strokeLinejoin="round" />
        )}
        {(isPoint || isCollection) && (
          <g transform={isCollection ? "translate(35,35) scale(0.3)" : ""}>
            {style.pointIcon === 'circle' && <circle cx="50" cy="50" r={style.pointSize || 8} fill={color} />}
            {style.pointIcon === 'square' && <rect x={50 - (style.pointSize || 8)} y={50 - (style.pointSize || 8)} width={(style.pointSize || 8) * 2} height={(style.pointSize || 8) * 2} fill={color} />}
            {style.pointIcon === 'triangle' && <path d={`M 50 ${50 - (style.pointSize || 10)} L ${50 + (style.pointSize || 10)} ${50 + (style.pointSize || 10)} L ${50 - (style.pointSize || 10)} ${50 + (style.pointSize || 10)} Z`} fill={color} />}
            {style.pointIcon === 'star' && <path d="M 50 35 L 53.09 43.1 L 62.36 43.1 L 54.81 48.2 L 57.9 56.3 L 50 51.2 L 42.1 56.3 L 45.19 48.2 L 37.64 43.1 L 46.91 43.1 Z" fill={color} transform={`translate(50, 50) scale(${(style.pointSize || 8) / 8}) translate(-50, -50)`} />}
          </g>
        )}
      </svg>
    </div>
  );
};

export default React.memo(StylePreview);