import React, { useState, useRef, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Rectangle, useMap, useMapEvents, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Grab, Plus, Minus, Square, Globe, Maximize, Trash2, MousePointer2, Compass } from 'lucide-react';
import { ModelMetadata } from '../../types';
import { reprojectCoordinates } from '../../utils/gdalService';
import type { Translations } from '../../i18n/index';

// Fix for default marker icons in Leaflet with Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface BboxEditorProps {
  spatialExtent: ModelMetadata['spatialExtent'];
  onChange?: (extent: ModelMetadata['spatialExtent']) => void;
  modelCrs?: string;
  t: Translations;
  lang?: string;
}

const isGeographic = (crs?: string) => {
  if (!crs) return true;
  const n = crs.trim().toUpperCase();
  return n === 'EPSG:4326' || n === 'WGS84' || n === 'CRS84';
};

const parse = (v: string) => parseFloat(v);
const clampLon = (v: number) => Math.max(-180, Math.min(180, v));
const clampLat = (v: number) => Math.max(-90, Math.min(90, v));
const round4 = (v: number) => Math.round(v * 10000) / 10000;

const toWgs84Extent = (ww: number, ee: number, ss: number, nn: number) => ({
  westBoundLongitude: String(clampLon(ww)),
  eastBoundLongitude: String(clampLon(ee)),
  southBoundLatitude: String(clampLat(ss)),
  northBoundLatitude: String(clampLat(nn)),
});

const toNativeExtent = (ww: number, ee: number, ss: number, nn: number) => ({
  westBoundLongitude: String(round4(ww)),
  eastBoundLongitude: String(round4(ee)),
  southBoundLatitude: String(round4(ss)),
  northBoundLatitude: String(round4(nn)),
});

// --- Sub-components ---

const InvalidateSize: React.FC = () => {
  const map = useMap();
  useEffect(() => {
    // Leaflet captures container size at mount time. When the map is rendered
    // inside a conditionally-shown / CSS-animated container it may measure 0×0.
    // A short delay lets the browser finish layout before we recalculate.
    const timer = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
};

const MapController: React.FC<{
  bounds: L.LatLngBoundsExpression | null,
  isDrawing: boolean,
  activeHandle: string | null,
  mode: 'pan' | 'draw',
  onChange?: (extent: any) => void,
  onCommit: (extent: any) => void,
  setActiveHandle: (h: string | null) => void,
  setDragWgs84: (e: any | null) => void,
  setIsDrawing: (b: boolean) => void,
  dragWgs84: any | null,
  displayExt: any | null
}> = ({ bounds, isDrawing, activeHandle, mode, onChange, onCommit, setActiveHandle, setDragWgs84, setIsDrawing, dragWgs84, displayExt }) => {
  const map = useMap();
  const drawingOriginRef = useRef<L.LatLng | null>(null);

  useMapEvents({
    mousedown(e) {
      if (!onChange) return;
      const isShift = (e.originalEvent as MouseEvent).shiftKey;
      if (mode !== 'draw' && !isShift) return;
      
      setIsDrawing(true);
      drawingOriginRef.current = e.latlng;
      setDragWgs84(toWgs84Extent(e.latlng.lng, e.latlng.lng, e.latlng.lat, e.latlng.lat));
      map.dragging.disable();
    },
    mousemove(e) {
      if (isDrawing && drawingOriginRef.current) {
        const origin = drawingOriginRef.current;
        const nw = Math.min(origin.lng, e.latlng.lng);
        const ne = Math.max(origin.lng, e.latlng.lng);
        const ns = Math.min(origin.lat, e.latlng.lat);
        const nn = Math.max(origin.lat, e.latlng.lat);
        setDragWgs84(toWgs84Extent(nw, ne, ns, nn));
      } else if (activeHandle && displayExt) {
        const w = parse(displayExt.westBoundLongitude);
        const ee = parse(displayExt.eastBoundLongitude);
        const s = parse(displayExt.southBoundLatitude);
        const n = parse(displayExt.northBoundLatitude);
        let nw = w, ne = ee, ns = s, nn = n;
        if (activeHandle.includes('w')) nw = e.latlng.lng;
        if (activeHandle.includes('e')) ne = e.latlng.lng;
        if (activeHandle.includes('s')) ns = e.latlng.lat;
        if (activeHandle.includes('n')) nn = e.latlng.lat;
        setDragWgs84(toWgs84Extent(nw, ne, ns, nn));
      }
    },
    mouseup() {
      if (isDrawing) {
        setIsDrawing(false);
        const final = dragWgs84;
        if (final) {
          const dw = Math.abs(parse(final.eastBoundLongitude) - parse(final.westBoundLongitude));
          const dh = Math.abs(parse(final.northBoundLatitude) - parse(final.southBoundLatitude));
          if (dw > 0.00001 && dh > 0.00001) onCommit(final);
        }
        setDragWgs84(null);
        drawingOriginRef.current = null;
        map.dragging.enable();
      } else if (activeHandle) {
        if (dragWgs84) onCommit(dragWgs84);
        setActiveHandle(null);
        setDragWgs84(null);
        map.dragging.enable();
      }
    }
  });

  return null;
};

const FitBoundsButton = ({ bounds, t }: { bounds: L.LatLngBoundsExpression | null, t: Translations['bboxEditor'] }) => {
  const map = useMap();
  if (!bounds) return null;
  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); map.fitBounds(bounds, { padding: [10, 10] }); }}
      onMouseDown={e => e.stopPropagation()}
      title={t.fitToBounds}
      className="p-2 rounded-lg transition-all duration-200 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
    >
      <Maximize size={18} strokeWidth={2} />
    </button>
  );
};

