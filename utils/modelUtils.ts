import { Layer, ModelProperty } from '../types';

/**
 * Returns a layer's own properties merged with all inherited properties from
 * its parent chain. Parent properties come first, followed by the layer's own.
 * Cycles are prevented by tracking visited layer IDs.
 */
export function getEffectiveProperties(layer: Layer, allLayers: Layer[]): ModelProperty[] {
  const visited = new Set<string>();

  function collect(l: Layer): ModelProperty[] {
    if (visited.has(l.id)) return [];
    visited.add(l.id);

    const parentProps: ModelProperty[] = [];
    if (l.extends) {
      const parent = allLayers.find(lyr => lyr.id === l.extends);
      if (parent) {
        parentProps.push(...collect(parent));
      }
    }
    return [...parentProps, ...l.properties];
  }

  return collect(layer);
}

/**
 * Returns layers in topological order: parents before children.
 * Layers without extends come first, then their dependents.
 */
export function topoSortLayers(layers: Layer[]): Layer[] {
  const sorted: Layer[] = [];
  const visited = new Set<string>();

  function visit(layer: Layer) {
    if (visited.has(layer.id)) return;
    if (layer.extends) {
      const parent = layers.find(l => l.id === layer.extends);
      if (parent) visit(parent);
    }
    visited.add(layer.id);
    sorted.push(layer);
  }

  layers.forEach(visit);
  return sorted;
}
