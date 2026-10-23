import { useState } from 'react';
import { Icon } from '@iconify/react';
import { isUpgradePending } from '../../utils/appMode';
import { styles } from './setupStyles';

// Step 2 of a new install: the owner's login and the admin PIN.
export default function AdminStep({ p }) {
  const [showPin, setShowPin] = useState(false);
  return (
    <div style={styles.stepCard}>
      <div style={styles.stepHeader}>
        <div style={styles.stepBadge}>2</div>
        <label style={{ ...styles.label, marginBottom: 0 }}>Crea tu cuenta de Administrador</label>
      </div>
      <p style={styles.helperText}>Esta será tu llave maestra (RLS) para entrar al sistema.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={styles.inputWrap}>
          <Icon icon="lucide:mail" style={styles.inputIcon} />
          <input className="setup-input" type="email" placeholder="Correo electrónico" value={p.adminEmail} onChange={(e) => p.setAdminEmail(e.target.value)} required style={styles.input} />
        </div>
        <div style={styles.inputWrap}>
          <Icon icon="lucide:lock" style={styles.inputIcon} />
          <input className="setup-input" type="password" placeholder="Contraseña segura" value={p.adminPassword} onChange={(e) => p.setAdminPassword(e.target.value)} required style={styles.input} />
        </div>
        <div style={styles.inputWrap}>
          <Icon icon="lucide:shield" style={styles.inputIcon} />
          <input
            className="setup-input"
            type={showPin ? 'text' : 'password'}
            inputMode="numeric"
            autoComplete="off"
            placeholder="PIN de administrador (4-6 dígitos)"
            value={p.adminPin}
            onChange={(e) => p.setAdminPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            required
            style={{ ...styles.input, paddingRight: '44px' }}
          />
          <button
            type="button"
            onClick={() => setShowPin((v) => !v)}
            aria-label={showPin ? 'Ocultar PIN' : 'Mostrar PIN'}
            style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px', display: 'flex' }}
          >
            <Icon icon={showPin ? 'lucide:eye-off' : 'lucide:eye'} />
          </button>
        </div>
      </div>
      <p style={styles.helperText}>
        El PIN desbloquea la caja y el panel. {isUpgradePending() ? 'Se rellenó con tu PIN local para que conserves el mismo.' : ''}
      </p>
    </div>
  );
}
