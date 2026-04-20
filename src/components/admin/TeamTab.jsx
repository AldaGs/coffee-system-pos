import { useTranslation } from '../../hooks/useTranslation';

function TeamTab({ newCashier, setNewCashier, handleAddCashier, cashiers, editingCashier, setEditingCashier, handleSaveEditCashier, handleDeleteCashier }) {
  const { t } = useTranslation();
  
  return (
    <div className="admin-section fade-in">
      <h2 style={{ color: 'var(--text-main)', borderBottom: '2px solid var(--border)', paddingBottom: '10px' }}>{t('team.title')}</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
        {t('team.subtitle')}
      </p>

      {/* ADD NEW MEMBER FORM */}
      <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', marginBottom: '30px' }}>
        <h3 style={{ marginTop: 0, color: 'var(--text-main)' }}>{t('team.addMember')}</h3>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input 
            type="text" 
            placeholder={t('team.placeholderName')} 
            value={newCashier.name} 
            onChange={(e) => setNewCashier({ ...newCashier, name: e.target.value })} 
            style={{ flex: 2, padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} 
          />
          <input 
            type="password" 
            maxLength="4" 
            placeholder={t('team.placeholderPin')} 
            value={newCashier.pin} 
            onChange={(e) => setNewCashier({ ...newCashier, pin: e.target.value.replace(/\D/g, '') })} 
            style={{ flex: 1, padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', textAlign: 'center', letterSpacing: '4px' }} 
          />
          
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-main)', fontWeight: 'bold' }}>
            <input type="checkbox" checked={newCashier.isAdmin} onChange={(e) => setNewCashier({ ...newCashier, isAdmin: e.target.checked })} style={{ width: '18px', height: '18px' }} />
            {t('team.isAdmin')}
          </label>

          <button onClick={handleAddCashier} style={{ padding: '12px 24px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
            {t('team.btnAdd')}
          </button>
        </div>
      </div>

      {/* STAFF LIST */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {cashiers.map(cashier => (
          <div key={cashier.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)', padding: '16px 20px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            
            {editingCashier && editingCashier.id === cashier.id ? (
              <div style={{ display: 'flex', gap: '10px', width: '100%', alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="text" value={editingCashier.name} onChange={(e) => setEditingCashier({ ...editingCashier, name: e.target.value })} style={{ flex: 2, padding: '10px', borderRadius: '6px', border: '2px solid var(--brand-color)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
                <input type="password" maxLength="4" value={editingCashier.pin} onChange={(e) => setEditingCashier({ ...editingCashier, pin: e.target.value.replace(/\D/g, '') })} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '2px solid var(--brand-color)', background: 'var(--bg-main)', color: 'var(--text-main)', textAlign: 'center', letterSpacing: '4px' }} />
                
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-main)' }}>
                  <input type="checkbox" checked={editingCashier.isAdmin} onChange={(e) => setEditingCashier({ ...editingCashier, isAdmin: e.target.checked })} />
                  {t('team.adminAccess')}
                </label>

                <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                  <button onClick={() => setEditingCashier(null)} style={{ padding: '8px 16px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '6px' }}>
                    {t('team.btnCancel')}
                  </button>
                  <button onClick={handleSaveEditCashier} style={{ padding: '8px 16px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>
                    {t('team.btnSave')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <div style={{ height: '40px', width: '40px', borderRadius: '20px', background: cashier.isAdmin ? '#9b59b6' : 'var(--brand-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>{cashier.name.charAt(0)}</div>
                  <div>
                    <div style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '1.1rem' }}>
                      {cashier.name} {cashier.isAdmin && <span style={{ fontSize: '0.7rem', background: '#9b59b6', color: 'white', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px' }}>{t('team.badgeAdmin')}</span>}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('team.pinLabel')}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setEditingCashier(cashier)} style={{ padding: '8px 16px', background: 'transparent', color: '#2980b9', border: '1px solid #2980b9', borderRadius: '6px', fontWeight: 'bold' }}>{t('team.btnEdit')}</button>
                  <button onClick={() => handleDeleteCashier(cashier.id)} style={{ padding: '8px 16px', background: 'transparent', color: '#e74c3c', border: '1px solid #e74c3c', borderRadius: '6px', fontWeight: 'bold' }}>{t('team.btnRemove')}</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default TeamTab;