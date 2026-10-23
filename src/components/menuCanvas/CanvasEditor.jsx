// Full-screen react-konva editor for a designed menu (menu.data.document),
// saved back with updateMenu().
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { Stage, Layer, Rect } from 'react-konva';
import { Icon } from '@iconify/react';
import { nanoid } from 'nanoid';
import { newDocument, newPage, PAGE_PRESETS, pathBBox } from '../../utils/canvasDocument';
import { PaletteContext } from './paletteContext';
import { updateMenu } from '../../api/menus';
import { openInBrowser } from '../../utils/openInBrowser';
import { menuBaseUrl } from '../../utils/customDomainSync';
import AssetPicker from './AssetPicker';
import ItemPicker from './ItemPicker';
import { ContextMenu } from './editor/ContextMenu';
import { GridOverlay, GuidesOverlay, RULER, Ruler } from './editor/overlays';
import { EditorOverlayLayer, InlineTextEditor, PathEditor, PenPreview, SelectionTransformer } from './editor/stageTools';
import { NodeKonva } from './editor/NodeKonva';
import { PageTabs, Toolbar, Topbar } from './editor/chrome';
import { PropertiesPanel } from './editor/PropertiesPanel';
import { mainRow, mainRowNarrow, overlay, propsPanelNarrow, sheetHandle, stageArea, stageAreaNarrow, zoomBtn, zoomWidget } from './editor/styles';
import { nextZ, rectsOverlap, sortedNodes } from './editor/geometry';
import { withPage, expandGroups, nearestBindingItemId, unlinkNodes } from './editor/docOps';
import { textNode, rectNode, circleNode, imageNode, whatsAppNode, dateNode, bindingRows } from './editor/nodeTemplates';
import { useCanvasHistory } from './editor/useCanvasHistory';
import { useStageZoom } from './editor/useStageZoom';
import { useRulerGuides } from './editor/useRulerGuides';
import { usePenTool } from './editor/usePenTool';
import { useDocFonts } from './editor/useDocFonts';
import { useNodeDrag } from './editor/useNodeDrag';
import { useNodeOps } from './editor/useNodeOps';

const NARROW = '(max-width: 820px)';
const isNarrowNow = () => typeof window !== 'undefined' && window.matchMedia(NARROW).matches;

