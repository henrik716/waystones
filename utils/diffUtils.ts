import { DataModel, Layer, Field, PropertyConstraints, LayerConstraint, SharedType } from '../types';

export type ChangeType = 'added' | 'deleted' | 'modified';

export interface ModelChange {
  type: ChangeType;
  itemType: 'layer' | 'property' | 'model_meta' | 'shared_type';
  itemName: string;
  details?: string;
  layerId?: string;
  layerName?: string;
  sharedTypeId?: string;
  propertyId?: string;
  modifiedFields?: { field: string; oldValue: any; newValue: any }[];
}

const isEqual = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);

/** Helper: get a display label for a field's type */
const fieldTypeLabel = (f: Field, t: any): string => {
  switch (f.fieldType.kind) {
    case 'primitive':       return t.types?.[f.fieldType.baseType] || f.fieldType.baseType;
    case 'codelist':        return t.types?.codelist || 'Codelist';
    case 'geometry':        return t.types?.geometry || 'Geometry';
    case 'feature-ref':     return t.types?.['feature-ref'] || 'Relation';
    case 'datatype-inline': return t.types?.['datatype-inline'] || 'Object';
    case 'datatype-ref':    return t.types?.['datatype-ref'] || 'Datatype';
  }
};

/**
 * Sammenligner to datamodeller og returnerer en liste over endringer.
 * Bruker rekursjon for å håndtere nøstede objekter og Shared Types.
 */
