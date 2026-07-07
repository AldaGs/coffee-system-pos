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
import { Stage, Layer, Rect, Circle, Text, Image as KImage, Transformer, Group, Line, Path, Label, Tag } from 'react-konva';
import { Icon } from '@iconify/react';
import { nanoid } from 'nanoid';
import { newDocument, newPage, PAGE_PRESETS, presetKeyFor, syncDocFonts, docFontLoadSpecs, pathToSvgD, pathBBox, translatePath, cloneNodeGeometry, formatDateField } from '../../utils/canvasDocument';
import { CANVAS_FONTS, googleUrlForToken, fontIdForStack, parseGoogleFontUrl } from '../../utils/canvasFonts';
import { PaletteContext } from './paletteContext';
import { updateMenu } from '../../api/menus';
import { openInBrowser } from '../../utils/openInBrowser';
import AssetPicker from './AssetPicker';
import ColorPicker from './ColorPicker';
import ItemPicker from './ItemPicker';
import LayersPanel from './LayersPanel';

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
  // Rulers default off on phones/tablets — the gutters eat scarce width, and
  // touch guide-dragging is finicky. The layout also stacks vertically below.
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches
  );
  const [showRulers, setShowRulers] = useState(() => !(typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches));
  const [showGrid, setShowGrid] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [guides, setGuides] = useState([]);
  // On narrow layouts the properties panel is a collapsible bottom sheet so it
  // doesn't steal the stage's width. Auto-opens when a node is selected.
  const [panelOpen, setPanelOpen] = useState(false);
  // "Simulate sold-out" preview: treats every stock-linked / bound item as out
  // of stock so the owner can see which elements auto-hide (ghosted) or dim
  // without touching real inventory.
  const [previewOOS, setPreviewOOS] = useState(false);

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

  // Copy/paste/duplicate. The clipboard is an in-memory ring of node clones
  // (no ids) — scoped to the editor session, so it never touches the OS
  // clipboard. contextMenu holds the right-click menu's screen position.
  const clipboardRef = useRef([]);
  const [contextMenu, setContextMenu] = useState(null); // { x, y } screen coords

  // Pen tool (Bézier). penDraft holds the in-progress path; penCursor drives
  // the rubber-band preview; penDownRef tracks whether the mouse is held so a
  // click-drag can pull smooth handles out of the anchor being placed.
  const [penMode, setPenMode] = useState(false);
  const [penDraft, setPenDraft] = useState(null); // { points:[], closed:false }
  const [penCursor, setPenCursor] = useState(null);
  const penDownRef = useRef(false);

  // Double-click editing: inline text (text content / shape label) and path
  // anchor editing. `editing` = { id, kind:'text'|'label' }; `editingPathId`
  // shows draggable anchors/handles for one path.
  const [editing, setEditing] = useState(null);
  const [editingPathId, setEditingPathId] = useState(null);
  const editStartDocRef = useRef(null);

  // Web fonts declared on the document (e.g. chalkboard's Permanent Marker).
  // Konva caches glyph metrics at draw time, so a font that arrives after the
  // first paint leaves text mis-measured. We inject the <link>, wait for the
  // family to actually load, then bump fontEpoch — which feeds the Text node
  // keys below to force a remount with correct metrics.
  const [fontEpoch, setFontEpoch] = useState(0);
  const fontsKey = JSON.stringify(doc.fonts || []);
  useEffect(() => {
    syncDocFonts(doc);
    const specs = docFontLoadSpecs(doc);
    if (typeof document === 'undefined' || !document.fonts || specs.length === 0) return;
    let active = true;
    Promise.all(specs.map(s => document.fonts.load(s).catch(() => {})))
      .then(() => { if (active) setFontEpoch(e => e + 1); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontsKey]);

  // Leave path anchor-editing when the path is no longer the selection.
  useEffect(() => {
    if (editingPathId && !selectedIds.includes(editingPathId)) setTimeout(() => setEditingPathId(null), 0);
  }, [selectedIds, editingPathId]);

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

  // Record a single undo step for an edit that mutated the doc via silent
  // updates (e.g. dragging a path anchor): pass the pre-edit snapshot.
  function pushHistory(prevDoc) {
    if (!prevDoc) return;
    setPast(p => [...p.slice(-HISTORY_LIMIT), prevDoc]);
    setFuture([]);
    setDirty(true);
  }

  // Keyboard: Ctrl/Cmd+Z / Shift+Z. Delete removes selected node.
  useEffect(() => {
    function onKey(e) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return; // let the inline editor own its keys
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if (meta && e.key.toLowerCase() === 'c') {
        if (selectedIds.length) { e.preventDefault(); copySelection(); }
      } else if (meta && e.key.toLowerCase() === 'v') {
        if (clipboardRef.current.length) { e.preventDefault(); pasteClipboard(); }
      } else if (meta && e.key.toLowerCase() === 'd') {
        if (selectedIds.length) { e.preventDefault(); duplicateSelection(); }
      } else if (e.key === 'Enter' && penMode) {
        e.preventDefault();
        finishPath(penDraft, false);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        // Locked nodes are protected from deletion, like every other edit.
        const lockedIds = new Set((page?.nodes || []).filter(n => n.locked).map(n => n.id));
        const deletable = selectedIds.filter(id => !lockedIds.has(id));
        if (deletable.length) removeNodes(deletable);
      } else if (e.key === 'Escape') {
        if (penMode) cancelPen();
        else if (editingPathId) setEditingPathId(null);
        else if (editing) setEditing(null);
        else setSelectedIds([]);
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

  // ---------- Copy / paste / duplicate --------------------------------------
  // Stash id-less clones of the current selection (in document order so paste
  // preserves stacking). Returns how many were copied.
  function copySelection(ids = selectedIds) {
    const set = new Set(ids);
    const clones = (page?.nodes || []).filter(n => set.has(n.id)).map(n => cloneNodeGeometry(n, 0, 0));
    clipboardRef.current = clones;
    return clones.length;
  }

  // Add clones from a source list to the current page, offset so copies are
  // visible, in ONE commit (single undo step). Selects the new nodes.
  function addClones(clones, dx = 24, dy = 24) {
    if (!clones || clones.length === 0) return;
    const z0 = nextZ(page);
    const withIds = clones.map((c, i) => {
      const g = cloneNodeGeometry(c, dx, dy); // re-offset from the stored clone
      return { ...g, id: nanoid(8), z: z0 + i };
    });
    mutatePage(p => ({ ...p, nodes: [...(p.nodes || []), ...withIds] }));
    setSelectedIds(withIds.map(n => n.id));
  }

  function pasteClipboard() { addClones(clipboardRef.current, 24, 24); }

  // Duplicate = copy the selection and immediately drop offset copies, without
  // disturbing the paste clipboard.
  function duplicateSelection() {
    const set = new Set(selectedIds);
    const src = (page?.nodes || []).filter(n => set.has(n.id));
    addClones(src, 24, 24);
  }

  // ---------- Visibility link (stock) ---------------------------------------
  // Find the item-binding whose center is closest to the selection's center, so
  // "link to product" can suggest the obvious item in one click.
  function nearestBindingItemId(ids) {
    const set = new Set(ids);
    const sel = (page?.nodes || []).filter(n => set.has(n.id));
    if (!sel.length) return null;
    const cx = sel.reduce((s, n) => s + (n.x + n.w / 2), 0) / sel.length;
    const cy = sel.reduce((s, n) => s + (n.y + n.h / 2), 0) / sel.length;
    let best = null, bestD = Infinity;
    for (const n of (page?.nodes || [])) {
      if (n.type !== 'item-binding' || !n.item_id || set.has(n.id)) continue;
      const d = Math.hypot(n.x + n.w / 2 - cx, n.y + n.h / 2 - cy);
      if (d < bestD) { bestD = d; best = n.item_id; }
    }
    return best;
  }

  // Link every eligible (non-binding) node in `ids` to a catalog item in one
  // commit, preserving each node's existing hide toggle.
  function linkNodesToItem(ids, itemId) {
    const set = new Set(ids);
    mutatePage(p => ({
      ...p,
      nodes: (p.nodes || []).map(n =>
        set.has(n.id) && n.type !== 'item-binding'
          ? { ...n, link: { itemId, hideWhenOOS: n.link?.hideWhenOOS ?? true } }
          : n)
    }));
  }
  function unlinkNodes(ids) {
    const set = new Set(ids);
    mutatePage(p => ({ ...p, nodes: (p.nodes || []).map(n => set.has(n.id) ? { ...n, link: null } : n) }));
  }

  // Context-menu action: link the selection to the nearest binding's item in
  // one click, or open the picker when the page has no bindings yet.
  function linkSelectionToProduct() {
    const ids = selectedIds.filter(id => {
      const n = (page?.nodes || []).find(x => x.id === id);
      return n && n.type !== 'item-binding';
    });
    if (!ids.length) return;
    const near = nearestBindingItemId(ids);
    if (near) { linkNodesToItem(ids, near); return; }
    setItemPickerCb(() => (picked) => { if (picked?.[0]) linkNodesToItem(ids, picked[0]); setItemPickerCb(null); });
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

  // Reassign z from an explicit top-first ordering (Layers panel drag-and-drop
  // or its up/down buttons). Unlike the neighbor-swap helpers above, this
  // normalizes every node to a unique z, so reordering stays correct even when
  // a template seeded many nodes at the same z.
  function reorderNodesByIds(orderedTopFirst) {
    const n = orderedTopFirst.length;
    const zById = new Map();
    orderedTopFirst.forEach((id, i) => zById.set(id, n - i)); // top of list → highest z
    mutatePage(p => ({ ...p, nodes: (p.nodes || []).map(node => zById.has(node.id) ? { ...node, z: zById.get(node.id) } : node) }));
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
      openInBrowser(printUrl);
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

  // ---------- Responsive layout --------------------------------------------

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 820px)');
    const on = e => setIsNarrow(e.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  // On narrow layouts, surface the bottom sheet automatically when a selection
  // appears so the just-tapped node's controls are reachable without hunting.
  useEffect(() => {
    if (isNarrow && selectedIds.length > 0) setTimeout(() => setPanelOpen(true), 0);
  }, [isNarrow, selectedIds.length]);

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
  }, [pageW, pageH, showRulers, isNarrow, panelOpen]);

  // Pointer position in page coordinates (undo the stage scale).
  function pagePointer(e) {
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    return { x: pos.x / (stageScale || 1), y: pos.y / (stageScale || 1) };
  }

  // ---------- Pen tool (Bézier paths) ---------------------------------------
  function mirror(around, p) { return { x: 2 * around.x - p.x, y: 2 * around.y - p.y }; }

  function penDown(e) {
    const p = pagePointer(e);
    const draft = penDraft || { points: [], closed: false };
    // Click near the first anchor (with 3+ points) closes + finishes the path.
    if (draft.points.length > 2) {
      const f = draft.points[0];
      if (Math.hypot(f.x - p.x, f.y - p.y) < 10 / (stageScale || 1)) {
        finishPath(draft, true);
        return;
      }
    }
    penDownRef.current = true;
    setPenDraft({ ...draft, points: [...draft.points, { x: p.x, y: p.y, hIn: null, hOut: null }] });
  }
  function penMove(e) {
    const p = pagePointer(e);
    setPenCursor(p);
    if (!penDownRef.current) return;
    // Dragging while placing an anchor pulls symmetric bézier handles out.
    setPenDraft(d => {
      if (!d || d.points.length === 0) return d;
      const pts = d.points.slice();
      const i = pts.length - 1;
      const a = pts[i];
      pts[i] = { ...a, hOut: { x: p.x, y: p.y }, hIn: mirror({ x: a.x, y: a.y }, p) };
      return { ...d, points: pts };
    });
  }
  function penUp() { penDownRef.current = false; }

  function finishPath(draft, closed) {
    const d = draft || penDraft;
    penDownRef.current = false;
    setPenDraft(null);
    setPenCursor(null);
    setPenMode(false);
    if (!d || d.points.length < 2) return;
    const points = d.points;
    const bb = pathBBox(points);
    addNode({
      type: 'path', points, closed: !!closed,
      x: bb.x, y: bb.y, w: bb.w, h: bb.h, rotation: 0,
      style: { stroke: '#111111', strokeWidth: 6, fill: 'transparent' }
    });
  }
  function cancelPen() { penDownRef.current = false; setPenDraft(null); setPenCursor(null); setPenMode(false); }

  // ---------- Double-click editing ------------------------------------------
  function handleNodeDblClick(node) {
    if (penMode) return;
    if (node.type === 'text') { setEditingPathId(null); setEditing({ id: node.id, kind: 'text' }); }
    else if (node.type === 'shape') { setEditingPathId(null); setEditing({ id: node.id, kind: 'label' }); }
    else if (node.type === 'path') { setEditing(null); setEditingPathId(node.id); }
  }
  // Commit inline text (text content or shape label) and close the editor.
  function commitInlineText(value) {
    if (!editing) return;
    updateNode(editing.id, editing.kind === 'label' ? { label: value } : { text: value });
    setEditing(null);
  }

  // Path anchor editing: silent updates while dragging, one undo step on end.
  function pathEditStart() { editStartDocRef.current = doc; }
  function setPathPoint(id, i, fn) {
    setDoc(d => ({
      ...d,
      pages: d.pages.map((p, pi) => pi === pageIndex ? {
        ...p, nodes: (p.nodes || []).map(n => n.id === id ? { ...n, points: n.points.map((pt, k) => k === i ? fn(pt) : pt) } : n)
      } : p)
    }));
    setDirty(true);
  }
  function moveAnchor(id, i, pos) {
    setPathPoint(id, i, p => {
      const dx = pos.x - p.x, dy = pos.y - p.y;
      return { x: pos.x, y: pos.y, hIn: p.hIn ? { x: p.hIn.x + dx, y: p.hIn.y + dy } : null, hOut: p.hOut ? { x: p.hOut.x + dx, y: p.hOut.y + dy } : null };
    });
  }
  function moveHandle(id, i, which, pos) { setPathPoint(id, i, p => ({ ...p, [which]: { x: pos.x, y: pos.y } })); }
  function pathEditEnd(id) {
    setDoc(d => ({
      ...d,
      pages: d.pages.map((p, pi) => pi === pageIndex ? {
        ...p, nodes: (p.nodes || []).map(n => { if (n.id !== id) return n; const bb = pathBBox(n.points); return { ...n, x: bb.x, y: bb.y, w: bb.w, h: bb.h }; })
      } : p)
    }));
    pushHistory(editStartDocRef.current);
    editStartDocRef.current = null;
  }

  // Press on empty canvas: begin a marquee (and clear selection unless Shift).
  function onStageMouseDown(e) {
    if (penMode) { penDown(e); return; }
    if (e.target !== e.target.getStage()) return;
    if (!e.evt.shiftKey) setSelectedIds([]);
    const p = pagePointer(e);
    marqueeStartRef.current = p;
    setMarquee({ x: p.x, y: p.y, w: 0, h: 0 });
  }
  function onStageMouseMove(e) {
    if (penMode) { penMove(e); return; }
    if (!marqueeStartRef.current) return;
    const p = pagePointer(e);
    const s = marqueeStartRef.current;
    setMarquee({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  }
  function onStageMouseUp(e) {
    if (penMode) { penUp(e); return; }
    if (!marqueeStartRef.current) return;
    const m = marquee;
    marqueeStartRef.current = null;
    setMarquee(null);
    if (!m || (m.w < 4 && m.h < 4)) return; // a click, not a drag
    const hit = (page?.nodes || [])
      .filter(n => !n.hidden && !n.locked && rectsOverlap(m, { x: n.x, y: n.y, w: n.w, h: n.h }))
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

  // Top-left page bbox of a live-dragging konva node. All node types (incl.
  // shapes, now Group-based) report their top-left position directly.
  function liveBBox(konvaNode, node) {
    return { x: konvaNode.x(), y: konvaNode.y(), w: node.w, h: node.h };
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
    if (!snapEnabled || node.type === 'path') return; // paths drag free (points are absolute)
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
        // Paths are drawn from absolute points with the konva node at (0,0);
        // a drag leaves the offset on kn.x/y, so fold it into the points.
        if (n.type === 'path') {
          const dx = kn.x(), dy = kn.y();
          if (!dx && !dy) return n;
          const pts = translatePath(n.points, dx, dy);
          const bb = pathBBox(pts);
          kn.x(0); kn.y(0);
          return { ...n, points: pts, x: bb.x, y: bb.y, w: bb.w, h: bb.h };
        }
        return { ...n, x: Math.round(kn.x()), y: Math.round(kn.y()) };
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
        const patch = {
          x: Math.round(kn.x()), y: Math.round(kn.y()),
          w: Math.max(10, Math.round(n.w * sx)), h: Math.max(10, Math.round(n.h * sy)),
          rotation: Math.round(kn.rotation())
        };
        if (n.type === 'text' && n.autoWidth && Math.abs(sx - 1) > 0.001) patch.autoWidth = false;
        kn.scaleX(1); kn.scaleY(1);
        return { ...n, ...patch };
      })
    }));
  }

  // Move a node to (x, y) — path-safe: paths translate their points instead
  // of having a raw x/y written (which would desync the absolute geometry).
  function moveNodeTo(n, x, y) {
    if (n.type === 'path') {
      const pts = translatePath(n.points, x - n.x, y - n.y);
      const bb = pathBBox(pts);
      return { ...n, points: pts, x: bb.x, y: bb.y, w: bb.w, h: bb.h };
    }
    return { ...n, x, y };
  }



  // Align the selection's edges/centers to a reference frame: the selection's
  // own bbox, the page, or the "key object" (the first node selected, which
  // stays put). Single-node align only makes sense against canvas/key.
  function alignSelected(dir, target = 'selection') {
    const set = new Set(selectedIds);
    const sel = (page?.nodes || []).filter(n => set.has(n.id));
    if (sel.length === 0) return;
    let minX, maxX, minY, maxY;
    if (target === 'canvas') {
      minX = 0; maxX = pageW; minY = 0; maxY = pageH;
    } else if (target === 'key') {
      const key = sel.find(n => n.id === selectedIds[0]) || sel[0];
      minX = key.x; maxX = key.x + key.w; minY = key.y; maxY = key.y + key.h;
    } else {
      minX = Math.min(...sel.map(n => n.x)); maxX = Math.max(...sel.map(n => n.x + n.w));
      minY = Math.min(...sel.map(n => n.y)); maxY = Math.max(...sel.map(n => n.y + n.h));
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    mutatePage(p => ({
      ...p,
      nodes: (p.nodes || []).map(n => {
        if (!set.has(n.id)) return n;
        if (target === 'key' && n.id === selectedIds[0]) return n; // key object stays
        let { x, y } = n;
        if (dir === 'left') x = minX; else if (dir === 'right') x = maxX - n.w; else if (dir === 'hcenter') x = cx - n.w / 2;
        else if (dir === 'top') y = minY; else if (dir === 'bottom') y = maxY - n.h; else if (dir === 'vcenter') y = cy - n.h / 2;
        return moveNodeTo(n, Math.round(x), Math.round(y));
      })
    }));
  }

  // Distribute 3+ nodes so the gaps between them (edge to edge) are equal,
  // keeping the outermost two fixed. axis 'h' = horizontal, 'v' = vertical.
  function distributeSelected(axis) {
    const set = new Set(selectedIds);
    const sel = (page?.nodes || []).filter(n => set.has(n.id));
    if (sel.length < 3) return;
    const pos = axis === 'h' ? 'x' : 'y';
    const size = axis === 'h' ? 'w' : 'h';
    const sorted = [...sel].sort((a, b) => a[pos] - b[pos]);
    const spanStart = sorted[0][pos];
    const spanEnd = sorted[sorted.length - 1][pos] + sorted[sorted.length - 1][size];
    const totalSize = sorted.reduce((s, n) => s + n[size], 0);
    const gap = (spanEnd - spanStart - totalSize) / (sorted.length - 1);
    const placed = {};
    let cur = spanStart;
    for (const n of sorted) { placed[n.id] = cur; cur += n[size] + gap; }
    mutatePage(p => ({
      ...p,
      nodes: (p.nodes || []).map(n => {
        if (!(n.id in placed)) return n;
        const x = axis === 'h' ? placed[n.id] : n.x;
        const y = axis === 'v' ? placed[n.id] : n.y;
        return moveNodeTo(n, Math.round(x), Math.round(y));
      })
    }));
  }

  // ---------- Context menu --------------------------------------------------
  // Right-click a node: select it (unless it's already part of a multi-select)
  // and open the menu at the cursor. Right-click empty canvas: a Paste-only
  // menu. Konva's onContextMenu passes the DOM event on e.evt.
  const nodeMenuHandledRef = useRef(false);
  function handleNodeContextMenu(e, node) {
    e.evt?.preventDefault();
    nodeMenuHandledRef.current = true;
    if (!selectedIds.includes(node.id)) selectOne(node.id);
    setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, empty: false });
  }
  // Fires after the node handler (native event keeps bubbling to the overlay).
  // If a node already claimed this contextmenu, let it stand; otherwise show a
  // Paste-only menu for the empty canvas.
  function handleOverlayContextMenu(e) {
    e.preventDefault();
    if (nodeMenuHandledRef.current) { nodeMenuHandledRef.current = false; return; }
    setContextMenu({ x: e.clientX, y: e.clientY, empty: true });
  }
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); };
  }, [contextMenu]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGuide?.axis, activeGuide?.index, stageScale, pageW, pageH, doc, pageIndex]);

  return (
   <PaletteContext.Provider value={paletteCtx}>
    <div style={overlay} onContextMenu={handleOverlayContextMenu}>
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
        previewOOS={previewOOS} onTogglePreviewOOS={() => setPreviewOOS(v => !v)}
      />

      <PageTabs
        doc={doc}
        pageIndex={pageIndex}
        onSelect={i => { setPageIndex(i); setSelectedIds([]); }}
        onAdd={addPage}
        onDelete={deletePage}
      />

      {previewOOS && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', background: 'rgba(210,120,30,0.18)', borderBottom: '1px solid rgba(210,120,30,0.4)', color: '#f0b370', fontSize: '0.8rem', fontWeight: 700 }}>
          <Icon icon="lucide:package-x" />
          Vista previa: productos agotados — los elementos atenuados se ocultan o se marcan en el menú público. No cambia el inventario real.
        </div>
      )}

      <div style={isNarrow ? mainRowNarrow : mainRow}>
        <Toolbar
          isNarrow={isNarrow}
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
          onTogglePen={() => { setSelectedIds([]); setPenMode(m => !m); setPenDraft(null); setPenCursor(null); }}
          penActive={penMode}
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
          onAddWhatsApp={() => addNode({
            type: 'whatsapp-button',
            x: Math.round(pageW / 2 - 260), y: Math.round(pageH / 2 - 40),
            w: 520, h: 88, rotation: 0,
            label: 'Pedir por WhatsApp', url: '',
            style: { fill: '#25D366', color: '#ffffff', fontFamily: 'system-ui, sans-serif', fontSize: 34, fontWeight: 800, borderRadius: 999, align: 'center', padding: 16 }
          })}
          onAddDate={() => addNode({
            type: 'date-field',
            x: Math.round(pageW / 2 - 200), y: Math.round(pageH / 2 - 30),
            w: 400, h: 60, rotation: 0,
            emoji: '🔥', label: 'Tostado:', value: '', relative: true, item_id: null,
            style: { fontFamily: 'system-ui, sans-serif', fontSize: 32, fontWeight: 600, color: '#8a6d3b', align: 'left' }
          })}
        />

        <div ref={stageWrapRef} style={isNarrow ? stageAreaNarrow : stageArea}>
          <div style={showRulers
            ? { display: 'grid', gridTemplateColumns: `${RULER}px auto`, gridTemplateRows: `${RULER}px auto` }
            : undefined}>
            {showRulers && <div style={{ background: '#161b22', borderRight: '1px solid #30363d', borderBottom: '1px solid #30363d' }} />}
            {showRulers && <Ruler axis="x" pageSize={pageW} scale={stageScale} onStart={e => startGuideFromRuler('h', e)} />}
            {showRulers && <Ruler axis="y" pageSize={pageH} scale={stageScale} onStart={e => startGuideFromRuler('v', e)} />}
            {/* touchAction:none keeps the browser from scrolling/zooming the
                page out from under a drag/marquee gesture on the canvas. */}
            <div ref={stageBoxRef} style={{ position: 'relative', width: pageW * stageScale, height: pageH * stageScale, boxShadow: '0 12px 40px rgba(0,0,0,0.35)', touchAction: 'none' }}>
              <Stage
                ref={stageRef}
                width={pageW * stageScale}
                height={pageH * stageScale}
                scaleX={stageScale}
                scaleY={stageScale}
                onMouseDown={onStageMouseDown}
                onMouseMove={onStageMouseMove}
                onMouseUp={onStageMouseUp}
                onDblClick={() => { if (penMode) finishPath(penDraft, false); }}
                onDblTap={() => { if (penMode) finishPath(penDraft, false); }}
                onTouchStart={onStageMouseDown}
                onTouchMove={onStageMouseMove}
                onTouchEnd={onStageMouseUp}
                style={{ background: page.background, cursor: penMode ? 'crosshair' : 'default' }}
              >
                {showGrid && !exporting && (
                  <Layer listening={false}>
                    <GridOverlay pageW={pageW} pageH={pageH} />
                  </Layer>
                )}
                <Layer listening={!penMode}>
                  {/* Opaque page background so PNG export isn't transparent. */}
                  <Rect x={0} y={0} width={pageW} height={pageH} fill={page.background || '#ffffff'} listening={false} />
                  {sortedNodes(page).map(node => {
                    if (node.hidden) return null;
                    const linkedOut = node.link?.itemId && node.link.hideWhenOOS !== false;
                    const bindingHides = node.type === 'item-binding' && node.hide_when_out_of_stock;
                    const ghost = previewOOS && (linkedOut || bindingHides);
                    const dim = previewOOS && node.type === 'item-binding' && !node.hide_when_out_of_stock;
                    return (
                    <NodeKonva
                      key={node.id}
                      node={node}
                      menuData={menuData}
                      fontEpoch={fontEpoch}
                      ghost={ghost}
                      dim={dim}
                      isSelected={selectedIds.includes(node.id)}
                      onSelect={e => {
                        if (node.locked) return;
                        if (e?.evt?.shiftKey) toggleSelect(node.id);
                        else selectOne(node.id);
                      }}
                      onDblClick={n => !node.locked && handleNodeDblClick(n)}
                      onChange={patch => updateNode(node.id, patch)}
                      onMeasure={updateNodeSilent}
                      onDragStart={e => handleDragStart(e, node)}
                      onDragMove={e => handleDragMove(e, node)}
                      onNodeDragEnd={handleNodeDragEnd}
                      onNodeTransformEnd={handleNodeTransformEnd}
                      onContextMenu={handleNodeContextMenu}
                    />
                    );
                  })}
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
                  {penDraft && (
                    <PenPreview draft={penDraft} cursor={penCursor} scale={stageScale} />
                  )}
                  {!exporting && selectedIds.map(id => {
                    const n = (page?.nodes || []).find(x => x.id === id);
                    if (!n || n.type !== 'path') return null; // paths skip the transformer; show a bbox
                    return <Rect key={'psel' + id} x={n.x} y={n.y} width={n.w} height={n.h} stroke="#1f6feb" strokeWidth={1 / stageScale} dash={[5 / stageScale, 3 / stageScale]} listening={false} />;
                  })}
                  {/* Discreet chip on stock-linked nodes so the owner can see at
                      a glance which elements auto-hide with a product. */}
                  {!exporting && (page?.nodes || []).filter(n => n.link?.itemId).map(n => {
                    const sz = 24 / stageScale;
                    return (
                      <Group key={'lk' + n.id} x={n.x} y={n.y} listening={false}>
                        <Rect width={sz} height={sz} cornerRadius={6 / stageScale} fill="#0d1117" opacity={0.82} stroke="#3fb950" strokeWidth={1 / stageScale} />
                        <Text text="🔗" x={sz * 0.16} y={sz * 0.12} fontSize={sz * 0.62} listening={false} />
                      </Group>
                    );
                  })}
                </Layer>
                {editingPathId && (() => {
                  const pn = (page?.nodes || []).find(x => x.id === editingPathId && x.type === 'path');
                  if (!pn) return null;
                  return (
                    <Layer>
                      <PathEditor
                        node={pn}
                        scale={stageScale}
                        onStart={pathEditStart}
                        onAnchor={(i, pos) => moveAnchor(pn.id, i, pos)}
                        onHandle={(i, which, pos) => moveHandle(pn.id, i, which, pos)}
                        onEnd={() => pathEditEnd(pn.id)}
                      />
                    </Layer>
                  );
                })()}
              </Stage>
              <GuidesOverlay
                guides={pageGuides}
                scale={stageScale}
                activeGuide={activeGuide}
                onStartDragGuide={startDragGuide}
              />
              {editing && (() => {
                const en = (page?.nodes || []).find(x => x.id === editing.id);
                if (!en) return null;
                return (
                  <InlineTextEditor
                    node={en}
                    kind={editing.kind}
                    scale={stageScale}
                    onCommit={commitInlineText}
                    onCancel={() => setEditing(null)}
                  />
                );
              })()}
            </div>
          </div>
        </div>

        {isNarrow && (
          <div style={sheetHandle} onClick={() => setPanelOpen(o => !o)}>
            <span style={{ fontWeight: 800, fontSize: '0.78rem', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {selectedIds.length > 1 ? `${selectedIds.length} seleccionados` : 'Propiedades'}
            </span>
            <Icon icon={panelOpen ? 'lucide:chevron-down' : 'lucide:chevron-up'} />
          </div>
        )}
        {(!isNarrow || panelOpen) && (
          <PropertiesPanel
            doc={doc}
            page={page}
            changePageBg={changePageBg}
            changePageSize={changePageSize}
            selected={selected}
            multiCount={selectedIds.length}
            selectedIds={selectedIds}
            onSelectNode={(id, multi) => multi ? toggleSelect(id) : selectOne(id)}
            onAlign={(dir, target) => alignSelected(dir, target)}
            onDistribute={axis => distributeSelected(axis)}
            onUpdate={patch => selected && updateNode(selected.id, patch)}
            onUpdateNode={updateNode}
            onReorder={reorderNodesByIds}
            onSetFont={(stack, url) => selected && setNodeFont(selected.id, stack, url)}
            onDelete={() => selected && removeNode(selected.id)}
            onForward={id => bringForward(id || selected?.id)}
            onBack={id => sendBack(id || selected?.id)}
            openAssetPicker={(cb) => setAssetPickerCb(() => (url) => { cb(url); setAssetPickerCb(null); })}
            openItemPicker={(cb) => setItemPickerCb(() => (ids) => { cb(ids); setItemPickerCb(null); })}
            menuData={menuData}
            style={isNarrow ? propsPanelNarrow : undefined}
          />
        )}
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

      {contextMenu && (() => {
        const selNodes = (page?.nodes || []).filter(n => selectedIds.includes(n.id));
        const canLink = selNodes.some(n => n.type !== 'item-binding');
        const isLinked = selNodes.some(n => n.link?.itemId);
        const suggestId = canLink ? nearestBindingItemId(selectedIds) : null;
        const suggestName = suggestId
          ? (Object.values(menuData?.categories || {}).flat().find(x => x.id === suggestId)?.name || null)
          : null;
        return (
          <ContextMenu
            pos={contextMenu}
            hasSelection={selectedIds.length > 0}
            selectionCount={selectedIds.length}
            canPaste={clipboardRef.current.length > 0}
            canLink={canLink}
            isLinked={isLinked}
            linkSuggestion={suggestName}
            onLinkProduct={() => { linkSelectionToProduct(); setContextMenu(null); }}
            onUnlink={() => { unlinkNodes(selectedIds); setContextMenu(null); }}
            onDuplicate={() => { duplicateSelection(); setContextMenu(null); }}
            onCopy={() => { copySelection(); setContextMenu(null); }}
            onPaste={() => { pasteClipboard(); setContextMenu(null); }}
            onForward={() => { selectedIds.forEach(bringForward); setContextMenu(null); }}
            onBack={() => { selectedIds.forEach(sendBack); setContextMenu(null); }}
            onDelete={() => { removeNodes(selectedIds); setContextMenu(null); }}
          />
        );
      })()}
    </div>
   </PaletteContext.Provider>
  );
}

