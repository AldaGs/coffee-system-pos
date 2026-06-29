// FloorEditor — full-screen drag-and-drop editor for one floor_plan row.
// Reuses the react-konva engine that powers the menu CanvasEditor, but with a
// single node type: a table. Add tables, drag/resize/rotate them, edit each
// table's number / name / seats / shape, then save back to floor_plan.data.
// See docs/tables.md (Phase 2).
//
// State model: the whole table list lives in `tables` and edits flow through
// pushHistory() so undo is a flat snapshot ring. The Stage scales to fit the
// wrapper, exactly like CanvasEditor — all node coords stay in canvas pixels.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Rect, Circle, Text, Group, Transformer } from 'react-konva';
import { Icon } from '@iconify/react';
import { updateFloor } from '../../api/floors';
import {
  newFloorDocument, newTableNode, tablesOf, clampNode,
  duplicateNumbers, TABLE_SHAPES, DEFAULT_FLOOR_SIZE,
} from '../../utils/floorDocument';

const HISTORY_LIMIT = 50;

export default function FloorEditor({ floor, onClose, showAlert }) {
  const initialDoc = floor.document || newFloorDocument();
  const size = initialDoc.size || DEFAULT_FLOOR_SIZE;

  const [tables, setTables] = useState(() => tablesOf(initialDoc));
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const selected = tables.find(t => t.id === selectedId) || null;

  // ---------- history -------------------------------------------------------
  function commit(nextTables, { history = true } = {}) {
    if (history) {
      setPast(p => [...p.slice(-HISTORY_LIMIT + 1), tables]);
      setFuture([]);
    }
    setTables(nextTables);
    setDirty(true);
  }
  function undo() {
    setPast(p => {
      if (!p.length) return p;
      const prev = p[p.length - 1];
      setFuture(f => [tables, ...f]);
      setTables(prev);
      return p.slice(0, -1);
    });
  }
  function redo() {
    setFuture(f => {
      if (!f.length) return f;
      const next = f[0];
      setPast(p => [...p, tables]);
      setTables(next);
      return f.slice(1);
    });
  }

  function patchSelected(patch) {
    if (!selectedId) return;
    commit(tables.map(t => t.id === selectedId ? clampNode({ ...t, ...patch }, size) : t));
  }
  function addTable(shape = 'round') {
    const node = newTableNode(tables.length, { shape });
    commit([...tables, node]);
    setSelectedId(node.id);
  }
  function deleteSelected() {
    if (!selectedId) return;
    commit(tables.filter(t => t.id !== selectedId));
    setSelectedId(null);
  }

  // ---------- stage scaling (mirrors CanvasEditor) --------------------------
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    function recalc() {
      const el = wrapRef.current;
      if (!el) return;
      const pad = 40;
      const aw = el.clientWidth - pad;
      const ah = el.clientHeight - pad;
      setScale(Math.max(0.1, Math.min(aw / size.w, ah / size.h)));
    }
    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [size.w, size.h]);

  // ---------- transformer ---------------------------------------------------
  const trRef = useRef(null);
  const nodeRefs = useRef({});
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const node = selectedId ? nodeRefs.current[selectedId] : null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedId, tables]);

  function onDragEnd(id, e) {
    const { x, y } = e.target.position();
    commit(tables.map(t => t.id === id ? clampNode({ ...t, x, y }, size) : t));
  }
  function onTransformEnd(id, e) {
    const node = e.target;
    const sx = node.scaleX(), sy = node.scaleY();
    node.scaleX(1); node.scaleY(1);
    commit(tables.map(t => t.id === id ? clampNode({
      ...t,
      x: node.x(), y: node.y(),
      w: Math.round(t.w * sx), h: Math.round(t.h * sy),
      rotation: Math.round(node.rotation()),
    }, size) : t));
  }

  // ---------- save ----------------------------------------------------------
  const dupes = useMemo(() => duplicateNumbers({ tables }), [tables]);
  async function save() {
    if (dupes.length) {
      showAlert?.('Números duplicados', `Hay mesas con el mismo número: ${dupes.join(', ')}. Cada mesa debe tener un número único.`);
      return;
    }
    setSaving(true);
    try {
      await updateFloor(floor.id, { document: { ...initialDoc, size, tables } });
      setDirty(false);
      onClose?.(true);
    } catch (err) {
      showAlert?.('Error', err.message);
    } finally {
      setSaving(false);
    }
  }
  function close() {
    if (dirty && !window.confirm('Hay cambios sin guardar. ¿Salir de todos modos?')) return;
    onClose?.(false);
  }

  // Keyboard: delete removes selection, ctrl/cmd+z undo.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); deleteSelected(); }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'var(--bg-main)', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <strong style={{ fontSize: '1rem', marginRight: '8px' }}>{floor.name || 'Plano'}</strong>
        <ToolButton icon="lucide:circle" label="Mesa redonda" onClick={() => addTable('round')} />
        <ToolButton icon="lucide:square" label="Mesa cuadrada" onClick={() => addTable('square')} />
        <ToolButton icon="lucide:rectangle-horizontal" label="Mesa rectangular" onClick={() => addTable('rect')} />
        <span style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 6px' }} />
        <ToolButton icon="lucide:undo-2" label="Deshacer" onClick={undo} disabled={!past.length} />
        <ToolButton icon="lucide:redo-2" label="Rehacer" onClick={redo} disabled={!future.length} />
        <ToolButton icon="lucide:trash-2" label="Eliminar" onClick={deleteSelected} disabled={!selectedId} />
        <div style={{ flex: 1 }} />
        {dupes.length > 0 && (
          <span style={{ color: 'var(--danger, #e74c3c)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Icon icon="lucide:alert-triangle" /> Números duplicados
          </span>
        )}
        <button onClick={close} style={btnStyle('ghost')}>Cerrar</button>
        <button onClick={save} disabled={saving} style={btnStyle('primary')}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Canvas */}
        <div ref={wrapRef} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'var(--bg-main)' }}>
          <Stage
            width={size.w * scale}
            height={size.h * scale}
            scaleX={scale}
            scaleY={scale}
            onMouseDown={e => { if (e.target === e.target.getStage()) setSelectedId(null); }}
            onTouchStart={e => { if (e.target === e.target.getStage()) setSelectedId(null); }}
            style={{ background: 'var(--bg-card)', borderRadius: 8, boxShadow: '0 0 0 1px var(--border)' }}
          >
            <Layer>
              {tables.map(t => (
                <TableNode
                  key={t.id}
                  table={t}
                  selected={t.id === selectedId}
                  refCb={node => { if (node) nodeRefs.current[t.id] = node; }}
                  onSelect={() => setSelectedId(t.id)}
                  onDragEnd={e => onDragEnd(t.id, e)}
                  onTransformEnd={e => onTransformEnd(t.id, e)}
                />
              ))}
              <Transformer ref={trRef} rotateEnabled keepRatio={false}
                boundBoxFunc={(oldB, newB) => (newB.width < 40 || newB.height < 40) ? oldB : newB} />
            </Layer>
          </Stage>
        </div>

        {/* Properties panel */}
        <div style={{ width: 260, borderLeft: '1px solid var(--border)', background: 'var(--bg-card)', padding: 16, overflowY: 'auto' }}>
          {!selected ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Selecciona una mesa para editar sus datos, o agrega una desde la barra superior.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="Número">
                <input value={selected.number} onChange={e => patchSelected({ number: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="Nombre (opcional)">
                <input value={selected.name} onChange={e => patchSelected({ name: e.target.value })} style={inputStyle} placeholder="p. ej. Terraza 1" />
              </Field>
              <Field label="Lugares esperados">
                <input type="number" min={1} value={selected.seats}
                  onChange={e => patchSelected({ seats: Math.max(1, Number(e.target.value) || 1) })} style={inputStyle} />
              </Field>
              <Field label="Forma">
                <div style={{ display: 'flex', gap: 6 }}>
                  {TABLE_SHAPES.map(s => (
                    <button key={s} onClick={() => patchSelected({ shape: s })}
                      style={{ ...btnStyle(selected.shape === s ? 'primary' : 'ghost'), flex: 1, padding: '6px' }}>
                      {s === 'round' ? 'Redonda' : s === 'square' ? 'Cuadrada' : 'Rect.'}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TableNode({ table, selected, refCb, onSelect, onDragEnd, onTransformEnd }) {
  const common = {
    ref: refCb,
    x: table.x, y: table.y, rotation: table.rotation || 0,
    draggable: true,
    onClick: onSelect, onTap: onSelect,
    onDragStart: onSelect,
    onDragEnd, onTransformEnd,
  };
  const fill = selected ? 'var(--brand-color, #3498db)' : '#cbd5e1';
  return (
    <Group {...common}>
      {table.shape === 'round'
        ? <Circle x={table.w / 2} y={table.h / 2} radius={Math.min(table.w, table.h) / 2} fill={fill} stroke="#64748b" strokeWidth={2} />
        : <Rect width={table.w} height={table.h} cornerRadius={table.shape === 'rect' ? 10 : 8} fill={fill} stroke="#64748b" strokeWidth={2} />}
      <Text x={0} y={table.h / 2 - 16} width={table.w} align="center"
        text={`${table.number || '?'}${table.name ? `\n${table.name}` : ''}`}
        fontSize={18} fontStyle="bold" fill="#0f172a" listening={false} />
      <Text x={0} y={table.h - 22} width={table.w} align="center"
        text={`${table.seats} 👤`} fontSize={13} fill="#0f172a" listening={false} />
    </Group>
  );
}

const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '0.9rem', boxSizing: 'border-box' };

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>{label}</span>
      {children}
    </label>
  );
}

function ToolButton({ icon, label, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} title={label} aria-label={label}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1 }}>
      <Icon icon={icon} style={{ fontSize: '1.05rem' }} />
    </button>
  );
}

function btnStyle(kind) {
  const base = { padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', border: '1px solid var(--border)' };
  if (kind === 'primary') return { ...base, background: 'var(--brand-color, #3498db)', color: '#fff', border: 'none' };
  return { ...base, background: 'transparent', color: 'var(--text-main)' };
}