export const compareModels = (baseline: DataModel | null, current: DataModel, t: any): ModelChange[] => {
  const changes: ModelChange[] = [];

  if (!baseline) return [];

  const emptyLabel = `(${t.review?.empty || 'empty'})`;

  // Collect sub-property fields recursively
  const collectSubPropertyFields = (
    props: Field[], 
    path: string
  ): { field: string; oldValue: any; newValue: any }[] => {
    const fields: { field: string; oldValue: any; newValue: any }[] = [];
    props.forEach(sp => {
      const subPath = `${path} ▸ ${sp.name}`;
      fields.push({ field: `${subPath} (${t.propType || 'Type'})`, oldValue: emptyLabel, newValue: fieldTypeLabel(sp, t) });
      fields.push({ field: `${subPath} (${t.propRequired || 'Multiplicity'})`, oldValue: emptyLabel, newValue: sp.multiplicity });
      
      if (sp.description) fields.push({ field: `${subPath} (${t.propDescription || 'Description'})`, oldValue: emptyLabel, newValue: sp.description });
      if (sp.defaultValue) fields.push({ field: `${subPath} (${t.propDefaultValue || 'Default Value'})`, oldValue: emptyLabel, newValue: sp.defaultValue });
      if (sp.constraints && Object.keys(sp.constraints).length > 0) fields.push({ field: `${subPath} (${t.constraints?.title || 'Constraints'})`, oldValue: emptyLabel, newValue: t.review?.added || 'Added' });

      if (sp.fieldType.kind === 'datatype-ref') {
        const dtRef = sp.fieldType;
        const st = current.sharedTypes?.find(s => s.id === dtRef.typeId);
        if (st) {
            fields.push({ field: `${subPath} (Datatype)`, oldValue: emptyLabel, newValue: st.name });
            fields.push(...collectSubPropertyFields(st.properties, subPath));
        }
      }

      if (sp.fieldType.kind === 'datatype-inline' && sp.fieldType.properties.length > 0) {
        fields.push(...collectSubPropertyFields(sp.fieldType.properties, subPath));
      }
    });
    return fields;
  };

  // Recursively compare properties between baseline and current
  const compareProperties = (
    baseProps: Field[], 
    currProps: Field[], 
    containerId: string, 
    containerName: string, 
    itemType: 'layer' | 'shared_type',
    parentPath: string = ""
  ) => {
    const baseMap = new Map(baseProps.map(p => [p.id, p]));
    const currMap = new Map(currProps.map(p => [p.id, p]));

    // 1. LAGT TIL (ADDED)
    currProps.forEach(prop => {
      const fullPropName = parentPath ? `${parentPath} ▸ ${prop.name}` : prop.name;
      if (!baseMap.has(prop.id)) {
        const addedFields = [
          { field: t.propType || 'Type', oldValue: emptyLabel, newValue: fieldTypeLabel(prop, t) },
          { field: t.propRequired || 'Multiplicity', oldValue: emptyLabel, newValue: prop.multiplicity }
        ];
        if (prop.defaultValue) addedFields.push({ field: t.propDefaultValue || 'Default Value', oldValue: emptyLabel, newValue: prop.defaultValue });
        if (prop.constraints && Object.keys(prop.constraints).length > 0) addedFields.push({ field: t.constraints?.title || 'Constraints', oldValue: emptyLabel, newValue: t.review?.added || 'Added' });
        
        if (prop.fieldType.kind === 'datatype-ref') {
          const dtRef = prop.fieldType;
          const st = current.sharedTypes?.find(s => s.id === dtRef.typeId);
          addedFields.push({ field: t.sharedTypeName || 'Datatype', oldValue: emptyLabel, newValue: st?.name || dtRef.typeId });
          if (st && st.properties.length > 0) {
            addedFields.push(...collectSubPropertyFields(st.properties, fullPropName));
          }
        }

        if (prop.description) addedFields.push({ field: t.propDescription || 'Description', oldValue: emptyLabel, newValue: prop.description });
        
        if (prop.fieldType.kind === 'datatype-inline' && prop.fieldType.properties.length > 0) {
          addedFields.push(...collectSubPropertyFields(prop.fieldType.properties, fullPropName));
        }

        changes.push({ 
          type: 'added', 
          itemType: 'property', 
          itemName: fullPropName, 
          layerId: itemType === 'layer' ? containerId : undefined, 
          sharedTypeId: itemType === 'shared_type' ? containerId : undefined,
          layerName: containerName,
          propertyId: prop.id, 
          details: `${t.review?.added || 'Lagt til'} i ${itemType === 'layer' ? t.review.layer : 'datatype'} "${containerName}"`,
          modifiedFields: addedFields
        });
      }

      if (prop.fieldType.kind === 'datatype-inline' && prop.fieldType.properties.length > 0 && baseMap.has(prop.id)) {
        const baseProp = baseMap.get(prop.id)!;
        const baseSubProps = baseProp.fieldType.kind === 'datatype-inline' ? baseProp.fieldType.properties : [];
        compareProperties(baseSubProps, prop.fieldType.properties, containerId, containerName, itemType, fullPropName);
      }
    });

    // 2. SLETTET (DELETED)
    baseProps.forEach(prop => {
      const fullPropName = parentPath ? `${parentPath} ▸ ${prop.name}` : prop.name;
      if (!currMap.has(prop.id)) {
        changes.push({ 
          type: 'deleted', 
          itemType: 'property', 
          itemName: fullPropName, 
          layerId: itemType === 'layer' ? containerId : undefined,
          sharedTypeId: itemType === 'shared_type' ? containerId : undefined,
          layerName: containerName,
          propertyId: prop.id, 
          details: `${t.review?.deleted || 'Slettet'} fra "${containerName}"` 
        });
      }
    });

    // 3. ENDRET (MODIFIED)
    currProps.forEach(prop => {
      const baseProp = baseMap.get(prop.id);
      if (baseProp) {
        const fullPropName = parentPath ? `${parentPath} ▸ ${prop.name}` : prop.name;
        const propModifiedFields: { field: string; oldValue: any; newValue: any }[] = [];
        
        if (baseProp.name !== prop.name) propModifiedFields.push({ field: t.propName || 'Name', oldValue: baseProp.name, newValue: prop.name });
        if (baseProp.title !== prop.title) propModifiedFields.push({ field: t.propTitle || 'Title', oldValue: baseProp.title || emptyLabel, newValue: prop.title || emptyLabel });
        if (baseProp.description !== prop.description) propModifiedFields.push({ field: t.propDescription || 'Description', oldValue: baseProp.description || emptyLabel, newValue: prop.description || emptyLabel });
        if (!isEqual(baseProp.fieldType, prop.fieldType)) propModifiedFields.push({ field: t.propType || 'Type', oldValue: fieldTypeLabel(baseProp, t), newValue: fieldTypeLabel(prop, t) });
        if (baseProp.multiplicity !== prop.multiplicity) propModifiedFields.push({ field: t.propRequired || 'Multiplicity', oldValue: baseProp.multiplicity || emptyLabel, newValue: prop.multiplicity || emptyLabel });
        if (baseProp.defaultValue !== prop.defaultValue) propModifiedFields.push({ field: t.propDefaultValue || 'Default Value', oldValue: baseProp.defaultValue || emptyLabel, newValue: prop.defaultValue || emptyLabel });
        if (!isEqual(baseProp.constraints, prop.constraints)) propModifiedFields.push({ field: t.constraints?.title || 'Constraints', oldValue: t.review?.modified || 'Modified', newValue: t.review?.modified || 'Modified' });
        
        if (prop.fieldType.kind === 'datatype-ref' && baseProp.fieldType.kind === 'datatype-ref') {
            const baseDtRef = baseProp.fieldType;
            const currDtRef = prop.fieldType;
            if (baseDtRef.typeId !== currDtRef.typeId) {
                const oldST = baseline.sharedTypes?.find(s => s.id === baseDtRef.typeId);
                const newST = current.sharedTypes?.find(s => s.id === currDtRef.typeId);
                propModifiedFields.push({ field: t.sharedTypeName || 'Datatype', oldValue: oldST?.name || emptyLabel, newValue: newST?.name || emptyLabel });
                if (newST) {
                    propModifiedFields.push(...collectSubPropertyFields(newST.properties, fullPropName));
                }
            }
        }
        
        if (propModifiedFields.length > 0) {
          changes.push({ 
            type: 'modified', 
            itemType: 'property', 
            itemName: fullPropName, 
            layerId: itemType === 'layer' ? containerId : undefined,
            sharedTypeId: itemType === 'shared_type' ? containerId : undefined,
            layerName: containerName, 
            propertyId: prop.id, 
            modifiedFields: propModifiedFields,
            details: `I "${containerName}"`
          });
        }
      }
    });
  };

  // 1. SJEKK MODELL-METADATA
  const modifiedMeta: { field: string; oldValue: any; newValue: any }[] = [];
  if (baseline.name !== current.name) modifiedMeta.push({ field: t.modelName, oldValue: baseline.name, newValue: current.name });
  if (baseline.version !== current.version) modifiedMeta.push({ field: t.version, oldValue: baseline.version, newValue: current.version });
  if (baseline.namespace !== current.namespace) modifiedMeta.push({ field: t.namespace, oldValue: baseline.namespace, newValue: current.namespace });
  if (baseline.crs !== current.crs) modifiedMeta.push({ field: t.crsLabel, oldValue: baseline.crs, newValue: current.crs });
  
  if (modifiedMeta.length > 0) {
    changes.push({ type: 'modified', itemType: 'model_meta', itemName: t.review.modelMetadata, modifiedFields: modifiedMeta });
  }

  // 2. SJEKK GJENBRUKBARE DATATYPER (SHARED TYPES)
  const baselineTypeIds = new Set((baseline.sharedTypes || []).map(st => st.id));
  const currentTypeIds = new Set((current.sharedTypes || []).map(st => st.id));

  (current.sharedTypes || []).forEach(st => {
    if (!baselineTypeIds.has(st.id)) {
      changes.push({ type: 'added', itemType: 'shared_type', itemName: st.name, sharedTypeId: st.id, details: t.sharedTypes });
    } else {
      const baseST = baseline.sharedTypes?.find(b => b.id === st.id);
      if (baseST) {
        if (baseST.name !== st.name) {
            changes.push({ type: 'modified', itemType: 'shared_type', itemName: st.name, sharedTypeId: st.id, modifiedFields: [{field: t.sharedTypeName, oldValue: baseST.name, newValue: st.name}] });
        }
        compareProperties(baseST.properties, st.properties, st.id, st.name, 'shared_type');
      }
    }
  });

  (baseline.sharedTypes || []).forEach(st => {
    if (!currentTypeIds.has(st.id)) {
      changes.push({ type: 'deleted', itemType: 'shared_type', itemName: st.name, sharedTypeId: st.id });
    }
  });

  // 3. SJEKK LAG (LAYERS)
  const baselineLayerIds = new Set(baseline.layers.map(l => l.id));
  const currentLayerIds = new Set(current.layers.map(l => l.id));

  current.layers.forEach(layer => {
    const baselineLayer = baseline.layers.find(l => l.id === layer.id);
    
    if (!baselineLayerIds.has(layer.id)) {
      const addedFields = [
        { field: t.propGeometryType, oldValue: emptyLabel, newValue: t.geometryTypes[layer.geometryType] || layer.geometryType },
        { field: t.geomColumnName, oldValue: emptyLabel, newValue: layer.geometryColumnName }
      ];
      changes.push({ 
        type: 'added', itemType: 'layer', itemName: layer.name, layerId: layer.id, modifiedFields: addedFields 
      });
    } else if (baselineLayer) {
      const layerModifiedFields: { field: string; oldValue: any; newValue: any }[] = [];

      if (baselineLayer.name !== layer.name) {
        layerModifiedFields.push({ field: t.layerName, oldValue: baselineLayer.name, newValue: layer.name });
      }

      if (baselineLayer.geometryType !== layer.geometryType) {
        layerModifiedFields.push({ 
          field: t.propGeometryType, 
          oldValue: t.geometryTypes[baselineLayer.geometryType] || baselineLayer.geometryType, 
          newValue: t.geometryTypes[layer.geometryType] || layer.geometryType 
        });
      }

      if (layer.geometryType !== 'None' && baselineLayer.geometryColumnName !== layer.geometryColumnName) {
        layerModifiedFields.push({ field: t.geomColumnName, oldValue: baselineLayer.geometryColumnName, newValue: layer.geometryColumnName });
      }

      const baseConstraints = baselineLayer.layerConstraints || [];
      const currConstraints = layer.layerConstraints || [];
      if (!isEqual(baseConstraints, currConstraints)) {
        layerModifiedFields.push({ field: t.layerValidation?.title || 'Validation Rules', oldValue: t.review.modified, newValue: t.review.modified });
      }

      if (layerModifiedFields.length > 0) {
        changes.push({ type: 'modified', itemType: 'layer', itemName: layer.name, layerId: layer.id, modifiedFields: layerModifiedFields });
      }
    }
    compareProperties(baselineLayer ? baselineLayer.properties : [], layer.properties, layer.id, layer.name, 'layer');
  });

  baseline.layers.forEach(layer => {
    if (!currentLayerIds.has(layer.id)) {
      changes.push({ type: 'deleted', itemType: 'layer', itemName: layer.name, layerId: layer.id });
    }
  });

  return changes;
};



