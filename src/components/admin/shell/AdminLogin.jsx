import { Icon } from '@iconify/react';
import { useTranslation } from '../../../hooks/useTranslation';

const fieldStyle = { padding: '16px', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1rem', outline: 'none' };
const labelStyle = { fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' };

export default function AdminLogin({ loginForm, setLoginForm, onSubmit, onBack }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', height: '100dvh', width: '100vw', backgroundColor: 'var(--bg-main)', justifyContent: 'center', alignItems: 'center', fontFamily: 'system-ui', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div className="fade-in" style={{ background: 'var(--bg-surface)', padding: '48px', borderRadius: '32px', width: '100%', maxWidth: '450px', boxShadow: '0 20px 60px rgba(0,0,0,0.1)', border: '1px solid var(--border)' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ width: '80px', height: '80px', background: 'var(--brand-color)', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px auto', boxShadow: '0 10px 20px rgba(52, 152, 219, 0.3)' }}>
            <Icon icon="lucide:shield-lock" style={{ fontSize: '2.5rem', color: 'white' }} />
          </div>
          <h2 style={{ margin: 0, color: 'var(--text-main)', fontSize: '2rem', fontWeight: '900' }}>{t('admin.loginTitle')}</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>{t('admin.loginSubtitle') || 'Access the administrative dashboard'}</p>
        </div>

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={labelStyle}><Icon icon="lucide:mail" />{t('admin.email')}</label>
            <input type="email" value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} style={fieldStyle} required />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={labelStyle}><Icon icon="lucide:key-round" />{t('admin.password')}</label>
            <input type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} style={fieldStyle} required />
          </div>
          <button type="submit" style={{ padding: '18px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '18px', cursor: 'pointer', fontWeight: '900', fontSize: '1.2rem', marginTop: '8px', boxShadow: '0 10px 25px rgba(52, 152, 219, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
            <Icon icon="lucide:log-in" />
            {t('admin.accessBtn')}
          </button>
          <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Icon icon="lucide:arrow-left" />
            {t('admin.backToRegister') || 'Back to Register'}
          </button>
        </form>
      </div>
    </div>
  );
}