// Right-click menu. Positioned at the cursor in screen space; the parent closes
// it on any outside click (window listener). Items collapse to just Paste when
// nothing is selected.
function ContextMenu({ pos, hasSelection, selectionCount, canPaste, canLink, isLinked, linkSuggestion, onLinkProduct, onUnlink, onDuplicate, onCopy, onPaste, onForward, onBack, onDelete }) {
  const item = (icon, label, onClick, opts = {}) => (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={opts.disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        background: 'transparent', border: 'none', color: opts.danger ? '#ff7e7e' : '#e6edf3',
        padding: '8px 12px', cursor: opts.disabled ? 'default' : 'pointer', fontSize: '0.85rem',
        opacity: opts.disabled ? 0.4 : 1, borderRadius: 6
      }}
      onMouseEnter={e => { if (!opts.disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <Icon icon={icon} style={{ fontSize: '1rem', flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{label}</span>
      {opts.hint && <span style={{ color: '#8b949e', fontSize: '0.72rem' }}>{opts.hint}</span>}
    </button>
  );
  // Keep the menu on-screen near the right/bottom edges.
  const x = Math.min(pos.x, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 210);
  const y = Math.min(pos.y, (typeof window !== 'undefined' ? window.innerHeight : 9999) - 240);
  return (
    <div
      onContextMenu={e => e.preventDefault()}
      style={{
        position: 'fixed', left: x, top: y, zIndex: 3000, minWidth: 190,
        background: '#161b22', border: '1px solid #30363d', borderRadius: 10,
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)', padding: 6
      }}
    >
      {hasSelection ? (
        <>
          {item('lucide:copy-plus', 'Duplicar', onDuplicate, { hint: 'Ctrl+D' })}
          {item('lucide:copy', 'Copiar', onCopy, { hint: 'Ctrl+C' })}
          {item('lucide:clipboard-paste', 'Pegar', onPaste, { hint: 'Ctrl+V', disabled: !canPaste })}
          {canLink && (
            <>
              <div style={{ height: 1, background: '#30363d', margin: '4px 0' }} />
              {item('lucide:link', linkSuggestion ? `Vincular a ${linkSuggestion}` : 'Vincular a producto…', onLinkProduct, { hint: linkSuggestion ? 'oculta al agotarse' : undefined })}
              {isLinked && item('lucide:link-2-off', 'Quitar vínculo', onUnlink)}
            </>
          )}
          <div style={{ height: 1, background: '#30363d', margin: '4px 0' }} />
          {item('lucide:chevron-up', 'Traer adelante', onForward)}
          {item('lucide:chevron-down', 'Enviar atrás', onBack)}
          <div style={{ height: 1, background: '#30363d', margin: '4px 0' }} />
          {item('lucide:trash-2', selectionCount > 1 ? `Eliminar (${selectionCount})` : 'Eliminar', onDelete, { danger: true })}
        </>
      ) : (
        item('lucide:clipboard-paste', 'Pegar', onPaste, { hint: 'Ctrl+V', disabled: !canPaste })
      )}
    </div>
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

function NodeKonva({ node, menuData, fontEpoch = 0, ghost = false, dim = false, onSelect, onDblClick, onMeasure, onDragStart, onDragMove, onNodeDragEnd, onNodeTransformEnd, onContextMenu }) {
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
    // Sold-out preview: ghost the elements that would hide, dim the bindings
    // that stay but show as unavailable. Still selectable/editable.
    opacity: node.hidden ? 0 : (ghost ? 0.15 : (dim ? 0.5 : 1)),
    draggable: !node.locked,
    listening: !node.locked,
    onClick: onSelect, onTap: onSelect,
    onDblClick: () => onDblClick?.(node), onDblTap: () => onDblClick?.(node),
    onDragStart,
    onDragMove,
    onDragEnd: () => onNodeDragEnd?.(node),
    onTransformEnd: () => onNodeTransformEnd?.(node),
    onContextMenu: (e) => onContextMenu?.(e, node)
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
        key={`${s.fontFamily}-${s.fontSize}-${s.fontWeight}-${s.fontStyle}-${s.letterSpacing}-${s.lineHeight}-${fontEpoch}-${auto}`}
        {...common}
        text={node.text || ''}
        width={auto ? undefined : node.w}
        height={auto ? undefined : node.h}
        wrap={auto ? 'none' : 'word'}
        fontFamily={s.fontFamily || 'Georgia, serif'}
        fontSize={s.fontSize || 24}
        fontStyle={`${s.fontStyle || 'normal'} ${s.fontWeight || 400}`.trim()}
        letterSpacing={s.letterSpacing || 0}
        lineHeight={s.lineHeight || 1.15}
        fill={s.color || '#111'}
        align={s.align || 'left'}
        verticalAlign={auto ? 'top' : 'middle'}
      />
    );
  }

  if (node.type === 'shape') {
    const s = node.style || {};
    // Both shapes render inside a Group at (node.x, node.y) with a node.w×node.h
    // box, so drag/transform are uniform (no circle center special-casing) and
    // an optional centered label can ride along.
    return (
      <Group {...common}>
        {node.shape === 'circle' ? (
          <Circle
            x={node.w / 2} y={node.h / 2}
            radius={Math.min(node.w, node.h) / 2}
            fill={s.fill || '#ccc'}
            stroke={s.stroke || undefined}
            strokeWidth={s.strokeWidth || 0}
          />
        ) : (
          <Rect
            width={node.w} height={node.h}
            fill={s.fill || '#ccc'}
            stroke={s.stroke || undefined}
            strokeWidth={s.strokeWidth || 0}
            cornerRadius={s.borderRadius || 0}
          />
        )}
        {node.label ? (
          <Text
            key={`lbl-${node.label.length}-${node.labelStyle?.fontSize}-${fontEpoch}`}
            x={8} y={0} width={Math.max(0, node.w - 16)} height={node.h}
            text={node.label}
            fontFamily={node.labelStyle?.fontFamily || 'Georgia, serif'}
            fontSize={node.labelStyle?.fontSize || 32}
            fontStyle={`${node.labelStyle?.fontWeight || 700}`}
            fill={node.labelStyle?.color || '#ffffff'}
            align="center" verticalAlign="middle"
            listening={false}
          />
        ) : null}
      </Group>
    );
  }

  if (node.type === 'path') {
    const s = node.style || {};
    // Points are absolute, so pin the konva node at (0,0). `name` flags it so
    // the Transformer skips it (freeform paths aren't box-resized).
    return (
      <Path
        {...common}
        name="pathnode"
        x={0} y={0}
        data={pathToSvgD(node.points, node.closed)}
        stroke={s.stroke || '#111'}
        strokeWidth={s.strokeWidth ?? 6}
        fill={s.fill && s.fill !== 'transparent' ? s.fill : undefined}
        lineCap="round"
        lineJoin="round"
        hitStrokeWidth={Math.max(14, (s.strokeWidth ?? 6) + 8)}
      />
    );
  }

  if (node.type === 'image') {
    return <KonvaImageNode node={node} common={common} fit={node.fit || 'cover'} />;
  }

  if (node.type === 'item-binding') {
    return <BindingPlaceholder node={node} common={common} menuData={menuData} fontEpoch={fontEpoch} onMeasure={onMeasure} strike={dim} />;
  }

  if (node.type === 'whatsapp-button') {
    return <WhatsAppButtonKonva node={node} common={common} fontEpoch={fontEpoch} />;
  }

  if (node.type === 'date-field') {
    return <DateFieldKonva node={node} common={common} menuData={menuData} fontEpoch={fontEpoch} />;
  }

  // Unknown — render a dashed outline so the user can see + delete it.
  return (
    <Rect {...common} width={node.w} height={node.h} stroke="#888" strokeWidth={1} dash={[6, 4]} fill="rgba(0,0,0,0.04)" />
  );
}

// Anchor/handle editing overlay for one selected path (entered via
// double-click). Dragging an anchor moves it + its handles; dragging a handle
// moves just that handle. Updates are silent per-move; the parent records a
// single undo step on drag end.
function PathEditor({ node, scale, onStart, onAnchor, onHandle, onEnd }) {
  const k = n => n / (scale || 1);
  const pts = node.points || [];
  return (
    <>
      {pts.map((p, i) => (
        <Group key={i}>
          {p.hIn && <Line points={[p.x, p.y, p.hIn.x, p.hIn.y]} stroke="#1f6feb" strokeWidth={k(1)} />}
          {p.hOut && <Line points={[p.x, p.y, p.hOut.x, p.hOut.y]} stroke="#1f6feb" strokeWidth={k(1)} />}
          {p.hIn && (
            <Circle x={p.hIn.x} y={p.hIn.y} radius={k(4)} fill="#fff" stroke="#1f6feb" strokeWidth={k(1.5)} draggable
              onDragStart={onStart} onDragMove={e => onHandle(i, 'hIn', { x: e.target.x(), y: e.target.y() })} onDragEnd={onEnd} />
          )}
          {p.hOut && (
            <Circle x={p.hOut.x} y={p.hOut.y} radius={k(4)} fill="#fff" stroke="#1f6feb" strokeWidth={k(1.5)} draggable
              onDragStart={onStart} onDragMove={e => onHandle(i, 'hOut', { x: e.target.x(), y: e.target.y() })} onDragEnd={onEnd} />
          )}
          <Circle x={p.x} y={p.y} radius={k(5.5)} fill="#1f6feb" stroke="#fff" strokeWidth={k(1.5)} draggable
            onDragStart={onStart} onDragMove={e => onAnchor(i, { x: e.target.x(), y: e.target.y() })} onDragEnd={onEnd} />
        </Group>
      ))}
    </>
  );
}

// DOM <textarea> overlay for inline text editing (text node content or a
// shape's centered label). Positioned over the node in screen space.
function InlineTextEditor({ node, kind, scale, onCommit, onCancel }) {
  const initial = kind === 'label' ? (node.label || '') : (node.text || '');
  const [val, setVal] = useState(initial);
  const ref = useRef(null);
  useEffect(() => { const t = ref.current; if (t) { t.focus(); t.select(); } }, []);
  const s = (kind === 'label' ? node.labelStyle : node.style) || {};
  const style = {
    position: 'absolute',
    left: node.x * scale, top: node.y * scale,
    width: Math.max(40, node.w * scale), height: Math.max(24, node.h * scale),
    fontFamily: s.fontFamily || 'Georgia, serif',
    fontSize: (s.fontSize || (kind === 'label' ? 32 : 24)) * scale,
    fontWeight: s.fontWeight || (kind === 'label' ? 700 : 400),
    color: s.color || (kind === 'label' ? '#ffffff' : '#111111'),
    textAlign: kind === 'label' ? 'center' : (s.align || 'left'),
    lineHeight: 1.15, background: 'rgba(13,17,23,0.35)', border: '1.5px solid #1f6feb',
    outline: 'none', resize: 'none', padding: 0, margin: 0, overflow: 'hidden', boxSizing: 'border-box', zIndex: 5
  };
  return (
    <textarea
      ref={ref}
      value={val}
      style={style}
      onChange={e => setVal(e.target.value)}
      onBlur={() => onCommit(val)}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onCommit(val); }
      }}
    />
  );
}