// Structured change helpers

export interface StructuredChanges {
  modelMeta: ModelChange[];
  sharedTypes: ModelChange[];
  layers: {
    layerId: string;
    layerName: string;
    layerChanges: ModelChange[];
    propertyChanges: ModelChange[];
  }[];
}

export const getStructuredChanges = (changes: ModelChange[]): StructuredChanges => {
  const structured: StructuredChanges = {
    modelMeta: [],
    sharedTypes: [],
    layers: []
  };

  const layerMap = new Map<string, { layerId: string; layerName: string; layerChanges: ModelChange[]; propertyChanges: ModelChange[] }>();

  changes.forEach(change => {
    if (change.itemType === 'model_meta') {
      structured.modelMeta.push(change);
    } else if (change.itemType === 'shared_type' || (change.itemType === 'property' && change.sharedTypeId)) {
        structured.sharedTypes.push(change);
    } else if (change.layerId) {
      if (!layerMap.has(change.layerId)) {
        layerMap.set(change.layerId, {
          layerId: change.layerId,
          layerName: change.layerName || change.itemName,
          layerChanges: [],
          propertyChanges: []
        });
      }
      const group = layerMap.get(change.layerId)!;
      if (change.itemType === 'layer') group.layerChanges.push(change);
      else group.propertyChanges.push(change);
    }
  });

  structured.layers = Array.from(layerMap.values());
  return structured;
};

