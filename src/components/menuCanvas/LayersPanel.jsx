import { useState } from 'react';
import { Icon } from '@iconify/react';

// Illustrator-style layers list: top of the list = top of the stacking order.
// Rows can be dragged to reorder, renamed (double-click), locked, and hidden.
// All reordering funnels through onReorder(orderedTopFirstIds) so z stays
// unique and correct even when a template seeded many nodes at the same z.

const btnStyle = {
  background: 'transparent', border: 'none', color: '#8b949e', cursor: 'pointer',
  padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center'
};
const activeBtnStyle = { ...btnStyle, color: '#e6edf3' };

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

export default function LayersPanel({ nodes, selectedIds, onSelect, onUpdate, onReorder }) {
  // Top-first ordering (highest z on top), matching the on-canvas stacking.
  const sortedNodes = [...(nodes || [])].sort((a, b) => (b.z || 0) - (a.z || 0));
  const ids = sortedNodes.map(n => n.id);

  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [overPos, setOverPos] = useState('before'); // 'before' = drop above the row

  function move(fromId, toId, pos) {
    if (!onReorder || fromId === toId) return;
    const order = ids.filter(id => id !== fromId);
    let idx = order.indexOf(toId);
    if (idx < 0) return;
    if (pos === 'after') idx += 1;
    order.splice(idx, 0, fromId);
    onReorder(order);
  }

  // Up/down buttons reuse the same robust reorder path (one step toward top/bottom).
  function nudge(id, delta) {
    const i = ids.indexOf(id);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    const order = [...ids];
    order.splice(i, 1);
    order.splice(j, 0, id);
    onReorder?.(order);
  }

  function endDrag() { setDragId(null); setOverId(null); }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1, paddingRight: 4 }}>
      {sortedNodes.map((node, i) => (
        <LayerItem
          key={node.id}
          node={node}
          isSelected={selectedIds.includes(node.id)}
          isDragging={dragId === node.id}
          dropBefore={dragId && overId === node.id && overPos === 'before'}
          dropAfter={dragId && overId === node.id && overPos === 'after'}
          canForward={i > 0}
          canBack={i < sortedNodes.length - 1}
          onSelect={(multi) => onSelect(node.id, multi)}
          onUpdate={patch => onUpdate(node.id, patch)}
          onForward={() => nudge(node.id, -1)}
          onBack={() => nudge(node.id, +1)}
          onDragStart={() => setDragId(node.id)}
          onDragOverItem={(pos) => { if (dragId && dragId !== node.id) { setOverId(node.id); setOverPos(pos); } }}
          onDropItem={() => { if (dragId) move(dragId, node.id, overPos); endDrag(); }}
          onDragEnd={endDrag}
        />
      ))}
      {sortedNodes.length === 0 && (
        <div style={{ padding: 20, textAlign: 'center', color: '#8b949e', fontSize: '0.8rem' }}>
          No hay elementos en esta página.
        </div>
      )}
    </div>
  );
}

function LayerItem({
  node, isSelected, isDragging, dropBefore, dropAfter, canForward, canBack,
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
      draggable={!editing}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', node.id); onDragStart(); }}
      onDragOver={handleDragOver}
      onDrop={(e) => { e.preventDefault(); onDropItem(); }}
      onDragEnd={onDragEnd}
      onClick={(e) => onSelect(e.shiftKey || e.metaKey || e.ctrlKey)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px',
        background: isSelected ? 'rgba(31,111,235,0.2)' : 'transparent',
        border: `1px solid ${isSelected ? '#1f6feb' : 'transparent'}`,
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
