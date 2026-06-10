// Phase 4c.1 — react-konva editor (MVP). Full-screen overlay that mutates
// a menu's data.document and saves it back via updateMenu().
//
// Scope of this MVP:
//   - Add/select/move/resize/rotate: text, rect, circle, image, item-binding
//   - Per-node properties panel (font/color/fill/text/binding fields)
//   - Page management: switch / add / delete page, edit background
//   - Layer ordering: bring forward / send back
//   - Undo/redo via a snapshot ring buffer (50 steps, in-memory)
//   - Save / close — close prompts on dirty state
//
// Out of scope (later sub-phases):
//   - Asset upload (4c.2)
//   - Rich text editing inside text nodes (use the textarea in props panel)
//   - Snap/guides/multi-select/group
//   - Print + page-size presets switching (4c.5)

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Rect, Circle, Text, Image as KImage, Transformer, Group, Line, Label, Tag } from 'react-konva';
import { Icon } from '@iconify/react';
import { nanoid } from 'nanoid';
import { newDocument, newPage, PAGE_PRESETS, presetKeyFor, buildItemIndex, syncDocFonts, docFontFamilies } from '../../utils/canvasDocument';
import { CANVAS_FONTS, googleUrlForToken, fontIdForStack, parseGoogleFontUrl } from '../../utils/canvasFonts';
import { PaletteContext } from './paletteContext';
import { updateMenu } from '../../api/menus';
import AssetPicker from './AssetPicker';
import ColorPicker from './ColorPicker';
import ItemPicker from './ItemPicker';

const HISTORY_LIMIT = 50;

