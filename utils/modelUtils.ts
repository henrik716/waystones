import { Layer, Field, DataModel } from '../types';

/**
 * Returns a layer's own properties merged with all inherited properties from
 * its parent chain. Parent properties come first, followed by the layer's own.
 * Cycles are prevented by tracking visited layer IDs.
 */
export function getEffectiveProperties(layer: Layer, allLayers: Layer[]): Field[] {
  const visited = new Set<string>();

  function collect(l: Layer): Field[] {
    if (visited.has(l.id)) return [];
    visited.add(l.id);

    const parentProps: Field[] = [];
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
  const inProgress = new Set<string>();

  function visit(layer: Layer) {
    if (visited.has(layer.id)) return;
    if (inProgress.has(layer.id)) return; // cycle — stop recursion
    inProgress.add(layer.id);
    if (layer.extends) {
      const parent = layers.find(l => l.id === layer.extends);
      if (parent) visit(parent);
    }
    inProgress.delete(layer.id);
    visited.add(layer.id);
    sorted.push(layer);
  }

  layers.forEach(visit);
  return sorted;
}

/**
 * Creates a copy of the model with all sensitive credentials removed.
 * Useful for public exports (model.json, model.yaml).
 */
export function scrubModelForExport(model: DataModel): DataModel {
  // Deep clone using JSON serialization for simplicity and safety
  const clone = JSON.parse(JSON.stringify(model)) as DataModel;

  if (clone.sourceConnection?.config) {
    const config = clone.sourceConnection.config as any;
    
    // Remove PostGIS / Supabase / Databricks secrets completely
    if ('password' in config) delete config.password;
    if ('token' in config) delete config.token;
    if ('anonKey' in config) delete config.anonKey;
    
    // Also clear the PG connection string if it was somehow cached/added
    if ('pgConnectionString' in config) delete config.pgConnectionString;
  }

  return clone;
}