const WorldViewButton = ({ t }: { t: Translations['bboxEditor'] }) => {
  const map = useMap();
  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); map.setView([20, 0], 1); }}
      onMouseDown={e => e.stopPropagation()}
      title={t.worldView}
      className="p-2 rounded-lg transition-all duration-200 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
    >
      <Globe size={18} strokeWidth={2} />
    </button>
  );
};

const ClearButton = ({ t, onClear }: { t: Translations['bboxEditor'], onClear: () => void }) => (
  <button
    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClear(); }}
    onMouseDown={e => e.stopPropagation()}
    title={t.clearExtent}
    className="p-2 rounded-lg transition-all duration-200 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50"
  >
    <Trash2 size={18} strokeWidth={2} />
  </button>
);

const ZoomButton = ({ type, t }: { type: 'in' | 'out', t: Translations['bboxEditor'] }) => {
  const map = useMap();
  const label = type === 'in' ? t.zoomIn : t.zoomOut;
  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (type === 'in') map.zoomIn(); else map.zoomOut(); }}
      onMouseDown={e => e.stopPropagation()}
      title={label}
      className="p-2 rounded-lg transition-all duration-200 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
    >
      {type === 'in' ? <Plus size={18} strokeWidth={2} /> : <Minus size={18} strokeWidth={2} />}
    </button>
  );
};

const Handle = ({ position, type, activeHandle, setActiveHandle }: { position: L.LatLngExpression, type: string, activeHandle: string | null, setActiveHandle: (h: string | null) => void }) => {
  const map = useMap();
  const cursor = type.length === 1 
    ? (type === 'n' || type === 's' ? 'ns-resize' : 'ew-resize')
    : (type === 'nw' || type === 'se' ? 'nwse-resize' : 'nesw-resize');

  return (
    <CircleMarker
      center={position}
      radius={activeHandle === type ? 6 : 4}
      pathOptions={{
        fillColor: 'white',
        fillOpacity: 1,
        color: activeHandle === type ? '#4F46E5' : '#6366F1',
        weight: activeHandle === type ? 3 : 2,
        className: 'transition-all duration-150 shadow-sm'
      }}
      eventHandlers={{
        mousedown: (e) => {
          L.DomEvent.stopPropagation(e);
          setActiveHandle(type);
          map.dragging.disable();
        },
        mouseover: (e) => { e.target.getElement().style.cursor = cursor; }
      }}
    />
  );
};

