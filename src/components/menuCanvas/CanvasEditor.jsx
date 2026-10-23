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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { Stage, Layer, Rect, Text, Group, Line } from 'react-konva';
import { Icon } from '@iconify/react';
import { nanoid } from 'nanoid';
import { newDocument, newPage, PAGE_PRESETS, syncDocFonts, docFontLoadSpecs, pathBBox, translatePath, cloneNodeGeometry, clusterByGroup } from '../../utils/canvasDocument';
import { PaletteContext } from './paletteContext';
import { updateMenu } from '../../api/menus';
import { openInBrowser } from '../../utils/openInBrowser';
import { menuBaseUrl } from '../../utils/customDomainSync';
import AssetPicker from './AssetPicker';
import ItemPicker from './ItemPicker';
import { ContextMenu } from './editor/ContextMenu';
import { GridOverlay, GuidesOverlay, RULER, Ruler } from './editor/overlays';
import { InlineTextEditor, PathEditor, PenPreview, SelectionTransformer } from './editor/stageTools';
import { NodeKonva } from './editor/NodeKonva';
import { PageTabs, Toolbar, Topbar } from './editor/chrome';
import { PropertiesPanel } from './editor/PropertiesPanel';
import { mainRow, mainRowNarrow, overlay, propsPanelNarrow, sheetHandle, stageArea, stageAreaNarrow, zoomBtn, zoomWidget } from './editor/styles';
import { nextZ, rectsOverlap, sortedNodes } from './editor/geometry';

const HISTORY_LIMIT = 50;

