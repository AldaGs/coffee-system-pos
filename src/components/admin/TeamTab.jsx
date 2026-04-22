import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';

function TeamTab({ newCashier, setNewCashier, handleAddCashier, cashiers, editingCashier, setEditingCashier, handleSaveEditCashier, handleDeleteCashier }) {
  const { t } = useTranslation();

  return (
    <div className="admin-section fade-in">
      <div className="admin-section-header" style={{ marginBottom: '40px' }}>
        <h1 style={{ margin: 0, color: 'var(--text-main)', fontSize: '2rem', fontWeight: '800' }}>{t('team.title')}</h1>
        <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0', fontSize: '1.1rem' }}>{t('team.subtitle')}</p>
      </div>

      <div className="admin-grid-responsive" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '32px', alignItems: 'flex-start' }}>

        {/* ADD MEMBER FORM */}
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <h3 style={{ margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: '800' }}>
            <Icon icon="lucide:user-plus" style={{ color: 'var(--brand-color)' }} />
            {t('team.addTitle') || 'Add Team Member'}
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>{t('team.labelName')}</label>
              <input
                type="text"
                placeholder="e.g., John Doe"
                value={newCashier.name}
                onChange={(e) => setNewCashier({ ...newCashier, name: e.target.value })}
                style={{ padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>{t('team.labelPin')}</label>
              <div style={{ position: 'relative' }}>
                <Icon icon="lucide:key-round" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="password"
                  maxLength="4"
                  placeholder="4 digits"
                  value={newCashier.pin}
                  onChange={(e) => setNewCashier({ ...newCashier, pin: e.target.value.replace(/\D/g, '') })}
                  style={{ width: '100%', padding: '14px 14px 14px 42px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold', letterSpacing: '8px', fontSize: '1.2rem', boxSizing: 'border-box' }}
                />
              </div>
              <small style={{ color: 'var(--text-muted)' }}>{t('team.pinHelp')}</small>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', color: 'var(--text-main)', fontWeight: 'bold', height: '52px', padding: '0 16px', background: 'var(--bg-main)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <input type="checkbox" checked={newCashier.isAdmin} onChange={(e) => setNewCashier({ ...newCashier, isAdmin: e.target.checked })} style={{ width: '20px', height: '20px', accentColor: 'var(--brand-color)' }} />
                <span style={{ fontSize: '0.9rem' }}>{t('team.isAdmin') || 'Administrator Privileges'}</span>
              </label>
            </div>

            <button onClick={handleAddCashier} style={{ padding: '16px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '16px', cursor: 'pointer', fontWeight: '900', fontSize: '1.1rem', marginTop: '8px', boxShadow: '0 8px 20px rgba(52, 152, 219, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              <Icon icon="lucide:plus" />
              {t('team.btnAdd')}
            </button>
          </div>
        </div>

        {/* TEAM LIST TABLE */}
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '24px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: '800' }}>
            <Icon icon="lucide:users" style={{ color: 'var(--brand-color)' }} />
            {t('team.listTitle') || 'Team List'}
          </h3>

          <div style={{ overflowX: 'auto' }}>
            <table className="card-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead style={{ background: 'var(--bg-main)', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                <tr>
                  <th style={{ padding: '16px' }}>{t('team.colName')}</th>
                  <th style={{ padding: '16px' }}>{t('team.colRole') || 'Role'}</th>
                  <th style={{ padding: '16px', textAlign: 'right' }}>{t('team.colActions')}</th>
                </tr>
              </thead>
              <tbody style={{ color: 'var(--text-main)' }}>
                {cashiers.map(member => (
                  <tr key={member.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '16px', fontWeight: 'bold' }} data-label={t('team.colName')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--bg-main)', color: 'var(--brand-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '0.8rem', border: '1px solid var(--border)' }}>
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        {member.name}
                      </div>
                    </td>
                    <td style={{ padding: '16px' }} data-label={t('team.colRole') || 'Role'}>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '20px',
                        fontSize: '0.75rem',
                        fontWeight: '800',
                        textTransform: 'uppercase',
                        background: member.isAdmin ? 'rgba(155, 89, 182, 0.1)' : 'rgba(52, 152, 219, 0.1)',
                        color: member.isAdmin ? '#9b59b6' : '#3498db',
                        border: `1px solid ${member.isAdmin ? 'rgba(155, 89, 182, 0.2)' : 'rgba(52, 152, 219, 0.2)'}`
                      }}>
                        {member.isAdmin ? t('team.roleAdmin') : t('team.roleWaiter')}
                      </span>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'right' }} data-label={t('team.colActions')}>
                      <button
                        onClick={() => handleDeleteCashier(member.id)}
                        style={{ background: 'rgba(231, 76, 60, 0.05)', border: 'none', color: '#e74c3c', cursor: 'pointer', padding: '8px', borderRadius: '10px', transition: 'all 0.2s' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(231, 76, 60, 0.1)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(231, 76, 60, 0.05)'}
                      >
                        <Icon icon="lucide:trash-2" style={{ fontSize: '1.1rem' }} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}

export default TeamTab;