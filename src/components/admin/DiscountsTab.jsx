import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';
import { toCents, formatForDisplay } from '../../utils/moneyUtils';

function DiscountsTab({ menuData, newRule, setNewRule, saveMenuToCloud, showAlert, showConfirm }) {
  const { t } = useTranslation();

  return (
    <div className="admin-section fade-in">
      <div className="admin-section-header" style={{ marginBottom: '40px' }}>
        <h1 style={{ margin: 0, color: 'var(--text-main)', fontSize: '2rem', fontWeight: '800' }}>{t('disc.title')}</h1>
        <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0', fontSize: '1.1rem' }}>{t('disc.subtitle')}</p>
      </div>

      <div className="admin-grid-responsive" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '32px', alignItems: 'flex-start' }}>

        {/* CREATE RULE SECTION */}
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '24px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: '800' }}>
            <Icon icon="lucide:ticket-plus" style={{ color: 'var(--brand-color)' }} />
            {t('disc.createTitle')}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('disc.labelName')}</label>
              <input
                type="text"
                placeholder={t('disc.placeholderName')}
                value={newRule.name}
                onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                style={{ padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('disc.labelType')}</label>
                <select
                  value={newRule.type}
                  onChange={(e) => setNewRule({ ...newRule, type: e.target.value })}
                  style={{ padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  <option value="percentage">{t('disc.typePerc')}</option>
                  <option value="flat">{t('disc.typeFlat')}</option>
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('disc.labelValue')}</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                    {newRule.type === 'percentage' ? '%' : '$'}
                  </span>
                  <input
                    type="number"
                    placeholder={t('disc.placeholderValue')}
                    value={newRule.value}
                    onChange={(e) => setNewRule({ ...newRule, value: e.target.value })}
                    style={{ width: '100%', padding: '14px 14px 14px 32px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: '900', fontSize: '0.85rem' }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon icon="lucide:target" style={{ color: 'var(--brand-color)' }} />
                {t('disc.applyTo')}
              </label>
              <select
                value={newRule.targetType}
                onChange={(e) => setNewRule({ ...newRule, targetType: e.target.value, targetValue: '' })}
                style={{ padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold', cursor: 'pointer' }}
              >
                <option value="cart">{t('disc.targetCart')}</option>
                <option value="item">{t('disc.targetItem')}</option>
              </select>
            </div>

            {newRule.targetType === 'item' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }} className="fade-in">
                <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('disc.selectItem')}</label>
                <select
                  value={newRule.targetValue}
                  onChange={(e) => setNewRule({ ...newRule, targetValue: e.target.value })}
                  style={{ padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  <option value="">{t('disc.selectItemPlaceholder')}</option>
                  {Object.keys(menuData.categories).map(cat =>
                    menuData.categories[cat].map(item => (
                      <option key={item.id} value={item.name}>{item.name} ({cat})</option>
                    ))
                  )}
                </select>
              </div>
            )}

            <button
              onClick={() => {
                if (!newRule.name || !newRule.value || (newRule.targetType === 'item' && !newRule.targetValue)) {
                  return showAlert(t('disc.alertError'), t('disc.alertErrorDesc'));
                }
                const updatedMenu = { ...menuData };
                if (!updatedMenu.discountRules) updatedMenu.discountRules = [];
                const val = newRule.type === 'percentage' ? parseFloat(newRule.value) : toCents(newRule.value);
                updatedMenu.discountRules.push({ ...newRule, id: Date.now(), value: val, isActive: true });
                saveMenuToCloud(updatedMenu);
                setNewRule({ name: '', type: 'percentage', value: '', targetType: 'cart', targetValue: '' });
                showAlert(t('disc.alertSuccess'), t('disc.alertSuccessDesc'));
              }}
              style={{ padding: '16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '16px', cursor: 'pointer', fontWeight: '900', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginTop: '10px', boxShadow: '0 8px 20px rgba(39, 174, 96, 0.2)' }}
            >
              <Icon icon="lucide:plus-circle" />
              {t('disc.btnAdd')}
            </button>
          </div>
        </div>

        {/* ACTIVE RULES LIST */}
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', height: 'fit-content' }}>
          <h3 style={{ marginTop: 0, marginBottom: '24px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: '800' }}>
            <Icon icon="lucide:tags" style={{ color: 'var(--brand-color)' }} />
            {t('disc.activeTitle')}
          </h3>
          {(!menuData.discountRules || menuData.discountRules.length === 0) ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', background: 'var(--bg-main)', borderRadius: '20px', border: '2px dashed var(--border)' }}>
              <Icon icon="lucide:ticket" style={{ fontSize: '3rem', color: 'var(--text-muted)', opacity: 0.2, marginBottom: '16px' }} />
              <p style={{ color: 'var(--text-muted)', margin: 0, fontWeight: 'bold' }}>{t('disc.noRules')}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {menuData.discountRules.map(rule => (
                <div key={rule.id} className="mobile-flex-stack" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', background: 'var(--bg-main)', borderRadius: '20px', border: rule.isActive ? '1px solid var(--brand-color)' : '1px solid var(--border)', opacity: rule.isActive ? 1 : 0.6, transition: 'all 0.3s', boxShadow: rule.isActive ? '0 4px 12px rgba(52, 152, 219, 0.1)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ height: '48px', width: '48px', borderRadius: '14px', background: rule.isActive ? 'rgba(52, 152, 219, 0.1)' : 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: rule.isActive ? 'var(--brand-color)' : 'var(--text-muted)' }}>
                      <Icon icon={rule.type === 'percentage' ? 'lucide:percent' : 'lucide:banknote'} style={{ fontSize: '1.4rem' }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: '900', color: 'var(--text-main)', fontSize: '1.1rem' }}>{rule.name}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--brand-color)', fontWeight: 'bold' }}>
                          {rule.type === 'percentage' ? `${rule.value}% ${t('disc.off')}` : `${formatForDisplay(rule.value)} ${t('disc.off')}`}
                        </span>
                        <span style={{ height: '3px', width: '3px', background: 'var(--border)', borderRadius: '50%' }} className="desktop-only" />
                        <span>{rule.targetType === 'cart' ? t('disc.entireOrder') : `${t('disc.itemLabel')} ${rule.targetValue}`}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => {
                        const updatedMenu = { ...menuData };
                        const ruleIndex = updatedMenu.discountRules.findIndex(r => r.id === rule.id);
                        updatedMenu.discountRules[ruleIndex].isActive = !rule.isActive;
                        saveMenuToCloud(updatedMenu);
                      }}
                      style={{ height: '40px', width: '40px', background: rule.isActive ? 'rgba(241, 196, 15, 0.1)' : 'rgba(46, 204, 113, 0.1)', color: rule.isActive ? '#f1c40f' : '#27ae60', border: 'none', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title={rule.isActive ? t('disc.btnPause') : t('disc.btnActivate')}
                    >
                      <Icon icon={rule.isActive ? "lucide:pause" : "lucide:play"} style={{ fontSize: '1.2rem' }} />
                    </button>
                    <button
                      onClick={() => {
                        showConfirm(t('disc.confirmDelete'), t('disc.confirmDeleteDesc'), () => {
                          const updatedMenu = { ...menuData };
                          updatedMenu.discountRules = updatedMenu.discountRules.filter(r => r.id !== rule.id);
                          saveMenuToCloud(updatedMenu);
                        });
                      }}
                      style={{ height: '40px', width: '40px', background: 'rgba(231, 76, 60, 0.05)', color: '#e74c3c', border: 'none', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title={t('disc.btnDelete')}
                    >
                      <Icon icon="lucide:trash-2" style={{ fontSize: '1.2rem' }} />
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