// Live preview of the in-progress pen path: the committed segments (dashed),
// a rubber-band to the cursor, anchor dots, and any bézier handles being
// pulled. Rendered in a non-listening overlay layer.
function PenPreview({ draft, cursor, scale }) {
  const pts = draft.points || [];
  const k = n => n / (scale || 1);
  if (pts.length === 0) {
    return cursor ? <Circle x={cursor.x} y={cursor.y} radius={k(4)} stroke="#1f6feb" strokeWidth={k(1)} /> : null;
  }
  const last = pts[pts.length - 1];
  return (
    <>
      <Path data={pathToSvgD(pts, false)} stroke="#1f6feb" strokeWidth={k(2)} dash={[k(5), k(4)]} />
      {cursor && <Line points={[last.x, last.y, cursor.x, cursor.y]} stroke="#1f6feb" strokeWidth={k(1)} dash={[k(3), k(3)]} />}
      {pts.map((p, i) => (
        <Group key={i}>
          {p.hOut && <Line points={[p.x, p.y, p.hOut.x, p.hOut.y]} stroke="#1f6feb" strokeWidth={k(1)} />}
          {p.hIn && <Line points={[p.x, p.y, p.hIn.x, p.hIn.y]} stroke="#1f6feb" strokeWidth={k(1)} />}
          {p.hOut && <Circle x={p.hOut.x} y={p.hOut.y} radius={k(3)} fill="#1f6feb" />}
          {p.hIn && <Circle x={p.hIn.x} y={p.hIn.y} radius={k(3)} fill="#1f6feb" />}
          <Circle x={p.x} y={p.y} radius={k(i === 0 ? 5 : 4)} fill={i === 0 ? '#ffffff' : '#1f6feb'} stroke="#1f6feb" strokeWidth={k(1.5)} />
        </Group>
      ))}
    </>
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
    setTimeout(() => { setImg(null); setFailed(false); }, 0);
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

  // Rounded mask: clip the bitmap (and placeholder fill) to a rounded rect so
  // the editor preview matches the public renderer's border-radius. The failed
  // outline rides outside the clip so it stays fully visible.
  const radius = node.style?.borderRadius || 0;
  const clip = radius > 0
    ? (ctx) => roundRectPath(ctx, 0, 0, w, h, Math.min(radius, w / 2, h / 2))
    : undefined;

  return (
    <Group {...common}>
      <Group clipFunc={clip}>
        <Rect
          width={w} height={h}
          fill={img ? 'transparent' : 'rgba(120,120,120,0.12)'}
        />
        {inner}
      </Group>
      {failed && (
        <Rect width={w} height={h} stroke="#c33" strokeWidth={2} dash={[4, 4]} cornerRadius={radius} listening={false} />
      )}
    </Group>
  );
}

// Trace a rounded-rectangle sub-path on a Konva/canvas 2D context — used as a
// Group clipFunc so images get the same rounded mask the DOM renderer applies
// via border-radius.
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Editor preview for item-binding nodes. Renders the same fields the
// public ItemBindingView does — emoji + name + price respecting the
// `fields` array and `layout` — so the user sees toggle effects live.
// Background/stroke/borderRadius come from node.style so visual edits
// match what customers will see. Unbound nodes get a faint dashed
// outline so they're discoverable.
function BindingPlaceholder({ node, common, menuData, fontEpoch = 0, onMeasure, strike = false }) {
  const idx = useMemo(() => {
    const m = new Map();
    Object.values(menuData?.categories || {}).flat().forEach(it => m.set(it.id, it));
    return m;
  }, [menuData]);
  const item = idx.get(node.item_id);
  const s = node.style || {};
  const fields = node.fields && node.fields.length > 0 ? node.fields : ['name', 'price'];
  const stacked = node.layout === 'stacked';
  const auto = !!node.autoWidth && !stacked;
  const inlineRef = useRef(null);
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

  // Auto-box (inline only): let Konva measure the line and persist the box back
  // silently, so the binding hugs its dynamic text like a free-text autoWidth
  // node — matching the public renderer.
  useEffect(() => {
    if (!auto) return;
    const n = inlineRef.current;
    if (!n) return;
    const w = Math.ceil(n.width()) + pad * 2;
    const h = Math.ceil(n.height());
    if (w > 0 && (Math.abs(w - node.w) > 1 || Math.abs(h - node.h) > 1)) onMeasure?.(node.id, { w, h });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, inlineText, fontFamily, fontSize, fontStyleStr, pad, node.w, node.h, fontEpoch]);

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
          ref={inlineRef}
          key={`${fontFamily}-${fontSize}-${fontStyleStr}-${fontEpoch}-${auto}`}
          x={pad} y={0}
          width={auto ? undefined : Math.max(0, node.w - pad * 2)}
          height={auto ? undefined : node.h}
          wrap={auto ? 'none' : 'word'}
          text={inlineText}
          fontFamily={fontFamily}
          fontSize={fontSize}
          fontStyle={fontStyleStr}
          fill={color}
          align={align}
          textDecoration={strike ? 'line-through' : undefined}
          verticalAlign={auto ? 'top' : 'middle'}
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
            textDecoration={strike ? 'line-through' : undefined}
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
              textDecoration={strike ? 'line-through' : undefined}
            />
          )}
        </>
      )}
    </Group>
  );
}

