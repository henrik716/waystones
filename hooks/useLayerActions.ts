import { useState, useEffect } from 'react';
import { DataModel, Layer, Field } from '../types';
import { createEmptyField, createEmptyLayer } from '../constants';
import type { Translations } from '../i18n/index';

interface UseLayerActionsProps {
  model: DataModel;
  baselineModel: DataModel | null;
  onUpdate: (model: DataModel) => void;
  t: Translations;
  onTypePromoted?: (newSharedTypeId: string) => void;
}

export const useLayerActions = ({
  model,
  baselineModel,
  onUpdate,
  t,
  onTypePromoted,
}: UseLayerActionsProps) => {
  const [activeLayerId, setActiveLayerId] = useState<string>(
    model.layers[0]?.id || ''
  );

  // --- LAYER DISPLAY LOGIC ---
  const displayLayers = [...model.layers];
  if (baselineModel) {
    baselineModel.layers.forEach((bl) => {
      if (!model.layers.find((l) => l.id === bl.id)) {
        (displayLayers as any).push({ ...bl, isGhost: true });
      }
    });
  }

  useEffect(() => {
    if (
      displayLayers.length > 0 &&
      (!activeLayerId || !displayLayers.find((l) => l.id === activeLayerId))
    ) {
      setActiveLayerId(displayLayers[0].id);
    }
  }, [model.layers, activeLayerId, displayLayers]);

  const activeLayer = displayLayers.find((l) => l.id === activeLayerId) || displayLayers[0];
  const isGhostLayer = (activeLayer as any)?.isGhost;
  const baselineLayer = baselineModel?.layers.find((l) => l.id === activeLayerId);

  // --- LAYER CRUD ---
  const handleAddLayer = () => {
    const defaultLayerName = t.layerNameDefault
      ? `${t.layerNameDefault} ${model.layers.length + 1}`
      : `Layer ${model.layers.length + 1}`;
    const newLayer = createEmptyLayer(defaultLayerName);
    onUpdate({
      ...model,
      layers: [...model.layers, newLayer],
    });
    setActiveLayerId(newLayer.id);
  };

  const handleDeleteLayer = (id: string) => {
    if (model.layers.length <= 1) return;
    const newLayers = model.layers.filter((l) => l.id !== id);
    onUpdate({ ...model, layers: newLayers });
    if (activeLayerId === id) setActiveLayerId(newLayers[0].id);
  };

  const handleUpdateLayer = (updatedLayer: Partial<Layer>) => {
    onUpdate({
      ...model,
      layers: model.layers.map((l) =>
        l.id === (activeLayer?.id || activeLayerId)
          ? { ...l, ...updatedLayer }
          : l
      ),
    });
  };

  // --- PROPERTY CRUD ---
  const handleAddProperty = () => {
    if (!activeLayer) return;
    handleUpdateLayer({
      properties: [...activeLayer.properties, createEmptyField()],
    });
  };

  const handleUpdateProperty = (updatedProp: Field) => {
    const oldProp = activeLayer.properties.find((p) => p.id === updatedProp.id);
    const oldFt =
      oldProp?.fieldType.kind === 'feature-ref' ? oldProp.fieldType : undefined;
    const newFt =
      updatedProp.fieldType.kind === 'feature-ref'
        ? updatedProp.fieldType
        : undefined;

    const inverseChanged =
      oldFt?.inverseFieldId !== newFt?.inverseFieldId ||
      oldFt?.layerId !== newFt?.layerId;

    if (inverseChanged && (oldFt || newFt)) {
      // Cross-layer sync needed for inverse relations
      let updatedLayers = model.layers.map((l) =>
        l.id === activeLayer.id
          ? {
              ...l,
              properties: l.properties.map((p) =>
                p.id === updatedProp.id ? updatedProp : p
              ),
            }
          : l
      );

      // Clear old back-pointer
      if (oldFt?.inverseFieldId) {
        updatedLayers = updatedLayers.map((l) => ({
          ...l,
          properties: l.properties.map((p) => {
            if (
              p.id === oldFt.inverseFieldId &&
              p.fieldType.kind === 'feature-ref' &&
              p.fieldType.inverseFieldId === updatedProp.id
            ) {
              const { inverseFieldId, ...rest } = p.fieldType;
              return { ...p, fieldType: rest };
            }
            return p;
          }),
        }));
      }

      // Set new back-pointer
      if (newFt?.inverseFieldId && newFt.layerId) {
        updatedLayers = updatedLayers.map((l) => ({
          ...l,
          properties: l.properties.map((p) => {
            if (p.id === newFt.inverseFieldId && p.fieldType.kind === 'feature-ref') {
              return {
                ...p,
                fieldType: { ...p.fieldType, inverseFieldId: updatedProp.id },
              };
            }
            return p;
          }),
        }));
      }

      onUpdate({ ...model, layers: updatedLayers });
    } else {
      handleUpdateLayer({
        properties: activeLayer.properties.map((p) =>
          p.id === updatedProp.id ? updatedProp : p
        ),
      });
    }
  };

  const handleDeleteProperty = (id: string) => {
    const prop = activeLayer.properties.find((p) => p.id === id);
    const ft =
      prop?.fieldType.kind === 'feature-ref' ? prop.fieldType : undefined;

    let updatedLayers = model.layers.map((l) =>
      l.id === activeLayer.id
        ? { ...l, properties: l.properties.filter((p) => p.id !== id) }
        : l
    );

    // Clear back-pointer in target layer if this field had an inverse
    if (ft?.inverseFieldId) {
      updatedLayers = updatedLayers.map((l) => ({
        ...l,
        properties: l.properties.map((p) => {
          if (
            p.id === ft.inverseFieldId &&
            p.fieldType.kind === 'feature-ref' &&
            p.fieldType.inverseFieldId === id
          ) {
            const { inverseFieldId, ...rest } = p.fieldType;
            return { ...p, fieldType: rest };
          }
          return p;
        }),
      }));
    }

    onUpdate({ ...model, layers: updatedLayers });
  };

  const handleMoveProperty = (id: string, direction: 'up' | 'down') => {
    const index = activeLayer.properties.findIndex((p) => p.id === id);
    if (index === -1) return;

    const newProps = [...activeLayer.properties];
    if (direction === 'up' && index > 0) {
      [newProps[index - 1], newProps[index]] = [newProps[index], newProps[index - 1]];
    } else if (direction === 'down' && index < newProps.length - 1) {
      [newProps[index + 1], newProps[index]] = [newProps[index], newProps[index + 1]];
    } else {
      return;
    }

    handleUpdateLayer({ properties: newProps });
  };

  // --- PROMOTE INLINE TYPE EVENT LISTENER ---
  useEffect(() => {
    const handler = (e: Event) => {
      const { fieldId, typeName, properties } = (e as CustomEvent).detail;
      const newSharedType = {
        id: crypto.randomUUID(),
        name: typeName,
        description: '',
        properties: Array.isArray(properties) ? properties : [],
      };
      onUpdate({
        ...model,
        layers: model.layers.map((layer) => {
          if (layer.id !== activeLayerId) return layer;
          return {
            ...layer,
            properties: layer.properties.map((p) =>
              p.id === fieldId
                ? {
                    ...p,
                    fieldType: {
                      kind: 'datatype-ref' as const,
                      typeId: newSharedType.id,
                    },
                  }
                : p
            ),
          };
        }),
        sharedTypes: [...(model.sharedTypes || []), newSharedType],
      });
      // Notify parent of the promotion to switch tabs and select the new type
      onTypePromoted?.(newSharedType.id);
    };
    window.addEventListener('promote-inline-type', handler);
    return () => window.removeEventListener('promote-inline-type', handler);
  }, [activeLayerId, model, onUpdate, onTypePromoted]);

  return {
    activeLayerId,
    setActiveLayerId,
    activeLayer,
    isGhostLayer,
    baselineLayer,
    displayLayers,
    handleAddLayer,
    handleDeleteLayer,
    handleUpdateLayer,
    handleAddProperty,
    handleUpdateProperty,
    handleDeleteProperty,
    handleMoveProperty,
  };
};