export default function CanvasEditor({ menu, menuData, onClose, showAlert }) {
  const initialDoc = menu.data?.document || newDocument('16:9');
  const [doc, setDoc] = useState(initialDoc);
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const [pageIndex, setPageIndex] = useState(0);
  // Multi-selection: selectedIds drives the transformer + group drag; the
  // properties panel only opens when exactly one node is selected.
  const [selectedIds, setSelectedIds] = useState([]);
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const selectOne = id => setSelectedIds(id ? [id] : []);
  const toggleSelect = id => setSelectedIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // When set, AssetPicker is open. The callback fires with the chosen URL
  // and decides what to do (add new image node vs replace selected node's src).
  const [assetPickerCb, setAssetPickerCb] = useState(null);
  const [itemPickerCb, setItemPickerCb] = useState(null);

  // Editor aids (4c.6 polish): rulers, grid overlay, and snap-to-guide while
  // dragging. `guides` holds the live alignment lines drawn during a drag.
  const [showRulers, setShowRulers] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [guides, setGuides] = useState([]);

  // Ruler guides (Figma/Photoshop-style): persistent lines stored per page on
  // page.guides = { v:[x...], h:[y...] }. `activeGuide` is the one currently
  // being created (index=null) or repositioned; its live pos is mirrored in a
  // ref so the window mouseup handler reads the final value without re-binding.
  const [activeGuide, setActiveGuide] = useState(null); // { axis:'v'|'h', index, pos }
  const activePosRef = useRef(0);
  const stageBoxRef = useRef(null);
  const stageRef = useRef(null);

  // Marquee selection (drag on empty canvas) + group-drag bookkeeping.
  const [marquee, setMarquee] = useState(null); // { x, y, w, h } in page coords
  const marqueeStartRef = useRef(null);
  const groupDragRef = useRef(null); // { starts: {id:{x,y}}, leadId }

  // PNG export hides editor chrome (selection/guides/grid) for one frame.
  const [exporting, setExporting] = useState(false);

  // Web fonts declared on the document (e.g. chalkboard's Permanent Marker).
  // Konva caches glyph metrics at draw time, so a font that arrives after the
  // first paint leaves text mis-measured. We inject the <link>, wait for the
  // family to actually load, then bump fontEpoch — which feeds the Text node
  // keys below to force a remount with correct metrics.
  const [fontEpoch, setFontEpoch] = useState(0);
  const fontsKey = JSON.stringify(doc.fonts || []);
  useEffect(() => {
    syncDocFonts(doc);
    const fams = docFontFamilies(doc);
    if (typeof document === 'undefined' || !document.fonts || fams.length === 0) return;
    let active = true;
    Promise.all(fams.map(f => document.fonts.load(`16px ${f}`).catch(() => {})))
      .then(() => { if (active) setFontEpoch(e => e + 1); });
    return () => { active = false; };
  }, [fontsKey]);

  const page = doc.pages[pageIndex] || doc.pages[0];
  const selected = useMemo(() => page?.nodes?.find(n => n.id === selectedId) || null, [page, selectedId]);

  // Wrap every doc mutation so history + dirty flag stay in sync. Pass the
  // *new* document — caller computes it however; we don't try to be clever
  // with patches.
  const commit = useCallback((next) => {
    setPast(p => [...p.slice(-HISTORY_LIMIT), doc]);
    setFuture([]);
    setDoc(next);
    setDirty(true);
  }, [doc]);

  function undo() {
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    setPast(p => p.slice(0, -1));
    setFuture(f => [doc, ...f]);
    setDoc(prev);
  }
  function redo() {
    if (future.length === 0) return;
    const next = future[0];
    setFuture(f => f.slice(1));
    setPast(p => [...p, doc]);
    setDoc(next);
  }

  // Keyboard: Ctrl/Cmd+Z / Shift+Z. Delete removes selected node.
  useEffect(() => {
    function onKey(e) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        removeNodes(selectedIds);
      } else if (e.key === 'Escape') {
        setSelectedIds([]);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------- Node operations -----------------------------------------------

  function mutatePage(fn) {
    const next = { ...doc, pages: doc.pages.map((p, i) => i === pageIndex ? fn(p) : p) };
    commit(next);
  }

  function addNode(node) {
    const withId = { id: nanoid(8), z: nextZ(page), ...node };
    mutatePage(p => ({ ...p, nodes: [...(p.nodes || []), withId] }));
    selectOne(withId.id);
  }

  function updateNode(id, patch) {
    mutatePage(p => ({
      ...p,
      nodes: (p.nodes || []).map(n => n.id === id ? { ...n, ...patch, style: patch.style ? { ...n.style, ...patch.style } : n.style } : n)
    }));
  }

  // Geometry sync for auto-width text — updates the doc WITHOUT a history
  // entry so re-measuring on every keystroke/font change doesn't flood undo.
  function updateNodeSilent(id, patch) {
    setDoc(d => ({
      ...d,
      pages: d.pages.map((p, i) => i === pageIndex ? {
        ...p, nodes: (p.nodes || []).map(n => n.id === id ? { ...n, ...patch } : n)
      } : p)
    }));
    setDirty(true);
  }

  function removeNode(id) { removeNodes([id]); }
  function removeNodes(ids) {
    const set = new Set(ids);
    mutatePage(p => ({ ...p, nodes: (p.nodes || []).filter(n => !set.has(n.id)) }));
    setSelectedIds([]);
  }

  // Set a node's font family and, if it's a web font, register its URL on the
  // document in ONE commit. Doing both in a single doc mutation avoids the
  // stale-closure race where two back-to-back commits clobber each other.
  function setNodeFont(id, stack, url) {
    let next = doc;
    if (url && !(doc.fonts || []).includes(url)) {
      next = { ...next, fonts: [...(next.fonts || []), url] };
    }
    next = {
      ...next,
      pages: next.pages.map((p, i) => i === pageIndex ? {
        ...p,
        nodes: (p.nodes || []).map(n => n.id === id ? { ...n, style: { ...n.style, fontFamily: stack } } : n)
      } : p)
    };
    commit(next);
  }

  function bringForward(id) {
    mutatePage(p => {
      const sorted = [...(p.nodes || [])].sort((a, b) => (a.z || 0) - (b.z || 0));
      const idx = sorted.findIndex(n => n.id === id);
      if (idx < 0 || idx === sorted.length - 1) return p;
      const a = sorted[idx], b = sorted[idx + 1];
      const az = a.z || 0, bz = b.z || 0;
      return { ...p, nodes: (p.nodes || []).map(n => n.id === a.id ? { ...n, z: bz } : n.id === b.id ? { ...n, z: az } : n) };
    });
  }
  function sendBack(id) {
    mutatePage(p => {
      const sorted = [...(p.nodes || [])].sort((a, b) => (a.z || 0) - (b.z || 0));
      const idx = sorted.findIndex(n => n.id === id);
      if (idx <= 0) return p;
      const a = sorted[idx], b = sorted[idx - 1];
      const az = a.z || 0, bz = b.z || 0;
      return { ...p, nodes: (p.nodes || []).map(n => n.id === a.id ? { ...n, z: bz } : n.id === b.id ? { ...n, z: az } : n) };
    });
  }

  // ---------- Page operations -----------------------------------------------

  function addPage() {
    commit({ ...doc, pages: [...doc.pages, newPage()] });
    setPageIndex(doc.pages.length);
    setSelectedIds([]);
  }
  function deletePage(idx) {
    if (doc.pages.length <= 1) return;
    commit({ ...doc, pages: doc.pages.filter((_, i) => i !== idx) });
    setPageIndex(Math.max(0, Math.min(pageIndex, doc.pages.length - 2)));
    setSelectedIds([]);
  }
  function changePageBg(color) {
    mutatePage(p => ({ ...p, background: color }));
  }

  function changePageSize(presetKey) {
    const preset = PAGE_PRESETS[presetKey];
    if (!preset) return;
    const cur = doc.page_size || {};
    if (cur.w === preset.w && cur.h === preset.h) return;
    // Warn if any node would land outside the new bounds — the user can
    // still proceed; we don't crop, just flag the risk.
    const overflow = doc.pages.some(p => (p.nodes || []).some(n =>
      (n.x || 0) + (n.w || 0) > preset.w || (n.y || 0) + (n.h || 0) > preset.h
    ));
    if (overflow && !window.confirm(
      'Algunos elementos quedan fuera del nuevo tamaño de página. Se conservan ' +
      'sus coordenadas — los puedes mover después. ¿Continuar?'
    )) return;
    commit({ ...doc, page_size: { w: preset.w, h: preset.h } });
  }

  // Opens the menu's print URL in a new window. The public page detects
  // ?print=1 and triggers window.print() once rendered.
  function openPrint() {
    if (typeof window === 'undefined') return;
    const url = localStorage.getItem('tinypos_supabase_url');
    const key = localStorage.getItem('tinypos_supabase_anon_key');
    if (!url || !key) {
      showAlert?.('Configuración faltante', 'Faltan credenciales locales para imprimir.');
      return;
    }
    if (dirty && !window.confirm('Hay cambios sin guardar. Imprime guardará primero.')) return;
    const go = () => {
      const printUrl = `${window.location.origin}/menu?u=${btoa(url)}&k=${btoa(key)}&m=${menu.id}&print=1`;
      window.open(printUrl, '_blank', 'noopener,noreferrer');
    };
    if (dirty) save().then(go).catch(() => {}); else go();
  }

  // ---------- Save / close --------------------------------------------------

  async function save() {
    setSaving(true);
    try {
      const nextData = { ...(menu.data || {}), document: doc };
      await updateMenu(menu.id, { data: nextData });
      setDirty(false);
      onClose(true);
    } catch (err) {
      showAlert?.('Error guardando', err.message);
    } finally { setSaving(false); }
  }

  function tryClose() {
    if (dirty && !window.confirm('Hay cambios sin guardar. ¿Cerrar de todos modos?')) return;
    onClose(false);
  }

  // ---------- Stage scaling -------------------------------------------------

  const pageW = doc.page_size?.w || 1920;
  const pageH = doc.page_size?.h || 1080;
  const stageWrapRef = useRef(null);
  const [stageScale, setStageScale] = useState(1);

  useEffect(() => {
    function recalc() {
      const el = stageWrapRef.current;
      if (!el) return;
      const pad = 40 + (showRulers ? RULER : 0);
      const aw = el.clientWidth - pad;
      const ah = el.clientHeight - pad;
      setStageScale(Math.min(aw / pageW, ah / pageH));
    }
    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [pageW, pageH, showRulers]);

  // Pointer position in page coordinates (undo the stage scale).
  function pagePointer(e) {
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    return { x: pos.x / (stageScale || 1), y: pos.y / (stageScale || 1) };
  }

  // Press on empty canvas: begin a marquee (and clear selection unless Shift).
  function onStageMouseDown(e) {
    if (e.target !== e.target.getStage()) return;
    if (!e.evt.shiftKey) setSelectedIds([]);
    const p = pagePointer(e);
    marqueeStartRef.current = p;
    setMarquee({ x: p.x, y: p.y, w: 0, h: 0 });
  }
  function onStageMouseMove(e) {
    if (!marqueeStartRef.current) return;
    const p = pagePointer(e);
    const s = marqueeStartRef.current;
    setMarquee({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  }
  function onStageMouseUp(e) {
    if (!marqueeStartRef.current) return;
    const m = marquee;
    marqueeStartRef.current = null;
    setMarquee(null);
    if (!m || (m.w < 4 && m.h < 4)) return; // a click, not a drag
    const hit = (page?.nodes || [])
      .filter(n => rectsOverlap(m, { x: n.x, y: n.y, w: n.w, h: n.h }))
      .map(n => n.id);
    setSelectedIds(prev => e.evt.shiftKey ? Array.from(new Set([...prev, ...hit])) : hit);
  }

  // ---------- Snapping + smart guides ---------------------------------------
  // While dragging, snap the moving node's edges/centers to the page
  // edges/center and to other nodes' edges/centers, and surface the match as
  // a guide line. All math is in page coordinates; the snap threshold is a
  // fixed on-screen distance converted back through the current stage scale.
  function computeSnap(activeId, x, y, w, h) {
    const thresh = 7 / (stageScale || 1);
    const vT = [0, pageW / 2, pageW];   // candidate x targets
    const hT = [0, pageH / 2, pageH];   // candidate y targets
    for (const n of (page?.nodes || [])) {
      if (n.id === activeId) continue;
      vT.push(n.x, n.x + n.w / 2, n.x + n.w);
      hT.push(n.y, n.y + n.h / 2, n.y + n.h);
    }
    // Ruler guides are snap targets too.
    for (const x of (page?.guides?.v || [])) vT.push(x);
    for (const y of (page?.guides?.h || [])) hT.push(y);
    // Active edges paired with the offset that turns a target into a new x/y.
    const vC = [{ val: x, off: 0 }, { val: x + w / 2, off: w / 2 }, { val: x + w, off: w }];
    const hC = [{ val: y, off: 0 }, { val: y + h / 2, off: h / 2 }, { val: y + h, off: h }];
    let bV = null, bH = null;
    for (const c of vC) for (const t of vT) {
      const d = Math.abs(c.val - t);
      if (d <= thresh && (!bV || d < bV.d)) bV = { d, target: t, off: c.off };
    }
    for (const c of hC) for (const t of hT) {
      const d = Math.abs(c.val - t);
      if (d <= thresh && (!bH || d < bH.d)) bH = { d, target: t, off: c.off };
    }
    const lines = [];
    let nx = x, ny = y;
    if (bV) { nx = bV.target - bV.off; lines.push({ key: 'v' + bV.target, points: [bV.target, 0, bV.target, pageH] }); }
    if (bH) { ny = bH.target - bH.off; lines.push({ key: 'h' + bH.target, points: [0, bH.target, pageW, bH.target] }); }
    return { nx, ny, lines };
  }

  // Top-left page bbox of a live-dragging konva node (circles report center).
  function liveBBox(konvaNode, node) {
    let x = konvaNode.x(), y = konvaNode.y();
    if (node.type === 'shape' && node.shape === 'circle') { x -= node.w / 2; y -= node.h / 2; }
    return { x, y, w: node.w, h: node.h };
  }

  // Begin dragging: if the grabbed node is part of a multi-selection, snapshot
  // every selected node's konva position so the whole group can follow.
  function handleDragStart(e, node) {
    if (selectedIds.length > 1 && selectedIds.includes(node.id)) {
      const stage = stageRef.current;
      const starts = {};
      for (const id of selectedIds) {
        const kn = stage?.findOne('#' + id);
        if (kn) starts[id] = { x: kn.x(), y: kn.y() };
      }
      groupDragRef.current = { starts, leadId: node.id };
    } else {
      groupDragRef.current = null;
    }
  }

  function handleDragMove(e, node) {
    const g = groupDragRef.current;
    // Group drag: translate every other selected node by the lead's delta.
    // Snapping is skipped for groups to keep the relative layout intact.
    if (g && g.leadId === node.id) {
      const lead = e.target;
      const dx = lead.x() - g.starts[node.id].x;
      const dy = lead.y() - g.starts[node.id].y;
      const stage = stageRef.current;
      for (const id of Object.keys(g.starts)) {
        if (id === node.id) continue;
        const kn = stage?.findOne('#' + id);
        if (kn) { kn.x(g.starts[id].x + dx); kn.y(g.starts[id].y + dy); }
      }
      return;
    }
    if (!snapEnabled) return;
    const kn = e.target;
    const { x, y, w, h } = liveBBox(kn, node);
    const { nx, ny, lines } = computeSnap(node.id, x, y, w, h);
    const isCircle = node.type === 'shape' && node.shape === 'circle';
    kn.x(isCircle ? nx + node.w / 2 : nx);
    kn.y(isCircle ? ny + node.h / 2 : ny);
    setGuides(lines);
  }

  // Drag end: bake the dragged node's (and, for a group drag, every selected
  // node's) final konva position into the document in ONE commit. Doing it in
  // a single mutation avoids the stale-closure race where a second commit in
  // the same tick would revert the first. Circles store a top-left bbox, so
  // convert their center back. Rotation/scale aren't touched by a drag —
  // onTransformEnd handles those.
  function handleNodeDragEnd(node) {
    if (guides.length) setGuides([]);
    const stage = stageRef.current;
    const g = groupDragRef.current;
    const ids = (g && g.leadId === node.id) ? selectedIds : [node.id];
    const set = new Set(ids);
    mutatePage(p => ({
      ...p,
      nodes: (p.nodes || []).map(n => {
        if (!set.has(n.id)) return n;
        const kn = stage?.findOne('#' + n.id);
        if (!kn) return n;
        let x = kn.x(), y = kn.y();
        if (n.type === 'shape' && n.shape === 'circle') { x -= n.w / 2; y -= n.h / 2; }
        return { ...n, x: Math.round(x), y: Math.round(y) };
      })
    }));
    groupDragRef.current = null;
  }

  // Transform end: bake scale → w/h (and rotation/position) for the dragged
  // node, or for the whole selection on a group transform, in ONE commit.
  // The Transformer fires transformend once PER attached node, so a guard ref
  // makes only the first call of a gesture do the work (it already resets
  // every selected node's scale), keeping it to a single undo step.
  const transformGuardRef = useRef(false);
  function handleNodeTransformEnd(node) {
    if (transformGuardRef.current) return;
    transformGuardRef.current = true;
    requestAnimationFrame(() => { transformGuardRef.current = false; });

    const stage = stageRef.current;
    const ids = selectedIds.length > 1 && selectedIds.includes(node.id) ? selectedIds : [node.id];
    const set = new Set(ids);
    mutatePage(p => ({
      ...p,
      nodes: (p.nodes || []).map(n => {
        if (!set.has(n.id)) return n;
        const kn = stage?.findOne('#' + n.id);
        if (!kn) return n;
        const sx = kn.scaleX(), sy = kn.scaleY();
        let patch;
        if (n.type === 'shape' && n.shape === 'circle') {
          const r = kn.radius() * Math.max(sx, sy);
          patch = { x: Math.round(kn.x() - r), y: Math.round(kn.y() - r), w: Math.round(r * 2), h: Math.round(r * 2), rotation: Math.round(kn.rotation()) };
        } else {
          patch = {
            x: Math.round(kn.x()), y: Math.round(kn.y()),
            w: Math.max(10, Math.round(n.w * sx)), h: Math.max(10, Math.round(n.h * sy)),
            rotation: Math.round(kn.rotation())
          };
          if (n.type === 'text' && n.autoWidth && Math.abs(sx - 1) > 0.001) patch.autoWidth = false;
        }
        kn.scaleX(1); kn.scaleY(1);
        return { ...n, ...patch };
      })
    }));
  }

  // Align the multi-selection within its own bounding box.
  function alignSelected(dir) {
    if (selectedIds.length < 2) return;
    const set = new Set(selectedIds);
    const sel = (page?.nodes || []).filter(n => set.has(n.id));
    const minX = Math.min(...sel.map(n => n.x)), maxX = Math.max(...sel.map(n => n.x + n.w));
    const minY = Math.min(...sel.map(n => n.y)), maxY = Math.max(...sel.map(n => n.y + n.h));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    mutatePage(p => ({
      ...p,
      nodes: (p.nodes || []).map(n => {
        if (!set.has(n.id)) return n;
        let { x, y } = n;
        if (dir === 'left') x = minX; else if (dir === 'right') x = maxX - n.w; else if (dir === 'hcenter') x = cx - n.w / 2;
        else if (dir === 'top') y = minY; else if (dir === 'bottom') y = maxY - n.h; else if (dir === 'vcenter') y = cy - n.h / 2;
        return { ...n, x: Math.round(x), y: Math.round(y) };
      })
    }));
  }

  // ---------- Document palette (shared with every ColorPicker) ---------------
  const palette = doc.palette || [];
  function addSwatch(hex) {
    if (!hex) return;
    const h = hex.toLowerCase();
    if (palette.some(c => c.toLowerCase() === h)) return;
    commit({ ...doc, palette: [...palette, hex] });
  }
  function removeSwatch(hex) {
    commit({ ...doc, palette: palette.filter(c => c.toLowerCase() !== hex.toLowerCase()) });
  }
  const paletteCtx = { palette, addSwatch, removeSwatch };

  // ---------- PNG export -----------------------------------------------------
  // Hide selection/guides/grid for one frame, snapshot the stage at native
  // page resolution (undo the on-screen scale via pixelRatio), then restore.
  function exportPng() { setSelectedIds([]); setExporting(true); }
  useEffect(() => {
    if (!exporting) return;
    const raf = requestAnimationFrame(() => {
      try {
        const url = stageRef.current?.toDataURL({ pixelRatio: 1 / (stageScale || 1) });
        if (url) {
          const a = document.createElement('a');
          a.download = `${(menu.name || 'menu').replace(/\s+/g, '-')}-pagina-${pageIndex + 1}.png`;
          a.href = url;
          a.click();
        }
      } catch (err) {
        showAlert?.('Error al exportar', err.message);
      }
      setExporting(false);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exporting]);

  // ---------- Ruler guides --------------------------------------------------
  const pageGuides = page?.guides || { v: [], h: [] };

  function addGuide(axis, pos) {
    mutatePage(p => {
      const g = p.guides || { v: [], h: [] };
      return { ...p, guides: { ...g, [axis]: [...(g[axis] || []), pos] } };
    });
  }
  function updateGuide(axis, index, pos) {
    mutatePage(p => {
      const g = p.guides || { v: [], h: [] };
      const arr = [...(g[axis] || [])]; arr[index] = pos;
      return { ...p, guides: { ...g, [axis]: arr } };
    });
  }
  function removeGuide(axis, index) {
    mutatePage(p => {
      const g = p.guides || { v: [], h: [] };
      return { ...p, guides: { ...g, [axis]: (g[axis] || []).filter((_, i) => i !== index) } };
    });
  }

  // Convert a pointer event to a page coordinate on the chosen axis.
  function pointerToPage(ev, axis) {
    const box = stageBoxRef.current?.getBoundingClientRect();
    if (!box) return 0;
    const raw = axis === 'h' ? (ev.clientY - box.top) : (ev.clientX - box.left);
    return Math.round(raw / (stageScale || 1));
  }

  // Begin pulling a brand-new guide out of a ruler. Top ruler (x) spawns a
  // horizontal guide; left ruler (y) spawns a vertical one — matching how
  // design tools map rulers to guide orientation.
  function startGuideFromRuler(axis, ev) {
    ev.preventDefault();
    const pos = pointerToPage(ev, axis);
    activePosRef.current = pos;
    setActiveGuide({ axis, index: null, pos });
  }
  // Begin repositioning an existing guide.
  function startDragGuide(axis, index, ev) {
    ev.preventDefault();
    ev.stopPropagation();
    const pos = (pageGuides[axis] || [])[index] ?? 0;
    activePosRef.current = pos;
    setActiveGuide({ axis, index, pos });
  }

  useEffect(() => {
    if (!activeGuide) return;
    const axis = activeGuide.axis;
    const index = activeGuide.index;
    function move(ev) {
      const pos = pointerToPage(ev, axis);
      activePosRef.current = pos;
      setActiveGuide(g => g ? { ...g, pos } : g);
    }
    function up() {
      const pos = activePosRef.current;
      const dim = axis === 'h' ? pageH : pageW;
      const inside = pos >= 0 && pos <= dim;
      if (index == null) {
        if (inside) addGuide(axis, pos);       // dropped on canvas → keep
      } else if (inside) {
        updateGuide(axis, index, pos);
      } else {
        removeGuide(axis, index);              // dragged off → delete
      }
      setActiveGuide(null);
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    // Re-bind only when the drag identity or geometry changes — pos lives in a
    // ref so per-move state updates don't thrash the listeners.
  }, [activeGuide?.axis, activeGuide?.index, stageScale, pageW, pageH, doc, pageIndex]);

  return (
   <PaletteContext.Provider value={paletteCtx}>
    <div style={overlay} onContextMenu={e => e.preventDefault()}>
      <Topbar
        menuName={menu.name}
        dirty={dirty}
        saving={saving}
        onUndo={undo}
        onRedo={redo}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onSave={save}
        onClose={tryClose}
        onPrint={openPrint}
        onExportPng={exportPng}
        showRulers={showRulers} onToggleRulers={() => setShowRulers(v => !v)}
        showGrid={showGrid} onToggleGrid={() => setShowGrid(v => !v)}
        snapEnabled={snapEnabled} onToggleSnap={() => setSnapEnabled(v => !v)}
      />

      <PageTabs
        doc={doc}
        pageIndex={pageIndex}
        onSelect={i => { setPageIndex(i); setSelectedIds([]); }}
        onAdd={addPage}
        onDelete={deletePage}
      />

      <div style={mainRow}>
        <Toolbar
          onAddText={() => addNode({
            type: 'text', autoWidth: true, x: pageW / 2 - 200, y: pageH / 2 - 40, w: 240, h: 64, rotation: 0,
            text: 'Texto', style: { fontFamily: 'Georgia, serif', fontSize: 48, fontWeight: 700, color: '#111', align: 'left' }
          })}
          onAddRect={() => addNode({
            type: 'shape', shape: 'rect', x: pageW / 2 - 150, y: pageH / 2 - 100, w: 300, h: 200, rotation: 0,
            style: { fill: '#f28b05', stroke: 'transparent', strokeWidth: 0, borderRadius: 0 }
          })}
          onAddCircle={() => addNode({
            type: 'shape', shape: 'circle', x: pageW / 2 - 100, y: pageH / 2 - 100, w: 200, h: 200, rotation: 0,
            style: { fill: '#1c2a3a', stroke: 'transparent', strokeWidth: 0 }
          })}
          onAddImage={() => {
            setAssetPickerCb(() => (url) => {
              addNode({ type: 'image', x: 200, y: 200, w: 600, h: 400, rotation: 0, src: url, fit: 'cover' });
              setAssetPickerCb(null);
            });
          }}
          onAddBinding={() => {
            setItemPickerCb(() => (itemIds) => {
              // Materialize-on-drop: one binding node per id, stacked
              // vertically starting near page center. User can rearrange
              // freely after — the set of nodes is fixed at design time
              // (renames/new items don't auto-appear), but each node's
              // displayed data is live via the RPC.
              const baseX = Math.round(pageW * 0.1);
              const baseY = Math.round(pageH * 0.2);
              const rowH = 96;
              const rowGap = 16;
              const created = itemIds.map((id, i) => ({
                type: 'item-binding',
                x: baseX, y: baseY + i * (rowH + rowGap),
                w: Math.round(pageW * 0.8), h: rowH,
                rotation: 0,
                item_id: id,
                fields: ['emoji', 'name', 'price'],
                layout: 'inline',
                style: { fontFamily: 'Georgia, serif', fontSize: 48, fontWeight: 600, color: '#111', align: 'left' }
              }));
              // Commit all at once so undo treats it as one step.
              const z0 = nextZ(page);
              const withIds = created.map((n, i) => ({ id: nanoid(8), z: z0 + i, ...n }));
              mutatePage(p => ({ ...p, nodes: [...(p.nodes || []), ...withIds] }));
              setSelectedIds(withIds.map(n => n.id));
              setItemPickerCb(null);
            });
          }}
        />

        <div ref={stageWrapRef} style={stageArea}>
          <div style={showRulers
            ? { display: 'grid', gridTemplateColumns: `${RULER}px auto`, gridTemplateRows: `${RULER}px auto` }
            : undefined}>
            {showRulers && <div style={{ background: '#161b22', borderRight: '1px solid #30363d', borderBottom: '1px solid #30363d' }} />}
            {showRulers && <Ruler axis="x" pageSize={pageW} scale={stageScale} onStart={e => startGuideFromRuler('h', e)} />}
            {showRulers && <Ruler axis="y" pageSize={pageH} scale={stageScale} onStart={e => startGuideFromRuler('v', e)} />}
            <div ref={stageBoxRef} style={{ position: 'relative', width: pageW * stageScale, height: pageH * stageScale, boxShadow: '0 12px 40px rgba(0,0,0,0.35)' }}>
              <Stage
                ref={stageRef}
                width={pageW * stageScale}
                height={pageH * stageScale}
                scaleX={stageScale}
                scaleY={stageScale}
                onMouseDown={onStageMouseDown}
                onMouseMove={onStageMouseMove}
                onMouseUp={onStageMouseUp}
                onTouchStart={onStageMouseDown}
                style={{ background: page.background }}
              >
                {showGrid && !exporting && (
                  <Layer listening={false}>
                    <GridOverlay pageW={pageW} pageH={pageH} />
                  </Layer>
                )}
                <Layer>
                  {/* Opaque page background so PNG export isn't transparent. */}
                  <Rect x={0} y={0} width={pageW} height={pageH} fill={page.background || '#ffffff'} listening={false} />
                  {sortedNodes(page).map(node => (
                    <NodeKonva
                      key={node.id}
                      node={node}
                      menuData={menuData}
                      fontEpoch={fontEpoch}
                      isSelected={selectedIds.includes(node.id)}
                      onSelect={e => (e?.evt?.shiftKey ? toggleSelect(node.id) : selectOne(node.id))}
                      onChange={patch => updateNode(node.id, patch)}
                      onMeasure={updateNodeSilent}
                      onDragStart={e => handleDragStart(e, node)}
                      onDragMove={e => handleDragMove(e, node)}
                      onNodeDragEnd={handleNodeDragEnd}
                      onNodeTransformEnd={handleNodeTransformEnd}
                    />
                  ))}
                  {!exporting && <SelectionTransformer selectedIds={selectedIds} />}
                </Layer>
                <Layer listening={false}>
                  {!exporting && guides.map(g => (
                    <Line key={g.key} points={g.points} stroke="#ff3b9a" strokeWidth={1 / stageScale} dash={[6 / stageScale, 4 / stageScale]} />
                  ))}
                  {marquee && (
                    <Rect
                      x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h}
                      fill="rgba(31,111,235,0.12)" stroke="#1f6feb" strokeWidth={1 / stageScale} dash={[4 / stageScale, 3 / stageScale]}
                    />
                  )}
                </Layer>
              </Stage>
              <GuidesOverlay
                guides={pageGuides}
                scale={stageScale}
                activeGuide={activeGuide}
                onStartDragGuide={startDragGuide}
              />
            </div>
          </div>
        </div>

        <PropertiesPanel
          doc={doc}
          page={page}
          changePageBg={changePageBg}
          changePageSize={changePageSize}
          selected={selected}
          multiCount={selectedIds.length}
          onAlign={dir => alignSelected(dir)}
          onUpdate={patch => selected && updateNode(selected.id, patch)}
          onSetFont={(stack, url) => selected && setNodeFont(selected.id, stack, url)}
          onDelete={() => selected && removeNode(selected.id)}
          onForward={() => selected && bringForward(selected.id)}
          onBack={() => selected && sendBack(selected.id)}
          openAssetPicker={(cb) => setAssetPickerCb(() => (url) => { cb(url); setAssetPickerCb(null); })}
          openItemPicker={(cb) => setItemPickerCb(() => (ids) => { cb(ids); setItemPickerCb(null); })}
          menuData={menuData}
        />
      </div>

      {assetPickerCb && (
        <AssetPicker
          menuId={menu.id}
          onPick={assetPickerCb}
          onClose={() => setAssetPickerCb(null)}
        />
      )}

      {itemPickerCb && (
        <ItemPicker
          menuData={menuData}
          onPick={itemPickerCb}
          onClose={() => setItemPickerCb(null)}
        />
      )}
    </div>
   </PaletteContext.Provider>
  );
}

function sortedNodes(page) {
  return [...(page?.nodes || [])].sort((a, b) => (a.z || 0) - (b.z || 0));
}

function nextZ(page) {
  const max = (page?.nodes || []).reduce((m, n) => Math.max(m, n.z || 0), -1);
  return max + 1;
}

// Axis-aligned rectangle overlap (used for marquee hit-testing).
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

const RULER = 22; // px gutter for the on-screen rulers

// Pick a "nice" tick spacing (in page px) so labels stay readable at the
// current zoom — aim for ticks ~80px apart on screen.
function tickStep(scale) {
  const target = 80 / (scale || 1);
  const steps = [50, 100, 200, 250, 500, 1000];
  return steps.find(s => s >= target) || 1000;
}

// SVG ruler along the top (x) or left (y) of the stage, labelled in page px.
// Pressing on it starts pulling a guide (onStart).
function Ruler({ axis, pageSize, scale, onStart }) {
  const px = pageSize * scale;
  const step = tickStep(scale);
  const ticks = [];
  for (let v = 0; v <= pageSize; v += step) ticks.push(v);
  const isX = axis === 'x';
  return (
    <svg
      width={isX ? px : RULER}
      height={isX ? RULER : px}
      onMouseDown={onStart}
      style={{ background: '#161b22', display: 'block', cursor: isX ? 'row-resize' : 'col-resize', borderRight: isX ? 'none' : '1px solid #30363d', borderBottom: isX ? '1px solid #30363d' : 'none' }}
    >
      {ticks.map(v => {
        const p = v * scale;
        return isX ? (
          <g key={v}>
            <line x1={p} y1={RULER - 6} x2={p} y2={RULER} stroke="#586069" strokeWidth={1} />
            <text x={p + 2} y={10} fill="#8b949e" fontSize={9} fontFamily="system-ui">{v}</text>
          </g>
        ) : (
          <g key={v}>
            <line x1={RULER - 6} y1={p} x2={RULER} y2={p} stroke="#586069" strokeWidth={1} />
            <text x={2} y={p + 9} fill="#8b949e" fontSize={9} fontFamily="system-ui">{v}</text>
          </g>
        );
      })}
    </svg>
  );
}

// Faint full-page grid drawn inside the (scaled) stage. Page coordinates, so
// the lines track the document, not the screen.
function GridOverlay({ pageW, pageH, step = 120 }) {
  const lines = [];
  for (let x = step; x < pageW; x += step) lines.push(<Line key={'gx' + x} points={[x, 0, x, pageH]} stroke="rgba(127,127,127,0.18)" strokeWidth={1} />);
  for (let y = step; y < pageH; y += step) lines.push(<Line key={'gy' + y} points={[0, y, pageW, y]} stroke="rgba(127,127,127,0.18)" strokeWidth={1} />);
  return <>{lines}</>;
}

// DOM overlay (above the Konva stage) that draws the persistent ruler guides
// in page coords scaled to screen, plus the in-flight guide preview. Only the
// thin grab strips capture pointer events; everything else stays click-through
// so node interaction is unaffected. Drawn in DOM rather than Konva to keep
// the screen-space hit math simple under the stage's scale transform.
const GUIDE_COLOR = '#19c3d6';
function GuidesOverlay({ guides, scale, activeGuide, onStartDragGuide }) {
  const dragging = activeGuide; // { axis, index, pos } or null
  function lineStyle(axis, pos) {
    return axis === 'v'
      ? { position: 'absolute', left: pos * scale, top: 0, width: 1, height: '100%', background: GUIDE_COLOR, pointerEvents: 'none' }
      : { position: 'absolute', top: pos * scale, left: 0, height: 1, width: '100%', background: GUIDE_COLOR, pointerEvents: 'none' };
  }
  function hitStyle(axis, pos) {
    return axis === 'v'
      ? { position: 'absolute', left: pos * scale - 4, top: 0, width: 9, height: '100%', cursor: 'col-resize', pointerEvents: 'auto' }
      : { position: 'absolute', top: pos * scale - 4, left: 0, height: 9, width: '100%', cursor: 'row-resize', pointerEvents: 'auto' };
  }
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {['v', 'h'].flatMap(axis => (guides[axis] || []).map((pos, i) => {
        // Hide the guide that's currently being dragged; the preview shows it.
        if (dragging && dragging.index === i && dragging.axis === axis) return null;
        return (
          <div key={axis + i}>
            <div style={lineStyle(axis, pos)} />
            <div style={hitStyle(axis, pos)} onMouseDown={e => onStartDragGuide(axis, i, e)} />
          </div>
        );
      }))}
      {dragging && (
        <>
          <div style={{ ...lineStyle(dragging.axis, dragging.pos), background: GUIDE_COLOR, boxShadow: `0 0 0 1px ${GUIDE_COLOR}` }} />
          <div style={dragging.axis === 'v'
            ? { position: 'absolute', left: dragging.pos * scale + 4, top: 4, padding: '1px 5px', background: GUIDE_COLOR, color: '#06222a', fontSize: 10, fontWeight: 800, borderRadius: 3, pointerEvents: 'none' }
            : { position: 'absolute', top: dragging.pos * scale + 4, left: 4, padding: '1px 5px', background: GUIDE_COLOR, color: '#06222a', fontSize: 10, fontWeight: 800, borderRadius: 3, pointerEvents: 'none' }}>
            {dragging.pos}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Konva node renderers
// ============================================================================

function NodeKonva({ node, menuData, fontEpoch = 0, isSelected, onSelect, onChange, onMeasure, onDragStart, onDragMove, onNodeDragEnd, onNodeTransformEnd }) {
  const shapeRef = useRef(null);

  // Auto-width text: after each render, read the konva-measured size and
  // persist it (silently) so the doc box matches the glyphs everywhere.
  useEffect(() => {
    if (node.type !== 'text' || !node.autoWidth) return;
    const n = shapeRef.current;
    if (!n) return;
    const w = Math.ceil(n.width());
    const h = Math.ceil(n.height());
    if (w > 0 && (Math.abs(w - node.w) > 1 || Math.abs(h - node.h) > 1)) onMeasure?.(node.id, { w, h });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.type, node.autoWidth, node.text, node.w, node.h, node.style?.fontFamily, node.style?.fontSize, node.style?.fontWeight, fontEpoch]);

  // Drag end and transform end are baked into the document by the parent (so
  // group gestures land in a single, undoable commit). See handleNodeDragEnd
  // / handleNodeTransformEnd in CanvasEditor.
  const common = {
    ref: shapeRef,
    id: node.id,
    x: node.x, y: node.y, rotation: node.rotation || 0,
    draggable: true,
    onClick: onSelect, onTap: onSelect,
    onDragStart,
    onDragMove,
    onDragEnd: () => onNodeDragEnd?.(node),
    onTransformEnd: () => onNodeTransformEnd?.(node)
  };

  if (node.type === 'text') {
    const s = node.style || {};
    // Auto-width text hugs its glyphs: render with no fixed width so Konva
    // measures it, then persist the measured w/h back (silently, no undo
    // entry) so snapping/transform/public render all agree. Fixed text keeps
    // its authored box. The font key forces a remount so stale glyph metrics
    // don't linger when the font/size/weight changes.
    const auto = !!node.autoWidth;
    return (
      <Text
        key={`${s.fontFamily}-${s.fontSize}-${s.fontWeight}-${fontEpoch}-${auto}`}
        {...common}
        text={node.text || ''}
        width={auto ? undefined : node.w}
        height={auto ? undefined : node.h}
        wrap={auto ? 'none' : 'word'}
        fontFamily={s.fontFamily || 'Georgia, serif'}
        fontSize={s.fontSize || 24}
        fontStyle={`${s.fontStyle || 'normal'} ${s.fontWeight || 400}`.trim()}
        fill={s.color || '#111'}
        align={s.align || 'left'}
        verticalAlign={auto ? 'top' : 'middle'}
      />
    );
  }

  if (node.type === 'shape' && node.shape === 'circle') {
    const s = node.style || {};
    return (
      <Circle
        {...common}
        x={node.x + node.w / 2}
        y={node.y + node.h / 2}
        radius={Math.min(node.w, node.h) / 2}
        fill={s.fill || '#ccc'}
        stroke={s.stroke || undefined}
        strokeWidth={s.strokeWidth || 0}
        // Drag end and transform end (incl. circle center→bbox + radius
        // conversion) are baked by the parent via `common`.
      />
    );
  }

  if (node.type === 'shape') {
    const s = node.style || {};
    return (
      <Rect
        {...common}
        width={node.w} height={node.h}
        fill={s.fill || '#ccc'}
        stroke={s.stroke || undefined}
        strokeWidth={s.strokeWidth || 0}
        cornerRadius={s.borderRadius || 0}
      />
    );
  }

  if (node.type === 'image') {
    return <KonvaImageNode node={node} common={common} fit={node.fit || 'cover'} />;
  }

  if (node.type === 'item-binding') {
    return <BindingPlaceholder node={node} common={common} menuData={menuData} fontEpoch={fontEpoch} />;
  }

  // Unknown — render a dashed outline so the user can see + delete it.
  return (
    <Rect {...common} width={node.w} height={node.h} stroke="#888" strokeWidth={1} dash={[6, 4]} fill="rgba(0,0,0,0.04)" />
  );
}

// Image node. Rendered as a stable Group (the draggable/transform target) with
// a transparent box Rect defining the bounds and the bitmap inside it, so the
// konva node identity never swaps as the image loads — that swap was leaving a
// detached transformer ghost behind. `fit` honours the Ajuste control:
//   cover   → fill the box, centre-crop (no distortion)
//   contain → fit inside the box, letterboxed + centred (no distortion)
function KonvaImageNode({ node, common, fit }) {
  const [img, setImg] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setImg(null); setFailed(false);
    const i = new window.Image();
    i.crossOrigin = 'anonymous';
    i.src = node.src;
    i.onload = () => setImg(i);
    i.onerror = () => setFailed(true);
  }, [node.src]);

  const w = node.w, h = node.h;
  let inner = null;
  if (img) {
    if (fit === 'contain') {
      const s = Math.min(w / img.width, h / img.height);
      const dw = img.width * s, dh = img.height * s;
      inner = <KImage image={img} x={(w - dw) / 2} y={(h - dh) / 2} width={dw} height={dh} listening={false} />;
    } else {
      // cover: crop the source to the box's aspect ratio.
      const ar = w / h, iar = img.width / img.height;
      let cw, ch, cx, cy;
      if (iar > ar) { ch = img.height; cw = img.height * ar; cx = (img.width - cw) / 2; cy = 0; }
      else { cw = img.width; ch = img.width / ar; cx = 0; cy = (img.height - ch) / 2; }
      inner = <KImage image={img} width={w} height={h} crop={{ x: cx, y: cy, width: cw, height: ch }} listening={false} />;
    }
  }

  return (
    <Group {...common}>
      <Rect
        width={w} height={h}
        fill={img ? 'transparent' : 'rgba(120,120,120,0.12)'}
        stroke={failed ? '#c33' : undefined}
        strokeWidth={failed ? 2 : 0}
        dash={failed ? [4, 4] : undefined}
      />
      {inner}
    </Group>
  );
}

// Editor preview for item-binding nodes. Renders the same fields the
// public ItemBindingView does — emoji + name + price respecting the
// `fields` array and `layout` — so the user sees toggle effects live.
// Background/stroke/borderRadius come from node.style so visual edits
// match what customers will see. Unbound nodes get a faint dashed
// outline so they're discoverable.
function BindingPlaceholder({ node, common, menuData, fontEpoch = 0 }) {
  const idx = useMemo(() => {
    const m = new Map();
    Object.values(menuData?.categories || {}).flat().forEach(it => m.set(it.id, it));
    return m;
  }, [menuData]);
  const item = idx.get(node.item_id);
  const s = node.style || {};
  const fields = node.fields && node.fields.length > 0 ? node.fields : ['name', 'price'];
  const stacked = node.layout === 'stacked';
  const fontSize = s.fontSize || 48;
  const color = s.color || '#111';
  const fontFamily = s.fontFamily || 'Georgia, serif';
  const align = s.align || 'left';
  const fontStyleStr = `${s.fontWeight || 400}`;
  const pad = s.padding ?? 8;

  // Build the parts in the order specified by `fields`.
  const showEmoji = fields.includes('emoji') && item?.emoji;
  const showImage = fields.includes('image') && item?.image_url;
  const showName  = fields.includes('name');
  const showPrice = fields.includes('price');

  const nameText = item ? item.name : `(item ${node.item_id || '—'})`;
  const priceText = item
    ? (item.basePrice != null ? formatPrice(item.basePrice) : '')
    : '';

  // For inline layout we paint everything in one Text node with separators
  // so Konva measures the line as a single unit (no Flexbox in Konva). For
  // stacked we stack two Texts: name row + price row.
  const inlineParts = [];
  if (showEmoji) inlineParts.push(item.emoji);
  if (showName)  inlineParts.push(nameText);
  if (showPrice && priceText) inlineParts.push(priceText);
  const inlineText = inlineParts.join('   ');

  const bg = s.fill || 'transparent';
  const stroke = s.stroke && (s.strokeWidth || 0) > 0 ? s.stroke : (item ? undefined : '#f28b05');
  const strokeWidth = stroke ? (s.strokeWidth || (item ? 0 : 2)) : 0;
  const dash = item ? undefined : [6, 6];

  return (
    <Group {...common}>
      <Rect
        width={node.w} height={node.h}
        fill={bg}
        stroke={stroke}
        strokeWidth={strokeWidth}
        dash={dash}
        cornerRadius={s.borderRadius || 0}
      />
      {showImage && (
        // Use a placeholder rect for the image area in the editor — Konva
        // image loading is expensive when many bindings exist. Public
        // renderer shows the actual photo.
        <Rect
          x={pad} y={pad}
          width={Math.max(0, Math.min(node.h - pad * 2, node.w * 0.25))}
          height={Math.max(0, node.h - pad * 2)}
          fill="rgba(0,0,0,0.08)"
          cornerRadius={6}
        />
      )}
      {/* Same metric-cache workaround as text nodes — see comment above. */}
      {!stacked && (
        <Text
          key={`${fontFamily}-${fontSize}-${fontStyleStr}-${fontEpoch}`}
          x={pad} y={0}
          width={Math.max(0, node.w - pad * 2)}
          height={node.h}
          text={inlineText}
          fontFamily={fontFamily}
          fontSize={fontSize}
          fontStyle={fontStyleStr}
          fill={color}
          align={align}
          verticalAlign="middle"
        />
      )}
      {stacked && (
        <>
          <Text
            key={`name-${fontFamily}-${fontSize}-${fontStyleStr}-${fontEpoch}`}
            x={pad} y={pad}
            width={Math.max(0, node.w - pad * 2)}
            height={node.h - pad * 2}
            text={[showEmoji ? item.emoji : '', showName ? nameText : ''].filter(Boolean).join(' ')}
            fontFamily={fontFamily}
            fontSize={fontSize}
            fontStyle={fontStyleStr}
            fill={color}
            align={align}
            verticalAlign="top"
          />
          {showPrice && priceText && (
            <Text
              key={`price-${fontFamily}-${fontSize}-${fontStyleStr}-${fontEpoch}`}
              x={pad} y={node.h - fontSize * 0.9 - pad}
              width={Math.max(0, node.w - pad * 2)}
              text={priceText}
              fontFamily={fontFamily}
              fontSize={fontSize * 0.9}
              fontStyle={fontStyleStr}
              fill={color}
              align={align}
            />
          )}
        </>
      )}
    </Group>
  );
}

// Editor-only price helper — menuData prices are in cents on `basePrice`.
// We can't read the shop's locale here, so just render with two decimals
// and a dollar sign as a visual proxy; the public renderer uses the real
// formatForDisplay() utility.
function formatPrice(cents) {
  const n = Math.round(cents || 0) / 100;
  return `$${n.toFixed(2)}`;
}

// Transformer follows whichever node is currently selected. The attach runs
// on EVERY render (no dep array) on purpose: text/binding nodes remount when
// their font key changes and image nodes resolve async, so the konva instance
// behind a given id can be replaced — re-finding it each render keeps the
// transformer on the live node and prevents a detached "ghost" box.
function SelectionTransformer({ selectedIds }) {
  const trRef = useRef(null);
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const stage = tr.getStage();
    const nodes = (selectedIds || []).map(id => stage.findOne(`#${id}`)).filter(Boolean);
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });
  return (
    <Transformer
      ref={trRef}
      rotateEnabled={true}
      ignoreStroke={true}
      padding={0}
      anchorSize={10}
      borderStroke="#1f6feb"
      anchorStroke="#1f6feb"
      anchorFill="white"
    />
  );
}

// ============================================================================
// Chrome
// ============================================================================

function Topbar({ menuName, dirty, saving, onUndo, onRedo, canUndo, canRedo, onSave, onClose, onPrint, onExportPng, showRulers, onToggleRulers, showGrid, onToggleGrid, snapEnabled, onToggleSnap }) {
  const toggle = on => ({ ...ghostBtn, background: on ? 'rgba(31,111,235,0.35)' : 'transparent' });
  return (
    <div style={topbar}>
      <button onClick={onClose} style={ghostBtn} title="Cerrar editor">
        <Icon icon="lucide:x" /> Cerrar
      </button>
      <div style={{ flex: 1, color: 'rgba(255,255,255,0.85)', fontWeight: 800 }}>
        Editor de lienzo — {menuName} {dirty && <span style={{ color: '#ffb84d', fontWeight: 700, marginLeft: 6 }}>•</span>}
      </div>
      <button onClick={onToggleSnap} style={toggle(snapEnabled)} title="Ajuste y guías inteligentes"><Icon icon="lucide:magnet" /></button>
      <button onClick={onToggleRulers} style={toggle(showRulers)} title="Reglas"><Icon icon="lucide:ruler" /></button>
      <button onClick={onToggleGrid} style={toggle(showGrid)} title="Cuadrícula"><Icon icon="lucide:grid-3x3" /></button>
      <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />
      <button onClick={onUndo} disabled={!canUndo} style={ghostBtn} title="Deshacer (Ctrl+Z)"><Icon icon="lucide:undo-2" /></button>
      <button onClick={onRedo} disabled={!canRedo} style={ghostBtn} title="Rehacer (Ctrl+Shift+Z)"><Icon icon="lucide:redo-2" /></button>
      <button onClick={onExportPng} style={ghostBtn} title="Exportar página como PNG"><Icon icon="lucide:image-down" /> PNG</button>
      <button onClick={onPrint} style={ghostBtn} title="Vista previa de impresión"><Icon icon="lucide:printer" /> Imprimir</button>
      <button onClick={onSave} disabled={saving} style={primaryBtn}>
        <Icon icon={saving ? 'lucide:loader' : 'lucide:save'} /> {saving ? 'Guardando…' : 'Guardar'}
      </button>
    </div>
  );
}

function PageTabs({ doc, pageIndex, onSelect, onAdd, onDelete }) {
  return (
    <div style={pageTabs}>
      {doc.pages.map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => onSelect(i)} style={{
            ...ghostBtn,
            background: i === pageIndex ? 'rgba(255,255,255,0.18)' : 'transparent',
            color: 'white', fontWeight: 800
          }}>
            Página {i + 1}
          </button>
          {doc.pages.length > 1 && (
            <button onClick={() => onDelete(i)} style={{ ...ghostBtn, padding: '6px', color: '#ff9595' }} title="Eliminar página">
              <Icon icon="lucide:trash-2" />
            </button>
          )}
        </div>
      ))}
      <button onClick={onAdd} style={ghostBtn}><Icon icon="lucide:plus" /> Página</button>
    </div>
  );
}

function Toolbar({ onAddText, onAddRect, onAddCircle, onAddImage, onAddBinding }) {
  return (
    <div style={toolbar}>
      <ToolBtn icon="lucide:type" label="Texto" onClick={onAddText} />
      <ToolBtn icon="lucide:square" label="Rect" onClick={onAddRect} />
      <ToolBtn icon="lucide:circle" label="Círculo" onClick={onAddCircle} />
      <ToolBtn icon="lucide:image" label="Imagen" onClick={onAddImage} />
      <div style={{ height: 1, background: 'rgba(255,255,255,0.15)', margin: '4px 0' }} />
      <ToolBtn icon="lucide:link" label="Producto" onClick={onAddBinding} />
    </div>
  );
}

function ToolBtn({ icon, label, onClick }) {
  return (
    <button onClick={onClick} style={toolBtnStyle}>
      <Icon icon={icon} style={{ fontSize: '1.3rem' }} />
      <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.02em' }}>{label}</span>
    </button>
  );
}

function PropertiesPanel({ doc, page, changePageBg, changePageSize, selected, multiCount, onAlign, onUpdate, onSetFont, onDelete, onForward, onBack, openAssetPicker, openItemPicker, menuData }) {
  return (
    <aside style={propsPanel}>
      {multiCount > 1 ? (
        <MultiSelectProps count={multiCount} onAlign={onAlign} />
      ) : !selected ? (
        <PageProperties doc={doc} page={page} changePageBg={changePageBg} changePageSize={changePageSize} />
      ) : (
        <NodeProperties
          node={selected}
          onUpdate={onUpdate}
          onSetFont={onSetFont}
          onDelete={onDelete}
          onForward={onForward}
          onBack={onBack}
          openAssetPicker={openAssetPicker}
          openItemPicker={openItemPicker}
          menuData={menuData}
        />
      )}
    </aside>
  );
}

// Shown when 2+ nodes are selected: alignment tools for the group.
function MultiSelectProps({ count, onAlign }) {
  const aligns = [
    { dir: 'left', icon: 'lucide:align-start-vertical', label: 'Izq.' },
    { dir: 'hcenter', icon: 'lucide:align-center-vertical', label: 'Centro H' },
    { dir: 'right', icon: 'lucide:align-end-vertical', label: 'Der.' },
    { dir: 'top', icon: 'lucide:align-start-horizontal', label: 'Arriba' },
    { dir: 'vcenter', icon: 'lucide:align-center-horizontal', label: 'Centro V' },
    { dir: 'bottom', icon: 'lucide:align-end-horizontal', label: 'Abajo' }
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 style={panelTitle}>{count} seleccionados</h3>
      <p style={{ margin: 0, fontSize: '0.78rem', color: '#8b949e' }}>
        Arrastra cualquiera para moverlos juntos, o usa el recuadro para escalar/rotar el grupo.
      </p>
      <Row label="Alinear">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {aligns.map(a => (
            <button key={a.dir} onClick={() => onAlign(a.dir)} title={a.label} style={{ ...smallBtn, justifyContent: 'center', padding: '8px 4px' }}>
              <Icon icon={a.icon} />
            </button>
          ))}
        </div>
      </Row>
    </div>
  );
}

function PageProperties({ doc, page, changePageBg, changePageSize }) {
  const presetKey = presetKeyFor(doc.page_size) || '';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 style={panelTitle}>Documento</h3>
      <Row label="Tamaño de página">
        <select
          value={presetKey}
          onChange={e => changePageSize(e.target.value)}
          style={selectStyle}
        >
          {!presetKey && <option value="">Personalizado ({doc.page_size?.w}×{doc.page_size?.h})</option>}
          <optgroup label="Pantalla">
            {Object.entries(PAGE_PRESETS).filter(([, p]) => p.category === 'digital').map(([k, p]) => (
              <option key={k} value={k}>{p.label}</option>
            ))}
          </optgroup>
          <optgroup label="Impresión">
            {Object.entries(PAGE_PRESETS).filter(([, p]) => p.category === 'print').map(([k, p]) => (
              <option key={k} value={k}>{p.label}</option>
            ))}
          </optgroup>
        </select>
      </Row>
      <p style={{ margin: 0, fontSize: '0.72rem', color: '#777' }}>
        Aplica a todo el documento. Tamaños de impresión se usan al imprimir.
      </p>

      <h3 style={{ ...panelTitle, marginTop: 10 }}>Página actual</h3>
      <Row label="Fondo">
        <ColorPicker value={page.background || '#ffffff'} onChange={changePageBg} />
        <code style={{ fontSize: '0.78rem', color: '#aaa' }}>{page.background || '#ffffff'}</code>
      </Row>
      <p style={{ margin: 0, fontSize: '0.78rem', color: '#aaa' }}>
        Selecciona un objeto en el lienzo para editar sus propiedades.
      </p>
    </div>
  );
}

function NodeProperties({ node, onUpdate, onSetFont, onDelete, onForward, onBack, openAssetPicker, openItemPicker, menuData }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 style={panelTitle}>{labelForNode(node)}</h3>

      <Row label="Capa">
        <button onClick={onBack} style={smallBtn}><Icon icon="lucide:chevron-down" /> Atrás</button>
        <button onClick={onForward} style={smallBtn}><Icon icon="lucide:chevron-up" /> Adelante</button>
      </Row>

      <Row label="Posición">
        <NumInput value={node.x} onChange={v => onUpdate({ x: v })} suffix="X" />
        <NumInput value={node.y} onChange={v => onUpdate({ y: v })} suffix="Y" />
      </Row>
      <Row label="Tamaño">
        <NumInput value={node.w} onChange={v => onUpdate({ w: Math.max(10, v) })} suffix="W" />
        <NumInput value={node.h} onChange={v => onUpdate({ h: Math.max(10, v) })} suffix="H" />
      </Row>
      <Row label="Rotación">
        <NumInput value={node.rotation || 0} onChange={v => onUpdate({ rotation: v })} suffix="°" />
      </Row>

      {node.type === 'text' && <TextProps node={node} onUpdate={onUpdate} onSetFont={onSetFont} />}
      {node.type === 'shape' && <ShapeProps node={node} onUpdate={onUpdate} />}
      {node.type === 'image' && <ImageProps node={node} onUpdate={onUpdate} openAssetPicker={openAssetPicker} />}
      {node.type === 'item-binding' && <BindingProps node={node} onUpdate={onUpdate} onSetFont={onSetFont} openItemPicker={openItemPicker} menuData={menuData} />}

      <button onClick={onDelete} style={{ ...smallBtn, color: '#ff7e7e', borderColor: '#ff7e7e' }}>
        <Icon icon="lucide:trash-2" /> Eliminar
      </button>
    </div>
  );
}

function labelForNode(n) {
  if (n.type === 'text') return 'Texto';
  if (n.type === 'shape') return n.shape === 'circle' ? 'Círculo' : 'Rectángulo';
  if (n.type === 'image') return 'Imagen';
  if (n.type === 'item-binding') return 'Producto vinculado';
  return n.type;
}

// Font dropdown (curated system + Google families) with a custom Google
// Fonts URL override. Picking a Google family or applying a valid link
// registers the stylesheet on the document via onSetFont(stack, url) so both
// renderers load it; system fonts pass a null url.
function FontPicker({ value, onSetFont }) {
  const currentId = fontIdForStack(value);
  const [customOpen, setCustomOpen] = useState(currentId === 'custom');
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');

  function onSelect(e) {
    const id = e.target.value;
    if (id === 'custom') { setCustomOpen(true); return; }
    setCustomOpen(false);
    const f = CANVAS_FONTS.find(x => x.id === id);
    if (f) onSetFont?.(f.stack, f.google ? googleUrlForToken(f.google) : null);
  }
  function applyCustom() {
    const parsed = parseGoogleFontUrl(url);
    if (!parsed) { setErr('Enlace no válido. Pega una URL de fonts.googleapis.com.'); return; }
    setErr('');
    onSetFont?.(parsed.stack, parsed.url);
  }

  return (
    <>
      <Row label="Tipografía">
        <select value={currentId} onChange={onSelect} style={selectStyle}>
          <optgroup label="Sistema">
            {CANVAS_FONTS.filter(f => !f.google).map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
          </optgroup>
          <optgroup label="Google Fonts">
            {CANVAS_FONTS.filter(f => f.google).map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
          </optgroup>
          <option value="custom">Personalizado (enlace)…</option>
        </select>
      </Row>
      {customOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://fonts.googleapis.com/css2?family=…"
            style={textInputStyle}
          />
          <button onClick={applyCustom} style={{ ...smallBtn, background: '#1f6feb', color: 'white', borderColor: '#1f6feb', justifyContent: 'center' }}>
            <Icon icon="lucide:check" /> Aplicar enlace
          </button>
          {err && <span style={{ color: '#ff7e7e', fontSize: '0.72rem' }}>{err}</span>}
          <span style={{ color: '#d8a657', fontSize: '0.7rem', lineHeight: 1.35, display: 'flex', gap: 4 }}>
            <Icon icon="lucide:alert-triangle" style={{ flexShrink: 0, marginTop: 2 }} />
            Los enlaces externos cargan recursos de terceros; pueden tardar o no mostrarse en todos los dispositivos. Usa solo enlaces de Google Fonts.
          </span>
        </div>
      )}
    </>
  );
}

function TextProps({ node, onUpdate, onSetFont }) {
  const s = node.style || {};
  return (
    <>
      <Row label="Texto"><textarea value={node.text || ''} onChange={e => onUpdate({ text: e.target.value })} rows={3} style={textareaStyle} /></Row>
      <Row label="Tamaño"><NumInput value={s.fontSize || 24} onChange={v => onUpdate({ style: { fontSize: v } })} /></Row>
      <Row label="Peso">
        <select value={s.fontWeight || 400} onChange={e => onUpdate({ style: { fontWeight: Number(e.target.value) } })} style={selectStyle}>
          {[300, 400, 500, 600, 700, 800, 900].map(w => <option key={w} value={w}>{w}</option>)}
        </select>
      </Row>
      <FontPicker value={s.fontFamily} onSetFont={onSetFont} />
      <Row label="Color">
        <ColorPicker value={s.color || '#111111'} onChange={c => onUpdate({ style: { color: c } })} />
      </Row>
      <Row label="Alineación">
        <select value={s.align || 'left'} onChange={e => onUpdate({ style: { align: e.target.value } })} style={selectStyle} disabled={!!node.autoWidth}>
          <option value="left">Izquierda</option>
          <option value="center">Centro</option>
          <option value="right">Derecha</option>
        </select>
      </Row>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#ddd', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={!!node.autoWidth}
          onChange={e => onUpdate({ autoWidth: e.target.checked })}
        />
        Ancho automático
        <span style={{ color: '#8b949e', fontSize: '0.72rem' }}>(la caja se ajusta al texto)</span>
      </label>
    </>
  );
}

function ShapeProps({ node, onUpdate }) {
  const s = node.style || {};
  return (
    <>
      <Row label="Relleno"><ColorPicker value={s.fill || '#cccccc'} onChange={c => onUpdate({ style: { fill: c } })} /></Row>
      <Row label="Borde"><ColorPicker value={s.stroke || '#000000'} onChange={c => onUpdate({ style: { stroke: c } })} /></Row>
      <Row label="Grosor"><NumInput value={s.strokeWidth || 0} onChange={v => onUpdate({ style: { strokeWidth: v } })} /></Row>
      {node.shape !== 'circle' && (
        <Row label="Radio"><NumInput value={s.borderRadius || 0} onChange={v => onUpdate({ style: { borderRadius: v } })} /></Row>
      )}
    </>
  );
}

function ImageProps({ node, onUpdate, openAssetPicker }) {
  return (
    <>
      <Row label="Imagen">
        <button onClick={() => openAssetPicker?.(url => onUpdate({ src: url }))} style={{ ...smallBtn, background: '#1f6feb', color: 'white', borderColor: '#1f6feb' }}>
          <Icon icon="lucide:image-plus" /> Cambiar imagen
        </button>
      </Row>
      {node.src && (
        <div style={{ marginTop: -4 }}>
          <img src={node.src} alt="" style={{ width: '100%', maxHeight: 120, objectFit: 'contain', borderRadius: 6, background: '#0d1117' }} />
        </div>
      )}
      <Row label="Ajuste">
        <select value={node.fit || 'cover'} onChange={e => onUpdate({ fit: e.target.value })} style={selectStyle}>
          <option value="cover">Cubrir</option>
          <option value="contain">Contener</option>
        </select>
      </Row>
    </>
  );
}

function BindingProps({ node, onUpdate, onSetFont, openItemPicker, menuData }) {
  const fields = node.fields || ['name', 'price'];
  function toggle(f) {
    const next = fields.includes(f) ? fields.filter(x => x !== f) : [...fields, f];
    onUpdate({ fields: next });
  }
  const itemIndex = useMemo(() => {
    const m = new Map();
    Object.values(menuData?.categories || {}).flat().forEach(it => m.set(it.id, it));
    return m;
  }, [menuData]);
  const item = itemIndex.get(node.item_id);
  return (
    <>
      <Row label="Producto">
        <button
          onClick={() => openItemPicker?.(ids => { if (ids[0]) onUpdate({ item_id: ids[0] }); })}
          style={{ ...smallBtn, flex: 1, justifyContent: 'flex-start', background: '#0d1117' }}
        >
          <Icon icon={item ? 'lucide:check-circle' : 'lucide:alert-circle'} style={{ color: item ? '#3fb950' : '#f0883e' }} />
          <span style={{ flex: 1, textAlign: 'left' }}>
            {item ? `${item.emoji ? item.emoji + ' ' : ''}${item.name}` : `(sin vincular: ${node.item_id || '—'})`}
          </span>
          <Icon icon="lucide:repeat" />
        </button>
      </Row>
      <Row label="Campos">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {['emoji', 'image', 'name', 'price'].map(f => (
            <button key={f} onClick={() => toggle(f)} style={{
              ...smallBtn,
              background: fields.includes(f) ? '#1f6feb' : 'transparent',
              color: fields.includes(f) ? 'white' : '#ddd'
            }}>{f}</button>
          ))}
        </div>
      </Row>
      <Row label="Disposición">
        <select value={node.layout || 'inline'} onChange={e => onUpdate({ layout: e.target.value })} style={selectStyle}>
          <option value="inline">En línea</option>
          <option value="stacked">Apilado</option>
        </select>
      </Row>
      <FontPicker value={node.style?.fontFamily} onSetFont={onSetFont} />
      <Row label="Tamaño texto"><NumInput value={node.style?.fontSize || 48} onChange={v => onUpdate({ style: { fontSize: v } })} /></Row>
      <Row label="Color texto"><ColorPicker value={node.style?.color || '#111111'} onChange={c => onUpdate({ style: { color: c } })} /></Row>

      <div style={{ borderTop: '1px solid #30363d', paddingTop: 10, marginTop: 4 }}>
        <p style={{ ...panelTitle, marginBottom: 8, fontSize: '0.75rem' }}>Fondo</p>
      </div>
      <Row label="Color fondo">
        <ColorPicker value={node.style?.fill || '#ffffff'} onChange={c => onUpdate({ style: { fill: c } })} />
        {node.style?.fill && (
          <button onClick={() => onUpdate({ style: { fill: '' } })} style={smallBtn} title="Sin fondo">
            <Icon icon="lucide:x" />
          </button>
        )}
      </Row>
      <Row label="Borde"><ColorPicker value={node.style?.stroke || '#000000'} onChange={c => onUpdate({ style: { stroke: c } })} /></Row>
      <Row label="Grosor borde"><NumInput value={node.style?.strokeWidth || 0} onChange={v => onUpdate({ style: { strokeWidth: v } })} /></Row>
      <Row label="Radio esquinas"><NumInput value={node.style?.borderRadius || 0} onChange={v => onUpdate({ style: { borderRadius: v } })} /></Row>
      <Row label="Padding interno"><NumInput value={node.style?.padding ?? 8} onChange={v => onUpdate({ style: { padding: v } })} /></Row>

      <div style={{ borderTop: '1px solid #30363d', paddingTop: 10, marginTop: 4 }}>
        <p style={{ ...panelTitle, marginBottom: 8, fontSize: '0.75rem' }}>Inventario</p>
      </div>
      <Row label="Cuando se agote">
        <select
          value={node.hide_when_out_of_stock ? 'hide' : 'strikethrough'}
          onChange={e => onUpdate({ hide_when_out_of_stock: e.target.value === 'hide' })}
          style={selectStyle}
        >
          <option value="strikethrough">Mostrar tachado</option>
          <option value="hide">Ocultar del menú</option>
        </select>
      </Row>
    </>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
}

function NumInput({ value, onChange, suffix }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#22272e', borderRadius: 6, padding: '4px 8px', border: '1px solid #30363d', flex: 1 }}>
      <input
        type="number"
        value={value ?? 0}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', background: 'transparent', border: 'none', color: 'white', outline: 'none', fontSize: '0.85rem' }}
      />
      {suffix && <span style={{ color: '#888', fontSize: '0.7rem' }}>{suffix}</span>}
    </label>
  );
}

// ============================================================================
// Inline styles — dark editor chrome, not themable.
// ============================================================================

const overlay = { position: 'fixed', inset: 0, zIndex: 2000, background: '#0d1117', display: 'flex', flexDirection: 'column', color: 'white' };
const topbar  = { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#161b22', borderBottom: '1px solid #30363d' };
const pageTabs = { display: 'flex', gap: 8, alignItems: 'center', padding: '6px 16px', background: '#0d1117', borderBottom: '1px solid #30363d', overflowX: 'auto' };
const mainRow  = { display: 'flex', flex: 1, minHeight: 0 };
const toolbar  = { width: 80, padding: 12, background: '#161b22', borderRight: '1px solid #30363d', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' };
const stageArea = { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: '#0d1117', overflow: 'auto' };
const propsPanel = { width: 300, padding: 16, background: '#161b22', borderLeft: '1px solid #30363d', overflowY: 'auto' };

const ghostBtn   = { background: 'transparent', border: '1px solid transparent', color: 'white', padding: '6px 10px', borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 };
const primaryBtn = { background: '#238636', border: 'none', color: 'white', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 800 };
const toolBtnStyle = { background: '#22272e', border: '1px solid #30363d', color: 'white', borderRadius: 8, padding: '8px 4px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 };
const panelTitle = { margin: 0, fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8b949e' };
const smallBtn  = { background: 'transparent', border: '1px solid #30363d', color: '#ddd', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' };
const colorInput = { width: 36, height: 28, border: '1px solid #30363d', borderRadius: 6, background: 'transparent', cursor: 'pointer', padding: 0 };
const textInputStyle = { flex: 1, background: '#22272e', border: '1px solid #30363d', color: 'white', borderRadius: 6, padding: '6px 8px', fontSize: '0.85rem', outline: 'none' };
const textareaStyle  = { ...textInputStyle, width: '100%', resize: 'vertical', fontFamily: 'inherit' };
const selectStyle    = { ...textInputStyle, cursor: 'pointer' };