const DimensionBadge = ({ extent, unit, t }: { extent: any | null, unit: string, t: Translations['bboxEditor'] }) => {
  if (!extent) return null;
  const w = parse(extent.westBoundLongitude);
  const e = parse(extent.eastBoundLongitude);
  const s = parse(extent.southBoundLatitude);
  const n = parse(extent.northBoundLatitude);
  if (isNaN(w) || isNaN(e) || isNaN(s) || isNaN(n)) return null;

  return (
    <div className="absolute bottom-3 right-3 z-[1000] bg-white/90 backdrop-blur-md px-2 py-1 rounded-lg border border-slate-200/60 shadow-lg flex items-center gap-3 pointer-events-none ring-1 ring-black/[0.03]">
      <div className="flex items-center gap-3 font-mono text-[10px] font-bold text-slate-500">
        <div className="flex items-center gap-1"><span className="text-slate-300">{t.width}:</span><span>{round4(Math.abs(e - w))}{unit}</span></div>
        <div className="flex items-center gap-1"><span className="text-slate-300">{t.height}:</span><span>{round4(Math.abs(n - s))}{unit}</span></div>
      </div>
    </div>
  );
};

const CoordInput: React.FC<{ label: string, value: string, placeholder: string, readOnly: boolean, unit: string, onChange: (v: string) => void, onCommit: (v: string) => void }> = ({ label, value, placeholder, readOnly, unit, onChange, onCommit }) => (
  <div className="flex items-center justify-between gap-4">
    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 w-8">{label}</span>
    <div className="relative flex-1">
      <input
        type="text" inputMode="decimal" value={value} placeholder={placeholder} readOnly={readOnly}
        onChange={ev => onChange(ev.target.value)}
        onBlur={ev => onCommit(ev.target.value)}
        onKeyDown={ev => ev.key === 'Enter' && onCommit((ev.target as HTMLInputElement).value)}
        className={[
          'w-full text-[11px] font-mono font-bold text-right rounded-xl px-3 py-2 pr-6',
          'bg-white border outline-none transition-all',
          readOnly ? 'border-slate-100 text-slate-400 cursor-default bg-slate-50/50' : 'border-slate-200 text-slate-700 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/5 shadow-sm',
        ].join(' ')}
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-300 pointer-events-none font-mono">{unit}</span>
    </div>
  </div>
);

// --- Main Component ---