// WhatsApp button node preview. A rounded pill with the WhatsApp mark drawn as
// a Konva Path plus the label, matching the public renderer's styled anchor.
function WhatsAppButtonKonva({ node, common, fontEpoch = 0 }) {
  const s = node.style || {};
  const label = node.label || 'Pedir por WhatsApp';
  const bg = s.fill || '#25D366';
  const color = s.color || '#ffffff';
  const fontSize = s.fontSize || 28;
  const radius = s.borderRadius ?? Math.min(node.h / 2, 999);
  const glyph = Math.min(node.h * 0.5, fontSize);
  const gap = glyph * 0.4;
  const pad = s.padding ?? 12;
  return (
    <Group {...common}>
      <Rect width={node.w} height={node.h} fill={bg} cornerRadius={Math.min(radius, node.h / 2)} />
      <Group x={0} y={0} clipFunc={(ctx) => roundRectPath(ctx, 0, 0, node.w, node.h, Math.min(radius, node.h / 2))}>
        {/* Center the glyph + label as a unit. */}
        <Path
          x={node.w / 2 - (glyph + gap + label.length * fontSize * 0.28) / 2}
          y={node.h / 2 - glyph / 2}
          data="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.76.46 3.45 1.34 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.16c-.24.68-1.4 1.3-1.94 1.35-.5.05-.98.23-3.3-.69-2.78-1.1-4.56-3.94-4.7-4.13-.14-.19-1.13-1.5-1.13-2.86 0-1.36.71-2.03.97-2.31.24-.26.53-.32.7-.32.18 0 .35 0 .5.01.16.01.38-.06.59.45.24.58.81 2 .88 2.15.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.16-.29.36-.42.48-.14.14-.28.29-.12.57.16.28.72 1.19 1.55 1.93 1.06.95 1.96 1.24 2.24 1.38.28.14.44.12.6-.07.16-.19.69-.81.88-1.09.18-.28.37-.23.62-.14.25.09 1.61.76 1.89.9.28.14.46.21.53.32.07.12.07.66-.17 1.34Z"
          fill={color}
          scaleX={glyph / 24}
          scaleY={glyph / 24}
          listening={false}
        />
        <Text
          key={`wa-${fontSize}-${fontEpoch}`}
          x={pad} y={0}
          width={Math.max(0, node.w - pad * 2)}
          height={node.h}
          text={label}
          fontFamily={s.fontFamily || 'system-ui, sans-serif'}
          fontSize={fontSize}
          fontStyle={`${s.fontWeight || 800}`}
          fill={color}
          align="center"
          verticalAlign="middle"
          listening={false}
        />
      </Group>
    </Group>
  );
}

