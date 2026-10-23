import { useCallback, useState } from 'react';

const HISTORY_LIMIT = 50;

// The document plus undo/redo. commit() records a step; setDoc() changes the
// document silently (live drags, re-measuring text) and pushHistory() records
// one step for such an edit afterwards, from its pre-edit snapshot.
export function useCanvasHistory(initialDoc) {
  const [doc, setDocState] = useState(initialDoc);
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const [dirty, setDirty] = useState(false);

  const commit = useCallback((next) => {
    setPast((p) => [...p.slice(-HISTORY_LIMIT), doc]);
    setFuture([]);
    setDocState(next);
    setDirty(true);
  }, [doc]);

  const setDoc = (fn) => {
    setDocState(fn);
    setDirty(true);
  };

  const pushHistory = (prevDoc) => {
    if (!prevDoc) return;
    setPast((p) => [...p.slice(-HISTORY_LIMIT), prevDoc]);
    setFuture([]);
    setDirty(true);
  };

  const undo = () => {
    if (past.length === 0) return;
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [doc, ...f]);
    setDocState(past[past.length - 1]);
  };

  const redo = () => {
    if (future.length === 0) return;
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, doc]);
    setDocState(future[0]);
  };

  return {
    doc, setDoc, commit, pushHistory, undo, redo,
    canUndo: past.length > 0, canRedo: future.length > 0,
    dirty, markSaved: () => setDirty(false),
  };
}
