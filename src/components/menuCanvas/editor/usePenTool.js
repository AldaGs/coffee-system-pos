import { useRef, useState } from 'react';
import { pathBBox } from '../../../utils/canvasDocument';
import { PATH_STYLE } from './nodeTemplates';

const mirror = (around, p) => ({ x: 2 * around.x - p.x, y: 2 * around.y - p.y });

// Bézier pen. Click places anchors; click-drag pulls smooth handles out of the
// anchor being placed; clicking the first anchor (3+ points) closes the path.
export function usePenTool({ stageScale, addNode, clearSelection }) {
  const [penMode, setPenMode] = useState(false);
  const [penDraft, setPenDraft] = useState(null); // { points: [], closed }
  const [penCursor, setPenCursor] = useState(null);
  const penDownRef = useRef(false);

  const reset = () => {
    penDownRef.current = false;
    setPenDraft(null);
    setPenCursor(null);
    setPenMode(false);
  };

  const finishPath = (draft, closed) => {
    const d = draft || penDraft;
    reset();
    if (!d || d.points.length < 2) return;
    const bb = pathBBox(d.points);
    addNode({ type: 'path', points: d.points, closed: !!closed, x: bb.x, y: bb.y, w: bb.w, h: bb.h, rotation: 0, style: PATH_STYLE });
  };

  const penDown = (p) => {
    const draft = penDraft || { points: [], closed: false };
    if (draft.points.length > 2) {
      const f = draft.points[0];
      if (Math.hypot(f.x - p.x, f.y - p.y) < 10 / (stageScale || 1)) {
        finishPath(draft, true);
        return;
      }
    }
    penDownRef.current = true;
    setPenDraft({ ...draft, points: [...draft.points, { x: p.x, y: p.y, hIn: null, hOut: null }] });
  };

  const penMove = (p) => {
    setPenCursor(p);
    if (!penDownRef.current) return;
    setPenDraft((d) => {
      if (!d || d.points.length === 0) return d;
      const pts = d.points.slice();
      const a = pts[pts.length - 1];
      pts[pts.length - 1] = { ...a, hOut: { x: p.x, y: p.y }, hIn: mirror({ x: a.x, y: a.y }, p) };
      return { ...d, points: pts };
    });
  };

  const penUp = () => { penDownRef.current = false; };

  const togglePen = () => {
    clearSelection();
    setPenMode((m) => !m);
    setPenDraft(null);
    setPenCursor(null);
  };

  return { penMode, penDraft, penCursor, penDown, penMove, penUp, finishPath, cancelPen: reset, togglePen };
}