// Date-field node preview. Emoji + label + formatted date on one line — the
// businessless replacement for the coffee-only roast line. Binds to an item's
// roast_date when linked, else shows the node's own value.
function DateFieldKonva({ node, common, menuData, fontEpoch = 0 }) {
  const idx = useMemo(() => {
    const m = new Map();
    Object.values(menuData?.categories || {}).flat().forEach(it => m.set(it.id, it));
    return m;
  }, [menuData]);
  const s = node.style || {};
  const bound = node.item_id ? idx.get(node.item_id) : null;
  const value = node.value || bound?.roastDate || bound?.roast_date || null;
  const dateStr = formatDateField(value, { lang: 'es', relative: node.relative !== false });
  const text = [node.emoji || '', node.label || '', dateStr || (value ? '' : 'AAAA-MM-DD')].filter(Boolean).join(' ');
  return (
    <Group {...common}>
      <Text
        key={`date-${s.fontSize}-${fontEpoch}`}
        width={node.w} height={node.h}
        text={text}
        fontFamily={s.fontFamily || 'system-ui, sans-serif'}
        fontSize={s.fontSize || 32}
        fontStyle={`${s.fontWeight || 600}`}
        fill={s.color || '#8a6d3b'}
        align={s.align || 'left'}
        verticalAlign="middle"
      />
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
    // Paths opt out of the box transformer (name="pathnode").
    // Skip paths (freeform) and locked nodes (draggable:false) so the
    // transformer never offers resize/rotate handles on a locked element.
    const nodes = (selectedIds || []).map(id => stage.findOne(`#${id}`)).filter(Boolean).filter(n => n.name() !== 'pathnode' && n.draggable());
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
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

function Topbar({ menuName, dirty, saving, onUndo, onRedo, canUndo, canRedo, onSave, onClose, onPrint, onExportPng, showRulers, onToggleRulers, showGrid, onToggleGrid, snapEnabled, onToggleSnap, previewOOS, onTogglePreviewOOS }) {
  const toggle = on => ({ ...ghostBtn, background: on ? 'rgba(31,111,235,0.35)' : 'transparent' });
  return (
    <div style={topbar}>
      <button onClick={onClose} style={ghostBtn} title="Cerrar editor">
        <Icon icon="lucide:x" /> Cerrar
      </button>
      <div style={{ flex: 1, color: 'rgba(255,255,255,0.85)', fontWeight: 800 }}>
        Editor de lienzo — {menuName} {dirty && <span style={{ color: '#ffb84d', fontWeight: 700, marginLeft: 6 }}>•</span>}
      </div>
      <button onClick={onTogglePreviewOOS} style={{ ...toggle(previewOOS), background: previewOOS ? 'rgba(210,120,30,0.45)' : 'transparent' }} title="Simular productos agotados (previsualiza qué se oculta)"><Icon icon="lucide:package-x" /></button>
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

function Toolbar({ onAddText, onAddRect, onAddCircle, onAddImage, onAddBinding, onAddWhatsApp, onAddDate, onTogglePen, penActive, isNarrow }) {
  // Narrow: horizontal, horizontally-scrollable strip above the stage instead
  // of the 80px left rail (which would leave a phone almost no canvas width).
  const sep = isNarrow
    ? <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.15)', margin: '0 2px' }} />
    : <div style={{ height: 1, background: 'rgba(255,255,255,0.15)', margin: '4px 0' }} />;
  return (
    <div style={isNarrow ? toolbarNarrow : toolbar}>
      <ToolBtn icon="lucide:type" label="Texto" onClick={onAddText} isNarrow={isNarrow} />
      <ToolBtn icon="lucide:square" label="Rect" onClick={onAddRect} isNarrow={isNarrow} />
      <ToolBtn icon="lucide:circle" label="Círculo" onClick={onAddCircle} isNarrow={isNarrow} />
      <ToolBtn icon="lucide:pen-tool" label="Pluma" onClick={onTogglePen} active={penActive} isNarrow={isNarrow} />
      <ToolBtn icon="lucide:image" label="Imagen" onClick={onAddImage} isNarrow={isNarrow} />
      {sep}
      <ToolBtn icon="lucide:link" label="Producto" onClick={onAddBinding} isNarrow={isNarrow} />
      <ToolBtn icon="mdi:whatsapp" label="WhatsApp" onClick={onAddWhatsApp} isNarrow={isNarrow} />
      <ToolBtn icon="lucide:calendar-days" label="Fecha" onClick={onAddDate} isNarrow={isNarrow} />
    </div>
  );
}

function ToolBtn({ icon, label, onClick, active, isNarrow }) {
  return (
    <button
      onClick={onClick}
      style={{ ...toolBtnStyle, ...(isNarrow ? { minWidth: 58, flexShrink: 0 } : null), ...(active ? { background: '#1f6feb', borderColor: '#1f6feb' } : null) }}
    >
      <Icon icon={icon} style={{ fontSize: '1.3rem' }} />
      <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.02em' }}>{label}</span>
    </button>
  );
}

function PropertiesPanel({ doc, page, changePageBg, changePageSize, selected, multiCount, selectedIds, onSelectNode, onAlign, onDistribute, onUpdate, onUpdateNode, onReorder, onSetFont, onDelete, onForward, onBack, openAssetPicker, openItemPicker, menuData, style }) {
  const [activeTab, setActiveTab] = useState('props');
  const baseStyle = style || propsPanel;

  return (
    <aside style={{ ...baseStyle, padding: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid #30363d' }}>
        <button
          onClick={() => setActiveTab('props')}
          style={{ flex: 1, padding: '12px 8px', background: 'transparent', border: 'none', borderBottom: activeTab === 'props' ? '2px solid #1f6feb' : '2px solid transparent', color: activeTab === 'props' ? '#fff' : '#8b949e', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}
        >
          Propiedades
        </button>
        <button
          onClick={() => setActiveTab('layers')}
          style={{ flex: 1, padding: '12px 8px', background: 'transparent', border: 'none', borderBottom: activeTab === 'layers' ? '2px solid #1f6feb' : '2px solid transparent', color: activeTab === 'layers' ? '#fff' : '#8b949e', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}
        >
          Capas
        </button>
      </div>

      <div style={{ padding: '16px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'layers' ? (
          <LayersPanel
            nodes={page?.nodes}
            selectedIds={selectedIds}
            onSelect={onSelectNode}
            onUpdate={onUpdateNode}
            onReorder={onReorder}
          />
        ) : (
          multiCount > 1 ? (
            <MultiSelectProps count={multiCount} onAlign={onAlign} onDistribute={onDistribute} />
          ) : !selected ? (
            <PageProperties doc={doc} page={page} changePageBg={changePageBg} changePageSize={changePageSize} />
          ) : selected.locked ? (
            <LockedNotice onUnlock={() => onUpdateNode(selected.id, { locked: false })} />
          ) : (
            <NodeProperties
              node={selected}
              onUpdate={onUpdate}
              onSetFont={onSetFont}
              onDelete={onDelete}
              onForward={() => onForward(selected.id)}
              onBack={() => onBack(selected.id)}
              openAssetPicker={openAssetPicker}
              openItemPicker={openItemPicker}
              menuData={menuData}
            />
          )
        )}
      </div>
    </aside>
  );
}

// Shown when 2+ nodes are selected: alignment + distribution tools. The
// target switch decides the reference frame — the selection bbox, the page,
// or the key object (the first node selected, which stays put).
function MultiSelectProps({ count, onAlign, onDistribute }) {
  const [target, setTarget] = useState('selection');
  const aligns = [
    { dir: 'left', icon: 'lucide:align-start-vertical', label: 'Izquierda' },
    { dir: 'hcenter', icon: 'lucide:align-center-vertical', label: 'Centro horizontal' },
    { dir: 'right', icon: 'lucide:align-end-vertical', label: 'Derecha' },
    { dir: 'top', icon: 'lucide:align-start-horizontal', label: 'Arriba' },
    { dir: 'vcenter', icon: 'lucide:align-center-horizontal', label: 'Centro vertical' },
    { dir: 'bottom', icon: 'lucide:align-end-horizontal', label: 'Abajo' }
  ];
  const targets = [
    { id: 'selection', label: 'Selección' },
    { id: 'canvas', label: 'Lienzo' },
    { id: 'key', label: 'Objeto clave' }
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 style={panelTitle}>{count} seleccionados</h3>
      <p style={{ margin: 0, fontSize: '0.78rem', color: '#8b949e' }}>
        Arrastra cualquiera para moverlos juntos, o usa el recuadro para escalar/rotar el grupo.
      </p>

      <Row label="Alinear respecto a">
        <div style={{ display: 'flex', gap: 4, width: '100%' }}>
          {targets.map(t => (
            <button key={t.id} onClick={() => setTarget(t.id)} style={{
              ...smallBtn, flex: 1, justifyContent: 'center', padding: '6px 2px', fontSize: '0.72rem',
              ...(target === t.id ? { background: '#1f6feb', color: 'white', borderColor: '#1f6feb' } : null)
            }}>{t.label}</button>
          ))}
        </div>
      </Row>
      {target === 'key' && (
        <p style={{ margin: '-6px 0 0', fontSize: '0.7rem', color: '#8b949e' }}>
          El objeto clave es el primero seleccionado y no se mueve.
        </p>
      )}

      <Row label="Alinear">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {aligns.map(a => (
            <button key={a.dir} onClick={() => onAlign(a.dir, target)} title={a.label} style={{ ...smallBtn, justifyContent: 'center', padding: '8px 4px' }}>
              <Icon icon={a.icon} />
            </button>
          ))}
        </div>
      </Row>

      <Row label="Distribuir">
        <div style={{ display: 'flex', gap: 6, width: '100%' }}>
          <button onClick={() => onDistribute('h')} disabled={count < 3} title="Espaciado horizontal uniforme" style={{ ...smallBtn, flex: 1, justifyContent: 'center', opacity: count < 3 ? 0.5 : 1 }}>
            <Icon icon="lucide:align-horizontal-distribute-center" /> H
          </button>
          <button onClick={() => onDistribute('v')} disabled={count < 3} title="Espaciado vertical uniforme" style={{ ...smallBtn, flex: 1, justifyContent: 'center', opacity: count < 3 ? 0.5 : 1 }}>
            <Icon icon="lucide:align-vertical-distribute-center" /> V
          </button>
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

// Shown instead of the editable properties when a locked node is selected
// (e.g. picked from the Layers panel). Editing stays blocked until unlocked —
// matching Illustrator, where a locked item can't be modified.
function LockedNotice({ onUnlock }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}>
      <h3 style={panelTitle}>Elemento bloqueado</h3>
      <p style={{ margin: 0, fontSize: '0.82rem', color: '#8b949e', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <Icon icon="lucide:lock" style={{ flexShrink: 0, marginTop: 2 }} />
        Este elemento está bloqueado. Desbloquéalo para mover o editar sus propiedades.
      </p>
      <button onClick={onUnlock} style={{ ...smallBtn, background: '#1f6feb', color: 'white', borderColor: '#1f6feb', justifyContent: 'center', alignSelf: 'stretch' }}>
        <Icon icon="lucide:unlock" /> Desbloquear
      </button>
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

      {/* Paths are absolute point geometry — numeric x/y/w/h editing would
          desync them, so those rows are hidden for paths (drag to move). */}
      {node.type !== 'path' && (
        <>
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
        </>
      )}

      {node.type === 'text' && <TextProps node={node} onUpdate={onUpdate} onSetFont={onSetFont} />}
      {node.type === 'shape' && <ShapeProps node={node} onUpdate={onUpdate} />}
      {node.type === 'path' && <PathProps node={node} onUpdate={onUpdate} />}
      {node.type === 'image' && <ImageProps node={node} onUpdate={onUpdate} openAssetPicker={openAssetPicker} />}
      {node.type === 'item-binding' && <BindingProps node={node} onUpdate={onUpdate} onSetFont={onSetFont} openItemPicker={openItemPicker} menuData={menuData} />}
      {node.type === 'whatsapp-button' && <WhatsAppProps node={node} onUpdate={onUpdate} onSetFont={onSetFont} />}
      {node.type === 'date-field' && <DateFieldProps node={node} onUpdate={onUpdate} onSetFont={onSetFont} openItemPicker={openItemPicker} menuData={menuData} />}

      {/* Item-bindings own their availability behavior; every other node type
          can borrow a product's stock to auto-hide. */}
      {node.type !== 'item-binding' && (
        <VisibilityLink node={node} onUpdate={onUpdate} openItemPicker={openItemPicker} menuData={menuData} />
      )}

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
  if (n.type === 'whatsapp-button') return 'Botón WhatsApp';
  if (n.type === 'date-field') return 'Fecha';
  if (n.type === 'path') return 'Trazo';
  return n.type;
}

function PathProps({ node, onUpdate }) {
  const s = node.style || {};
  return (
    <>
      <Row label="Trazo"><ColorPicker value={s.stroke || '#111111'} onChange={c => onUpdate({ style: { stroke: c } })} /></Row>
      <Row label="Grosor"><NumInput value={s.strokeWidth ?? 6} onChange={v => onUpdate({ style: { strokeWidth: Math.max(0, v) } })} /></Row>
      <Row label="Relleno">
        <ColorPicker value={s.fill && s.fill !== 'transparent' ? s.fill : '#000000'} onChange={c => onUpdate({ style: { fill: c } })} />
        {s.fill && s.fill !== 'transparent' && (
          <button onClick={() => onUpdate({ style: { fill: 'transparent' } })} style={smallBtn} title="Sin relleno"><Icon icon="lucide:x" /></button>
        )}
      </Row>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#ddd', cursor: 'pointer' }}>
        <input type="checkbox" checked={!!node.closed} onChange={e => onUpdate({ closed: e.target.checked })} />
        Cerrar trazo
      </label>
    </>
  );
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

      <div style={{ borderTop: '1px solid #30363d', paddingTop: 10, marginTop: 4 }}>
        <p style={{ ...panelTitle, marginBottom: 8, fontSize: '0.75rem' }}>Tipografía</p>
      </div>
      <Row label="Estilo">
        <button
          onClick={() => onUpdate({ style: { fontStyle: s.fontStyle === 'italic' ? 'normal' : 'italic' } })}
          style={{ ...smallBtn, fontStyle: 'italic', ...(s.fontStyle === 'italic' ? { background: '#1f6feb', color: 'white', borderColor: '#1f6feb' } : null) }}
          title="Cursiva"
        >
          <Icon icon="lucide:italic" /> Cursiva
        </button>
      </Row>
      <Row label="Interlineado">
        <NumInput value={s.lineHeight ?? 1.15} step={0.05} onChange={v => onUpdate({ style: { lineHeight: Math.max(0.5, v) } })} suffix="×" />
      </Row>
      <Row label="Interletraje">
        <NumInput value={s.letterSpacing || 0} onChange={v => onUpdate({ style: { letterSpacing: v } })} suffix="px" />
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
  const ls = node.labelStyle || {};
  return (
    <>
      <Row label="Relleno"><ColorPicker value={s.fill || '#cccccc'} onChange={c => onUpdate({ style: { fill: c } })} /></Row>
      <Row label="Borde"><ColorPicker value={s.stroke || '#000000'} onChange={c => onUpdate({ style: { stroke: c } })} /></Row>
      <Row label="Grosor"><NumInput value={s.strokeWidth || 0} onChange={v => onUpdate({ style: { strokeWidth: v } })} /></Row>
      {node.shape !== 'circle' && (
        <Row label="Radio"><NumInput value={s.borderRadius || 0} onChange={v => onUpdate({ style: { borderRadius: v } })} /></Row>
      )}
      <Row label="Etiqueta">
        <input value={node.label || ''} onChange={e => onUpdate({ label: e.target.value })} placeholder="Doble clic para editar" style={textInputStyle} />
      </Row>
      {node.label ? (
        <>
          <Row label="Tamaño etiqueta"><NumInput value={ls.fontSize || 32} onChange={v => onUpdate({ labelStyle: { ...ls, fontSize: v } })} /></Row>
          <Row label="Color etiqueta"><ColorPicker value={ls.color || '#ffffff'} onChange={c => onUpdate({ labelStyle: { ...ls, color: c } })} /></Row>
        </>
      ) : null}
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
      <Row label="Radio esquinas">
        <NumInput value={node.style?.borderRadius || 0} onChange={v => onUpdate({ style: { borderRadius: Math.max(0, v) } })} suffix="px" />
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
      {node.layout !== 'stacked' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#ddd', cursor: 'pointer' }}>
          <input type="checkbox" checked={!!node.autoWidth} onChange={e => onUpdate({ autoWidth: e.target.checked })} />
          Ancho automático
          <span style={{ color: '#8b949e', fontSize: '0.72rem' }}>(la caja se ajusta al texto)</span>
        </label>
      )}
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

function WhatsAppProps({ node, onUpdate, onSetFont }) {
  const s = node.style || {};
  return (
    <>
      <Row label="Enlace de WhatsApp">
        <input
          type="url"
          inputMode="url"
          value={node.url || ''}
          onChange={e => onUpdate({ url: e.target.value })}
          placeholder="https://wa.me/52..."
          style={textInputStyle}
        />
      </Row>
      <Row label="Texto del botón">
        <input value={node.label || ''} onChange={e => onUpdate({ label: e.target.value })} placeholder="Pedir por WhatsApp" style={textInputStyle} />
      </Row>
      <FontPicker value={s.fontFamily} onSetFont={onSetFont} />
      <Row label="Tamaño texto"><NumInput value={s.fontSize || 28} onChange={v => onUpdate({ style: { fontSize: v } })} /></Row>
      <Row label="Color fondo"><ColorPicker value={s.fill || '#25D366'} onChange={c => onUpdate({ style: { fill: c } })} /></Row>
      <Row label="Color texto"><ColorPicker value={s.color || '#ffffff'} onChange={c => onUpdate({ style: { color: c } })} /></Row>
      <Row label="Radio esquinas"><NumInput value={s.borderRadius ?? 999} onChange={v => onUpdate({ style: { borderRadius: Math.max(0, v) } })} suffix="px" /></Row>
      <p style={{ margin: 0, fontSize: '0.72rem', color: '#8b949e' }}>
        Abre el enlace en el navegador al tocarlo en el menú público.
      </p>
    </>
  );
}

function DateFieldProps({ node, onUpdate, onSetFont, openItemPicker, menuData }) {
  const s = node.style || {};
  const itemIndex = useMemo(() => {
    const m = new Map();
    Object.values(menuData?.categories || {}).flat().forEach(it => m.set(it.id, it));
    return m;
  }, [menuData]);
  const item = node.item_id ? itemIndex.get(node.item_id) : null;
  return (
    <>
      <Row label="Emoji">
        <input
          value={node.emoji || ''}
          onChange={e => onUpdate({ emoji: e.target.value })}
          placeholder="🔥"
          maxLength={4}
          style={{ ...textInputStyle, width: 64, flex: '0 0 auto', textAlign: 'center', fontSize: '1.1rem' }}
        />
        <span style={{ color: '#8b949e', fontSize: '0.72rem' }}>Cualquier emoji o vacío</span>
      </Row>
      <Row label="Etiqueta">
        <input value={node.label || ''} onChange={e => onUpdate({ label: e.target.value })} placeholder="Tostado:, Cosecha:, Vence:…" style={textInputStyle} />
      </Row>
      <Row label="Origen de la fecha">
        <button
          onClick={() => openItemPicker?.(ids => { if (ids[0]) onUpdate({ item_id: ids[0], value: '' }); })}
          style={{ ...smallBtn, flex: 1, justifyContent: 'flex-start', background: '#0d1117' }}
          title="Vincular a la fecha de un producto"
        >
          <Icon icon={item ? 'lucide:link' : 'lucide:calendar'} style={{ color: item ? '#3fb950' : '#8b949e' }} />
          <span style={{ flex: 1, textAlign: 'left' }}>{item ? `${item.name}` : 'Fecha manual'}</span>
        </button>
        {node.item_id && (
          <button onClick={() => onUpdate({ item_id: null })} style={smallBtn} title="Quitar vínculo"><Icon icon="lucide:x" /></button>
        )}
      </Row>
      {!node.item_id && (
        <Row label="Fecha">
          <input
            type="date"
            value={node.value || ''}
            onChange={e => onUpdate({ value: e.target.value })}
            style={textInputStyle}
          />
        </Row>
      )}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#ddd', cursor: 'pointer' }}>
        <input type="checkbox" checked={node.relative !== false} onChange={e => onUpdate({ relative: e.target.checked })} />
        Mostrar frescura relativa
        <span style={{ color: '#8b949e', fontSize: '0.72rem' }}>(«hace 3 días»)</span>
      </label>
      <FontPicker value={s.fontFamily} onSetFont={onSetFont} />
      <Row label="Tamaño texto"><NumInput value={s.fontSize || 32} onChange={v => onUpdate({ style: { fontSize: v } })} /></Row>
      <Row label="Color texto"><ColorPicker value={s.color || '#8a6d3b'} onChange={c => onUpdate({ style: { color: c } })} /></Row>
      <Row label="Alineación">
        <select value={s.align || 'left'} onChange={e => onUpdate({ style: { align: e.target.value } })} style={selectStyle}>
          <option value="left">Izquierda</option>
          <option value="center">Centro</option>
          <option value="right">Derecha</option>
        </select>
      </Row>
    </>
  );
}

// Ties any node's visibility to a catalog item's stock: when the item sells
// out, the node hides on the public menu. Lets an owner wrap a badge, photo, or
// callout around a product and have the whole thing vanish together — the
// generic version of the item-binding's own hide-when-out-of-stock option.
function VisibilityLink({ node, onUpdate, openItemPicker, menuData }) {
  const itemIndex = useMemo(() => {
    const m = new Map();
    Object.values(menuData?.categories || {}).flat().forEach(it => m.set(it.id, it));
    return m;
  }, [menuData]);
  const link = node.link || null;
  const item = link?.itemId ? itemIndex.get(link.itemId) : null;
  return (
    <div style={{ borderTop: '1px solid #30363d', paddingTop: 10, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ ...panelTitle, margin: 0, fontSize: '0.75rem' }}>Visibilidad</p>
      <Row label="Vincular a producto">
        <button
          onClick={() => openItemPicker?.(ids => { if (ids[0]) onUpdate({ link: { itemId: ids[0], hideWhenOOS: link?.hideWhenOOS ?? true } }); })}
          style={{ ...smallBtn, flex: 1, justifyContent: 'flex-start', background: '#0d1117' }}
          title="Ocultar este elemento según el inventario de un producto"
        >
          <Icon icon={item ? 'lucide:link' : 'lucide:link-2-off'} style={{ color: item ? '#3fb950' : '#8b949e' }} />
          <span style={{ flex: 1, textAlign: 'left' }}>
            {link?.itemId ? (item ? `${item.emoji ? item.emoji + ' ' : ''}${item.name}` : `(producto eliminado)`) : 'Sin vínculo'}
          </span>
        </button>
        {link?.itemId && (
          <button onClick={() => onUpdate({ link: null })} style={smallBtn} title="Quitar vínculo"><Icon icon="lucide:x" /></button>
        )}
      </Row>
      {link?.itemId ? (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#ddd', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={link.hideWhenOOS !== false}
            onChange={e => onUpdate({ link: { ...link, hideWhenOOS: e.target.checked } })}
          />
          Ocultar cuando se agote
        </label>
      ) : (
        <p style={{ margin: 0, fontSize: '0.72rem', color: '#8b949e' }}>
          Vincula este elemento a un producto para que desaparezca del menú cuando se agote.
        </p>
      )}
    </div>
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

function NumInput({ value, onChange, suffix, step }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#22272e', borderRadius: 6, padding: '4px 8px', border: '1px solid #30363d', flex: 1 }}>
      <input
        type="number"
        step={step ?? 1}
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
const topbar  = { display: 'flex', alignItems: 'center', gap: 8, rowGap: 6, padding: '10px 16px', background: '#161b22', borderBottom: '1px solid #30363d', flexWrap: 'wrap' };
const pageTabs = { display: 'flex', gap: 8, alignItems: 'center', padding: '6px 16px', background: '#0d1117', borderBottom: '1px solid #30363d', overflowX: 'auto' };
const mainRow  = { display: 'flex', flex: 1, minHeight: 0 };
// Narrow (phone/tablet): stack toolbar → stage → bottom sheet vertically.
const mainRowNarrow = { ...mainRow, flexDirection: 'column' };
const toolbar  = { width: 80, padding: 12, background: '#161b22', borderRight: '1px solid #30363d', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' };
const toolbarNarrow = { display: 'flex', flexDirection: 'row', gap: 8, alignItems: 'stretch', padding: '8px 12px', background: '#161b22', borderBottom: '1px solid #30363d', overflowX: 'auto', WebkitOverflowScrolling: 'touch', flexShrink: 0 };
const stageArea = { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: '#0d1117', overflow: 'auto' };
const stageAreaNarrow = { ...stageArea, padding: 8, minHeight: 0 };
const propsPanel = { width: 300, padding: 16, background: '#161b22', borderLeft: '1px solid #30363d', overflowY: 'auto' };
// Bottom sheet on narrow: full width, capped height, its own scroll.
const propsPanelNarrow = { width: '100%', padding: 16, background: '#161b22', borderTop: '1px solid #30363d', overflowY: 'auto', maxHeight: '46vh', flexShrink: 0 };
const sheetHandle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 12px', background: '#161b22', borderTop: '1px solid #30363d', flexShrink: 0, cursor: 'pointer', userSelect: 'none' };

const ghostBtn   = { background: 'transparent', border: '1px solid transparent', color: 'white', padding: '6px 10px', borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 };
const primaryBtn = { background: '#238636', border: 'none', color: 'white', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 800 };
const toolBtnStyle = { background: '#22272e', border: '1px solid #30363d', color: 'white', borderRadius: 8, padding: '8px 4px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 };
const panelTitle = { margin: 0, fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8b949e' };
const smallBtn  = { background: 'transparent', border: '1px solid #30363d', color: '#ddd', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' };

const textInputStyle = { flex: 1, background: '#22272e', border: '1px solid #30363d', color: 'white', borderRadius: 6, padding: '6px 8px', fontSize: '0.85rem', outline: 'none' };
const textareaStyle  = { ...textInputStyle, width: '100%', resize: 'vertical', fontFamily: 'inherit' };
const selectStyle    = { ...textInputStyle, cursor: 'pointer' };
