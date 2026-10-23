import { useEffect, useRef, useState } from 'react';
import { setGuide } from './docOps';

const toPagePos = (box, ev, axis, scale) => {
  if (!box) return 0;
  return Math.round((axis === 'h' ? ev.clientY - box.top : ev.clientX - box.left) / (scale || 1));
};

// Persistent ruler guides, stored per page as page.guides = { v: [x…], h: [y…] }.
// Pull one out of a ruler, drag it to move it, drag it off the page to delete it.
export function useRulerGuides({ page, mutatePage, stageBoxRef, stageScale, pageW, pageH }) {
  // { axis: 'v'|'h', index (null while creating), pos }. The live position is
  // mirrored in a ref so the mouseup handler reads the final value.
  const [activeGuide, setActiveGuide] = useState(null);
  const activePosRef = useRef(0);
  const mutatePageRef = useRef(mutatePage);
  useEffect(() => { mutatePageRef.current = mutatePage; });

  const pageGuides = page?.guides || { v: [], h: [] };

  const pointerToPage = (ev, axis) => toPagePos(stageBoxRef.current?.getBoundingClientRect(), ev, axis, stageScale);

  const begin = (axis, index, pos) => {
    activePosRef.current = pos;
    setActiveGuide({ axis, index, pos });
  };

  // The top ruler spawns a horizontal guide, the left ruler a vertical one.
  const startGuideFromRuler = (axis, ev) => {
    ev.preventDefault();
    begin(axis, null, pointerToPage(ev, axis));
  };

  const startDragGuide = (axis, index, ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    begin(axis, index, (pageGuides[axis] || [])[index] ?? 0);
  };

  const axis = activeGuide?.axis;
  const index = activeGuide?.index;
  useEffect(() => {
    if (!axis) return;
    function move(ev) {
      const pos = toPagePos(stageBoxRef.current?.getBoundingClientRect(), ev, axis, stageScale);
      activePosRef.current = pos;
      setActiveGuide((g) => (g ? { ...g, pos } : g));
    }
    function up() {
      const pos = activePosRef.current;
      const inside = pos >= 0 && pos <= (axis === 'h' ? pageH : pageW);
      if (index == null) {
        if (inside) mutatePageRef.current((p) => setGuide(p, axis, null, pos));
      } else {
        mutatePageRef.current((p) => setGuide(p, axis, index, inside ? pos : null));
      }
      setActiveGuide(null);
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [axis, index, stageScale, pageW, pageH, stageBoxRef]);

  return { pageGuides, activeGuide, startGuideFromRuler, startDragGuide };
}
