import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';
import { getRole, ROLES } from '../../utils/cashierRoles';

// Visual styling for each role badge. Kept here so TeamTab is the single
// place that decides "what does a manager look like vs. an admin."
const ROLE_STYLES = {
  admin:    { bg: 'rgba(155, 89, 182, 0.10)', fg: '#9b59b6', border: 'rgba(155, 89, 182, 0.20)' },
  manager:  { bg: 'rgba(241, 196, 15, 0.10)', fg: '#b8860b', border: 'rgba(241, 196, 15, 0.25)' },
  employee: { bg: 'rgba(52, 152, 219, 0.10)', fg: '#3498db', border: 'rgba(52, 152, 219, 0.20)' },
};

function TeamTab({ newCashier, setNewCashier, handleAddCashier, cashiers, handleDeleteCashier }) {
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
                placeholder={t('team.labelName')}
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
                  placeholder={t('team.labelPin')}
                  value={newCashier.pin}
                  onChange={(e) => setNewCashier({ ...newCashier, pin: e.target.value.replace(/\D/g, '') })}
                  style={{ width: '100%', padding: '14px 14px 14px 42px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold', letterSpacing: '8px', fontSize: '1.2rem', boxSizing: 'border-box' }}
                />
              </div>
              <small style={{ color: 'var(--text-muted)' }}>{t('team.pinHelp')}</small>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>{t('team.labelRole') || 'Role'}</label>
              <select
                value={newCashier.role || ROLES.EMPLOYEE}
                onChange={(e) => setNewCashier({ ...newCashier, role: e.target.value })}
                style={{ padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold' }}
              >
                <option value={ROLES.EMPLOYEE}>{t('team.role.employee') || 'Employee'}</option>
                <option value={ROLES.MANAGER}>{t('team.role.manager') || 'Manager'}</option>
                <option value={ROLES.ADMIN}>{t('team.role.admin') || 'Admin'}</option>
              </select>
              <small style={{ color: 'var(--text-muted)' }}>{t('team.roleHelp')}</small>
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
                  <th style={{ padding: '16px' }}>{t('team.labelName')}</th>
                  <th style={{ padding: '16px' }}>{t('team.labelRole') || 'Role'}</th>
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
                      {(() => {
                        const role = getRole(member);
                        const s = ROLE_STYLES[role] || ROLE_STYLES.employee;
                        return (
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '20px',
                            fontSize: '0.75rem',
                            fontWeight: '800',
                            textTransform: 'uppercase',
                            background: s.bg,
                            color: s.fg,
                            border: `1px solid ${s.border}`,
                          }}>
                            {t(`team.role.${role}`) || role}
                          </span>
                        );
                      })()}
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