export const generateChangelog = (changes: ModelChange[], t: any): string => {
  if (changes.length === 0) return t.review?.noChanges || 'No changes';

  const sections: Record<string, string[]> = {
    [t.review?.breakingChanges || 'Breaking Changes']: [],
    [t.review?.newFeatures || 'New Features']: [],
    [t.review?.improvementsFixes || 'Improvements']: []
  };

  changes.forEach(change => {
    let line = `- **${change.itemName}**: ${t.review?.[change.type] || change.type}`;
    if (change.modifiedFields && change.modifiedFields.length > 0) {
      const fieldLines = change.modifiedFields.map(f => `  - **${f.field}**: ${f.oldValue} ➔ ${f.newValue}`);
      line += `\n${fieldLines.join('\n')}`;
    }

    if (change.type === 'deleted') sections[Object.keys(sections)[0]].push(line);
    else if (change.type === 'added') sections[Object.keys(sections)[1]].push(line);
    else sections[Object.keys(sections)[2]].push(line);
  });

  return Object.entries(sections)
    .filter(([_, items]) => items.length > 0)
    .map(([title, items]) => `### ${title}\n${items.join('\n')}`)
    .join('\n\n');
};

export const calculateNextVersion = (currentVersion: string, changes: ModelChange[]): string => {
  const parts = currentVersion.split('.').map(Number);
  if (parts.length !== 3) return "1.0.0";
  let [major, minor, patch] = parts;

  const hasBreaking = changes.some(c => c.type === 'deleted');
  const hasNew = changes.some(c => c.type === 'added');
  
  if (hasBreaking) { major++; minor = 0; patch = 0; }
  else if (hasNew) { minor++; patch = 0; }
  else if (changes.length > 0) { patch++; }

  return `${major}.${minor}.${patch}`;
};