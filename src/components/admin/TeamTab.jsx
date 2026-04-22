import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';

function TeamTab({ newCashier, setNewCashier, handleAddCashier, cashiers, editingCashier, setEditingCashier, handleSaveEditCashier, handleDeleteCashier }) {
  const { t } = useTranslation();
  
  return (
    <div className="admin-section fade-in">
      <div style={{ marginBottom: '40px' }}>
        <h1 style={{ margin: 0, color: 'var(--text-main)', fontSize: '2rem', fontWeight: '800' }}>{t('team.title')}</h1>
        <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0', fontSize: '1.1rem' }}>{t('team.subtitle')}</p>
      </div>

      {/* ADD NEW MEMBER FORM */}
      <div style={{ background: 'var(--bg-surface)', padding: '32px', borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', marginBottom: '40px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '24px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: '800' }}>
          <Icon icon="lucide:user-plus" style={{ color: 'var(--brand-color)' }} />
          {t('team.addMember')}
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('team.labelName') || 'Full Name'}</label>
            <input 
              type="text" 
              placeholder={t('team.placeholderName')} 
              value={newCashier.name} 
              onChange={(e) => setNewCashier({ ...newCashier, name: e.target.value })} 
              style={{ padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold' }} 
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('team.labelPin') || '4-Digit PIN'}</label>
            <input 
              type="password" 
              maxLength="4" 
              placeholder="••••" 
              value={newCashier.pin} 
              onChange={(e) => setNewCashier({ ...newCashier, pin: e.target.value.replace(/\D/g, '') })} 
              style={{ padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', textAlign: 'center', letterSpacing: '8px', fontSize: '0.85rem', outline: 'none' }} 
            />
          </div>
          
          <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', color: 'var(--text-main)', fontWeight: 'bold', height: '52px', padding: '0 16px', background: 'var(--bg-main)', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <input type="checkbox" checked={newCashier.isAdmin} onChange={(e) => setNewCashier({ ...newCashier, isAdmin: e.target.checked })} style={{ width: '20px', height: '20px', accentColor: 'var(--brand-color)' }} />
            <span style={{ fontSize: '0.9rem' }}>{t('team.isAdmin')}</span>
          </label>

          <button onClick={handleAddCashier} style={{ height: '52px', padding: '0 32px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 8px 20px rgba(39, 174, 96, 0.2)' }}>
            <Icon icon="lucide:user-plus" />
            {t('team.btnAdd')}
          </button>
        </div>
      </div>

      {/* STAFF LIST */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '10px' }}>
        {cashiers.map(cashier => (
          <div key={cashier.id} style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: '0 10px 30px rgba(0,0,0,0.02)', transition: 'all 0.2s' }}>
            
            {editingCashier && editingCashier.id === cashier.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }} className="fade-in">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('team.labelName')}</label>
                    <input type="text" value={editingCashier.name} onChange={(e) => setEditingCashier({ ...editingCashier, name: e.target.value })} style={{ padding: '12px', borderRadius: '10px', border: '2px solid var(--brand-color)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('team.labelPin')}</label>
                    <input type="password" maxLength="4" value={editingCashier.pin} onChange={(e) => setEditingCashier({ ...editingCashier, pin: e.target.value.replace(/\D/g, '') })} style={{ padding: '12px', borderRadius: '10px', border: '2px solid var(--brand-color)', background: 'var(--bg-main)', color: 'var(--text-main)', textAlign: 'center', letterSpacing: '8px', outline: 'none' }} />
                  </div>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', color: 'var(--text-main)', fontWeight: 'bold', padding: '10px 16px', background: 'var(--bg-main)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <input type="checkbox" checked={editingCashier.isAdmin} onChange={(e) => setEditingCashier({ ...editingCashier, isAdmin: e.target.checked })} style={{ width: '18px', height: '18px', accentColor: 'var(--brand-color)' }} />
                    <span style={{ fontSize: '0.9rem' }}>{t('team.adminAccess')}</span>
                  </label>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setEditingCashier(null)} style={{ padding: '12px 20px', background: 'var(--bg-main)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
                      {t('team.btnCancel')}
                    </button>
                    <button onClick={handleSaveEditCashier} style={{ padding: '12px 24px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '900', cursor: 'pointer', boxShadow: '0 4px 12px rgba(52, 152, 219, 0.2)' }}>
                      {t('team.btnSave')}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                  <div style={{ height: '64px', width: '64px', borderRadius: '20px', background: cashier.isAdmin ? 'linear-gradient(135deg, #9b59b6, #8e44ad)' : 'linear-gradient(135deg, var(--brand-color), #2980b9)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: '900', boxShadow: '0 8px 16px rgba(0,0,0,0.1)' }}>
                    {cashier.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontWeight: '900', color: 'var(--text-main)', fontSize: '1.2rem' }}>{cashier.name}</span>
                      {cashier.isAdmin && (
                        <span style={{ fontSize: '0.7rem', background: 'rgba(155, 89, 182, 0.1)', color: '#9b59b6', padding: '4px 10px', borderRadius: '10px', fontWeight: '900', textTransform: 'uppercase', border: '1px solid rgba(155, 89, 182, 0.2)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Icon icon="lucide:shield-check" />
                          {t('team.badgeAdmin')}
                        </span>
                      )}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Icon icon="lucide:key-round" style={{ fontSize: '1rem' }} />
                      {t('team.pinLabel')}: ••••
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setEditingCashier(cashier)} style={{ height: '44px', width: '44px', background: 'rgba(52, 152, 219, 0.05)', color: 'var(--brand-color)', border: '1px solid rgba(52, 152, 219, 0.1)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: '0.2s' }} title={t('team.btnEdit')}>
                    <Icon icon="lucide:edit-3" style={{ fontSize: '1.2rem' }} />
                  </button>
                  <button onClick={() => handleDeleteCashier(cashier.id)} style={{ height: '44px', width: '44px', background: 'rgba(231, 76, 60, 0.05)', color: '#e74c3c', border: '1px solid rgba(231, 76, 60, 0.1)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: '0.2s' }} title={t('team.btnRemove')}>
                    <Icon icon="lucide:trash-2" style={{ fontSize: '1.2rem' }} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default TeamTab;