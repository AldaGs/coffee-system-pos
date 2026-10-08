import { useState } from 'react';
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
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginTop: 24, display: 'grid', gap: 10 }}>
      <h2 style={{ margin: 0 }}>{t('legal.title')}</h2>
      <small style={{ color: 'var(--text-muted)' }}>{t('legal.note')}</small>
      <input style={input} placeholder={t('legal.businessName')} value={f.businessName} onChange={e => setF({ ...f, businessName: e.target.value })} />
      <input style={input} placeholder={t('legal.address')} value={f.address} onChange={e => setF({ ...f, address: e.target.value })} />
      <input style={input} placeholder={t('legal.contact')} value={f.contact} onChange={e => setF({ ...f, contact: e.target.value })} />
      {['privacy', 'terms'].map((k) => (
        <div key={k} style={{ display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>{t(`legal.${k}`)}</strong>
            <button type="button" onClick={() => fillTemplate(k)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', cursor: 'pointer', fontWeight: 700 }}>{t('legal.useTemplate')}</button>
          </div>
          <textarea rows={14} style={input} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} />
        </div>
      ))}
      <button type="button" onClick={save}
        style={{ padding: '12px 22px', border: 'none', borderRadius: 12, background: 'var(--brand-color)', color: 'white', fontWeight: 800, cursor: 'pointer', justifySelf: 'start' }}>
        {t('common.save')}
      </button>
    </div>
  );
}

export default LegalSection;
