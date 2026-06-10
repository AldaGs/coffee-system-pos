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
import { Stage, Layer, Rect, Circle, Text, Image as KImage, Transformer, Group, Label, Tag } from 'react-konva';
import { Icon } from '@iconify/react';
import { nanoid } from 'nanoid';
import { newDocument, newPage, PAGE_PRESETS, buildItemIndex } from '../../utils/canvasDocument';
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
  const [selectedId, setSelectedId] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // When set, AssetPicker is open. The callback fires with the chosen URL
  // and decides what to do (add new image node vs replace selected node's src).
  const [assetPickerCb, setAssetPickerCb] = useState(null);
  const [itemPickerCb, setItemPickerCb] = useState(null);

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
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        removeNode(selectedId);
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
    setSelectedId(withId.id);
  }

  function updateNode(id, patch) {
    mutatePage(p => ({
      ...p,
      nodes: (p.nodes || []).map(n => n.id === id ? { ...n, ...patch, style: patch.style ? { ...n.style, ...patch.style } : n.style } : n)
    }));
  }

  function removeNode(id) {
    mutatePage(p => ({ ...p, nodes: (p.nodes || []).filter(n => n.id !== id) }));
    setSelectedId(null);
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
    setSelectedId(null);
  }
  function deletePage(idx) {
    if (doc.pages.length <= 1) return;
    commit({ ...doc, pages: doc.pages.filter((_, i) => i !== idx) });
    setPageIndex(Math.max(0, Math.min(pageIndex, doc.pages.length - 2)));
    setSelectedId(null);
  }
  function changePageBg(color) {
    mutatePage(p => ({ ...p, background: color }));
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
      const aw = el.clientWidth - 40;
      const ah = el.clientHeight - 40;
      setStageScale(Math.min(aw / pageW, ah / pageH));
    }
    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [pageW, pageH]);

  // Click on empty area deselects.
  function onStageMouseDown(e) {
    if (e.target === e.target.getStage()) setSelectedId(null);
  }

  return (
    <div style={overlay}>
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
      />

      <PageTabs
        doc={doc}
        pageIndex={pageIndex}
        onSelect={i => { setPageIndex(i); setSelectedId(null); }}
        onAdd={addPage}
        onDelete={deletePage}
      />

      <div style={mainRow}>
        <Toolbar
          onAddText={() => addNode({
            type: 'text', x: pageW / 2 - 200, y: pageH / 2 - 40, w: 400, h: 80, rotation: 0,
            text: 'Texto', style: { fontFamily: 'Georgia, serif', fontSize: 48, fontWeight: 700, color: '#111', align: 'center' }
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
              setSelectedId(withIds[withIds.length - 1].id);
              setItemPickerCb(null);
            });
          }}
        />

        <div ref={stageWrapRef} style={stageArea}>
          <div style={{ width: pageW * stageScale, height: pageH * stageScale, boxShadow: '0 12px 40px rgba(0,0,0,0.35)' }}>
            <Stage
              width={pageW * stageScale}
              height={pageH * stageScale}
              scaleX={stageScale}
              scaleY={stageScale}
              onMouseDown={onStageMouseDown}
              onTouchStart={onStageMouseDown}
              style={{ background: page.background }}
            >
              <Layer>
                {sortedNodes(page).map(node => (
                  <NodeKonva
                    key={node.id}
                    node={node}
                    menuData={menuData}
                    isSelected={node.id === selectedId}
                    onSelect={() => setSelectedId(node.id)}
                    onChange={patch => updateNode(node.id, patch)}
                  />
                ))}
                <SelectionTransformer selectedId={selectedId} />
              </Layer>
            </Stage>
          </div>
        </div>

        <PropertiesPanel
          page={page}
          changePageBg={changePageBg}
          selected={selected}
          onUpdate={patch => selected && updateNode(selected.id, patch)}
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
  );
}

function sortedNodes(page) {
  return [...(page?.nodes || [])].sort((a, b) => (a.z || 0) - (b.z || 0));
}

function nextZ(page) {
  const max = (page?.nodes || []).reduce((m, n) => Math.max(m, n.z || 0), -1);
  return max + 1;
}

// ============================================================================
// Konva node renderers
// ============================================================================

