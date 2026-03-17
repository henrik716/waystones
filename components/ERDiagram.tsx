import React, { useRef } from 'react';
import type { Translations } from '../i18n/index';
import { DataModel, Layer, Field, SharedType } from '../types';
import { COLORS, getFieldConfig } from '../constants';
import { Download } from 'lucide-react';

interface ERDiagramProps {
  model: DataModel;
  t: Translations;
}

interface FlatProp {
  prop: Field;
  depth: number;
  isFromSharedType?: boolean;
}

const fieldTypeDisplay = (f: Field, t: Translations): string => {
  const ft = f.fieldType;
  switch (ft.kind) {
    case 'primitive':       return (t.types?.[ft.baseType] || ft.baseType).toUpperCase();
    case 'codelist':        return (t.types?.codelist || 'CODELIST').toUpperCase();
    case 'geometry':        return ft.geometryType.toUpperCase();
    case 'feature-ref':     return (t.types?.relation || 'RELATION').toUpperCase();
    case 'datatype-inline': return (t.types?.object || 'OBJECT').toUpperCase();
    case 'datatype-ref': return '';  // will be overridden below
  }
};

const flattenProperties = (
  properties: Field[], 
  allSharedTypes: SharedType[] = [], 
  currentDepth = 0,
  fromShared = false
): FlatProp[] => {
  let flatList: FlatProp[] = [];
  properties.forEach(f => {
    flatList.push({ prop: f, depth: currentDepth, isFromSharedType: fromShared });
    if (f.fieldType.kind === 'datatype-inline' && f.fieldType.properties.length > 0) {
      flatList = [...flatList, ...flattenProperties(f.fieldType.properties, allSharedTypes, currentDepth + 1, fromShared)];
    }
    if (f.fieldType.kind === 'datatype-ref' && f.fieldType.typeId) {
      const sharedType = allSharedTypes.find(st => st.id === (f.fieldType as any).typeId);
      if (sharedType && sharedType.properties) {
        flatList = [...flatList, ...flattenProperties(sharedType.properties, allSharedTypes, currentDepth + 1, true)];
      }
    }
  });
  return flatList;
};

