import { useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import { clusterByGroup } from '../../utils/canvasDocument';

// Illustrator-style layers list: top of the list = top of the stacking order.
// Rows can be dragged to reorder, renamed (double-click), locked, and hidden.
// Grouped nodes (shared node.groupId) cluster under a collapsible header; the
// header selects/locks/hides/moves the whole group. All reordering funnels
// through onReorder(orderedTopFirstIds) — the parent re-clusters + reassigns z,
// so groups stay contiguous no matter how a drag shuffles the raw list.

const btnStyle = {
  background: 'transparent', border: 'none', color: '#8b949e', cursor: 'pointer',
  padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center'
};
const activeBtnStyle = { ...btnStyle, color: '#e6edf3' };

// Per-row opacity: a compact button showing the current percentage that opens
// a slider popover. Kept out of the always-visible controls so the row stays
// tight; the button reads as "active" (brighter, shows the number) whenever the
// layer is below 100%.
function OpacityControl({ opacity, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const pct = Math.round((opacity ?? 1) * 100);
  const isSet = pct < 100;

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) { if (!wrapRef.current?.contains(e.target)) setOpen(false); }
    window.addEventListener('mousedown', onDocClick);
    return () => window.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'flex' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        draggable={false}
        onDragStart={e => e.preventDefault()}
        style={{ ...(isSet || open ? activeBtnStyle : btnStyle), gap: 2, padding: '4px 3px' }}
        title={`Opacidad ${pct}%`}
      >
        <Icon icon="lucide:blend" style={{ fontSize: '14px' }} />
        {isSet && <span style={{ fontSize: '0.62rem', fontWeight: 700 }}>{pct}</span>}
      </button>
      {open && (
        <div
          onClick={e => e.stopPropagation()}
          draggable={false}
          onDragStart={e => e.preventDefault()}
          style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 20,
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
            background: '#161b22', border: '1px solid #30363d', borderRadius: 8,
            boxShadow: '0 6px 18px rgba(0,0,0,0.4)'
          }}
        >
          <input
            type="range" min={0} max={100} value={pct}
            onChange={e => onChange(Number(e.target.value) / 100)}
            style={{ width: 96, accentColor: '#1f6feb' }}
          />
          <span style={{ fontSize: '0.72rem', color: '#8b949e', width: 30, textAlign: 'right' }}>{pct}%</span>
        </div>
      )}
    </div>
  );
}

function typeIconFor(node) {
  switch (node.type) {
    case 'text': return 'lucide:type';
    case 'image': return 'lucide:image';
    case 'shape': return node.shape === 'circle' ? 'lucide:circle' : node.shape === 'line' ? 'lucide:minus' : 'lucide:square';
    case 'path': return 'lucide:pen-tool';
    case 'item-binding': return 'lucide:package';
    case 'whatsapp-button': return 'mdi:whatsapp';
    case 'date-field': return 'lucide:calendar-days';
    default: return 'lucide:box';
  }
}

