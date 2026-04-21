import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';

function EditDrinkModal({ editingDrink, setEditingDrink, menuData, toggleModifierForDrink }) {
  const { t } = useTranslation();

  if (!editingDrink) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 1000, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
      <div className="modal-content fade-in" style={{ maxWidth: '500px', background: 'var(--bg-surface)', padding: '32px', borderRadius: '32px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ height: '48px', width: '48px', borderRadius: '14px', background: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)' }}>
              <Icon icon="lucide:settings-2" style={{ fontSize: '1.5rem', color: 'var(--brand-color)' }} />
            </div>
            <h2 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.5rem', fontWeight: '900' }}>{t('edit.title')}</h2>
          </div>
          <button 
            onClick={() => setEditingDrink(null)} 
            style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', width: '40px', height: '40px', borderRadius: '12px', cursor: 'pointer', color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon icon="lucide:x" style={{ fontSize: '1.2rem' }} />
          </button>
        </div>

        <p style={{ color: 'var(--text-muted)', marginBottom: '32px', fontSize: '1.1rem', lineHeight: '1.5' }}>
          {t('edit.subtitle')} <span style={{ color: 'var(--brand-color)', fontWeight: '900' }}>{editingDrink.drink.name}</span>.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '400px', overflowY: 'auto', paddingRight: '8px' }}>
          {Object.keys(menuData.modifierGroups).map(groupKey => {
            const isAssigned = editingDrink.drink.allowedModifiers.includes(groupKey);
            return (
              <label 
                key={groupKey} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '16px', 
                  padding: '20px', 
                  border: `2px solid ${isAssigned ? 'var(--brand-color)' : 'var(--border)'}`, 
                  borderRadius: '20px', 
                  cursor: 'pointer', 
                  background: isAssigned ? 'rgba(52, 152, 219, 0.05)' : 'var(--bg-main)', 
                  transition: 'all 0.2s',
                  boxShadow: isAssigned ? '0 4px 12px rgba(52, 152, 219, 0.1)' : 'none'
                }}
              >
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <input 
                    type="checkbox" 
                    checked={isAssigned} 
                    onChange={() => toggleModifierForDrink(groupKey)} 
                    style={{ width: '24px', height: '24px', cursor: 'pointer', accentColor: 'var(--brand-color)' }} 
                  />
                </div>
                <span style={{ fontSize: '1.1rem', fontWeight: '800', textTransform: 'capitalize', color: isAssigned ? 'var(--text-main)' : 'var(--text-muted)' }}>
                  {groupKey.replace('_', ' ')}
                </span>
                {isAssigned && (
                  <Icon icon="lucide:check" style={{ marginLeft: 'auto', color: 'var(--brand-color)', fontSize: '1.2rem' }} />
                )}
              </label>
            );
          })}
        </div>

        <button 
          onClick={() => setEditingDrink(null)} 
          style={{ width: '100%', padding: '18px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '18px', cursor: 'pointer', fontWeight: '900', fontSize: '1.1rem', marginTop: '32px', boxShadow: '0 10px 25px rgba(52, 152, 219, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
        >
          <Icon icon="lucide:save" />
          {t('edit.btnDone')}
        </button>
      </div>
    </div>
  );
}

export default EditDrinkModal;