const ERDiagram: React.FC<ERDiagramProps> = ({ model, t }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  
  const mainBoxW = 260;
  const mainBoxHeaderH = 50;
  const rowH = 34;
  const codelistBoxW = 200;
  const gapX = 140; 
  const gapY = 60; 
  
  const startX = 20;
  let currentY = 20;

  const layerVisuals = model.layers.map((layer) => {
    const flatProps = flattenProperties(layer.properties, model.sharedTypes || []);
    
    const hasGeom = layer.geometryType !== 'None';
    const geomRows = hasGeom ? 1 : 0;
    
    const layerH = mainBoxHeaderH + (geomRows + Math.max(0, flatProps.length)) * rowH + 16;
    const layerY = currentY;
    const visuals = {
        layer,
        flatProps,
        hasGeom,
        y: layerY,
        h: layerH,
        codelists: [] as any[],
        relations: [] as any[]
    };

    flatProps.forEach((flatItem, propIdx) => {
        const { prop } = flatItem;
        const sourceY = layerY + mainBoxHeaderH + (propIdx + geomRows) * rowH + rowH/2;

        if (prop.fieldType.kind === 'codelist' && prop.fieldType.mode === 'inline' && prop.fieldType.values.length > 0) {
            const clH = 40 + prop.fieldType.values.length * 26 + 10;
            visuals.codelists.push({
                prop,
                values: prop.fieldType.values,
                sourceY,
                h: clH,
                targetY: currentY + clH/2 
            });
        }

        if (prop.fieldType.kind === 'feature-ref' && prop.fieldType.layerId) {
            visuals.relations.push({
                targetLayerId: prop.fieldType.layerId,
                relationType: prop.fieldType.relationType,
                multiplicity: prop.multiplicity,
                sourceY
            });
        }
    });

    let clY = layerY;
    visuals.codelists = visuals.codelists.map(cl => {
        const updatedCl = { ...cl, targetY: clY + cl.h/2 };
        clY += cl.h + 20;
        return updatedCl;
    });

    currentY += Math.max(layerH, clY - layerY) + gapY;
    return visuals;
  });

  // Inheritance paths
  const inheritancePaths = layerVisuals.flatMap(vis => {
    if (!vis.layer.extends) return [];
    const parentVis = layerVisuals.find(v => v.layer.id === vis.layer.extends);
    if (!parentVis) return [];
    const x = startX - 40;
    const sY = vis.y + mainBoxHeaderH / 2;
    const tY = parentVis.y + mainBoxHeaderH / 2;
    return [{ path: `M${startX},${sY} C${x},${sY} ${x},${tY} ${startX},${tY}`, id: `${vis.layer.id}-inherits` }];
  });

  const relationPaths = layerVisuals.flatMap(vis =>
    vis.relations.map(rel => {
      const targetVis = layerVisuals.find(v => v.layer.id === rel.targetLayerId);
      if (!targetVis) return null;
      
      const sX = startX + mainBoxW;
      const sY = rel.sourceY;
      const tX = startX + mainBoxW;
      const tY = targetVis.y + 25; 
      
      const cp1X = sX + 60;
      const cp2X = tX + 60;
      
      return {
        path: `M${sX},${sY} C${cp1X},${sY} ${cp2X},${tY} ${tX},${tY}`,
        type: rel.relationType,
        multiplicity: rel.multiplicity,
        sX, sY,
        id: `${vis.layer.id}-${rel.targetLayerId}-${rel.sourceY}`
      };
    })
  ).filter(Boolean);

  const hasInheritance = model.layers.some(l => l.extends);
  const leftPad = hasInheritance ? 50 : 0;
  const svgW = leftPad + startX + mainBoxW + gapX + codelistBoxW + 40;
  const svgH = currentY + 40;

  const downloadSVG = () => {
    if (!svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);
    const downloadLink = document.createElement("a");
    downloadLink.href = svgUrl;
    downloadLink.download = `${model.name.replace(/\s/g, '_')}_diagram.svg`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  const isRequired = (f: Field) => f.multiplicity === '1..1' || f.multiplicity === '1..*';

  return (
    <div className="relative group">
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <button 
          onClick={downloadSVG} 
          className="bg-white/90 backdrop-blur border border-slate-200 p-2 rounded-xl text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm flex items-center gap-2"
        >
          <Download size={16} />
          <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">{t.export.svg}</span>
        </button>
      </div>

      <div className="w-full overflow-x-auto bg-slate-50/50 rounded-2xl border border-slate-200 p-8 shadow-inner custom-scrollbar">
        <svg ref={svgRef} viewBox={`${-leftPad} 0 ${svgW} ${svgH}`} className="w-full min-w-[700px] drop-shadow-sm" style={{ height: 'auto', maxWidth: '100%' }}>
          <defs>
            <linearGradient id="mainHeaderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={COLORS.primary} />
              <stop offset="100%" stopColor={COLORS.primaryDark} />
            </linearGradient>
            <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#cbd5e1" />
            </marker>
            <marker id="relationArrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#6366f1" />
            </marker>
            <marker id="inheritanceArrow" viewBox="0 0 12 12" refX="12" refY="6" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M 0 0 L 12 6 L 0 12 Z" fill="white" stroke="#7c3aed" strokeWidth="1.5"/>
            </marker>
          </defs>

          <g>
            {inheritancePaths.map((inh: any) => (
              <path key={inh.id} d={inh.path} fill="none" stroke="#7c3aed" strokeWidth="2" strokeDasharray="6 3" strokeOpacity="0.8" markerEnd="url(#inheritanceArrow)" />
            ))}
          </g>

          <g>
            {relationPaths.map((rel: any) => (
              <g key={rel.id}>
                <path d={rel.path} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeOpacity="0.6" markerEnd="url(#relationArrow)" className="transition-all hover:stroke-opacity-100" />
                {rel.multiplicity && (
                  <text x={rel.sX + 8} y={rel.sY - 5} fontSize="9" fontWeight="700" fill="#6366f1" opacity="0.85">
                    {rel.multiplicity}
                  </text>
                )}
              </g>
            ))}
          </g>

          {layerVisuals.map((vis) => {
            const geomRows = vis.hasGeom ? 1 : 0;
            return (
              <g key={vis.layer.id}>
                <rect x={startX} y={vis.y} width={mainBoxW} height={vis.h} rx="16" fill="white" stroke="#e2e8f0" strokeWidth="1.5"/>
                <path d={`M${startX},${vis.y+16} Q${startX},${vis.y} ${startX+16},${vis.y} H${startX+mainBoxW-16} Q${startX+mainBoxW},${vis.y} ${startX+mainBoxW},${vis.y+16} V${vis.y+mainBoxHeaderH} H${startX} Z`} fill="url(#mainHeaderGrad)" />
                <text x={startX + 16} y={vis.layer.isAbstract ? vis.y + 24 : vis.y + 30} fill="white" fontSize="14" fontWeight="900">{vis.layer.name}</text>
                {vis.layer.isAbstract && (
                  <text x={startX + 16} y={vis.y + 42} fill="white" fontSize="9" fontWeight="700" opacity="0.65">{t.abstract || '«abstract»'}</text>
                )}

                {vis.hasGeom && (
                  <g>
                    <rect x={startX + 2} y={vis.y + mainBoxHeaderH} width={mainBoxW - 4} height={rowH} fill="#f5f7ff" />
                    <circle cx={startX + 20} cy={vis.y + mainBoxHeaderH + rowH/2} r="3" fill={getFieldConfig({ kind: 'geometry' }).color} />
                    <text x={startX + 34} y={vis.y + mainBoxHeaderH + rowH/2 + 4} fill={COLORS.primaryDark} fontSize="12" fontWeight="900" className="mono">{vis.layer.geometryColumnName}*</text>
                    <text x={startX + mainBoxW - 16} y={vis.y + mainBoxHeaderH + rowH/2 + 4} textAnchor="end" fill={getFieldConfig({ kind: 'geometry' }).color} fontSize="9" fontWeight="900" opacity="0.6">{vis.layer.geometryType.toUpperCase()}</text>
                  </g>
                )}

                {vis.flatProps.map((flatItem, i) => {
                  const { prop, depth, isFromSharedType } = flatItem;
                  const config = getFieldConfig(prop.fieldType);
                  
                  const y = vis.y + mainBoxHeaderH + (i + geomRows) * rowH + 10;
                  const indentX = startX + (depth * 15);
                  
                  let typeDisplay = fieldTypeDisplay(prop, t);
                  if (prop.fieldType.kind === 'datatype-ref' && prop.fieldType.typeId) {
                      const st = model.sharedTypes?.find(s => s.id === (prop.fieldType as any).typeId);
                      if (st) typeDisplay = st.name.toUpperCase();
                  }

                  return (
                    <g key={`${prop.id}-${i}`}>
                      <line x1={startX + 12} y1={y} x2={startX + mainBoxW - 12} y2={y} stroke="#f1f5f9" strokeWidth="1"/>
                      
                      {depth > 0 && (
                        <path 
                          d={`M${indentX + 4},${y - rowH/2} V${y + rowH/2 - 4} Q${indentX + 4},${y + rowH/2} ${indentX + 8},${y + rowH/2} H${indentX + 12}`} 
                          fill="none" 
                          stroke={isFromSharedType ? "#f0abfc" : "#cbd5e1"} 
                          strokeWidth="1.5"
                        />
                      )}
                      
                      <circle cx={indentX + 20} cy={y + rowH/2} r="3" fill={isFromSharedType ? "#d946ef" : config.color} />
                      <text x={indentX + 34} y={y + rowH/2 + 4} fill={isFromSharedType ? "#701a75" : "#334155"} fontSize="12" fontWeight={isRequired(prop) ? "800" : "600"} className="mono">
                        {prop.name}{isRequired(prop) && "*"}
                      </text>
                      <text x={startX + mainBoxW - 16} y={y + rowH/2 + 4} textAnchor="end" fill={isFromSharedType ? "#d946ef" : config.color} fontSize="9" fontWeight="900" opacity="0.6">
                        {typeDisplay}
                      </text>
                    </g>
                  );
                })}

                {vis.codelists.map((cl: any, clIdx: number) => (
                   <g key={`${cl.prop.id}-${clIdx}`}>
                     <path d={`M${startX + mainBoxW},${cl.sourceY} C${startX + mainBoxW + gapX/2},${cl.sourceY} ${startX + mainBoxW + gapX/2},${cl.targetY} ${startX + mainBoxW + gapX},${cl.targetY}`} fill="none" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="5 3" markerEnd="url(#arrow)" />
                     <rect x={startX + mainBoxW + gapX} y={cl.targetY - cl.h/2} width={codelistBoxW} height={cl.h} rx="12" fill="white" stroke="#e2e8f0" strokeWidth="1.5" />
                     <rect x={startX + mainBoxW + gapX} y={cl.targetY - cl.h/2} width={codelistBoxW} height={32} rx="12" fill="#f8fafc" />
                     <text x={startX + mainBoxW + gapX + 12} y={cl.targetY - cl.h/2 + 20} fill="#64748b" fontSize="10" fontWeight="900" className="uppercase">{cl.prop.name}</text>
                     {cl.values.map((cv: any, ci: number) => (
                        <text key={cv.id} x={startX + mainBoxW + gapX + 12} y={cl.targetY - cl.h/2 + 50 + ci * 24} fill={COLORS.blue} fontSize="10" fontWeight="700" className="mono">{cv.code} <tspan fill="#64748b" fontWeight="400">{cv.label}</tspan></text>
                     ))}
                   </g>
                ))}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

export default ERDiagram;