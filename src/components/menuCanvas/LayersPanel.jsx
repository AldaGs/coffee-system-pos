import { useState } from 'react';
import { Icon } from '@iconify/react';

const btnStyle = {
  background: 'transparent', border: 'none', color: '#8b949e', cursor: 'pointer',
  padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center'
};

const activeBtnStyle = { ...btnStyle, color: '#e6edf3' };

export default function LayersPanel({ nodes, selectedIds, onSelect, onUpdate, onBringForward, onSendBack }) {
  // Sort nodes by z descending (top layers first)
  const sortedNodes = [...(nodes || [])].sort((a, b) => (b.z || 0) - (a.z || 0));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1, paddingRight: 4 }}>
      {sortedNodes.map((node, i) => (
        <LayerItem
          key={node.id}
          node={node}
          isSelected={selectedIds.includes(node.id)}
          onSelect={(multi) => onSelect(node.id, multi)}
          onUpdate={patch => onUpdate(node.id, patch)}
          canForward={i > 0}
          canBack={i < sortedNodes.length - 1}
          onForward={() => onBringForward(node.id)}
          onBack={() => onSendBack(node.id)}
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

function LayerItem({ node, isSelected, onSelect, onUpdate, canForward, canBack, onForward, onBack }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');

  const typeLabel = node.type === 'text' ? 'Texto' :
    node.type === 'image' ? 'Imagen' :
    node.type === 'shape' ? (node.shape === 'circle' ? 'Círculo' : 'Rectángulo') :
    node.type === 'path' ? 'Trazo' :
    node.type === 'item-binding' ? 'Producto' :
    node.type === 'whatsapp-button' ? 'Botón WA' :
    node.type === 'date-field' ? 'Fecha' : 'Elemento';

  const defaultName = node.text ? `Texto: ${node.text.slice(0, 15)}...` :
    node.label ? `Etiqueta: ${node.label}` :
    typeLabel;

  const displayName = node.name || defaultName;

  function handleDoubleClick() {
    setName(displayName);
    setEditing(true);
  }

  function commitName() {
    setEditing(false);
    if (name && name !== displayName) {
      onUpdate({ name });
    }
  }

  return (
    <div
      onClick={(e) => onSelect(e.shiftKey)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px',
        background: isSelected ? 'rgba(31,111,235,0.2)' : 'transparent',
        border: `1px solid ${isSelected ? '#1f6feb' : 'transparent'}`,
        borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem', color: '#e6edf3',
        opacity: node.hidden ? 0.5 : 1
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <button
          onClick={(e) => { e.stopPropagation(); onForward(); }}
          disabled={!canForward}
          style={{ ...btnStyle, padding: 0, opacity: canForward ? 1 : 0.2 }}
          title="Subir capa"
        >
          <Icon icon="lucide:chevron-up" style={{ fontSize: '12px' }} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onBack(); }}
          disabled={!canBack}
          style={{ ...btnStyle, padding: 0, opacity: canBack ? 1 : 0.2 }}
          title="Bajar capa"
        >
          <Icon icon="lucide:chevron-down" style={{ fontSize: '12px' }} />
        </button>
      </div>

      <div style={{ flex: 1, minWidth: 0, paddingLeft: 4 }} onDoubleClick={handleDoubleClick}>
        {editing ? (
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditing(false); }}
            autoFocus
            style={{ width: '100%', background: '#0d1117', color: 'white', border: '1px solid #1f6feb', borderRadius: 4, padding: '2px 4px', fontSize: '0.8rem', outline: 'none' }}
          />
        ) : (
          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {displayName}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <button
          onClick={(e) => { e.stopPropagation(); onUpdate({ locked: !node.locked }); }}
          style={node.locked ? activeBtnStyle : btnStyle}
          title={node.locked ? "Desbloquear" : "Bloquear"}
        >
          <Icon icon={node.locked ? "lucide:lock" : "lucide:unlock"} style={{ fontSize: '14px' }} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onUpdate({ hidden: !node.hidden }); }}
          style={node.hidden ? activeBtnStyle : btnStyle}
          title={node.hidden ? "Mostrar" : "Ocultar"}
        >
          <Icon icon={node.hidden ? "lucide:eye-off" : "lucide:eye"} style={{ fontSize: '14px' }} />
        </button>
      </div>
    </div>
  );
}
