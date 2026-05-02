import { useState, useEffect } from 'react';

function QuantityEditModal({ isOpen, item, onConfirm, onClose }) {
  const [qty, setQty] = useState('');

  useEffect(() => {
    if (isOpen && item) setQty(String(item.qty || 1));
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const handleConfirm = () => {
    const parsed = parseInt(qty, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      onConfirm(item.uniqueId, parsed);
      onClose();
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '320px' }}>
        <h2>Ingresar nueva cantidad</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '16px', fontSize: '1rem' }}>
          {item.emoji} {item.name}
        </p>
        <input
          type="number"
          min="0"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); if (e.key === 'Escape') onClose(); }}
          autoFocus
          style={{
            width: '100%',
            padding: '14px',
            fontSize: '1.8rem',
            textAlign: 'center',
            borderRadius: '8px',
            border: '2px solid var(--brand-color)',
            background: 'var(--bg-main)',
            color: 'var(--text-main)',
            outline: 'none',
            marginBottom: '20px',
            boxSizing: 'border-box'
          }}
        />
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="btn-confirm" onClick={handleConfirm}>Confirmar</button>
        </div>
      </div>
    </div>
  );
}

export default QuantityEditModal;
