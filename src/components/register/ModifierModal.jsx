import { usePos } from '../../utils/PosContext';
import { useTranslation } from '../../hooks/useTranslation';
import { formatForDisplay } from '../../utils/moneyUtils';
import { BottomSheet } from '../ui/arc';

function ModifierModal({
  isModalOpen, setIsModalOpen, setPendingItem
}) {
  const { t } = useTranslation();

  const { 
    pendingItem, menuData, handleToggleModifier, 
    handleTextModifierChange, addToTicket
  } = usePos();

  // Swiping the sheet away (or Esc / tapping outside) drops the item without adding it.
  const dismiss = () => { setIsModalOpen(false); setPendingItem(null); };

  return (
    <BottomSheet
      open={isModalOpen && !!pendingItem}
      onOpenChange={(open) => { if (!open) dismiss(); }}
      title={pendingItem ? `${t('modModal.customize')} ${pendingItem.name}` : ''}
      closeLabel={t('common.close')}
      detents={[0.6, 0.92]}
      className="arc"
    >
      {pendingItem && <>
        
        {pendingItem.allowedModifiers
          .filter(modKey => menuData.modifierGroups[modKey] && !menuData.modifierGroupSettings?.[modKey]?.isHidden)
          .map(modKey => (
          <div key={modKey} className="modifier-group">
            <h4 style={{ textTransform: 'capitalize' }}>{modKey.replace('_', ' ')}</h4>
            {menuData.modifierGroups[modKey].map(option => {
              const existingMod = pendingItem.selectedModifiers.find(m => m.id === option.id);
              const isSelected = !!existingMod;
              
              if (option.isTextInput) {
                return (
                  <div key={option.id} style={{ marginBottom: '10px' }}>
                    <label style={{ fontSize: '0.9rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                      {option.name}
                    </label>
                    <input 
                      type="text" 
                      placeholder={t('modModal.typeHere')} 
                      value={existingMod ? existingMod.textValue : ''} 
                      onChange={(e) => handleTextModifierChange(modKey, option, e.target.value)} 
                      style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `2px solid ${isSelected ? 'var(--brand-color)' : 'var(--border)'}`, background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1rem', outline: 'none' }} 
                    />
                  </div>
                );
              }
              
              return (
                <button 
                  key={option.id} 
                  onClick={() => handleToggleModifier(modKey, option)} 
                  className={`modifier-btn ${isSelected ? 'selected' : ''}`} 
                  style={{ margin: '4px' }}
                >
                  {option.name} {option.price > 0 && `(+${formatForDisplay(option.price)})`}
                </button>
              );
            })}
          </div>
        ))}

        <div className="modal-actions">
          <button className="btn-cancel" onClick={() => addToTicket(pendingItem, [], pendingItem.basePrice)}>
            {t('modModal.btnCancel')}
          </button>
          <button className="btn-confirm" onClick={() => addToTicket(pendingItem, pendingItem.selectedModifiers)}>
            {t('modModal.btnAdd')}
          </button>
        </div>
      </>}
    </BottomSheet>
  );
}

export default ModifierModal;