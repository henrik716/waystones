import React, { useState, useCallback } from 'react';

interface DragAndDropReorderProps<T> {
  items: T[];
  onReorder: (newOrder: T[]) => void;
  getItemId?: (item: T) => string;
}

interface DragAndDropState<T> {
  draggedItem: T | null;
  dragOverItem: T | null;
}

interface DragAndDropHandlers<T> {
  handleDragStart: (e: React.DragEvent, item: T) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragEnter: (e: React.DragEvent, item: T) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent, targetItem: T) => void;
  handleDragEnd: () => void;
}

export function useDragAndDropReorder<T>({
  items,
  onReorder,
  getItemId = (item) => (item as any).id || String(item)
}: DragAndDropReorderProps<T>): DragAndDropState<T> & DragAndDropHandlers<T> {
  const [draggedItem, setDraggedItem] = useState<T | null>(null);
  const [dragOverItem, setDragOverItem] = useState<T | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, item: T) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent, item: T) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverItem(item);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only clear if we're actually leaving the container
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDragOverItem(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetItem: T) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverItem(null);
    
    if (draggedItem && draggedItem !== targetItem) {
      const draggedItemId = getItemId(draggedItem);
      const targetItemId = getItemId(targetItem);
      
      const newOrder = [...items];
      const draggedIndex = newOrder.findIndex(item => getItemId(item) === draggedItemId);
      const targetIndex = newOrder.findIndex(item => getItemId(item) === targetItemId);
      
      if (draggedIndex !== -1 && targetIndex !== -1) {
        // Remove dragged item and insert at new position
        newOrder.splice(draggedIndex, 1);
        newOrder.splice(targetIndex, 0, draggedItem);
        
        // Only call onReorder if the order actually changed
        if (JSON.stringify(newOrder) !== JSON.stringify(items)) {
          onReorder(newOrder);
        }
      }
    }
    setDraggedItem(null);
  }, [draggedItem, items, onReorder, getItemId]);

  const handleDragEnd = useCallback(() => {
    setDraggedItem(null);
    setDragOverItem(null);
  }, []);

  return {
    draggedItem,
    dragOverItem,
    handleDragStart,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handleDragEnd
  };
}