export default function LayersPanel({ nodes, groups, selectedIds, onSelect, onSelectGroup, onUpdate, onBulkUpdate, onRenameGroup, onReorder }) {
  // Top-first ordering (highest z on top), then cluster groups so members are
  // adjacent — matching the on-canvas stacking the parent enforces.
  const sortedNodes = [...(nodes || [])].sort((a, b) => (b.z || 0) - (a.z || 0));
  const byId = new Map(sortedNodes.map(n => [n.id, n]));
  const order = clusterByGroup(sortedNodes.map(n => n.id), id => byId.get(id)?.groupId);

  const [dragId, setDragId] = useState(null);     // node id, or `grp:<gid>` for a header
  const [overId, setOverId] = useState(null);     // node id, or `hdr:<gid>` for a header
  const [overPos, setOverPos] = useState('before'); // 'before' = drop above the row
  const [collapsed, setCollapsed] = useState(() => new Set());

  // Keep the active row visible when the selection changes from the canvas.
  const primaryId = selectedIds[selectedIds.length - 1] || null;
  const activeRowRef = useRef(null);
  const selKey = selectedIds.join(',');
  useEffect(() => {
    if (dragId) return;
    activeRowRef.current?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey]);

  const membersOf = gid => order.filter(id => byId.get(id)?.groupId === gid);

  // The rows that travel together on a drag: a whole group for a header drag,
  // the whole selection when the grabbed row is part of a multi-selection,
  // otherwise just that row.
  function movingSetFor(id) {
    if (typeof id === 'string' && id.startsWith('grp:')) return new Set(membersOf(id.slice(4)));
    return (selectedIds.includes(id) && selectedIds.length > 1) ? new Set(selectedIds) : new Set([id]);
  }
  const movingSet = dragId ? movingSetFor(dragId) : new Set();

  // Resolve a drop target (which may be a header key) to a real anchor node id.
  function resolveTarget(over) {
    if (typeof over === 'string' && over.startsWith('hdr:')) {
      const ms = membersOf(over.slice(4));
      return ms[0] || null;
    }
    return over;
  }

  function move(fromId, over, pos) {
    if (!onReorder) return;
    const toId = resolveTarget(over);
    if (!toId) return;
    const moving = movingSetFor(fromId);
    if (moving.has(toId)) return; // dropping the group onto itself is a no-op
    const movingOrdered = order.filter(id => moving.has(id)); // preserve relative order
    const rest = order.filter(id => !moving.has(id));
    let idx = rest.indexOf(toId);
    if (idx < 0) return;
    if (pos === 'after') idx += 1;
    rest.splice(idx, 0, ...movingOrdered);
    onReorder(rest);
  }

  // Up/down buttons reuse the same robust reorder path (one step toward top/bottom).
  function nudge(id, delta) {
    const i = order.indexOf(id);
    const j = i + delta;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    next.splice(i, 1);
    next.splice(j, 0, id);
    onReorder?.(next);
  }

  function endDrag() { setDragId(null); setOverId(null); }
  function toggleCollapsed(gid) {
    setCollapsed(prev => { const n = new Set(prev); n.has(gid) ? n.delete(gid) : n.add(gid); return n; });
  }

  // Build the flat render list: a header before each group's first member,
  // then (unless collapsed) the member rows.
  const rows = [];
  const seenGroups = new Set();
  for (const id of order) {
    const node = byId.get(id);
    if (!node) continue;
    const gid = node.groupId;
    if (gid) {
      if (!seenGroups.has(gid)) {
        seenGroups.add(gid);
        rows.push({ kind: 'group', gid });
        if (!collapsed.has(gid)) membersOf(gid).forEach(m => rows.push({ kind: 'node', id: m, inGroup: true }));
      }
    } else {
      rows.push({ kind: 'node', id, inGroup: false });
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1, paddingRight: 4 }}>
      {rows.map((row, i) => {
        if (row.kind === 'group') {
          const members = membersOf(row.gid);
          return (
            <GroupHeader
              key={'g:' + row.gid}
              gid={row.gid}
              name={groups?.[row.gid]?.name || 'Grupo'}
              members={members}
              collapsed={collapsed.has(row.gid)}
              allSelected={members.length > 0 && members.every(m => selectedIds.includes(m))}
              allLocked={members.length > 0 && members.every(m => byId.get(m)?.locked)}
              allHidden={members.length > 0 && members.every(m => byId.get(m)?.hidden)}
              isDragging={dragId === 'grp:' + row.gid}
              dropBefore={dragId && overId === 'hdr:' + row.gid && overPos === 'before'}
              dropAfter={dragId && overId === 'hdr:' + row.gid && overPos === 'after'}
              onToggleCollapse={() => toggleCollapsed(row.gid)}
              onSelect={() => onSelectGroup?.(row.gid)}
              onRename={name => onRenameGroup?.(row.gid, name)}
              onToggleLock={() => onBulkUpdate?.(members, { locked: !members.every(m => byId.get(m)?.locked) })}
              onToggleHide={() => onBulkUpdate?.(members, { hidden: !members.every(m => byId.get(m)?.hidden) })}
              onDragStart={() => setDragId('grp:' + row.gid)}
              onDragOverItem={(pos) => { if (dragId && !movingSet.has(members[0])) { setOverId('hdr:' + row.gid); setOverPos(pos); } }}
              onDropItem={() => { if (dragId) move(dragId, 'hdr:' + row.gid, overPos); endDrag(); }}
              onDragEnd={endDrag}
            />
          );
        }
        const node = byId.get(row.id);
        if (!node) return null;
        return (
          <LayerItem
            key={node.id}
            node={node}
            indent={row.inGroup}
            rowRef={node.id === primaryId ? activeRowRef : null}
            isSelected={selectedIds.includes(node.id)}
            isDragging={movingSet.has(node.id)}
            dropBefore={dragId && overId === node.id && overPos === 'before'}
            dropAfter={dragId && overId === node.id && overPos === 'after'}
            canForward={i > 0}
            canBack={i < rows.length - 1}
            onSelect={(multi) => onSelect(node.id, multi)}
            onUpdate={patch => onUpdate(node.id, patch)}
            onForward={() => nudge(node.id, -1)}
            onBack={() => nudge(node.id, +1)}
            onDragStart={() => setDragId(node.id)}
            onDragOverItem={(pos) => { if (dragId && !movingSet.has(node.id)) { setOverId(node.id); setOverPos(pos); } }}
            onDropItem={() => { if (dragId) move(dragId, node.id, overPos); endDrag(); }}
            onDragEnd={endDrag}
          />
        );
      })}
      {rows.length === 0 && (
        <div style={{ padding: 20, textAlign: 'center', color: '#8b949e', fontSize: '0.8rem' }}>
          No hay elementos en esta página.
        </div>
      )}
    </div>
  );
}

