import { useRef, useState } from 'react';
import { pathBBox, translatePath } from '../../../utils/canvasDocument';
import { snapRect, withPage } from './docOps';

// Moving and resizing nodes on the stage. Konva owns the live position during a
// gesture; the final geometry is written to the document in one commit at the end.
export function useNodeDrag({ stageRef, doc, setDoc, pageIndex, page, selectedIds, mutatePage, pushHistory, updateNodeSilent, snapEnabled, stageScale, pageW, pageH }) {
  const [guides, setGuides] = useState([]); // snap lines drawn during a drag
  const groupDragRef = useRef(null); // { starts: { id: { x, y } }, leadId }
  const transformGuardRef = useRef(false);
  const transformStartRef = useRef(null);
  const findKonva = (id) => stageRef.current?.findOne('#' + id);

  // Grabbing one node of a multi-selection drags the whole selection.
  const handleDragStart = (e, node) => {
    if (selectedIds.length > 1 && selectedIds.includes(node.id)) {
      const starts = {};
      for (const id of selectedIds) {
        const kn = findKonva(id);
        if (kn) starts[id] = { x: kn.x(), y: kn.y() };
      }
      groupDragRef.current = { starts, leadId: node.id };
    } else {
      groupDragRef.current = null;
    }
  };

  const handleDragMove = (e, node) => {
    const g = groupDragRef.current;
    // Group drags don't snap, so the relative layout stays intact.
    if (g && g.leadId === node.id) {
      const dx = e.target.x() - g.starts[node.id].x;
      const dy = e.target.y() - g.starts[node.id].y;
      for (const id of Object.keys(g.starts)) {
        if (id === node.id) continue;
        const kn = findKonva(id);
        if (kn) { kn.x(g.starts[id].x + dx); kn.y(g.starts[id].y + dy); }
      }
      return;
    }
    if (!snapEnabled || node.type === 'path') return; // path points are absolute
    const kn = e.target;
    const { nx, ny, lines } = snapRect(page, node.id, { x: kn.x(), y: kn.y(), w: node.w, h: node.h }, pageW, pageH, 7 / (stageScale || 1));
    const isCircle = node.type === 'shape' && node.shape === 'circle';
    kn.x(isCircle ? nx + node.w / 2 : nx);
    kn.y(isCircle ? ny + node.h / 2 : ny);
    setGuides(lines);
  };

  // One mutation for every moved node, so a second commit in the same tick can't revert the first.
  const handleNodeDragEnd = (node) => {
    if (guides.length) setGuides([]);
    const g = groupDragRef.current;
    const set = new Set(g && g.leadId === node.id ? selectedIds : [node.id]);
    mutatePage((p) => ({
      ...p,
      nodes: (p.nodes || []).map((n) => {
        const kn = set.has(n.id) && findKonva(n.id);
        if (!kn) return n;
        // A path is drawn at (0,0) from absolute points, so the drag offset folds into the points.
        if (n.type === 'path') {
          const dx = kn.x(), dy = kn.y();
          if (!dx && !dy) return n;
          const pts = translatePath(n.points, dx, dy);
          const bb = pathBBox(pts);
          kn.x(0); kn.y(0);
          return { ...n, points: pts, x: bb.x, y: bb.y, w: bb.w, h: bb.h };
        }
        return { ...n, x: Math.round(kn.x()), y: Math.round(kn.y()) };
      }),
    }));
    groupDragRef.current = null;
  };

  const handleNodeTransformStart = () => {
    if (transformStartRef.current == null) transformStartRef.current = doc;
  };

  // Resizing bakes the scale into real geometry every frame so the preview
  // matches the result: text grows its font size, other nodes get a new w/h.
  // Multi-node transforms are left to Konva until the end, which avoids jitter.
  const handleNodeTransform = (e, node) => {
    if (selectedIds.length > 1) return;
    const kn = e.target;
    const sx = kn.scaleX(), sy = kn.scaleY();
    if (node.type === 'text' && !node.autoFit) {
      // Geometric mean: exact for corner drags, proportional for side drags.
      const factor = Math.sqrt(Math.abs(sx * sy)) || 1;
      kn.fontSize(Math.max(4, (node.style?.fontSize || 24) * factor));
      if (!node.autoWidth) kn.width(Math.max(10, node.w * sx));
      kn.scaleX(1); kn.scaleY(1);
      return;
    }
    kn.scaleX(1); kn.scaleY(1);
    updateNodeSilent(node.id, {
      x: Math.round(kn.x()), y: Math.round(kn.y()),
      w: Math.max(10, Math.round(node.w * sx)),
      h: Math.max(10, Math.round(node.h * sy)),
    });
  };

  // The Transformer fires transformend once per attached node; only the first
  // call of a gesture does the work and records one undo step.
  const handleNodeTransformEnd = (node) => {
    if (transformGuardRef.current) return;
    transformGuardRef.current = true;
    requestAnimationFrame(() => { transformGuardRef.current = false; });

    const startDoc = transformStartRef.current;
    transformStartRef.current = null;
    const set = new Set(selectedIds.length > 1 && selectedIds.includes(node.id) ? selectedIds : [node.id]);
    setDoc((d) => withPage(d, pageIndex, (p) => ({
      ...p,
      nodes: (p.nodes || []).map((n) => {
        const kn = set.has(n.id) && findKonva(n.id);
        if (!kn) return n;
        const sx = kn.scaleX(), sy = kn.scaleY();
        kn.scaleX(1); kn.scaleY(1);
        const base = { x: Math.round(kn.x()), y: Math.round(kn.y()), rotation: Math.round(kn.rotation()) };
        if (n.type === 'text' && !n.autoFit) {
          const factor = Math.sqrt(Math.abs(sx * sy)) || 1;
          const patch = { ...base, style: { ...n.style, fontSize: Math.max(4, Math.round((kn.fontSize?.() || n.style?.fontSize || 24) * factor)) } };
          if (!n.autoWidth) {
            patch.w = Math.max(10, Math.round((kn.width?.() || n.w) * sx));
            patch.h = Math.max(10, Math.round((kn.height?.() || n.h) * sy));
          }
          return { ...n, ...patch };
        }
        return { ...n, ...base, w: Math.max(10, Math.round(n.w * sx)), h: Math.max(10, Math.round(n.h * sy)) };
      }),
    })));
    pushHistory(startDoc);
  };

  return { guides, handleDragStart, handleDragMove, handleNodeDragEnd, handleNodeTransformStart, handleNodeTransform, handleNodeTransformEnd };
}