export default function CanvasEditor({ menu, menuData, onClose, showAlert }) {
  const { t } = useTranslation();
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
      } else if (meta && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) ungroupSelected(); else groupSelected();
      } else if (meta && e.key === '0') {
        e.preventDefault(); resetZoom();
      } else if (meta && (e.key === '=' || e.key === '+')) {
        e.preventDefault(); zoomByFactor(1.2);
      } else if (meta && e.key === '-') {
        e.preventDefault(); zoomByFactor(1 / 1.2);
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
    // Remap group ids so pasting/duplicating a group yields a fresh, independent
    // group rather than merging the copies into the original.
    const gidMap = new Map();
    const withIds = clones.map((c, i) => {
      const g = cloneNodeGeometry(c, dx, dy); // re-offset from the stored clone
      if (g.groupId) {
        if (!gidMap.has(g.groupId)) gidMap.set(g.groupId, 'grp_' + nanoid(6));
        g.groupId = gidMap.get(g.groupId);
      }
      return { ...g, id: nanoid(8), z: z0 + i };
    });
    mutatePage(p => {
      const groups = { ...(p.groups || {}) };
      for (const [oldG, newG] of gidMap) groups[newG] = { name: t('canvas.groupCopy').replace('{name}', p.groups?.[oldG]?.name || t('canvas.group')) };
      return { ...p, nodes: [...(p.nodes || []), ...withIds], groups };
    });
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
    // Grouped nodes must stay contiguous so nothing renders between members —
    // re-cluster before assigning z regardless of how the drag shuffled ids.
    const groupOf = id => (page?.nodes || []).find(n => n.id === id)?.groupId;
    const ordered = clusterByGroup(orderedTopFirst, groupOf);
    const n = ordered.length;
    const zById = new Map();
    ordered.forEach((id, i) => zById.set(id, n - i)); // top of list → highest z
    mutatePage(p => ({ ...p, nodes: (p.nodes || []).map(node => zById.has(node.id) ? { ...node, z: zById.get(node.id) } : node) }));
  }

  // ---------- Grouping ------------------------------------------------------
  // Flat model: a "group" is just a shared groupId on ≥1 node, with an optional
  // display name in page.groups. Grouping selects-as-one on the canvas and
  // clusters in the Layers panel; the public renderer never sees groups because
  // every node keeps its own absolute geometry and z.

  // Every id that shares a group with any id in `ids` (self if ungrouped).
  function expandGroups(ids) {
    const nodes = page?.nodes || [];
    const gids = new Set();
    for (const id of ids) {
      const g = nodes.find(n => n.id === id)?.groupId;
      if (g) gids.add(g);
    }
    if (gids.size === 0) return ids;
    const out = new Set(ids);
    for (const n of nodes) if (n.groupId && gids.has(n.groupId)) out.add(n.id);
    return Array.from(out);
  }
  // The nodes that move together when `id` is clicked on the canvas: its whole
  // group, or just itself.
  function groupPeers(id) {
    const g = (page?.nodes || []).find(n => n.id === id)?.groupId;
    if (!g) return [id];
    return (page?.nodes || []).filter(n => n.groupId === g).map(n => n.id);
  }
  // Canvas selection with group semantics: a plain click selects the clicked
  // node's whole group; shift-click toggles that group in/out of the selection.
  function selectFromCanvas(id, additive) {
    const peers = groupPeers(id);
    if (!additive) { setSelectedIds(peers); return; }
    setSelectedIds(prev => {
      const allIn = peers.every(p => prev.includes(p));
      return allIn ? prev.filter(p => !peers.includes(p)) : Array.from(new Set([...prev, ...peers]));
    });
  }

  function groupSelected() {
    const set = new Set(selectedIds);
    if (set.size < 2) return;
    const gid = 'grp_' + nanoid(6);
    const nodes = page?.nodes || [];
    // Cluster the members at their frontmost position, keeping relative order.
    const topFirst = [...nodes].sort((a, b) => (b.z || 0) - (a.z || 0)).map(n => n.id);
    const clustered = clusterByGroup(topFirst, id => (set.has(id) ? gid : nodes.find(n => n.id === id)?.groupId));
    const zById = new Map();
    clustered.forEach((id, i) => zById.set(id, clustered.length - i));
    const groupNum = Object.keys(page?.groups || {}).length + 1;
    commit({
      ...doc,
      pages: doc.pages.map((p, i) => i === pageIndex ? {
        ...p,
        groups: { ...(p.groups || {}), [gid]: { name: `Grupo ${groupNum}` } },
        nodes: (p.nodes || []).map(n => ({
          ...n,
          ...(set.has(n.id) ? { groupId: gid } : {}),
          ...(zById.has(n.id) ? { z: zById.get(n.id) } : {}),
        })),
      } : p),
    });
    setSelectedIds(clustered.filter(id => set.has(id)));
  }

  function ungroupSelected() {
    const set = new Set(selectedIds);
    const nodes = page?.nodes || [];
    const gids = new Set(nodes.filter(n => set.has(n.id) && n.groupId).map(n => n.groupId));
    if (gids.size === 0) return;
    commit({
      ...doc,
      pages: doc.pages.map((p, i) => i === pageIndex ? {
        ...p,
        groups: Object.fromEntries(Object.entries(p.groups || {}).filter(([g]) => !gids.has(g))),
        nodes: (p.nodes || []).map(n => {
          if (!gids.has(n.groupId)) return n;
          const { groupId, ...rest } = n;
          return rest;
        }),
      } : p),
    });
  }
  function renameGroup(gid, name) {
    mutatePage(p => ({ ...p, groups: { ...(p.groups || {}), [gid]: { ...(p.groups?.[gid] || {}), name } } }));
  }
  // Bulk patch every node in `ids` in one commit (group lock/hide from the
  // Layers panel header).
  function bulkUpdateNodes(ids, patch) {
    const set = new Set(ids);
    mutatePage(p => ({ ...p, nodes: (p.nodes || []).map(n => set.has(n.id) ? { ...n, ...patch } : n) }));
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
      t('canvas.outOfPage')
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
      showAlert?.(t('canvas.missingConfigTitle'), t('canvas.missingConfigDesc'));
      return;
    }
    if (dirty && !window.confirm(t('canvas.unsavedPrint'))) return;
    const go = () => {
      const printUrl = `${menuBaseUrl()}/menu?u=${btoa(url)}&k=${btoa(key)}&m=${menu.id}&print=1`;
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
      showAlert?.(t('canvas.saveError'), err.message);
    } finally { setSaving(false); }
  }

  function tryClose() {
    if (dirty && !window.confirm(t('canvas.unsavedClose'))) return;
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
  // The on-screen scale is the fit-to-viewport scale times the user's zoom.
  // zoom = 1 means "fit"; Ctrl/⌘ + wheel (or the zoom controls) change it.
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const stageScale = fitScale * zoom;
  const MIN_SCALE = 0.1, MAX_SCALE = 8;

  useEffect(() => {
    function recalc() {
      const el = stageWrapRef.current;
      if (!el) return;
      const pad = 40 + (showRulers ? RULER : 0);
      const aw = el.clientWidth - pad;
      const ah = el.clientHeight - pad;
      setFitScale(Math.min(aw / pageW, ah / pageH));
    }
    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [pageW, pageH, showRulers, isNarrow, panelOpen]);

  // Refs so the imperative wheel handler reads live values without re-binding.
  const stageScaleRef = useRef(stageScale);
  const fitScaleRef = useRef(fitScale);
  useEffect(() => { stageScaleRef.current = stageScale; fitScaleRef.current = fitScale; });

  // A scroll target queued by a zoom step, applied after the DOM resizes so the
  // point under the cursor (or the viewport center) stays put across the zoom.
  const pendingScrollRef = useRef(null);
  useLayoutEffect(() => {
    const t = pendingScrollRef.current;
    if (t && stageWrapRef.current) {
      stageWrapRef.current.scrollLeft = t.left;
      stageWrapRef.current.scrollTop = t.top;
    }
    pendingScrollRef.current = null;
  }, [zoom]);

  // Change the absolute scale toward a target, anchored at a container-relative
  // point (cx, cy) so that point doesn't drift. Queues the matching scroll.
  const applyScaleAt = useCallback((nextScaleRaw, cx, cy) => {
    const el = stageWrapRef.current;
    const old = stageScaleRef.current;
    const fit = fitScaleRef.current || 1;
    const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScaleRaw));
    if (!el || Math.abs(nextScale - old) < 1e-4) return;
    const f = nextScale / old;
    pendingScrollRef.current = { left: (el.scrollLeft + cx) * f - cx, top: (el.scrollTop + cy) * f - cy };
    setZoom(nextScale / fit);
  }, []);

  // Intercept Ctrl/⌘ + wheel: zoom the canvas instead of the browser page.
  // Registered natively (passive:false) so preventDefault actually stops the
  // page-zoom gesture. Plain wheel keeps its default scroll/pan behavior.
  useEffect(() => {
    const el = stageWrapRef.current;
    if (!el) return;
    function onWheel(e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * 0.0015);
      applyScaleAt(stageScaleRef.current * factor, e.clientX - rect.left, e.clientY - rect.top);
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyScaleAt]);

  // Zoom controls (buttons / keyboard) — anchored at the viewport center.
  function zoomByFactor(factor) {
    const el = stageWrapRef.current;
    if (!el) { setZoom(z => Math.max(MIN_SCALE, Math.min(MAX_SCALE, (fitScaleRef.current * z) * factor)) / (fitScaleRef.current || 1)); return; }
    applyScaleAt(stageScaleRef.current * factor, el.clientWidth / 2, el.clientHeight / 2);
  }
  function resetZoom() { pendingScrollRef.current = { left: 0, top: 0 }; setZoom(1); }

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
    // Marquee touching one group member pulls in the whole group.
    const hitExpanded = expandGroups(hit);
    setSelectedIds(prev => e.evt.shiftKey ? Array.from(new Set([...prev, ...hitExpanded])) : hitExpanded);
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

  // Live resize is WYSIWYG: instead of letting Konva stretch the node's pixels
  // during the drag (which distorts text glyphs / re-cropped images and then
  // snaps back on release), we bake the scale into real geometry on every
  // transform frame and reset the konva scale to 1. Text grows its FONT SIZE
  // rather than its box, so it scales like Illustrator/Figma; every other node
  // re-renders its children from the new w/h so the preview already matches the
  // committed result. A pre-drag snapshot feeds a single undo step on end.
  const transformGuardRef = useRef(false);
  const transformStartRef = useRef(null);

  function handleNodeTransformStart() {
    if (transformStartRef.current == null) transformStartRef.current = doc;
  }

  // Per-frame, single-node normalization. Group transforms are skipped here
  // (fighting the multi-node bounding box mid-drag causes jitter) and baked in
  // one shot on end instead.
  function handleNodeTransform(e, node) {
    if (selectedIds.length > 1) return;
    const kn = e.target;
    const sx = kn.scaleX(), sy = kn.scaleY();
    // Auto-fit text resizes as a box (below) so the font refits the new bounds;
    // other text grows its font instead of stretching.
    if (node.type === 'text' && !node.autoFit) {
      // Grow the font by the geometric mean of the two axes: corner drags are
      // uniform (sx==sy) so it tracks exactly; side drags still feel
      // proportional. Set it imperatively (synchronous) so Konva re-measures
      // this same frame — no state churn, no remount of the transform target.
      const factor = Math.sqrt(Math.abs(sx * sy)) || 1;
      const base = node.style?.fontSize || 24;
      kn.fontSize(Math.max(4, base * factor));
      if (!node.autoWidth) kn.width(Math.max(10, node.w * sx));
      kn.scaleX(1); kn.scaleY(1);
      return;
    }
    // Shapes / images / bindings render their content from w/h props, so bake
    // the scale into a silent size update and reset scale. Their outer Group
    // isn't keyed by size, so children re-render at the right proportions
    // without remounting the node the Transformer is attached to.
    kn.scaleX(1); kn.scaleY(1);
    updateNodeSilent(node.id, {
      x: Math.round(kn.x()), y: Math.round(kn.y()),
      w: Math.max(10, Math.round(node.w * sx)),
      h: Math.max(10, Math.round(node.h * sy)),
    });
  }

  // Transform end: fold each node's remaining scale into real geometry and
  // record ONE undo step from the pre-drag snapshot. The Transformer fires
  // transformend once PER attached node, so a guard makes only the first call
  // of a gesture do the work. Combining the live-baked value with the current
  // konva scale multiplicatively means this is correct whether the live pass
  // ran (single node → scale ~1) or was skipped (group → scale carries it).
  function handleNodeTransformEnd(node) {
    if (transformGuardRef.current) return;
    transformGuardRef.current = true;
    requestAnimationFrame(() => { transformGuardRef.current = false; });

    const startDoc = transformStartRef.current;
    transformStartRef.current = null;
    const stage = stageRef.current;
    const ids = selectedIds.length > 1 && selectedIds.includes(node.id) ? selectedIds : [node.id];
    const set = new Set(ids);
    setDoc(d => ({
      ...d,
      pages: d.pages.map((p, i) => i === pageIndex ? {
        ...p,
        nodes: (p.nodes || []).map(n => {
          if (!set.has(n.id)) return n;
          const kn = stage?.findOne('#' + n.id);
          if (!kn) return n;
          const sx = kn.scaleX(), sy = kn.scaleY();
          kn.scaleX(1); kn.scaleY(1);
          const base = { x: Math.round(kn.x()), y: Math.round(kn.y()), rotation: Math.round(kn.rotation()) };
          if (n.type === 'text' && !n.autoFit) {
            const factor = Math.sqrt(Math.abs(sx * sy)) || 1;
            const nextFont = Math.max(4, Math.round((kn.fontSize?.() || n.style?.fontSize || 24) * factor));
            const patch = { ...base, style: { ...n.style, fontSize: nextFont } };
            if (!n.autoWidth) {
              patch.w = Math.max(10, Math.round((kn.width?.() || n.w) * sx));
              patch.h = Math.max(10, Math.round((kn.height?.() || n.h) * sy));
            }
            return { ...n, ...patch };
          }
          return { ...n, ...base, w: Math.max(10, Math.round(n.w * sx)), h: Math.max(10, Math.round(n.h * sy)) };
        })
      } : p)
    }));
    pushHistory(startDoc);
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
        showAlert?.(t('canvas.exportError'), err.message);
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
          {t('canvas.oosPreview')}
        </div>
      )}

      <div style={isNarrow ? mainRowNarrow : mainRow}>
        <Toolbar
          isNarrow={isNarrow}
          onAddText={() => addNode({
            type: 'text', autoWidth: true, x: pageW / 2 - 200, y: pageH / 2 - 40, w: 240, h: 64, rotation: 0,
            text: t('canvas.text'), style: { fontFamily: 'Georgia, serif', fontSize: 48, fontWeight: 700, color: '#111', align: 'left' }
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
            label: t('canvas.orderWhatsApp'), url: '',
            style: { fill: '#25D366', color: '#ffffff', fontFamily: 'system-ui, sans-serif', fontSize: 34, fontWeight: 800, borderRadius: 999, align: 'center', padding: 16 }
          })}
          onAddDate={() => addNode({
            type: 'date-field',
            x: Math.round(pageW / 2 - 200), y: Math.round(pageH / 2 - 30),
            w: 400, h: 60, rotation: 0,
            emoji: '🔥', label: t('canvas.roasted'), value: '', relative: true, item_id: null,
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
                        selectFromCanvas(node.id, !!e?.evt?.shiftKey);
                      }}
                      onDblClick={n => !node.locked && handleNodeDblClick(n)}
                      onChange={patch => updateNode(node.id, patch)}
                      onMeasure={updateNodeSilent}
                      onDragStart={e => handleDragStart(e, node)}
                      onDragMove={e => handleDragMove(e, node)}
                      onNodeDragEnd={handleNodeDragEnd}
                      onNodeTransformStart={handleNodeTransformStart}
                      onNodeTransform={handleNodeTransform}
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
              {selectedIds.length > 1 ? `${selectedIds.length} seleccionados` : t('canvas.properties')}
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
            onSelectGroup={gid => setSelectedIds((page?.nodes || []).filter(n => n.groupId === gid).map(n => n.id))}
            groups={page?.groups || {}}
            onRenameGroup={renameGroup}
            onBulkUpdate={bulkUpdateNodes}
            onGroup={groupSelected}
            onUngroup={ungroupSelected}
            canUngroup={selectedIds.some(id => (page?.nodes || []).find(n => n.id === id)?.groupId)}
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
        const canGroup = selectedIds.length >= 2;
        const canUngroup = selNodes.some(n => n.groupId);
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
            canGroup={canGroup}
            canUngroup={canUngroup}
            canLink={canLink}
            isLinked={isLinked}
            linkSuggestion={suggestName}
            onGroup={() => { groupSelected(); setContextMenu(null); }}
            onUngroup={() => { ungroupSelected(); setContextMenu(null); }}
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

      {/* Floating zoom control (Ctrl/⌘ + wheel also zooms the canvas). */}
      <div style={zoomWidget}>
        <button onClick={() => zoomByFactor(1 / 1.2)} style={zoomBtn} title={t('canvas.zoomOut')}><Icon icon="lucide:minus" /></button>
        <button onClick={resetZoom} style={{ ...zoomBtn, minWidth: 54, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }} title={t('canvas.zoomFit')}>
          {Math.round(stageScale * 100)}%
        </button>
        <button onClick={() => zoomByFactor(1.2)} style={zoomBtn} title={t('canvas.zoomIn')}><Icon icon="lucide:plus" /></button>
      </div>
    </div>
   </PaletteContext.Provider>
  );
}
