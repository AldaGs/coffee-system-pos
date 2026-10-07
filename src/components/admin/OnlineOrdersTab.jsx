import { useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { toCents, fromCents } from '../../utils/moneyUtils';
import OrderTicket from '../OrderTicket';
import { DAY_ORDER, daysToBitmask, bitmaskToDays } from '../../api/menus';

// Online ordering settings. Stored at posSettings.onlineOrders so the
// public_place_order RPC can read it server-side (shop_settings.menu_data) and
// every device gets it through the normal posSettings sync.
// Shape: { enabled, paused, delivery: { enabled, feeCents }, schedule?: { days: bitmask (0 = every day), start: 'HH:MM', end: 'HH:MM' } }
const DEFAULTS = { enabled: false, paused: false, schedule: null, delivery: { enabled: false, feeCents: 0 }, ticket: { showIva: false } };
const DAY_ES = { mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue', fri: 'Vie', sat: 'Sáb', sun: 'Dom' };

function OnlineOrdersTab({ menuData, saveSettingsToCloud, showAlert }) {
  const { t, lang } = useTranslation();
  const saved = { ...DEFAULTS, ...(menuData?.posSettings?.onlineOrders || {}) };
  const [form, setForm] = useState(saved);
  const delivery = form.delivery || DEFAULTS.delivery;
  const setDelivery = (patch) => setForm({ ...form, delivery: { ...delivery, ...patch } });
  const showIva = !!form.ticket?.showIva;
  // Preview with real menu items: one IVA 16%, one tasa 0, then whatever else; samples if the menu is empty.
  const all = Object.values(menuData?.categories || {}).flat().filter((i) => i?.basePrice > 0);
  const picks = [all.find((i) => i.ivaTreatment === 'iva16'), all.find((i) => i.ivaTreatment !== 'iva16'), ...all]
    .filter((i, n, a) => i && a.indexOf(i) === n).slice(0, 3);
  const sample = picks.length ? picks : [
    { name: 'Americano', basePrice: 4500, ivaTreatment: 'iva16' }, { name: 'Croissant', basePrice: 3500, ivaTreatment: 'tasa0' }];
  const lines = sample.map((i) => ({ qty: 1, name: i.name, modifiers: [], line_cents: i.basePrice, iva: i.ivaTreatment || 'tasa0' }));
  const fee = delivery.enabled ? delivery.feeCents || 0 : 0;
  const sched = form.schedule || { days: 0, start: '', end: '' };
  const days = bitmaskToDays(sched.days);

  const setSched = (patch) => {
    const next = { ...sched, ...patch };
    // No days + no times = no restriction; drop it so the RPC skips the check.
    setForm({ ...form, schedule: (next.days || next.start || next.end) ? next : null });
  };

  const save = async () => {
    await saveSettingsToCloud({
      ...menuData,
      posSettings: { ...menuData.posSettings, onlineOrders: form }
    });
    showAlert(t('common.success'), t('oo.saved'));
  };

  const row = { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderTop: '1px solid var(--border)' };
  const input = { padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' };

  return (
    <div className="admin-section fade-in">
      <div className="admin-section-header" style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, color: 'var(--text-main)', fontSize: '2rem', fontWeight: 800 }}>{t('oo.title')}</h1>
        <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: '1.1rem' }}>{t('oo.subtitle')}</p>
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '8px 20px 20px' }}>
        <label style={{ ...row, borderTop: 'none', cursor: 'pointer' }}>
          <input type="checkbox" checked={!!form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} />
          <span><strong>{t('oo.enabled')}</strong><br /><small style={{ color: 'var(--text-muted)' }}>{t('oo.enabledDesc')}</small></span>
        </label>
        <label style={{ ...row, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!form.paused} onChange={e => setForm({ ...form, paused: e.target.checked })} />
          <span><strong>{t('oo.paused')}</strong><br /><small style={{ color: 'var(--text-muted)' }}>{t('oo.pausedDesc')}</small></span>
        </label>

        <label style={{ ...row, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!delivery.enabled} onChange={e => setDelivery({ enabled: e.target.checked })} />
          <span><strong>{t('oo.deliveryOn')}</strong><br /><small style={{ color: 'var(--text-muted)' }}>{t('oo.deliveryDesc')}</small></span>
        </label>
        {delivery.enabled && (
          <label style={{ ...row, borderTop: 'none', paddingTop: 0 }}>
            <span>{t('oo.deliveryFee')}</span>
            <input type="number" min="0" step="0.5" style={{ ...input, width: 110 }}
              value={fromCents(delivery.feeCents)} onChange={e => setDelivery({ feeCents: Math.max(0, toCents(e.target.value)) })} />
          </label>
        )}

        <div style={{ ...row, flexDirection: 'column', alignItems: 'stretch' }}>
          <strong>{t('oo.schedule')}</strong>
          <small style={{ color: 'var(--text-muted)' }}>{t('oo.scheduleDesc')}</small>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DAY_ORDER.map(d => {
              const on = days.includes(d);
              return (
                <button key={d} type="button"
                  onClick={() => setSched({ days: daysToBitmask(on ? days.filter(x => x !== d) : [...days, d]) })}
                  style={{ padding: '8px 14px', borderRadius: 999, border: '1px solid var(--border)', cursor: 'pointer', fontWeight: 800,
                    background: on ? 'var(--brand-color)' : 'var(--bg-main)', color: on ? 'white' : 'var(--text-main)' }}
                >{DAY_ES[d]}</button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="time" value={sched.start} onChange={e => setSched({ start: e.target.value })} style={input} />
            <span>–</span>
            <input type="time" value={sched.end} onChange={e => setSched({ end: e.target.value })} style={input} />
          </div>
        </div>

        <div style={{ ...row, flexDirection: 'column', alignItems: 'stretch' }}>
          <strong>{t('oo.ticket')}</strong>
          <small style={{ color: 'var(--text-muted)' }}>{t('oo.ticketDesc')}</small>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={showIva} onChange={e => setForm({ ...form, ticket: { ...form.ticket, showIva: e.target.checked } })} />
            <span>{t('oo.ticketShowIva')}</span>
          </label>
          <OrderTicket style={{ maxWidth: 360 }} items={lines} deliveryFeeCents={fee}
            totalCents={lines.reduce((a, l) => a + l.line_cents, 0) + fee}
            showIva={showIva} taxRate={menuData?.receiptSettings?.taxRate || 16} lang={lang} />
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('oo.linkHint')}</p>
        <button type="button" onClick={save}
          style={{ padding: '12px 22px', border: 'none', borderRadius: 12, background: 'var(--brand-color)', color: 'white', fontWeight: 800, cursor: 'pointer' }}>
          {t('common.save')}
        </button>
      </div>
    </div>
  );
}

export default OnlineOrdersTab;