function GroupHeader({
  gid, name, members, collapsed, allSelected, allLocked, allHidden,
  isDragging, dropBefore, dropAfter, onToggleCollapse, onSelect, onRename,
  onToggleLock, onToggleHide, onDragStart, onDragOverItem, onDropItem, onDragEnd
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function commit() { setEditing(false); if (draft && draft !== name) onRename(draft); }
  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const r = e.currentTarget.getBoundingClientRect();
    onDragOverItem((e.clientY - r.top) < r.height / 2 ? 'before' : 'after');
  }

  return (
    <div
      draggable={!editing}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'grp:' + gid); onDragStart(); }}
      onDragOver={handleDragOver}
      onDrop={(e) => { e.preventDefault(); onDropItem(); }}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px',
        background: allSelected ? 'rgba(31,111,235,0.28)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${allSelected ? '#1f6feb' : 'transparent'}`,
        borderTop: dropBefore ? '2px solid #1f6feb' : undefined,
        borderBottom: dropAfter ? '2px solid #1f6feb' : undefined,
        borderRadius: 6, cursor: 'grab', fontSize: '0.8rem', color: '#e6edf3',
        fontWeight: 700, opacity: isDragging ? 0.4 : 1
      }}
    >
      <button onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }} style={{ ...btnStyle, padding: 0 }} title={collapsed ? 'Expandir' : 'Contraer'}>
        <Icon icon={collapsed ? 'lucide:chevron-right' : 'lucide:chevron-down'} style={{ fontSize: '14px' }} />
      </button>
      <Icon icon={collapsed ? 'lucide:folder' : 'lucide:folder-open'} style={{ fontSize: '15px', color: '#d8a657', flexShrink: 0 }} />

      <div style={{ flex: 1, minWidth: 0 }} onDoubleClick={() => { setDraft(name); setEditing(true); }}>
        {editing ? (
          <input
            value={draft}
            draggable={false}
            onDragStart={e => e.preventDefault()}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
            autoFocus
            style={{ width: '100%', background: '#0d1117', color: 'white', border: '1px solid #1f6feb', borderRadius: 4, padding: '2px 4px', fontSize: '0.8rem', outline: 'none' }}
          />
        ) : (
          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`${name} · ${members.length}`}>
            {name} <span style={{ color: '#8b949e', fontWeight: 400 }}>· {members.length}</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <button onClick={(e) => { e.stopPropagation(); onToggleLock(); }} style={allLocked ? activeBtnStyle : btnStyle} title={allLocked ? 'Desbloquear grupo' : 'Bloquear grupo'}>
          <Icon icon={allLocked ? 'lucide:lock' : 'lucide:unlock'} style={{ fontSize: '14px' }} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onToggleHide(); }} style={allHidden ? activeBtnStyle : btnStyle} title={allHidden ? 'Mostrar grupo' : 'Ocultar grupo'}>
          <Icon icon={allHidden ? 'lucide:eye-off' : 'lucide:eye'} style={{ fontSize: '14px' }} />
        </button>
      </div>
    </div>
  );
}

