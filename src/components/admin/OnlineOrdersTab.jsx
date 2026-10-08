import { useState } from 'react';
import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';
import { toCents, fromCents } from '../../utils/moneyUtils';
import OrderTicket from '../OrderTicket';
import LegalSection from './LegalSection';
import { DAY_ORDER, daysToBitmask, bitmaskToDays } from '../../api/menus';

// Online ordering settings. Stored at posSettings.onlineOrders so the
// public_place_order RPC can read it server-side (shop_settings.menu_data) and
// every device gets it through the normal posSettings sync.
// slots: { enabled (default false: any future time),  interval 15|30|60, daysAhead (<=14), leadMinutes, hours: {days,start,end}|null (null = same as schedule) }
// openHours: { always, rules: [{ days: bitmask (mon = bit 0, 0 = every day), start: 'HH:MM', end: 'HH:MM' }] } = when orders are accepted (any rule matches; overnight wraps).
// schedule?: { days, start, end } = delivery/pickup hours only (fallback for slots + ASAP); it no longer gates ordering.
// Shape: { enabled, paused, delivery: { enabled, feeCents }, openHours, schedule }
const DEFAULTS = { enabled: false, paused: false, openHours: { always: true, rules: [] }, schedule: null, delivery: { enabled: false, feeCents: 0 }, ticket: { showIva: false }, slots: { enabled: false, interval: 30, daysAhead: 3, leadMinutes: 30, hours: null }, trackShowcase: { mode: 'off', categories: [], items: [] }, payments: { methods: ['cash', 'card', 'transfer'], transferInfo: '' } };
const DAY_ES = { mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue', fri: 'Vie', sat: 'Sáb', sun: 'Dom' };

function OnlineOrdersTab({ menuData, saveSettingsToCloud, showAlert }) {
  const { t, lang } = useTranslation();
  const saved = { ...DEFAULTS, ...(menuData?.posSettings?.onlineOrders || {}) };
  const [form, setForm] = useState(saved);
  const delivery = form.delivery || DEFAULTS.delivery;
  const setDelivery = (patch) => setForm({ ...form, delivery: { ...delivery, ...patch } });
  const showIva = !!form.ticket?.showIva;
  const sc = { ...DEFAULTS.trackShowcase, ...(form.trackShowcase || {}) };
  const setSc = (patch) => setForm({ ...form, trackShowcase: { ...sc, ...patch } });
  const toggle = (key, v) => setSc({ [key]: sc[key].includes(v) ? sc[key].filter((x) => x !== v) : [...sc[key], v] });
  const catEntries = Object.entries(menuData?.categories || {});
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

  const oh = { ...DEFAULTS.openHours, ...(form.openHours || {}) };
  const setOh = (patch) => setForm({ ...form, openHours: { ...oh, ...patch } });
  const setRule = (i, patch) => setOh({ rules: oh.rules.map((x, n) => (n === i ? { ...x, ...patch } : x)) });
  const pay = { ...DEFAULTS.payments, ...(form.payments || {}) };
  const setPay = (patch) => setForm({ ...form, payments: { ...pay, ...patch } });
  const togglePay = (m) => setPay({ methods: pay.methods.includes(m) ? pay.methods.filter((x) => x !== m) : [...pay.methods, m] });

  const sl = { ...DEFAULTS.slots, ...(form.slots || {}) };
  const setSl = (patch) => setForm({ ...form, slots: { ...sl, ...patch } });
  const slHours = sl.hours || { days: 0, start: '', end: '' };
  const slDays = bitmaskToDays(slHours.days);
  const num = (k, max) => (e) => setSl({ [k]: Math.min(max, Math.max(0, parseInt(e.target.value, 10) || 0)) });

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

  const row = { display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' };
  const input = { padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' };

  return (
    <div className="admin-section fade-in">
      <div className="admin-section-header" style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, color: 'var(--text-main)', fontSize: '2rem', fontWeight: 800 }}>{t('oo.title')}</h1>
          <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: '1.1rem' }}>{t('oo.subtitle')}</p>
        </div>
        <button type="button" onClick={save}
          style={{ flexShrink: 0, padding: '14px 28px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: 16, cursor: 'pointer', fontWeight: 'bold', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 10px 20px rgba(0,0,0,0.1)' }}>
          <Icon icon="lucide:save" />{t('common.save')}
        </button>
      </div>

      <div className="admin-grid-responsive" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 32, alignItems: 'start' }}>
        <Card icon="lucide:power" title={t('oo.title')}>
        <label style={{ ...row, cursor: 'pointer' }}>
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
          <label style={{ ...row, paddingTop: 0 }}>
            <span>{t('oo.deliveryFee')}</span>
            <input type="number" min="0" step="0.5" style={{ ...input, width: 110 }}
              value={fromCents(delivery.feeCents)} onChange={e => setDelivery({ feeCents: Math.max(0, toCents(e.target.value)) })} />
          </label>
        )}

          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>{t('oo.linkHint')}</p>
        </Card>

        <Card icon="lucide:store" title={t('oo.storeHours')}>
          <small style={{ color: 'var(--text-muted)' }}>{t('oo.storeHoursDesc')}</small>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!oh.always}
              onChange={e => setOh({ always: e.target.checked, rules: !e.target.checked && !oh.rules.length ? [{ days: 0, start: '09:00', end: '21:00' }] : oh.rules })} />
            <span>{t('oo.alwaysOpen')}</span>
          </label>
          {!oh.always && oh.rules.map((rule, i) => {
            const rd = bitmaskToDays(rule.days);
            return (
              <div key={i} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '8px 0', borderTop: '1px dashed var(--border)' }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {DAY_ORDER.map(d => {
                    const on = rd.includes(d);
                    return (
                      <button key={d} type="button"
                        onClick={() => setRule(i, { days: daysToBitmask(on ? rd.filter(x => x !== d) : [...rd, d]) })}
                        style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid var(--border)', cursor: 'pointer', fontWeight: 800,
                          background: on ? 'var(--brand-color)' : 'var(--bg-main)', color: on ? 'white' : 'var(--text-main)' }}
                      >{DAY_ES[d]}</button>
                    );
                  })}
                </div>
                <input type="time" value={rule.start} onChange={e => setRule(i, { start: e.target.value })} style={input} />
                <span>–</span>
                <input type="time" value={rule.end} onChange={e => setRule(i, { end: e.target.value })} style={input} />
                <button type="button" onClick={() => setOh({ rules: oh.rules.filter((_, n) => n !== i) })}
                  style={{ ...input, cursor: 'pointer' }}>{t('oo.removeHours')}</button>
              </div>
            );
          })}
          {!oh.always && (
            <button type="button" onClick={() => setOh({ rules: [...oh.rules, { days: 0, start: '09:00', end: '21:00' }] })}
              style={{ ...input, cursor: 'pointer', fontWeight: 800, alignSelf: 'flex-start' }}>+ {t('oo.addHours')}</button>
          )}
        </Card>

        <Card icon="lucide:truck" title={t('oo.schedule')}>
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
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <strong>{t('oo.slots')}</strong>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!sl.enabled} onChange={e => setSl({ enabled: e.target.checked })} />
            <span>{t('oo.slotsEnable')}</span>
          </label>
          <small style={{ color: 'var(--text-muted)' }}>{sl.enabled ? t('oo.slotsDesc') : t('oo.slotsOffDesc')}</small>
          {sl.enabled && <small style={{ color: 'var(--text-muted)' }}>{t('oo.slotsIndep')}</small>}
          {sl.enabled && (<>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <label>{t('oo.slotInterval')} <select style={input} value={sl.interval} onChange={e => setSl({ interval: +e.target.value })}>
              {[15, 30, 60].map(n => <option key={n} value={n}>{n} min</option>)}</select></label>
            <label>{t('oo.slotDays')} <input type="number" min="0" max="14" style={{ ...input, width: 80 }} value={sl.daysAhead} onChange={num('daysAhead', 14)} /></label>
            <label>{t('oo.slotLead')} <input type="number" min="0" max="1440" style={{ ...input, width: 90 }} value={sl.leadMinutes} onChange={num('leadMinutes', 1440)} /></label>
          </div>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={!sl.hours} onChange={e => setSl({ hours: e.target.checked ? null : { days: 0, start: '', end: '' } })} />
            <span>{t('oo.slotSameHours')}</span>
          </label>
          {sl.hours && (<>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DAY_ORDER.map(d => {
                const on = slDays.includes(d);
                return (
                  <button key={d} type="button"
                    onClick={() => setSl({ hours: { ...slHours, days: daysToBitmask(on ? slDays.filter(x => x !== d) : [...slDays, d]) } })}
                    style={{ padding: '8px 14px', borderRadius: 999, border: '1px solid var(--border)', cursor: 'pointer', fontWeight: 800,
                      background: on ? 'var(--brand-color)' : 'var(--bg-main)', color: on ? 'white' : 'var(--text-main)' }}
                  >{DAY_ES[d]}</button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <input type="time" value={slHours.start} onChange={e => setSl({ hours: { ...slHours, start: e.target.value } })} style={input} />
              <span>–</span>
              <input type="time" value={slHours.end} onChange={e => setSl({ hours: { ...slHours, end: e.target.value } })} style={input} />
            </div>
          </>)}
          </>)}
          </div>
        </Card>

        <Card icon="lucide:wallet" title={t('oo.payments')}>
          <small style={{ color: 'var(--text-muted)' }}>{t('oo.paymentsDesc')}</small>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {['cash', 'card', 'transfer'].map((m) => (
              <label key={m} style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={pay.methods.includes(m)} disabled={pay.methods.length === 1 && pay.methods.includes(m)} onChange={() => togglePay(m)} />
                <span>{t(`check.${m}`)}</span>
              </label>
            ))}
          </div>
          {pay.methods.includes('transfer') && (
            <textarea rows={3} maxLength={400} style={input} placeholder={t('oo.transferInfoPh')} value={pay.transferInfo} onChange={e => setPay({ transferInfo: e.target.value })} />
          )}
        </Card>

        <Card icon="lucide:receipt" title={t('oo.ticket')}>
          <small style={{ color: 'var(--text-muted)' }}>{t('oo.ticketDesc')}</small>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={showIva} onChange={e => setForm({ ...form, ticket: { ...form.ticket, showIva: e.target.checked } })} />
            <span>{t('oo.ticketShowIva')}</span>
          </label>
          <OrderTicket style={{ maxWidth: 360 }} items={lines} deliveryFeeCents={fee}
            totalCents={lines.reduce((a, l) => a + l.line_cents, 0) + fee}
            showIva={showIva} taxRate={menuData?.receiptSettings?.taxRate || 16} lang={lang} />
        </Card>

        <Card icon="lucide:sparkles" title={t('oo.showcase')}>
          <small style={{ color: 'var(--text-muted)' }}>{t('oo.showcaseDesc')}</small>
          <select style={input} value={sc.mode} onChange={e => setSc({ mode: e.target.value })}>
            {['off', 'all', 'categories', 'items'].map(m => <option key={m} value={m}>{t(`oo.showcase_${m}`)}</option>)}
          </select>
          {(sc.mode === 'categories' || sc.mode === 'items') && (
            <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
              {sc.mode === 'categories'
                ? catEntries.map(([name]) => (
                  <label key={name} style={{ display: 'flex', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                    <input type="checkbox" checked={sc.categories.includes(name)} onChange={() => toggle('categories', name)} />{name}
                  </label>))
                : catEntries.map(([name, list]) => (
                  <div key={name}>
                    <div style={{ fontWeight: 800, margin: '6px 0 2px' }}>{name}</div>
                    {list.map((i) => (
                      <label key={i.id} style={{ display: 'flex', gap: 8, padding: '3px 0', cursor: 'pointer' }}>
                        <input type="checkbox" checked={sc.items.includes(i.id)} onChange={() => toggle('items', i.id)} />{i.name}
                      </label>))}
                  </div>))}
            </div>
          )}
        </Card>
      </div>

      <LegalSection menuData={menuData} saveSettingsToCloud={saveSettingsToCloud} showAlert={showAlert} />
    </div>
  );
}

// Same card look as General Settings.
function Card({ icon, title, children }) {
  return (
    <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h3 style={{ margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon icon={icon} style={{ color: 'var(--brand-color)' }} />{title}
      </h3>
      {children}
    </div>
  );
}

export default OnlineOrdersTab;
