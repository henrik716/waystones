import { Layer, LayerStyle } from '../types';

/**
 * Translates a Waystones LayerStyle into a set of MapLibre GL Style layers.
 */
export function translateToGLStyle(layer: Layer, sourceId: string): any[] {
  const style = layer.style;
  const isPoint = layer.geometryType.includes('Point');
  const isLine = layer.geometryType.includes('LineString');
  const isPolygon = layer.geometryType.includes('Polygon');
  const layers: any[] = [];

  const baseFilter = ['==', ['geometry-type'], isPoint ? 'Point' : isLine ? 'LineString' : 'Polygon'];

  if (isPolygon) {
    // Fill Layer
    layers.push({
      id: `${layer.id}-fill`,
      type: 'fill',
      source: sourceId,
      'source-layer': layer.name,
      paint: {
        'fill-color': getGLColorExpression(style, 'simpleColor'),
        'fill-opacity': getGLNumberExpression(style, 'fillOpacity', 0.5),
      }
    });

    // Outline Layer
    if (style.showOutline !== false) {
      layers.push({
        id: `${layer.id}-outline`,
        type: 'line',
        source: sourceId,
        'source-layer': layer.name,
        paint: {
          'line-color': getGLColorExpression(style, 'simpleColor'),
          'line-width': getGLNumberExpression(style, 'lineWidth', 1),
          'line-opacity': getGLNumberExpression(style, 'lineOpacity', 1),
          'line-dasharray': getGLDashExpression(style)
        }
      });
    }
  } else if (isLine) {
    layers.push({
      id: `${layer.id}-line`,
      type: 'line',
      source: sourceId,
      'source-layer': layer.name,
      paint: {
        'line-color': getGLColorExpression(style, 'simpleColor'),
        'line-width': getGLNumberExpression(style, 'lineWidth', 2),
        'line-opacity': getGLNumberExpression(style, 'lineOpacity', 1),
        'line-dasharray': getGLDashExpression(style)
      }
    });
  } else if (isPoint) {
    layers.push({
      id: `${layer.id}-point`,
      type: 'circle',
      source: sourceId,
      'source-layer': layer.name,
      paint: {
        'circle-color': getGLColorExpression(style, 'simpleColor'),
        'circle-radius': getGLNumberExpression(style, 'pointSize', 5),
        'circle-opacity': getGLNumberExpression(style, 'pointOpacity', 1),
        'circle-stroke-width': 1,
        'circle-stroke-color': '#ffffff'
      }
    });
  }

  // Add Labels if enabled
  if (style.labelSettings?.enabled && style.labelSettings.propertyId) {
    const ls = style.labelSettings;
    layers.push({
      id: `${layer.id}-label`,
      type: 'symbol',
      source: sourceId,
      'source-layer': layer.name,
      layout: {
        'text-field': ['get', ls.propertyId],
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        'text-size': ls.fontSize || 12,
        'text-anchor': ls.placement === 'over' ? 'center' : 'top',
        'symbol-placement': isLine ? 'line' : 'point'
      },
      paint: {
        'text-color': ls.color || '#000000',
        'text-halo-color': ls.haloEnabled ? (ls.haloColor || '#ffffff') : 'transparent',
        'text-halo-width': ls.haloEnabled ? (ls.haloSize || 1) : 0
      }
    });
  }

  return layers;
}

function getGLColorExpression(style: LayerStyle, defaultProp: keyof LayerStyle): any {
  if (style.type === 'categorized' && style.propertyId) {
    const expression: any[] = ['match', ['get', style.propertyId]];
    const settings = style.categorizedSettings || {};
    
    Object.entries(settings).forEach(([code, cat]) => {
      expression.push(code, cat.color || '#ccc');
    });
    
    // Add default
    expression.push(style.simpleColor || '#ccc');
    return expression;
  }
  return style[defaultProp] || '#ccc';
}

function getGLNumberExpression(style: LayerStyle, prop: keyof LayerStyle, defaultValue: number): any {
  if (style.type === 'categorized' && style.propertyId) {
    const expression: any[] = ['match', ['get', style.propertyId]];
    const settings = style.categorizedSettings || {};
    
    Object.entries(settings).forEach(([code, cat]) => {
      expression.push(code, (cat as any)[prop] ?? style[prop] ?? defaultValue);
    });
    
    expression.push(style[prop] ?? defaultValue);
    return expression;
  }
  return style[prop] ?? defaultValue;
}

function getGLDashExpression(style: LayerStyle): any {
  const dash = style.lineDash || 'solid';
  const width = style.lineWidth || 2;
  
  // Note: MapLibre dasharray is relative to line-width.
  // Waystones dash logic:
  // dashed: w*4, w*4
  // dotted: w, w*2
  switch (dash) {
    case 'dashed': return [4, 4];
    case 'dotted': return [1, 2];
    case 'dash-dot': return [6, 2, 1, 2];
    case 'dash-dot-dot': return [6, 2, 1, 1.5, 1, 1.5];
    case 'long-dash': return [10, 4];
    default: return undefined;
  }
}

/**
 * Generates a full Style JSON for a PMTiles source.
 */
export function generateFullStyle(layers: Layer[], pmtilesUrl: string): any {
  const sourceId = 'waystones-tiles';
  const glLayers: any[] = [];
  
  // Background
  glLayers.push({
    id: 'background',
    type: 'background',
    paint: { 'background-color': '#f8fafc' }
  });

  layers.forEach(l => {
    glLayers.push(...translateToGLStyle(l, sourceId));
  });

  return {
    version: 8,
    name: 'Waystones Vector Tiles',
    sources: {
      [sourceId]: {
        type: 'vector',
        url: `pmtiles://${pmtilesUrl}`
      }
    },
    layers: glLayers
  };
}