function NodeKonva({ node, menuData, isSelected, onSelect, onChange }) {
  const shapeRef = useRef(null);

  // After a drag or transform, persist the resulting x/y/w/h/rotation into
  // the document. Konva mutates the node directly; we read it back here.
  function commitTransform() {
    const n = shapeRef.current;
    if (!n) return;
    const scaleX = n.scaleX();
    const scaleY = n.scaleY();
    onChange({
      x: Math.round(n.x()),
      y: Math.round(n.y()),
      w: Math.max(10, Math.round(node.w * scaleX)),
      h: Math.max(10, Math.round(node.h * scaleY)),
      rotation: Math.round(n.rotation())
    });
    n.scaleX(1);
    n.scaleY(1);
  }

  const common = {
    ref: shapeRef,
    id: node.id,
    x: node.x, y: node.y, rotation: node.rotation || 0,
    draggable: true,
    onClick: onSelect, onTap: onSelect,
    onDragEnd: commitTransform, onTransformEnd: commitTransform
  };

  if (node.type === 'text') {
    const s = node.style || {};
    return (
      <Text
        {...common}
        text={node.text || ''}
        width={node.w} height={node.h}
        fontFamily={s.fontFamily || 'Georgia, serif'}
        fontSize={s.fontSize || 24}
        fontStyle={`${s.fontStyle || 'normal'} ${s.fontWeight || 400}`.trim()}
        fill={s.color || '#111'}
        align={s.align || 'left'}
        verticalAlign="middle"
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
        // onTransformEnd: convert circle back to bounding box.
        onTransformEnd={() => {
          const n = shapeRef.current;
          const r = n.radius() * Math.max(n.scaleX(), n.scaleY());
          n.scaleX(1); n.scaleY(1);
          onChange({
            x: Math.round(n.x() - r),
            y: Math.round(n.y() - r),
            w: Math.round(r * 2),
            h: Math.round(r * 2),
            rotation: Math.round(n.rotation())
          });
        }}
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
    return <KonvaImageNode node={node} common={common} />;
  }

  if (node.type === 'item-binding') {
    return <BindingPlaceholder node={node} common={common} menuData={menuData} />;
  }

  // Unknown — render a dashed outline so the user can see + delete it.
  return (
    <Rect {...common} width={node.w} height={node.h} stroke="#888" strokeWidth={1} dash={[6, 4]} fill="rgba(0,0,0,0.04)" />
  );
}

// Loads an Image() element and feeds it to Konva once ready. Falls back to
// a dashed placeholder if loading fails (e.g. CORS, missing).
function KonvaImageNode({ node, common }) {
  const [img, setImg] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const i = new window.Image();
    i.crossOrigin = 'anonymous';
    i.src = node.src;
    i.onload = () => setImg(i);
    i.onerror = () => setFailed(true);
  }, [node.src]);

  if (failed) {
    return <Rect {...common} width={node.w} height={node.h} stroke="#c33" strokeWidth={2} dash={[4, 4]} fill="rgba(204,51,51,0.08)" />;
  }
  if (!img) {
    return <Rect {...common} width={node.w} height={node.h} fill="#eee" />;
  }
  return <KImage {...common} image={img} width={node.w} height={node.h} />;
}

// Editor preview for item-binding nodes. Renders the same fields the
// public ItemBindingView does — emoji + name + price respecting the
// `fields` array and `layout` — so the user sees toggle effects live.
// Background/stroke/borderRadius come from node.style so visual edits
// match what customers will see. Unbound nodes get a faint dashed
// outline so they're discoverable.
function BindingPlaceholder({ node, common, menuData }) {
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
      {!stacked && (
        <Text
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

// Transformer follows whichever node is currently selected.
function SelectionTransformer({ selectedId }) {
  const trRef = useRef(null);
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const stage = tr.getStage();
    const node = selectedId ? stage.findOne(`#${selectedId}`) : null;
    if (node) {
      tr.nodes([node]);
    } else {
      tr.nodes([]);
    }
    tr.getLayer()?.batchDraw();
  }, [selectedId]);
  return (
    <Transformer
      ref={trRef}
      rotateEnabled={true}
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

function Topbar({ menuName, dirty, saving, onUndo, onRedo, canUndo, canRedo, onSave, onClose }) {
  return (
    <div style={topbar}>
      <button onClick={onClose} style={ghostBtn} title="Cerrar editor">
        <Icon icon="lucide:x" /> Cerrar
      </button>
      <div style={{ flex: 1, color: 'rgba(255,255,255,0.85)', fontWeight: 800 }}>
        Editor de lienzo — {menuName} {dirty && <span style={{ color: '#ffb84d', fontWeight: 700, marginLeft: 6 }}>•</span>}
      </div>
      <button onClick={onUndo} disabled={!canUndo} style={ghostBtn} title="Deshacer (Ctrl+Z)"><Icon icon="lucide:undo-2" /></button>
      <button onClick={onRedo} disabled={!canRedo} style={ghostBtn} title="Rehacer (Ctrl+Shift+Z)"><Icon icon="lucide:redo-2" /></button>
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

function PropertiesPanel({ page, changePageBg, selected, onUpdate, onDelete, onForward, onBack, openAssetPicker, openItemPicker, menuData }) {
  return (
    <aside style={propsPanel}>
      {!selected ? <PageProperties page={page} changePageBg={changePageBg} /> : (
        <NodeProperties
          node={selected}
          onUpdate={onUpdate}
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

function PageProperties({ page, changePageBg }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 style={panelTitle}>Página</h3>
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

function NodeProperties({ node, onUpdate, onDelete, onForward, onBack, openAssetPicker, openItemPicker, menuData }) {
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

      {node.type === 'text' && <TextProps node={node} onUpdate={onUpdate} />}
      {node.type === 'shape' && <ShapeProps node={node} onUpdate={onUpdate} />}
      {node.type === 'image' && <ImageProps node={node} onUpdate={onUpdate} openAssetPicker={openAssetPicker} />}
      {node.type === 'item-binding' && <BindingProps node={node} onUpdate={onUpdate} openItemPicker={openItemPicker} menuData={menuData} />}

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

function TextProps({ node, onUpdate }) {
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
      <Row label="Familia">
        <input value={s.fontFamily || ''} onChange={e => onUpdate({ style: { fontFamily: e.target.value } })} placeholder="Georgia, serif" style={textInputStyle} />
      </Row>
      <Row label="Color">
        <ColorPicker value={s.color || '#111111'} onChange={c => onUpdate({ style: { color: c } })} />
      </Row>
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

function BindingProps({ node, onUpdate, openItemPicker, menuData }) {
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
