import { useTranslation } from '../../hooks/useTranslation';

function DiscountsTab({ menuData, newRule, setNewRule, saveMenuToCloud, showAlert, showConfirm }) {
  const { t } = useTranslation();

  return (
    <div className="admin-section fade-in">
      <h1 style={{ color: 'var(--text-main)' }}>{t('disc.title')}</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>{t('disc.subtitle')}</p>
      
      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        
        {/* CREATE RULE SECTION */}
        <div style={{ flex: 1, minWidth: '300px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0, color: 'var(--text-main)' }}>{t('disc.createTitle')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <input 
              type="text" 
              placeholder={t('disc.placeholderName')} 
              value={newRule.name} 
              onChange={(e) => setNewRule({ ...newRule, name: e.target.value })} 
              style={{ padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} 
            />
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <select 
                value={newRule.type} 
                onChange={(e) => setNewRule({ ...newRule, type: e.target.value })} 
                style={{ flex: 1, padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
              >
                <option value="percentage">{t('disc.typePerc')}</option>
                <option value="flat">{t('disc.typeFlat')}</option>
              </select>
              <input 
                type="number" 
                placeholder={t('disc.placeholderValue')} 
                value={newRule.value} 
                onChange={(e) => setNewRule({ ...newRule, value: e.target.value })} 
                style={{ flex: 1, padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} 
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>{t('disc.applyTo')}</label>
              <select 
                value={newRule.targetType} 
                onChange={(e) => setNewRule({ ...newRule, targetType: e.target.value, targetValue: '' })} 
                style={{ padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
              >
                <option value="cart">{t('disc.targetCart')}</option>
                <option value="item">{t('disc.targetItem')}</option>
              </select>
            </div>

            {newRule.targetType === 'item' && (
              <select 
                value={newRule.targetValue} 
                onChange={(e) => setNewRule({ ...newRule, targetValue: e.target.value })} 
                style={{ padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
              >
                <option value="">{t('disc.selectItem')}</option>
                {Object.keys(menuData.categories).map(cat => 
                  menuData.categories[cat].map(item => (
                    <option key={item.id} value={item.name}>{item.name} ({cat})</option>
                  ))
                )}
              </select>
            )}

            <button 
              onClick={() => { 
                if (!newRule.name || !newRule.value || (newRule.targetType === 'item' && !newRule.targetValue)) {
                  return showAlert(t('disc.alertError'), t('disc.alertErrorDesc')); 
                }
                const updatedMenu = { ...menuData }; 
                if (!updatedMenu.discountRules) updatedMenu.discountRules = []; 
                updatedMenu.discountRules.push({ ...newRule, id: Date.now(), value: parseFloat(newRule.value), isActive: true }); 
                saveMenuToCloud(updatedMenu); 
                setNewRule({ name: '', type: 'percentage', value: '', targetType: 'cart', targetValue: '' }); 
                showAlert(t('disc.alertSuccess'), t('disc.alertSuccessDesc')); 
              }} 
              style={{ padding: '14px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              {t('disc.btnAdd')}
            </button>
          </div>
        </div>

        {/* ACTIVE RULES LIST */}
        <div style={{ flex: 1, minWidth: '300px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>{t('disc.activeTitle')}</h3>
          {(!menuData.discountRules || menuData.discountRules.length === 0) ? (
            <p style={{ color: 'var(--text-muted)' }}>{t('disc.noRules')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {menuData.discountRules.map(rule => (
                <div key={rule.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', border: '1px solid var(--border)', borderRadius: '8px', background: rule.isActive ? 'var(--bg-main)' : 'var(--bg-surface)', opacity: rule.isActive ? 1 : 0.6 }}>
                  <div>
                    <div style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '1.1rem' }}>{rule.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      {rule.type === 'percentage' ? `${rule.value}% ${t('disc.off')}` : `$${rule.value.toFixed(2)} ${t('disc.off')}`} 
                      • {rule.targetType === 'cart' ? t('disc.entireOrder') : `${t('disc.itemLabel')} ${rule.targetValue}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                      onClick={() => { 
                        const updatedMenu = { ...menuData }; 
                        const ruleIndex = updatedMenu.discountRules.findIndex(r => r.id === rule.id); 
                        updatedMenu.discountRules[ruleIndex].isActive = !rule.isActive; 
                        saveMenuToCloud(updatedMenu); 
                      }} 
                      style={{ padding: '8px 12px', background: 'transparent', color: 'var(--brand-color)', border: '1px solid var(--brand-color)', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      {rule.isActive ? t('disc.btnPause') : t('disc.btnActivate')}
                    </button>
                    <button 
                      onClick={() => { 
                        showConfirm(t('disc.confirmDelete'), t('disc.confirmDeleteDesc'), () => { 
                          const updatedMenu = { ...menuData }; 
                          updatedMenu.discountRules = updatedMenu.discountRules.filter(r => r.id !== rule.id); 
                          saveMenuToCloud(updatedMenu); 
                        }); 
                      }} 
                      style={{ padding: '8px 12px', background: 'transparent', color: '#e74c3c', border: '1px solid #e74c3c', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      {t('disc.btnDelete')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DiscountsTab;