function LayerItem({
  node, rowRef, indent, isSelected, isDragging, dropBefore, dropAfter, canForward, canBack,
  onSelect, onUpdate, onForward, onBack, onDragStart, onDragOverItem, onDropItem, onDragEnd
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');

  const typeLabel = node.type === 'text' ? 'Texto' :
    node.type === 'image' ? 'Imagen' :
    node.type === 'shape' ? (node.shape === 'circle' ? 'Círculo' : node.shape === 'line' ? 'Línea' : 'Rectángulo') :
    node.type === 'path' ? 'Trazo' :
    node.type === 'item-binding' ? 'Producto' :
    node.type === 'whatsapp-button' ? 'Botón WA' :
    node.type === 'date-field' ? 'Fecha' : 'Elemento';

  const defaultName = node.text ? `${node.text.slice(0, 22)}${node.text.length > 22 ? '…' : ''}` :
    node.label ? node.label :
    typeLabel;
  const displayName = node.name || defaultName;

  function handleDoubleClick() { setName(displayName); setEditing(true); }
  function commitName() {
    setEditing(false);
    if (name && name !== displayName) onUpdate({ name });
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const r = e.currentTarget.getBoundingClientRect();
    onDragOverItem((e.clientY - r.top) < r.height / 2 ? 'before' : 'after');
  }

  return (
    <div
      ref={rowRef}
      draggable={!editing}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', node.id); onDragStart(); }}
      onDragOver={handleDragOver}
      onDrop={(e) => { e.preventDefault(); onDropItem(); }}
      onDragEnd={onDragEnd}
      onClick={(e) => onSelect(e.shiftKey || e.metaKey || e.ctrlKey)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', marginLeft: indent ? 16 : 0,
        background: isSelected ? 'rgba(31,111,235,0.2)' : 'transparent',
        border: `1px solid ${isSelected ? '#1f6feb' : 'transparent'}`,
        borderLeft: indent ? '2px solid rgba(216,166,87,0.4)' : `1px solid ${isSelected ? '#1f6feb' : 'transparent'}`,
        borderTop: dropBefore ? '2px solid #1f6feb' : undefined,
        borderBottom: dropAfter ? '2px solid #1f6feb' : (isSelected ? '1px solid #1f6feb' : undefined),
        borderRadius: 6, cursor: 'grab', fontSize: '0.8rem', color: '#e6edf3',
        opacity: isDragging ? 0.4 : (node.hidden ? 0.5 : 1)
      }}
    >
      <Icon icon="lucide:grip-vertical" style={{ fontSize: '13px', color: '#586069', flexShrink: 0 }} />
      <Icon icon={typeIconFor(node)} style={{ fontSize: '14px', color: '#8b949e', flexShrink: 0 }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <button onClick={(e) => { e.stopPropagation(); onForward(); }} disabled={!canForward}
          style={{ ...btnStyle, padding: 0, opacity: canForward ? 1 : 0.2 }} title="Subir">
          <Icon icon="lucide:chevron-up" style={{ fontSize: '12px' }} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onBack(); }} disabled={!canBack}
          style={{ ...btnStyle, padding: 0, opacity: canBack ? 1 : 0.2 }} title="Bajar">
          <Icon icon="lucide:chevron-down" style={{ fontSize: '12px' }} />
        </button>
      </div>

      <div style={{ flex: 1, minWidth: 0, paddingLeft: 2 }} onDoubleClick={handleDoubleClick}>
        {editing ? (
          <input
            value={name}
            draggable={false}
            onDragStart={e => e.preventDefault()}
            onChange={e => setName(e.target.value)}
            onBlur={commitName}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditing(false); }}
            autoFocus
            style={{ width: '100%', background: '#0d1117', color: 'white', border: '1px solid #1f6feb', borderRadius: 4, padding: '2px 4px', fontSize: '0.8rem', outline: 'none' }}
          />
        ) : (
          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={displayName}>
            {displayName}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <OpacityControl opacity={node.opacity} onChange={v => onUpdate({ opacity: v })} />
        <button onClick={(e) => { e.stopPropagation(); onUpdate({ locked: !node.locked }); }}
          style={node.locked ? activeBtnStyle : btnStyle} title={node.locked ? 'Desbloquear' : 'Bloquear'}>
          <Icon icon={node.locked ? 'lucide:lock' : 'lucide:unlock'} style={{ fontSize: '14px' }} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onUpdate({ hidden: !node.hidden }); }}
          style={node.hidden ? activeBtnStyle : btnStyle} title={node.hidden ? 'Mostrar' : 'Ocultar'}>
          <Icon icon={node.hidden ? 'lucide:eye-off' : 'lucide:eye'} style={{ fontSize: '14px' }} />
        </button>
      </div>
    </div>
  );
}
