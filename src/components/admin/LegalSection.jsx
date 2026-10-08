import { useState } from 'react';
import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';
import { legalTemplate } from '../../utils/legalTemplates';

// Editable privacy notice + terms, stored at posSettings.legal and exposed
// publicly (only these fields) through the get_legal() RPC.
function LegalSection({ menuData, saveSettingsToCloud, showAlert }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ businessName: '', address: '', contact: '', privacy: '', terms: '', ...(menuData?.posSettings?.legal || {}) });
  const input = { padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', width: '100%', boxSizing: 'border-box' };
  const fillTemplate = (k) => {
    if (f[k].trim() && !window.confirm(t('legal.overwrite'))) return;
    setF({ ...f, [k]: legalTemplate(k, f) });
  };
  const save = async () => {
    await saveSettingsToCloud({ ...menuData, posSettings: { ...menuData.posSettings, legal: f } });
    showAlert(t('common.success'), t('oo.saved'));
  };
  return (
    <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', marginTop: 32, display: 'grid', gap: 12 }}>
      <h3 style={{ margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon icon="lucide:scale" style={{ color: 'var(--brand-color)' }} />{t('legal.title')}
      </h3>
      <small style={{ color: 'var(--text-muted)' }}>{t('legal.note')}</small>
      <input style={input} placeholder={t('legal.businessName')} value={f.businessName} onChange={e => setF({ ...f, businessName: e.target.value })} />
      <input style={input} placeholder={t('legal.address')} value={f.address} onChange={e => setF({ ...f, address: e.target.value })} />
      <input style={input} placeholder={t('legal.contact')} value={f.contact} onChange={e => setF({ ...f, contact: e.target.value })} />
      {['privacy', 'terms'].map((k) => (
        // Long texts: collapsed by default so the card stays scannable.
        <details key={k} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon icon="lucide:chevron-right" />{t(`legal.${k}`)}
            <small style={{ marginLeft: 'auto', fontWeight: 600, color: f[k]?.trim() ? '#27ae60' : 'var(--text-muted)' }}>{f[k]?.trim() ? '✓' : '—'}</small>
          </summary>
          <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '10px 0 6px' }}>
            <button type="button" onClick={() => fillTemplate(k)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', cursor: 'pointer', fontWeight: 700 }}>{t('legal.useTemplate')}</button>
          </div>
          <textarea rows={14} style={{ ...input, width: '100%', boxSizing: 'border-box' }} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} />
        </details>
      ))}
      <button type="button" onClick={save}
        style={{ padding: '12px 22px', border: 'none', borderRadius: 12, background: 'var(--brand-color)', color: 'white', fontWeight: 800, cursor: 'pointer', justifySelf: 'start' }}>
        {t('common.save')}
      </button>
    </div>
  );
}

export default LegalSection;
