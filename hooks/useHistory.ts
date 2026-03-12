import { useState, useCallback, useEffect, useRef } from 'react';
import { DataModel } from '../types';

const MAX_HISTORY = 50;
const DEBOUNCE_MS = 800;

export function useHistory(initialModels: DataModel[]) {
  const [history, setHistory] = useState<DataModel[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const skipNextHistoryPush = useRef(false);
  const updateTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (history.length === 0) {
      setHistory([initialModels]);
      setHistoryIndex(0);
    }
  }, []);

  const pushToHistory = useCallback((newModels: DataModel[], immediate = false) => {
    if (skipNextHistoryPush.current) { skipNextHistoryPush.current = false; return; }
    const doPush = () => {
      setHistory(prev => {
        const newHistory = prev.slice(0, historyIndex + 1);
        newHistory.push(JSON.parse(JSON.stringify(newModels)));
        if (newHistory.length > MAX_HISTORY) newHistory.shift();
        return newHistory;
      });
      setHistoryIndex(prev => Math.min(prev + 1, MAX_HISTORY - 1));
    };
    if (updateTimerRef.current) window.clearTimeout(updateTimerRef.current);
    if (immediate) doPush(); else updateTimerRef.current = window.setTimeout(doPush, DEBOUNCE_MS);
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prevModels = JSON.parse(JSON.stringify(history[historyIndex - 1]));
      skipNextHistoryPush.current = true;
      setHistoryIndex(historyIndex - 1);
      return prevModels as DataModel[];
    }
    return null;
  }, [historyIndex, history]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextModels = JSON.parse(JSON.stringify(history[historyIndex + 1]));
      skipNextHistoryPush.current = true;
      setHistoryIndex(historyIndex + 1);
      return nextModels as DataModel[];
    }
    return null;
  }, [historyIndex, history]);

  return { pushToHistory, undo, redo, historyIndex, historyLength: history.length };
}
