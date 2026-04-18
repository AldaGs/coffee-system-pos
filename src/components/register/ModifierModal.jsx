import { usePos } from '../../utils/PosContext';

function ModifierModal({ 
  // ONLY these 2 local UI props stay here
  isModalOpen, setIsModalOpen 
}) {

  // 🔥 Pull the active item, menu rules, and cart functions from Context!
  const { 
    pendingItem, menuData, handleToggleModifier, 
    handleTextModifierChange, addToTicket 
  } = usePos();

  if (!isModalOpen || !pendingItem) return null;
  return (
    <div className="modal-overlay"><div className="modal-content">
      <h2>Customize: {pendingItem.name}</h2>
      {pendingItem.allowedModifiers.map(modKey => (
        <div key={modKey} className="modifier-group">
          <h4 style={{ textTransform: 'capitalize' }}>{modKey.replace('_', ' ')}</h4>
          {menuData.modifierGroups[modKey].map(option => {
            const existingMod = pendingItem.selectedModifiers.find(m => m.id === option.id);
            const isSelected = !!existingMod;
            if (option.isTextInput) {
              return (<div key={option.id} style={{ marginBottom: '10px' }}><label style={{ fontSize: '0.9rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>{option.name}</label><input type="text" placeholder="Type here..." value={existingMod ? existingMod.textValue : ''} onChange={(e) => handleTextModifierChange(modKey, option, e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `2px solid ${isSelected ? 'var(--brand-color)' : 'var(--border)'}`, background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1rem', outline: 'none' }} /></div>);
            }
            return (<button key={option.id} onClick={() => handleToggleModifier(modKey, option)} className={`modifier-btn ${isSelected ? 'selected' : ''}`} style={{ margin: '4px' }}>{option.name} {option.price > 0 && `(+$${option.price})`}</button>);
          })}
        </div>
      ))}
      <div className="modal-actions"><button className="btn-cancel" onClick={() => setIsModalOpen(false)}>Cancel</button><button className="btn-confirm" onClick={() => addToTicket(pendingItem, pendingItem.selectedModifiers)}>Add to Ticket</button></div>
    </div></div>
  );
}
export default ModifierModal;
