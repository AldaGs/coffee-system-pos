import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RULER } from './overlays';

const MIN_SCALE = 0.1, MAX_SCALE = 8;

// On-screen scale = fit-to-viewport × user zoom (zoom 1 = fit). Ctrl/⌘ + wheel
// and the zoom buttons keep the point under the cursor (or the center) in place.
export function useStageZoom({ pageW, pageH, showRulers, isNarrow, panelOpen }) {
  const stageWrapRef = useRef(null);
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const stageScale = fitScale * zoom;

  useEffect(() => {
    function recalc() {
      const el = stageWrapRef.current;
      if (!el) return;
      const pad = 40 + (showRulers ? RULER : 0);
      setFitScale(Math.min((el.clientWidth - pad) / pageW, (el.clientHeight - pad) / pageH));
    }
    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [pageW, pageH, showRulers, isNarrow, panelOpen]);

  // The native wheel handler reads live values through refs instead of re-binding.
  const stageScaleRef = useRef(stageScale);
  const fitScaleRef = useRef(fitScale);
  useEffect(() => { stageScaleRef.current = stageScale; fitScaleRef.current = fitScale; });

  // Scroll target for the zoom step, applied once the stage has resized.
  const pendingScrollRef = useRef(null);
  useLayoutEffect(() => {
    const target = pendingScrollRef.current;
    if (target && stageWrapRef.current) {
      stageWrapRef.current.scrollLeft = target.left;
      stageWrapRef.current.scrollTop = target.top;
    }
    pendingScrollRef.current = null;
  }, [zoom]);

  // (cx, cy) is relative to the scroll container and stays put across the zoom.
  const applyScaleAt = useCallback((nextScaleRaw, cx, cy) => {
    const el = stageWrapRef.current;
    const old = stageScaleRef.current;
    const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScaleRaw));
    if (!el || Math.abs(nextScale - old) < 1e-4) return;
    const f = nextScale / old;
    pendingScrollRef.current = { left: (el.scrollLeft + cx) * f - cx, top: (el.scrollTop + cy) * f - cy };
    setZoom(nextScale / (fitScaleRef.current || 1));
  }, []);

  // Registered natively with passive:false so preventDefault stops the browser's page zoom.
  useEffect(() => {
    const el = stageWrapRef.current;
    if (!el) return;
    function onWheel(e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      applyScaleAt(stageScaleRef.current * Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyScaleAt]);

  const zoomByFactor = (factor) => {
    const el = stageWrapRef.current;
    if (!el) {
      setZoom((z) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, (fitScaleRef.current * z) * factor)) / (fitScaleRef.current || 1));
      return;
    }
    applyScaleAt(stageScaleRef.current * factor, el.clientWidth / 2, el.clientHeight / 2);
  };

  const resetZoom = () => {
    pendingScrollRef.current = { left: 0, top: 0 };
    setZoom(1);
  };

  return { stageWrapRef, stageScale, zoomByFactor, resetZoom };
}
