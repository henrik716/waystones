import React from 'react';
import { Layers, GripVertical, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import type { DataModel } from '../../types';
import type { Translations } from '../../i18n/index';

interface RenderingOrderPanelProps {
  model: DataModel;
  layerOrder: string[];
  activeLayerId: string;
  onSelectLayer: (id: string) => void;
  draggedLayer: string | null;
  dragOverLayer: string | null;
  handleDragStart: (e: React.DragEvent, id: string) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragEnter: (e: React.DragEvent, id: string) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent, id: string) => void;
  handleDragEnd: (e: React.DragEvent) => void;
  resetOrder: () => void;
  isOpen: boolean;
  onToggle: () => void;
  t: Translations;
}

const RenderingOrderPanel: React.FC<RenderingOrderPanelProps> = ({
  model,
  layerOrder,
  activeLayerId,
  onSelectLayer,
  draggedLayer,
  dragOverLayer,
  handleDragStart,
  handleDragOver,
  handleDragEnter,
  handleDragLeave,
  handleDrop,
  handleDragEnd,
  resetOrder,
  isOpen,
  onToggle,
  t,
}) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 mb-4">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-all rounded-t-2xl"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center">
            <Layers size={16} className="text-indigo-600" />
          </div>
          <div>
            <h4 className="text-xs font-black text-slate-700">
              {t.quickPublish?.renderingOrder || 'Rendering Order'}
            </h4>
            <span className="text-[9px] text-slate-400 font-medium">
              {t.quickPublish?.dragToReorderLayers ||
                'Drag layers to reorder rendering order'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronUp size={16} className="text-slate-400" />
          ) : (
            <ChevronDown size={16} className="text-slate-400" />
          )}
        </div>
      </button>

      {isOpen && (
        <div
          className="px-4 pb-4"
          onDragOver={handleDragOver}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // Custom hook handles state cleanup automatically
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="text-[9px] text-slate-400 font-medium">
              {layerOrder.length} {layerOrder.length === 1 ? 'layer' : 'layers'}
            </div>
            <button
              onClick={resetOrder}
              className="text-xs font-black text-slate-500 hover:text-slate-700 flex items-center gap-1.5 shrink-0"
            >
              <RotateCcw size={12} />
              {t.quickPublish?.resetOrder || 'Reset'}
            </button>
          </div>
          <div className="space-y-1">
            {layerOrder.map((layerId) => {
              const layer = model.layers.find((l) => l.id === layerId);
              if (!layer) return null;
              const isActive = activeLayerId === layerId;
              const isDragged = draggedLayer === layerId;
              const isDragOver = dragOverLayer === layerId;

              return (
                <div
                  key={layerId}
                  draggable
                  onDragStart={(e) => handleDragStart(e, layerId)}
                  onDragOver={handleDragOver}
                  onDragEnter={(e) => handleDragEnter(e, layerId)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, layerId)}
                  onDragEnd={handleDragEnd}
                  onClick={() => onSelectLayer(layerId)}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all cursor-move ${isDragged ? 'opacity-50 scale-95' : ''}
                    ${
                      isDragOver
                        ? 'border-indigo-400 bg-indigo-50'
                        : 'border-slate-100 bg-slate-50'
                    } ${isActive ? 'ring-2 ring-indigo-500 bg-indigo-50' : ''}
                    hover:border-slate-300 hover:bg-white`}
                >
                  <GripVertical size={14} className="text-slate-400" />
                  <div
                    className="w-3 h-3 rounded-full border border-white/30 shrink-0"
                    style={{ backgroundColor: layer.style?.simpleColor || '#ccc' }}
                  />
                  <span className="text-sm font-black text-slate-900 truncate flex-1">
                    {layer.name || 'Untitled Layer'}
                  </span>
                  <div className="w-2 h-2 rounded-full bg-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default RenderingOrderPanel;