const BboxEditor: React.FC<BboxEditorProps> = ({ spatialExtent: rawSpatialExtent, onChange, modelCrs, t, lang = 'en' }) => {
  const b = t.bboxEditor;
  const spatialExtent = useMemo(() => ({
    westBoundLongitude: '',
    eastBoundLongitude: '',
    southBoundLatitude: '',
    northBoundLatitude: '',
    ...(rawSpatialExtent || {})
  }), [rawSpatialExtent]);

  const [localInputs, setLocalInputs] = useState({ ...spatialExtent });
  const [mapWgs84, setMapWgs84] = useState<any | null>(null);
  const [dragWgs84, setDragWgs84] = useState<any | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [mode, setMode] = useState<'pan' | 'draw'>(spatialExtent?.westBoundLongitude ? 'pan' : 'draw');
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const [liveNativeExt, setLiveNativeExt] = useState<any | null>(null);

  const geographic = isGeographic(modelCrs);

  // Sync liveNativeExt with displayExt
  useEffect(() => {
    const ext = dragWgs84 ?? mapWgs84;
    if (!ext) {
      setLiveNativeExt(null);
      return;
    }

    if (geographic) {
      setLiveNativeExt(ext);
      return;
    }

    // If not dragging, we can use the native spatialExtent directly
    if (!dragWgs84) {
      setLiveNativeExt(spatialExtent);
      return;
    }

    // If dragging, reproject to get native dimensions live
    const w = parse(dragWgs84.westBoundLongitude);
    const ee = parse(dragWgs84.eastBoundLongitude);
    const s = parse(dragWgs84.southBoundLatitude);
    const n = parse(dragWgs84.northBoundLatitude);

    let cancelled = false;
    reprojectCoordinates([[w, s], [ee, n]], 'EPSG:4326', modelCrs!).then(([[rw, rs], [re, rn]]) => {
      if (!cancelled) setLiveNativeExt(toNativeExtent(rw, re, rs, rn));
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [dragWgs84, mapWgs84, geographic, modelCrs, spatialExtent]);

  useEffect(() => { setLocalInputs({ ...spatialExtent }); }, [spatialExtent]);

  useEffect(() => {
    const w = parseFloat(spatialExtent.westBoundLongitude);
    const e = parseFloat(spatialExtent.eastBoundLongitude);
    const s = parseFloat(spatialExtent.southBoundLatitude);
    const n = parseFloat(spatialExtent.northBoundLatitude);
    if (isNaN(w) || isNaN(e) || isNaN(s) || isNaN(n) || w >= e || s >= n) { setMapWgs84(null); return; }
    if (geographic) { setMapWgs84(w >= -180 && e <= 180 && s >= -90 && n <= 90 ? spatialExtent : null); return; }
    let cancelled = false;
    reprojectCoordinates([[w, s], [e, n]], modelCrs!, 'EPSG:4326').then(([[mw, ms], [me, mn]]) => {
      if (cancelled) return;
      if (!isNaN(mw) && !isNaN(me) && !isNaN(ms) && !isNaN(mn) && mw >= -180 && me <= 180 && ms >= -90 && mn <= 90 && mw < me && ms < mn) {
        setMapWgs84({ westBoundLongitude: String(mw), eastBoundLongitude: String(me), southBoundLatitude: String(ms), northBoundLatitude: String(mn) });
      }
    }).catch(() => { if (!cancelled) setMapWgs84(null); });
    return () => { cancelled = true; };
  }, [spatialExtent, modelCrs, geographic]);

  const commitWgs84 = (extent: any) => {
    if (!onChange) return;
    if (geographic) { onChange(extent); }
    else {
      const w = parse(extent.westBoundLongitude);
      const e = parse(extent.eastBoundLongitude);
      const s = parse(extent.southBoundLatitude);
      const n = parse(extent.northBoundLatitude);
      reprojectCoordinates([[w, s], [e, n]], 'EPSG:4326', modelCrs!).then(([[rw, rs], [re, rn]]) => {
        onChange(toNativeExtent(rw, re, rs, rn));
      }).catch(() => onChange(extent));
    }
  };

  const displayExt = dragWgs84 ?? mapWgs84;
  const bounds = useMemo<L.LatLngBoundsExpression | null>(() => {
    if (!displayExt) return null;
    const w = parse(displayExt.westBoundLongitude);
    const e = parse(displayExt.eastBoundLongitude);
    const s = parse(displayExt.southBoundLatitude);
    const n = parse(displayExt.northBoundLatitude);
    if (isNaN(w) || isNaN(e) || isNaN(s) || isNaN(n)) return null;
    return [[s, w], [n, e]];
  }, [displayExt]);

  const inputsValid = useMemo(() => {
    const lw = parse(localInputs.westBoundLongitude), le = parse(localInputs.eastBoundLongitude), ls = parse(localInputs.southBoundLatitude), ln = parse(localInputs.northBoundLatitude);
    return !isNaN(lw) && !isNaN(le) && !isNaN(ls) && !isNaN(ln) && lw < le && ls < ln;
  }, [localInputs]);

  const unit = geographic ? '°' : 'm';
  const mid = (a: string, b: string) => (parse(a) + parse(b)) / 2;

  return (
    <div className="space-y-4">
      <div className={`relative rounded-xl overflow-hidden border-2 shadow-sm transition-colors duration-200 h-[300px] ${inputsValid ? 'border-indigo-300' : 'border-slate-200'}`}>
        <MapContainer center={[20, 0]} zoom={1} scrollWheelZoom={true} doubleClickZoom={false} boxZoom={false} zoomControl={false} className="w-full h-full" style={{ cursor: mode === 'draw' ? 'crosshair' : 'grab' }}>
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
          <InvalidateSize />
          <MapController 
            bounds={bounds} isDrawing={isDrawing} activeHandle={activeHandle} mode={mode} 
            onChange={onChange} onCommit={commitWgs84} setActiveHandle={setActiveHandle} 
            setDragWgs84={setDragWgs84} setIsDrawing={setIsDrawing} dragWgs84={dragWgs84} displayExt={displayExt} 
          />
          {bounds && (
            <>
              <Rectangle bounds={bounds} pathOptions={{ color: '#6366F1', weight: 2, fillColor: '#6366F1', fillOpacity: 0.1, dashArray: isDrawing ? '5, 5' : undefined }} />
              {!isDrawing && mode === 'draw' && displayExt && (
                <>
                  <Handle position={[parse(displayExt.northBoundLatitude), parse(displayExt.westBoundLongitude)]} type="nw" activeHandle={activeHandle} setActiveHandle={setActiveHandle} />
                  <Handle position={[parse(displayExt.northBoundLatitude), parse(displayExt.eastBoundLongitude)]} type="ne" activeHandle={activeHandle} setActiveHandle={setActiveHandle} />
                  <Handle position={[parse(displayExt.southBoundLatitude), parse(displayExt.westBoundLongitude)]} type="sw" activeHandle={activeHandle} setActiveHandle={setActiveHandle} />
                  <Handle position={[parse(displayExt.southBoundLatitude), parse(displayExt.eastBoundLongitude)]} type="se" activeHandle={activeHandle} setActiveHandle={setActiveHandle} />
                  <Handle position={[parse(displayExt.northBoundLatitude), mid(displayExt.westBoundLongitude, displayExt.eastBoundLongitude)]} type="n" activeHandle={activeHandle} setActiveHandle={setActiveHandle} />
                  <Handle position={[parse(displayExt.southBoundLatitude), mid(displayExt.westBoundLongitude, displayExt.eastBoundLongitude)]} type="s" activeHandle={activeHandle} setActiveHandle={setActiveHandle} />
                  <Handle position={[mid(displayExt.northBoundLatitude, displayExt.southBoundLatitude), parse(displayExt.westBoundLongitude)]} type="w" activeHandle={activeHandle} setActiveHandle={setActiveHandle} />
                  <Handle position={[mid(displayExt.northBoundLatitude, displayExt.southBoundLatitude), parse(displayExt.eastBoundLongitude)]} type="e" activeHandle={activeHandle} setActiveHandle={setActiveHandle} />
                </>
              )}
            </>
          )}
          <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2" onMouseDown={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
            <div className="flex items-center bg-white/90 backdrop-blur-md rounded-xl border border-slate-200/60 shadow-xl p-1 translation-all duration-200 gap-1 ring-1 ring-black/[0.03]">
              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMode('pan'); }} onMouseDown={e => e.stopPropagation()} title={b.pan} className={`p-2 rounded-lg transition-all duration-200 flex items-center justify-center ${mode === 'pan' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}><MousePointer2 size={18} strokeWidth={2} /></button>
              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMode('draw'); }} onMouseDown={e => e.stopPropagation()} title={b.drawExtent} className={`p-2 rounded-lg transition-all duration-200 flex items-center justify-center ${mode === 'draw' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}><Square size={18} strokeWidth={2} /></button>
              <div className="w-[1px] h-4 bg-slate-200 mx-0.5" />
              <ZoomButton type="in" t={b} /><ZoomButton type="out" t={b} />
              <div className="w-[1px] h-4 bg-slate-200 mx-0.5" />
              <WorldViewButton t={b} />
              {bounds && (
                <>
                  <FitBoundsButton bounds={bounds} t={b} />
                  <ClearButton t={b} onClear={() => { commitWgs84({ westBoundLongitude: '', eastBoundLongitude: '', southBoundLatitude: '', northBoundLatitude: '' }); setLocalInputs({ westBoundLongitude: '', eastBoundLongitude: '', southBoundLatitude: '', northBoundLatitude: '' }); }} />
                </>
              )}
            </div>
          </div>
          <DimensionBadge extent={liveNativeExt} unit={unit} t={b} />
        </MapContainer>
        {!bounds && onChange && !isDrawing && mode === 'draw' && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center pointer-events-none">
            <div className="bg-white/80 backdrop-blur-sm px-4 py-2 rounded-lg border border-slate-200 shadow-sm text-slate-600 text-xs font-semibold italic text-center max-w-[200px]">
              {b.clickAndDrag}
            </div>
          </div>
        )}
      </div>

      <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 flex flex-col gap-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-indigo-50 flex items-center justify-center text-indigo-600"><Compass size={14} /></div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{b.coordinates} ({modelCrs || 'WGS84'})</span>
          </div>
          {inputsValid && (
            <button onClick={() => { navigator.clipboard.writeText(`[${localInputs.westBoundLongitude}, ${localInputs.southBoundLatitude}, ${localInputs.eastBoundLongitude}, ${localInputs.northBoundLatitude}]`); }} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-sm active:scale-95 transition-all">
              {b.copy} [W,S,E,N]
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 relative">
          <div className="absolute left-1/2 top-2 bottom-2 w-px bg-slate-200/60 -translate-x-1/2" />
          <div className="space-y-4">
            <CoordInput label={b.north} value={localInputs.northBoundLatitude} placeholder={geographic ? '90' : ''} readOnly={!onChange} unit={unit} onChange={v => setLocalInputs(p => ({ ...p, northBoundLatitude: v }))} onCommit={v => { if (!onChange) return; const val = parseFloat(v); if (!isNaN(val)) onChange({ ...localInputs, northBoundLatitude: String(val) }); else setLocalInputs(p => ({ ...p, northBoundLatitude: spatialExtent.northBoundLatitude })); }} />
            <CoordInput label={b.south} value={localInputs.southBoundLatitude} placeholder={geographic ? '−90' : ''} readOnly={!onChange} unit={unit} onChange={v => setLocalInputs(p => ({ ...p, southBoundLatitude: v }))} onCommit={v => { if (!onChange) return; const val = parseFloat(v); if (!isNaN(val)) onChange({ ...localInputs, southBoundLatitude: String(val) }); else setLocalInputs(p => ({ ...p, southBoundLatitude: spatialExtent.southBoundLatitude })); }} />
          </div>
          <div className="space-y-4">
            <CoordInput label={b.west} value={localInputs.westBoundLongitude} placeholder={geographic ? '−180' : ''} readOnly={!onChange} unit={unit} onChange={v => setLocalInputs(p => ({ ...p, westBoundLongitude: v }))} onCommit={v => { if (!onChange) return; const val = parseFloat(v); if (!isNaN(val)) onChange({ ...localInputs, westBoundLongitude: String(val) }); else setLocalInputs(p => ({ ...p, westBoundLongitude: spatialExtent.westBoundLongitude })); }} />
            <CoordInput label={b.east} value={localInputs.eastBoundLongitude} placeholder={geographic ? '180' : ''} readOnly={!onChange} unit={unit} onChange={v => setLocalInputs(p => ({ ...p, eastBoundLongitude: v }))} onCommit={v => { if (!onChange) return; const val = parseFloat(v); if (!isNaN(val)) onChange({ ...localInputs, eastBoundLongitude: String(val) }); else setLocalInputs(p => ({ ...p, eastBoundLongitude: spatialExtent.eastBoundLongitude })); }} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default BboxEditor;
