import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Command, ChevronRight, Database, Globe, FileText,
  AlignJustify, Layers, Palette, ShieldCheck, Settings2, MapPin,
  Tags, Users, Calendar, Link
} from 'lucide-react';
import type { DataModel } from '../../types';
import { SERVICE_ICONS } from '../../constants';

interface ModelEditorOmnibarProps {
  isOpen: boolean;
  onClose: () => void;
  layers: DataModel['layers'];
  activeLayerId: string | undefined;
  setActiveNavSection: (s: 'model' | 'types' | 'layer') => void;
  setActiveLayerId: (id: string) => void;
  setActiveLayerTab: (tab: 'fields' | 'style' | 'rules' | 'settings') => void;
  setIsModelHeaderOpen: (v: boolean) => void;
  setIsMetadataOpen: (v: boolean) => void;
  setIsRenderingOrderOpen: (v: boolean) => void;
}

interface OmniItem {
  id: string;
  label: string;
  hint?: string;
  icon: React.ElementType;
  category: string;
  action: () => void;
}

function scrollTo(domId: string) {
  setTimeout(() => {
    document.getElementById(domId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
}

const ModelEditorOmnibar: React.FC<ModelEditorOmnibarProps> = ({
  isOpen,
  onClose,
  layers,
  activeLayerId,
  setActiveNavSection,
  setActiveLayerId,
  setActiveLayerTab,
  setIsModelHeaderOpen,
  setIsMetadataOpen,
  setIsRenderingOrderOpen,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const navigate = useCallback((action: () => void) => {
    action();
    onClose();
  }, [onClose]);

  const items: OmniItem[] = [
    // Model
    {
      id: 'model-settings',
      label: 'Model Settings',
      hint: 'name, namespace, CRS, description',
      icon: SERVICE_ICONS.Storage,
      category: 'Model',
      action: () => navigate(() => {
        setActiveNavSection('model');
        setIsModelHeaderOpen(true);
      }),
    },
    {
      id: 'model-crs',
      label: 'CRS',
      hint: 'coordinate reference system',
      icon: Globe,
      category: 'Model',
      action: () => navigate(() => {
        setActiveNavSection('model');
        setIsModelHeaderOpen(true);
        scrollTo('editor-meta-name');
      }),
    },
    {
      id: 'model-namespace',
      label: 'Namespace',
      icon: Link,
      category: 'Model',
      action: () => navigate(() => {
        setActiveNavSection('model');
        setIsModelHeaderOpen(true);
        scrollTo('editor-meta-namespace');
      }),
    },
    {
      id: 'rendering-order',
      label: 'Rendering Order',
      hint: 'layer draw order',
      icon: AlignJustify,
      category: 'Model',
      action: () => navigate(() => {
        setActiveNavSection('model');
        setIsRenderingOrderOpen(true);
      }),
    },
    // Publishing metadata
    {
      id: 'pub-metadata',
      label: 'Publishing Metadata',
      hint: 'contact, license, extent',
      icon: SERVICE_ICONS.STAC,
      category: 'Publishing',
      action: () => navigate(() => {
        setActiveNavSection('model');
        setIsMetadataOpen(true);
      }),
    },
    {
      id: 'pub-contact',
      label: 'Contact Information',
      hint: 'name, email, organization',
      icon: Users,
      category: 'Publishing',
      action: () => navigate(() => {
        setActiveNavSection('model');
        setIsMetadataOpen(true);
        scrollTo('editor-meta-contact');
      }),
    },
    {
      id: 'pub-keywords',
      label: 'Keywords & Theme',
      icon: Tags,
      category: 'Publishing',
      action: () => navigate(() => {
        setActiveNavSection('model');
        setIsMetadataOpen(true);
        scrollTo('editor-meta-keywords');
      }),
    },
    {
      id: 'pub-bbox',
      label: 'Spatial Extent',
      hint: 'bounding box',
      icon: MapPin,
      category: 'Publishing',
      action: () => navigate(() => {
        setActiveNavSection('model');
        setIsMetadataOpen(true);
        scrollTo('editor-meta-bbox');
      }),
    },
    {
      id: 'pub-temporal',
      label: 'Temporal Extent',
      hint: 'date range',
      icon: Calendar,
      category: 'Publishing',
      action: () => navigate(() => {
        setActiveNavSection('model');
        setIsMetadataOpen(true);
        scrollTo('editor-meta-bbox');
      }),
    },
    // Shared types
    {
      id: 'shared-types',
      label: 'Shared Types',
      hint: 'reusable types and enums',
      icon: Settings2,
      category: 'Shared',
      action: () => navigate(() => setActiveNavSection('types')),
    },
    // Current layer tabs (only when a layer is active)
    ...(activeLayerId ? [
      {
        id: 'layer-fields',
        label: 'Fields',
        hint: 'current layer properties',
        icon: Layers,
        category: 'Current Layer',
        action: () => navigate(() => {
          setActiveNavSection('layer');
          setActiveLayerTab('fields');
        }),
      },
      {
        id: 'layer-style',
        label: 'Style',
        hint: 'current layer styling',
        icon: Palette,
        category: 'Current Layer',
        action: () => navigate(() => {
          setActiveNavSection('layer');
          setActiveLayerTab('style');
        }),
      },
      {
        id: 'layer-rules',
        label: 'Rules',
        hint: 'current layer constraints',
        icon: ShieldCheck,
        category: 'Current Layer',
        action: () => navigate(() => {
          setActiveNavSection('layer');
          setActiveLayerTab('rules');
        }),
      },
      {
        id: 'layer-settings',
        label: 'Settings',
        hint: 'current layer settings',
        icon: Settings2,
        category: 'Current Layer',
        action: () => navigate(() => {
          setActiveNavSection('layer');
          setActiveLayerTab('settings');
        }),
      },
    ] : []),
    // All layers
    ...layers.map(layer => ({
      id: `layer-${layer.id}`,
      label: layer.title || layer.name,
      hint: layer.title ? layer.name : undefined,
      icon: Layers,
      category: 'Layers',
      action: () => navigate(() => {
        setActiveLayerId(layer.id);
        setActiveNavSection('layer');
      }),
    })),
  ];

  const filteredItems = query.trim()
    ? items.filter(item =>
        item.label.toLowerCase().includes(query.toLowerCase()) ||
        item.category.toLowerCase().includes(query.toLowerCase()) ||
        (item.hint?.toLowerCase().includes(query.toLowerCase()) ?? false)
      )
    : items;

  useEffect(() => { setSelectedIndex(0); }, [query]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % filteredItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredItems.length) % filteredItems.length);
    } else if (e.key === 'Enter') {
      filteredItems[selectedIndex]?.action();
    }
  };

  const categories = Array.from(new Set(filteredItems.map(i => i.category)));

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm"
          />
          <div className="fixed inset-0 z-[101] flex items-start justify-center pt-[12vh] pointer-events-none p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-xl bg-white rounded-[24px] shadow-2xl border border-slate-200 overflow-hidden pointer-events-auto flex flex-col"
            >
              {/* Search header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
                <Search className="h-5 w-5 text-slate-400 shrink-0" />
                <input
                  autoFocus
                  placeholder="Navigate to a section or layer..."
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 bg-transparent border-none outline-none text-slate-900 placeholder:text-slate-400 font-medium text-base"
                />
                <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg shrink-0">
                  <Command className="h-3 w-3 text-slate-400" />
                  <span className="text-[10px] font-black text-slate-400">K</span>
                </div>
              </div>

              {/* Results */}
              <div className="max-h-[60vh] overflow-y-auto p-2 space-y-1">
                {filteredItems.length === 0 ? (
                  <div className="py-12 px-4 text-center">
                    <p className="text-sm font-medium text-slate-500">No results for "{query}"</p>
                  </div>
                ) : (
                  categories.map(category => (
                    <div key={category} className="space-y-0.5">
                      <div className="px-3 pt-3 pb-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{category}</p>
                      </div>
                      {filteredItems.filter(i => i.category === category).map(item => {
                        const globalIdx = filteredItems.indexOf(item);
                        const Icon = item.icon;
                        const isSelected = globalIdx === selectedIndex;

                        return (
                          <button
                            key={item.id}
                            onClick={item.action}
                            onMouseEnter={() => setSelectedIndex(globalIdx)}
                            className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${
                              isSelected ? 'bg-indigo-50 text-indigo-900' : 'text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                                isSelected ? 'bg-white shadow-sm border border-indigo-100' : 'bg-slate-50 border border-slate-100'
                              }`}>
                                <Icon className={`h-4 w-4 ${isSelected ? 'text-indigo-600' : 'text-slate-400'}`} />
                              </div>
                              <div className="min-w-0">
                                <span className="font-semibold text-sm block">{item.label}</span>
                                {item.hint && (
                                  <span className="text-[10px] text-slate-400 font-medium">{item.hint}</span>
                                )}
                              </div>
                            </div>
                            {isSelected && <ChevronRight className="h-4 w-4 text-indigo-400 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-bold text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded">↑↓</span>
                    <span className="text-[10px] font-medium text-slate-500">Navigate</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-bold text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded">Enter</span>
                    <span className="text-[10px] font-medium text-slate-500">Select</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-bold text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded">Esc</span>
                  <span className="text-[10px] font-medium text-slate-500">Close</span>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ModelEditorOmnibar;