export default function CanvasEditor({ menu, menuData, onClose, showAlert }) {
  const { t } = useTranslation();
  const { doc, setDoc, commit, pushHistory, undo, redo, canUndo, canRedo, dirty, markSaved } =
    useCanvasHistory(menu.data?.document || newDocument('16:9'));
  const [pageIndex, setPageIndex] = useState(0);
  // The properties panel opens only when exactly one node is selected.
  const [selectedIds, setSelectedIds] = useState([]);
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const selectOne = (id) => setSelectedIds(id ? [id] : []);
  const toggleSelect = (id) => setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const [saving, setSaving] = useState(false);
  // While set, the picker is open; the callback decides what the pick does.
  const [assetPickerCb, setAssetPickerCb] = useState(null);
  const [itemPickerCb, setItemPickerCb] = useState(null);

  // Phones stack the layout and start without rulers (they eat width, and touch guide-dragging is fiddly).
  const [isNarrow, setIsNarrow] = useState(isNarrowNow);
  const [showRulers, setShowRulers] = useState(() => !isNarrowNow());
  const [showGrid, setShowGrid] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  // On narrow layouts the properties panel is a bottom sheet that opens when something is selected.
  const [panelOpen, setPanelOpen] = useState(false);
  const [sheetTrigger, setSheetTrigger] = useState(`${isNarrow}:0`);
  const sheetKey = `${isNarrow}:${selectedIds.length}`;
  if (sheetKey !== sheetTrigger) {
    setSheetTrigger(sheetKey);
    if (isNarrow && selectedIds.length > 0) setPanelOpen(true);
  }
  // Treats every stock-linked element as sold out, to preview what hides or dims.
  const [previewOOS, setPreviewOOS] = useState(false);

  const stageBoxRef = useRef(null);
  const stageRef = useRef(null);
  const [marquee, setMarquee] = useState(null); // page coords
  const marqueeStartRef = useRef(null);
  // PNG export hides selection, guides and grid for one frame.
  const [exporting, setExporting] = useState(false);
  const [contextMenu, setContextMenu] = useState(null); // { x, y } screen coords

  // Double-click editing: inline text / shape label, or a path's anchors.
  const [editing, setEditing] = useState(null); // { id, kind: 'text'|'label' }
  const [editingPathId, setEditingPathId] = useState(null);
  const activePathId = editingPathId && selectedIds.includes(editingPathId) ? editingPathId : null;
  const editStartDocRef = useRef(null);

  const fontEpoch = useDocFonts(doc);
  const page = doc.pages[pageIndex] || doc.pages[0];
  const selected = useMemo(() => page?.nodes?.find((n) => n.id === selectedId) || null, [page, selectedId]);
  const nodes = page?.nodes || [];
  const pageW = doc.page_size?.w || 1920;
  const pageH = doc.page_size?.h || 1080;

  const { stageWrapRef, stageScale, zoomByFactor, resetZoom } = useStageZoom({ pageW, pageH, showRulers, isNarrow, panelOpen });

  const {
    mutatePage, addNode, updateNode, updateNodeSilent, removeNodes, copySelection, pasteClipboard, duplicateSelection,
    linkSelectionToProduct, setNodeFont, bringForward, sendBack, selectFromCanvas, reorderNodesByIds, bulkUpdateNodes,
    renameGroup, alignSelected, distributeSelected, groupSelected, ungroupSelected, clipboardRef,
  } = useNodeOps({ doc, commit, setDoc, page, pageIndex, selectedIds, setSelectedIds, setItemPickerCb, pageW, pageH });

  // ---------- Pages, print, save --------------------------------------------

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

  // Nodes outside the new size aren't cropped; the user is warned first.
  function changePageSize(presetKey) {
    const preset = PAGE_PRESETS[presetKey];
    const cur = doc.page_size || {};
    if (!preset || (cur.w === preset.w && cur.h === preset.h)) return;
    const overflow = doc.pages.some((p) => (p.nodes || []).some((n) => (n.x || 0) + (n.w || 0) > preset.w || (n.y || 0) + (n.h || 0) > preset.h));
    if (overflow && !window.confirm(t('canvas.outOfPage'))) return;
    commit({ ...doc, page_size: { w: preset.w, h: preset.h } });
  }

  // The public page prints itself when opened with ?print=1.
  function openPrint() {
    const url = localStorage.getItem('tinypos_supabase_url');
    const key = localStorage.getItem('tinypos_supabase_anon_key');
    if (!url || !key) {
      showAlert?.(t('canvas.missingConfigTitle'), t('canvas.missingConfigDesc'));
      return;
    }
    if (dirty && !window.confirm(t('canvas.unsavedPrint'))) return;
    const go = () => openInBrowser(`${menuBaseUrl()}/menu?u=${btoa(url)}&k=${btoa(key)}&m=${menu.id}&print=1`);
    if (dirty) save().then(go).catch(() => {}); else go();
  }

  async function save() {
    setSaving(true);
    try {
      await updateMenu(menu.id, { data: { ...(menu.data || {}), document: doc } });
      markSaved();
      onClose(true);
    } catch (err) {
      showAlert?.(t('canvas.saveError'), err.message);
    } finally { setSaving(false); }
  }

  function tryClose() {
    if (dirty && !window.confirm(t('canvas.unsavedClose'))) return;
    onClose(false);
  }

  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const on = (e) => setIsNarrow(e.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  // ---------- Stage pointer: pen, marquee, editing ----------------------------

  const pen = usePenTool({ stageScale, addNode, clearSelection: () => setSelectedIds([]) });
  const { penMode, penDraft, penCursor, finishPath } = pen;

  const pagePointer = (e) => {
    const pos = e.target.getStage().getPointerPosition();
    return { x: pos.x / (stageScale || 1), y: pos.y / (stageScale || 1) };
  };

  function handleNodeDblClick(node) {
    if (penMode) return;
    if (node.type === 'text' || node.type === 'shape') {
      setEditingPathId(null);
      setEditing({ id: node.id, kind: node.type === 'text' ? 'text' : 'label' });
    } else if (node.type === 'path') {
      setEditing(null);
      setEditingPathId(node.id);
    }
  }
  function commitInlineText(value) {
    if (!editing) return;
    updateNode(editing.id, editing.kind === 'label' ? { label: value } : { text: value });
    setEditing(null);
  }

  // Anchor edits update silently while dragging and record one undo step at the end.
  const setPathPoint = (id, i, fn) => setDoc((d) => withPage(d, pageIndex, (p) => ({
    ...p, nodes: (p.nodes || []).map((n) => (n.id === id ? { ...n, points: n.points.map((pt, k) => (k === i ? fn(pt) : pt)) } : n)),
  })));
  const pathEditStart = () => { editStartDocRef.current = doc; };
  const moveAnchor = (id, i, pos) => setPathPoint(id, i, (p) => {
    const dx = pos.x - p.x, dy = pos.y - p.y;
    return { x: pos.x, y: pos.y, hIn: p.hIn ? { x: p.hIn.x + dx, y: p.hIn.y + dy } : null, hOut: p.hOut ? { x: p.hOut.x + dx, y: p.hOut.y + dy } : null };
  });
  const moveHandle = (id, i, which, pos) => setPathPoint(id, i, (p) => ({ ...p, [which]: { x: pos.x, y: pos.y } }));
  function pathEditEnd(id) {
    setDoc((d) => withPage(d, pageIndex, (p) => ({
      ...p, nodes: (p.nodes || []).map((n) => { if (n.id !== id) return n; const bb = pathBBox(n.points); return { ...n, x: bb.x, y: bb.y, w: bb.w, h: bb.h }; }),
    })));
    pushHistory(editStartDocRef.current);
    editStartDocRef.current = null;
  }

  // Pressing on empty canvas starts a marquee and clears the selection unless Shift is held.
  function onStageMouseDown(e) {
    if (penMode) { pen.penDown(pagePointer(e)); return; }
    if (e.target !== e.target.getStage()) return;
    if (!e.evt.shiftKey) setSelectedIds([]);
    const p = pagePointer(e);
    marqueeStartRef.current = p;
    setMarquee({ x: p.x, y: p.y, w: 0, h: 0 });
  }
  function onStageMouseMove(e) {
    if (penMode) { pen.penMove(pagePointer(e)); return; }
    if (!marqueeStartRef.current) return;
    const p = pagePointer(e);
    const s = marqueeStartRef.current;
    setMarquee({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  }
  function onStageMouseUp(e) {
    if (penMode) { pen.penUp(); return; }
    if (!marqueeStartRef.current) return;
    const m = marquee;
    marqueeStartRef.current = null;
    setMarquee(null);
    if (!m || (m.w < 4 && m.h < 4)) return; // a click, not a drag
    // Touching one member of a group selects the whole group.
    const hit = expandGroups(page, nodes.filter((n) => !n.hidden && !n.locked && rectsOverlap(m, n)).map((n) => n.id));
    setSelectedIds((prev) => (e.evt.shiftKey ? Array.from(new Set([...prev, ...hit])) : hit));
  }

  const {
    guides, handleDragStart, handleDragMove, handleNodeDragEnd, handleNodeTransformStart, handleNodeTransform, handleNodeTransformEnd,
  } = useNodeDrag({ stageRef, doc, setDoc, pageIndex, page, selectedIds, mutatePage, pushHistory, updateNodeSilent, snapEnabled, stageScale, pageW, pageH });

  const { pageGuides, activeGuide, startGuideFromRuler, startDragGuide } =
    useRulerGuides({ page, mutatePage, stageBoxRef, stageScale, pageW, pageH });

  // ---------- Keyboard -------------------------------------------------------

  useEffect(() => {
    function onKey(e) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return; // the inline editor owns its keys
      const meta = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (meta && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if (meta && key === 'c') {
        if (selectedIds.length) { e.preventDefault(); copySelection(); }
      } else if (meta && key === 'v') {
        if (clipboardRef.current.length) { e.preventDefault(); pasteClipboard(); }
      } else if (meta && key === 'd') {
        if (selectedIds.length) { e.preventDefault(); duplicateSelection(); }
      } else if (meta && key === 'g') {
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
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length) {
        e.preventDefault();
        // Locked nodes can't be deleted.
        const deletable = selectedIds.filter((id) => !nodes.find((n) => n.id === id)?.locked);
        if (deletable.length) removeNodes(deletable);
      } else if (e.key === 'Escape') {
        if (penMode) pen.cancelPen();
        else if (activePathId) setEditingPathId(null);
        else if (editing) setEditing(null);
        else setSelectedIds([]);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------- Context menu --------------------------------------------------
  // A node's handler runs first and claims the event; the overlay's handler
  // then shows the Paste-only menu only for clicks on empty canvas.
  const nodeMenuHandledRef = useRef(false);
  function handleNodeContextMenu(e, node) {
    e.evt?.preventDefault();
    nodeMenuHandledRef.current = true;
    if (!selectedIds.includes(node.id)) selectOne(node.id);
    setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, empty: false });
  }
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

  // Document palette shared with every ColorPicker.
  const palette = doc.palette || [];
  const paletteCtx = {
    palette,
    addSwatch: (hex) => {
      if (hex && !palette.some((c) => c.toLowerCase() === hex.toLowerCase())) commit({ ...doc, palette: [...palette, hex] });
    },
    removeSwatch: (hex) => commit({ ...doc, palette: palette.filter((c) => c.toLowerCase() !== hex.toLowerCase()) }),
  };

  // Snapshot at the page's native resolution (pixelRatio undoes the on-screen scale).
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
    // Runs once per export; the frame it waits for must not be rescheduled by unrelated renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exporting]);

  const addBindings = (itemIds) => {
    const z0 = nextZ(page);
    const added = bindingRows(pageW, pageH, itemIds).map((n, i) => ({ id: nanoid(8), z: z0 + i, ...n }));
    mutatePage((p) => ({ ...p, nodes: [...(p.nodes || []), ...added] }));
    setSelectedIds(added.map((n) => n.id));
    setItemPickerCb(null);
  };

  return (
   <PaletteContext.Provider value={paletteCtx}>
    <div style={overlay} onContextMenu={handleOverlayContextMenu}>
      <Topbar
        menuName={menu.name}
        dirty={dirty}
        saving={saving}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
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
          onAddText={() => addNode(textNode(pageW, pageH, t('canvas.text')))}
          onAddRect={() => addNode(rectNode(pageW, pageH))}
          onAddCircle={() => addNode(circleNode(pageW, pageH))}
          onAddImage={() => setAssetPickerCb(() => (url) => { addNode(imageNode(url)); setAssetPickerCb(null); })}
          onTogglePen={pen.togglePen}
          penActive={penMode}
          onAddBinding={() => setItemPickerCb(() => addBindings)}
          onAddWhatsApp={() => addNode(whatsAppNode(pageW, pageH, t('canvas.orderWhatsApp')))}
          onAddDate={() => addNode(dateNode(pageW, pageH, t('canvas.roasted')))}
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
                {!exporting && <EditorOverlayLayer guides={guides} selectedIds={selectedIds} nodes={nodes} scale={stageScale} />}
                <Layer listening={false}>
                  {marquee && (
                    <Rect
                      x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h}
                      fill="rgba(31,111,235,0.12)" stroke="#1f6feb" strokeWidth={1 / stageScale} dash={[4 / stageScale, 3 / stageScale]}
                    />
                  )}
                  {penDraft && <PenPreview draft={penDraft} cursor={penCursor} scale={stageScale} />}
                </Layer>
                {activePathId && (() => {
                  const pn = (page?.nodes || []).find(x => x.id === activePathId && x.type === 'path');
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
            changePageBg={(color) => mutatePage((p) => ({ ...p, background: color }))}
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
            onDelete={() => selected && removeNodes([selected.id])}
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
        const suggestId = canLink ? nearestBindingItemId(page, selectedIds) : null;
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
            onUnlink={() => { mutatePage((p) => unlinkNodes(p, selectedIds)); setContextMenu(null); }}
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
