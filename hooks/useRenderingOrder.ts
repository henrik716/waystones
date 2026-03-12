import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DataModel, Layer } from '../types';

interface UseRenderingOrderProps {
  model: DataModel;
  onUpdateModel?: (model: DataModel) => void;
  onUpdate?: (model: DataModel) => void;
}

export function useRenderingOrder({ model, onUpdateModel, onUpdate }: UseRenderingOrderProps) {
  const [layerOrder, setLayerOrder] = useState<string[]>(
    model.renderingOrder || model.layers.map(l => l.id)
  );
  
  // Track previous rendering order to prevent infinite loops
  const prevRenderingOrderRef = useRef<string[] | undefined>(undefined);

  // Update model with rendering order when it changes
  useEffect(() => {
    // Only update if rendering order actually changed
    const currentRenderingOrder = model.renderingOrder || model.layers.map(l => l.id);
    if (JSON.stringify(layerOrder) !== JSON.stringify(prevRenderingOrderRef.current)) {
      if (onUpdateModel) {
        onUpdateModel({
          ...model,
          renderingOrder: layerOrder
        });
      } else if (onUpdate) {
        onUpdate({
          ...model,
          renderingOrder: layerOrder
        });
      }
      prevRenderingOrderRef.current = layerOrder;
    }
  }, [layerOrder]); // Remove model, onUpdateModel, onUpdate from dependencies

  // Update layer order when model changes
  useEffect(() => {
    const newOrder = model.renderingOrder || model.layers.map(l => l.id);
    // Only update if the order actually changed
    if (JSON.stringify(newOrder) !== JSON.stringify(layerOrder)) {
      setLayerOrder(newOrder);
    }
  }, [model.renderingOrder, model.layers]);

  const resetOrder = useCallback(() => {
    const originalOrder = model.layers.map(l => l.id);
    setLayerOrder(originalOrder);
  }, [model.layers]);

  const handleReorder = useCallback((newOrder: string[]) => {
    setLayerOrder(newOrder);
  }, []);

  const getLayersInOrder = useCallback(() => {
    return layerOrder
      .map(id => model.layers.find(l => l.id === id))
      .filter(l => l !== undefined) as Layer[];
  }, [layerOrder, model.layers]);

  return {
    layerOrder,
    resetOrder,
    handleReorder,
    getLayersInOrder
  };
}
