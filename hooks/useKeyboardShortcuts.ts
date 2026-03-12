import { useEffect, DependencyList } from 'react';

interface KeyboardShortcutHandlers {
  onUndo: () => void;
  onRedo: () => void;
  onToggleSidebar: () => void;
  onTogglePreview: () => void;
}

export function useKeyboardShortcuts(
  handlers: KeyboardShortcutHandlers,
  deps: DependencyList = []
) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) handlers.onRedo(); else handlers.onUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') handlers.onRedo();
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') handlers.onToggleSidebar();
      if ((e.ctrlKey || e.metaKey) && e.key === 'j') handlers.onTogglePreview();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, deps);
}
