import React, { useState, useRef, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Rectangle, useMap, useMapEvents, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Grab, Plus, Minus, Square } from 'lucide-react';
import { ModelMetadata } from '../../types';
import { reprojectCoordinates } from '../../utils/gdalService';

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
  lang?: string;
}

const isGeographic = (crs?: string) => {
  if (!crs) return true;
  const n = crs.trim().toUpperCase();
  return n === 'EPSG:4326' || n === 'WGS84' || n === 'CRS84';
};

const BboxEditor: React.FC<BboxEditorProps> = ({ spatialExtent: rawSpatialExtent, onChange, modelCrs, lang = 'en' }) => {
  const spatialExtent = useMemo(() => ({
    westBoundLongitude: '',
    eastBoundLongitude: '',
    southBoundLatitude: '',
    northBoundLatitude: '',
    ...(rawSpatialExtent || {})
  }), [rawSpatialExtent]);

  const [localInputs, setLocalInputs] = useState({ ...spatialExtent });
  // WGS84 extent for map display — async-transformed from native CRS
  const [mapWgs84, setMapWgs84] = useState<typeof spatialExtent | null>(null);
  // Live WGS84 bbox during a projected-CRS drag (not yet transformed back)
  const [dragWgs84, setDragWgs84] = useState<typeof spatialExtent | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [mode, setMode] = useState<'pan' | 'draw'>(spatialExtent?.westBoundLongitude ? 'pan' : 'draw');
  const drawingOriginRef = useRef<L.LatLng | null>(null);

  const geographic = isGeographic(modelCrs);

  // Keep input fields in sync with props
  useEffect(() => {
    setLocalInputs({ ...spatialExtent });
  }, [spatialExtent]);

  // Compute WGS84 display extent for the map (async for projected CRS)
  useEffect(() => {
    const w = parseFloat(spatialExtent.westBoundLongitude);
    const e = parseFloat(spatialExtent.eastBoundLongitude);
    const s = parseFloat(spatialExtent.southBoundLatitude);
    const n = parseFloat(spatialExtent.northBoundLatitude);

    if (isNaN(w) || isNaN(e) || isNaN(s) || isNaN(n) || w >= e || s >= n) {
      setMapWgs84(null);
      return;
    }

    if (geographic) {
      if (w >= -180 && e <= 180 && s >= -90 && n <= 90) {
        setMapWgs84(spatialExtent);
      } else {
        setMapWgs84(null);
      }
      return;
    }

    // Projected CRS: async transform SW + NE corners to WGS84
    let cancelled = false;
    reprojectCoordinates([[w, s], [e, n]], modelCrs!, 'EPSG:4326')
      .then(([[mw, ms], [me, mn]]) => {
        if (cancelled) return;
        if (!isNaN(mw) && !isNaN(me) && !isNaN(ms) && !isNaN(mn) &&
          mw >= -180 && me <= 180 && ms >= -90 && mn <= 90 && mw < me && ms < mn) {
          setMapWgs84({
            westBoundLongitude: String(mw),
            eastBoundLongitude: String(me),
            southBoundLatitude: String(ms),
            northBoundLatitude: String(mn),
          });
        }
      })
      .catch(() => { if (!cancelled) setMapWgs84(null); });
    
    return () => { cancelled = true; };
  }, [spatialExtent, modelCrs, geographic]);

  const parse = (v: string) => parseFloat(v);
  const clampLon = (v: number) => Math.max(-180, Math.min(180, v));
  const clampLat = (v: number) => Math.max(-90, Math.min(90, v));
  const round4 = (v: number) => Math.round(v * 10000) / 10000;

  const toWgs84Extent = (ww: number, ee: number, ss: number, nn: number): typeof spatialExtent => ({
    westBoundLongitude: String(clampLon(ww)),
    eastBoundLongitude: String(clampLon(ee)),
    southBoundLatitude: String(clampLat(ss)),
    northBoundLatitude: String(clampLat(nn)),
  });

  const toNativeExtent = (ww: number, ee: number, ss: number, nn: number): typeof spatialExtent => ({
    westBoundLongitude: String(round4(ww)),
    eastBoundLongitude: String(round4(ee)),
    southBoundLatitude: String(round4(ss)),
    northBoundLatitude: String(round4(nn)),
  });

  const commitWgs84 = (extent: typeof spatialExtent) => {
    if (!onChange) return;
    if (geographic) {
      if (extent.westBoundLongitude !== spatialExtent.westBoundLongitude ||
          extent.eastBoundLongitude !== spatialExtent.eastBoundLongitude ||
          extent.southBoundLatitude !== spatialExtent.southBoundLatitude ||
          extent.northBoundLatitude !== spatialExtent.northBoundLatitude) {
        onChange(extent);
      }
    } else {
      const w = parse(extent.westBoundLongitude);
      const e = parse(extent.eastBoundLongitude);
      const s = parse(extent.southBoundLatitude);
      const n = parse(extent.northBoundLatitude);
      reprojectCoordinates([[w, s], [e, n]], 'EPSG:4326', modelCrs!)
        .then(([[rw, rs], [re, rn]]) => {
          const next = toNativeExtent(rw, re, rs, rn);
          if (next.westBoundLongitude !== spatialExtent.westBoundLongitude ||
              next.eastBoundLongitude !== spatialExtent.eastBoundLongitude ||
              next.southBoundLatitude !== spatialExtent.southBoundLatitude ||
              next.northBoundLatitude !== spatialExtent.northBoundLatitude) {
            onChange(next);
          }
        })
        .catch(() => onChange(extent));
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
    const lw = parse(localInputs.westBoundLongitude);
    const le = parse(localInputs.eastBoundLongitude);
    const ls = parse(localInputs.southBoundLatitude);
    const ln = parse(localInputs.northBoundLatitude);
    return !isNaN(lw) && !isNaN(le) && !isNaN(ls) && !isNaN(ln) && lw < le && ls < ln;
  }, [localInputs]);

  const unit = geographic ? '°' : 'm';

  const [activeHandle, setActiveHandle] = useState<string | null>(null);

  const MapController = () => {
    const map = useMap();
    const lastBoundsRef = useRef<string>('');

    // Fit bounds on valid extent if it changed significantly or on initial load
    useEffect(() => {
      if (bounds && !isDrawing && !activeHandle) {
        const boundsStr = JSON.stringify(bounds);
        if (boundsStr !== lastBoundsRef.current) {
          const b = L.latLngBounds(bounds);
          const size = Math.max(Math.abs(b.getNorth() - b.getSouth()), Math.abs(b.getEast() - b.getWest()));
          
          if (size > 0.0001) {
            map.fitBounds(bounds, { padding: [20, 20], maxZoom: 12 });
          } else if (size > 0) {
            map.setView(b.getCenter(), 12);
          }
          lastBoundsRef.current = boundsStr;
        }
      }
    }, [bounds, isDrawing, map, activeHandle]);

    useMapEvents({
      mousedown(e) {
        if (!onChange) return;
        const isShift = (e.originalEvent as MouseEvent).shiftKey;
        if (mode !== 'draw' && !isShift) return;
        
        setIsDrawing(true);
        drawingOriginRef.current = e.latlng;
        const extent = toWgs84Extent(e.latlng.lng, e.latlng.lng, e.latlng.lat, e.latlng.lat);
        setDragWgs84(extent);
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
          const e_ = parse(displayExt.eastBoundLongitude);
          const s = parse(displayExt.southBoundLatitude);
          const n = parse(displayExt.northBoundLatitude);
          
          let nw = w, ne = e_, ns = s, nn = n;
          const type = activeHandle;
          
          if (type.includes('w')) nw = e.latlng.lng;
          if (type.includes('e')) ne = e.latlng.lng;
          if (type.includes('s')) ns = e.latlng.lat;
          if (type.includes('n')) nn = e.latlng.lat;

          // Clamping to avoid inversion if desired, but box flipping is okay too
          setDragWgs84(toWgs84Extent(nw, ne, ns, nn));
        }
      },
      mouseup() {
        if (isDrawing) {
          setIsDrawing(false);
          const final = dragWgs84;
          if (final) {
            // Ensure non-zero size before committing
            const dw = Math.abs(parse(final.eastBoundLongitude) - parse(final.westBoundLongitude));
            const dh = Math.abs(parse(final.northBoundLatitude) - parse(final.southBoundLatitude));
            if (dw > 0.00001 && dh > 0.00001) commitWgs84(final);
          }
          setDragWgs84(null);
          drawingOriginRef.current = null;
          map.dragging.enable();
        } else if (activeHandle) {
          if (dragWgs84) commitWgs84(dragWgs84);
          setActiveHandle(null);
          setDragWgs84(null);
          map.dragging.enable();
        }
      }
    });

    return null;
  };

  const Handle = ({ position, type }: { position: L.LatLngExpression, type: string }) => {
    const map = useMap();
    
    // Determine cursor based on position
    const cursor = type.length === 1 
      ? (type === 'n' || type === 's' ? 'ns-resize' : 'ew-resize')
      : (type === 'nw' || type === 'se' ? 'nwse-resize' : 'nesw-resize');

    return (
      <CircleMarker
        center={position}
        radius={activeHandle === type ? 7 : 5}
        pathOptions={{
          fillColor: 'white',
          fillOpacity: 1,
          color: '#6366F1',
          weight: activeHandle === type ? 2.5 : 1.5,
          className: 'transition-all duration-150'
        }}
        eventHandlers={{
          mousedown: (e) => {
            L.DomEvent.stopPropagation(e);
            setActiveHandle(type);
            map.dragging.disable();
          },
          mouseover: (e) => {
            e.target.getElement().style.cursor = cursor;
          }
        }}
      />
    );
  };

  const commitInput = (key: keyof typeof spatialExtent, raw: string) => {
    if (!onChange) return;
    const val = parseFloat(raw);
    if (!isNaN(val)) {
      onChange({ ...localInputs, [key]: String(val) });
    } else {
      setLocalInputs(p => ({ ...p, [key]: spatialExtent[key] }));
    }
  };

  // Center on Norway if no bbox exists
  const defaultCenter: L.LatLngExpression = [65, 13];
  const defaultZoom = 3;

  const controlStackRef = useRef<HTMLDivElement>(null);

  // Helper to get center between two values
  const mid = (a: string, b: string) => (parse(a) + parse(b)) / 2;

  return (
    <div className="space-y-4">
      <div className={`relative rounded-xl overflow-hidden border-2 shadow-sm transition-colors duration-200 h-[300px] ${inputsValid ? 'border-indigo-300' : 'border-slate-200'}`}>
        <MapContainer
          center={defaultCenter}
          zoom={defaultZoom}
          scrollWheelZoom={true}
          doubleClickZoom={false}
          boxZoom={false}
          zoomControl={false}
          className="w-full h-full"
          style={{ cursor: mode === 'draw' ? 'crosshair' : 'grab' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />
          <MapController />
          
          {bounds && (
            <>
              <Rectangle
                bounds={bounds}
                pathOptions={{
                  color: '#6366F1',
                  weight: 2,
                  fillColor: '#6366F1',
                  fillOpacity: 0.1,
                  dashArray: isDrawing ? '5, 5' : undefined
                }}
              />
              {!isDrawing && mode === 'draw' && displayExt && (
                <>
                  {/* Corners */}
                  <Handle type="nw" position={[parse(displayExt.northBoundLatitude), parse(displayExt.westBoundLongitude)]} />
                  <Handle type="ne" position={[parse(displayExt.northBoundLatitude), parse(displayExt.eastBoundLongitude)]} />
                  <Handle type="sw" position={[parse(displayExt.southBoundLatitude), parse(displayExt.westBoundLongitude)]} />
                  <Handle type="se" position={[parse(displayExt.southBoundLatitude), parse(displayExt.eastBoundLongitude)]} />
                  {/* Edges */}
                  <Handle type="n" position={[parse(displayExt.northBoundLatitude), mid(displayExt.westBoundLongitude, displayExt.eastBoundLongitude)]} />
                  <Handle type="s" position={[parse(displayExt.southBoundLatitude), mid(displayExt.westBoundLongitude, displayExt.eastBoundLongitude)]} />
                  <Handle type="w" position={[mid(displayExt.northBoundLatitude, displayExt.southBoundLatitude), parse(displayExt.westBoundLongitude)]} />
                  <Handle type="e" position={[mid(displayExt.northBoundLatitude, displayExt.southBoundLatitude), parse(displayExt.eastBoundLongitude)]} />
                </>
              )}
            </>
          )}

          <div 
            ref={controlStackRef}
            className="absolute top-3 left-3 z-[1000] flex flex-col gap-2"
            onMouseDown={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
            onDoubleClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col bg-white/95 backdrop-blur-md rounded-xl border border-slate-200 shadow-xl p-1 gap-1 ring-1 ring-black/[0.03]">
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMode('pan'); }}
                onMouseDown={e => e.stopPropagation()}
                title={lang === 'no' ? 'Panorere' : 'Pan'}
                className={`p-2 rounded-lg transition-all duration-200 flex items-center justify-center ${mode === 'pan' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
              >
                <Grab size={18} strokeWidth={2.5} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setMode('draw'); }}
                onMouseDown={e => e.stopPropagation()}
                title={lang === 'no' ? 'Tegn utstrekning' : 'Draw extent'}
                className={`p-2 rounded-lg transition-all duration-200 flex items-center justify-center ${mode === 'draw' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
              >
                <Square size={18} strokeWidth={2.5} />
              </button>
            </div>

            <div className="flex flex-col bg-white/95 backdrop-blur-md rounded-xl border border-slate-200 shadow-xl p-1 gap-1 ring-1 ring-black/[0.03]">
              <ZoomButton type="in" lang={lang} />
              <ZoomButton type="out" lang={lang} />
            </div>
          </div>
        </MapContainer>

        {!bounds && onChange && !isDrawing && mode === 'draw' && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center pointer-events-none">
            <div className="bg-white/80 backdrop-blur-sm px-4 py-2 rounded-lg border border-slate-200 shadow-sm text-slate-600 text-xs font-semibold italic text-center max-w-[200px]">
              {lang === 'no' ? 'Klikk og dra for å velge utstrekning' : 'Click and drag to define extent'}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 items-center">
        <div />
        <CoordInput label={lang === 'no' ? 'Nord' : 'N'} value={localInputs.northBoundLatitude}
          placeholder={geographic ? '90' : ''} readOnly={!onChange} unit={unit}
          onChange={v => setLocalInputs(p => ({ ...p, northBoundLatitude: v }))}
          onCommit={v => commitInput('northBoundLatitude', v)} />
        <div />

        <CoordInput label={lang === 'no' ? 'Vest' : 'W'} value={localInputs.westBoundLongitude}
          placeholder={geographic ? '−180' : ''} readOnly={!onChange} unit={unit}
          onChange={v => setLocalInputs(p => ({ ...p, westBoundLongitude: v }))}
          onCommit={v => commitInput('westBoundLongitude', v)} />
        <div className="flex items-end justify-center pb-1.5 text-slate-300 text-lg select-none" aria-hidden="true">✛</div>
        <CoordInput label={lang === 'no' ? 'Øst' : 'E'} value={localInputs.eastBoundLongitude}
          placeholder={geographic ? '180' : ''} readOnly={!onChange} unit={unit}
          onChange={v => setLocalInputs(p => ({ ...p, eastBoundLongitude: v }))}
          onCommit={v => commitInput('eastBoundLongitude', v)} />

        <div />
        <CoordInput label={lang === 'no' ? 'Sør' : 'S'} value={localInputs.southBoundLatitude}
          placeholder={geographic ? '−90' : ''} readOnly={!onChange} unit={unit}
          onChange={v => setLocalInputs(p => ({ ...p, southBoundLatitude: v }))}
          onCommit={v => commitInput('southBoundLatitude', v)} />
        <div />
      </div>
    </div>
  );
};

interface CoordInputProps {
  label: string; value: string; placeholder: string; readOnly: boolean;
  unit: string;
  onChange: (v: string) => void; onCommit: (v: string) => void;
}

const CoordInput: React.FC<CoordInputProps> = ({ label, value, placeholder, readOnly, unit, onChange, onCommit }) => (
  <div className="flex flex-col items-center gap-0.5">
    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</span>
    <div className="relative w-full">
      <input
        type="text" inputMode="decimal" value={value} placeholder={placeholder} readOnly={readOnly}
        onChange={ev => onChange(ev.target.value)}
        onBlur={ev => onCommit(ev.target.value)}
        onKeyDown={ev => ev.key === 'Enter' && onCommit((ev.target as HTMLInputElement).value)}
        className={[
          'w-full text-xs font-mono font-semibold text-center rounded-lg px-2 py-1.5 pr-5',
          'bg-white border outline-none transition-all',
          readOnly
            ? 'border-slate-200 text-slate-500 cursor-default bg-slate-50'
            : 'border-slate-200 text-slate-700 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20',
        ].join(' ')}
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 pointer-events-none font-mono">{unit}</span>
    </div>
  </div>
);

export default BboxEditor;

const ZoomButton = ({ type, lang }: { type: 'in' | 'out', lang: string }) => {
  const map = useMap();
  const label = type === 'in' ? (lang === 'no' ? 'Zoom inn' : 'Zoom in') : (lang === 'no' ? 'Zoom ut' : 'Zoom out');
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (type === 'in') map.zoomIn(); else map.zoomOut();
      }}
      onMouseDown={e => e.stopPropagation()}
      title={label}
      className="p-2 rounded-lg transition-all duration-200 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50"
    >
      {type === 'in' ? <Plus size={18} strokeWidth={2.5} /> : <Minus size={18} strokeWidth={2.5} />}
    </button>
  );
};
