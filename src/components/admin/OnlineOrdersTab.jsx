import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { supabase } from '../../supabaseClient';
import { Icon } from '@iconify/react';
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslation } from '../../hooks/useTranslation';
import { toCents, fromCents, formatForDisplay } from '../../utils/moneyUtils';
import { validDeliveryArea } from '../../utils/deliveryAreas';
import OrderTicket from '../OrderTicket';
import LegalSection from './LegalSection';
import MenuShareCard from './MenuShareCard';
import { DAY_ORDER, daysToBitmask, bitmaskToDays, loadMenus } from '../../api/menus';

const DeliveryAreaMap = lazy(() => import('./DeliveryAreaMap'));
const DeliveryCoverageOverview = lazy(() => import('./DeliveryCoverageOverview'));

// Online ordering settings. Stored at posSettings.onlineOrders so the
// public_place_order RPC can read it server-side (shop_settings.menu_data) and
// every device gets it through the normal posSettings sync.
// slots: { enabled (default false: any future time),  interval 15|30|60, daysAhead (<=14), leadMinutes, hours: {days,start,end}|null (null = same as schedule) }
// openHours: { always, rules: [{ days: bitmask (mon = bit 0, 0 = every day), start: 'HH:MM', end: 'HH:MM' }] } = when orders are accepted (any rule matches; overnight wraps).
// schedule?: { days, start, end } = delivery/pickup hours only (fallback for slots + ASAP); it no longer gates ordering.
// menuId: a Public Menus menu whose categories the order page shows (null = whichever menu is active now).
// Shape: { enabled, paused, delivery: { enabled, shippingEnabled, areas }, openHours, schedule }
const DEFAULTS = { enabled: false, paused: false, openHours: { always: true, rules: [] }, schedule: null, delivery: { enabled: false, shippingEnabled: false, areas: [] }, ticket: { showIva: false }, slots: { enabled: false, interval: 30, daysAhead: 3, leadMinutes: 30, hours: null }, trackShowcase: { mode: 'off', categories: [], items: [] }, payments: { methods: ['cash', 'card', 'transfer'], transferInfo: '' } };
const DAY_ES = { mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue', fri: 'Vie', sat: 'Sáb', sun: 'Dom' };

function OnlineOrdersTab({ menuData, saveSettingsToCloud, showAlert }) {
  const { t, lang } = useTranslation();
  const saved = { ...DEFAULTS, ...(menuData?.posSettings?.onlineOrders || {}) };
  const [form, setForm] = useState(saved);
  const persisted = useRef(saved);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(null);
  const [editingAreaId, setEditingAreaId] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [menus, setMenus] = useState([]);
  useEffect(() => { loadMenus().then(setMenus).catch(() => {}); }, []);
  // A cloud refresh can update settings while this tab holds local drafts.
  // Keep the persisted base current without replacing any in-progress form edits.
  useEffect(() => { persisted.current = { ...DEFAULTS, ...(menuData?.posSettings?.onlineOrders || {}) }; }, [menuData?.posSettings?.onlineOrders]);
  const delivery = { ...DEFAULTS.delivery, ...(form.delivery || {}) };
  const setDelivery = (patch) => setForm({ ...form, delivery: { ...delivery, ...patch } });
  const areas = delivery.areas || [];
  const setArea = (id, patch) => setDelivery({ areas: areas.map((a) => a.id === id ? { ...a, ...patch } : a) });
  const areaText = lang === 'en' ? {
    title: 'Local delivery areas', desc: 'Set a radius or draw a street boundary. Higher priority wins where areas overlap. A pin on the boundary is inside.', editorHelp: 'Save each zone to keep its changes.',
    add: 'Add area', openEditor: 'Open editor', closeEditor: 'Done', name: 'Area name', radius: 'Radius', polygon: 'Street boundary', km: 'Radius (km)', priority: 'Priority',
    charge: 'Delivery charge', remove: 'Delete zone', corner: 'Remove corner', save: 'Save zone', active: 'Enabled', inactive: 'Disabled', unsaved: 'Unsaved changes', new: 'New zone', shipping: 'Offer shipping outside all areas',
    shippingHelp: 'Outside addresses become requests with a pending shipping price. Staff must contact the customer and confirm the price before accepting the order.',
    legacy: 'The old flat delivery fee is not used. Add and enable an area to offer local delivery.', invalid: 'Complete each enabled area with a name, price, and valid map boundary.',
  } : {
    title: 'Zonas de entrega local', desc: 'Define un radio o dibuja el límite por calles. La prioridad más alta gana si las zonas se superponen. El borde está incluido.', editorHelp: 'Guarda cada zona para conservar sus cambios.',
    add: 'Agregar zona', openEditor: 'Abrir Editor', closeEditor: 'Listo', name: 'Nombre de zona', radius: 'Radio', polygon: 'Límite por calles', km: 'Radio (km)', priority: 'Prioridad',
    charge: 'Costo de entrega', remove: 'Eliminar zona', corner: 'Quitar esquina', save: 'Guardar zona', active: 'Activa', inactive: 'Inactiva', unsaved: 'Cambios sin guardar', new: 'Zona nueva', shipping: 'Ofrecer envío fuera de las zonas',
    shippingHelp: 'Las direcciones fuera de las zonas se reciben con el costo de envío pendiente. El personal debe contactar al cliente y confirmar el precio antes de aceptar el pedido.',
    legacy: 'La tarifa fija anterior ya no se usa. Agrega y activa una zona para ofrecer entrega local.', invalid: 'Completa cada zona activa con nombre, precio y un límite válido en el mapa.',
  };
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
  const fee = delivery.enabled ? areas.find((a) => a.enabled)?.feeCents || 0 : 0;
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

  const commitSettings = async (nextOnline, busyKey) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(busyKey);
    try {
      const result = await saveSettingsToCloud({
        ...menuData,
        posSettings: { ...menuData.posSettings, onlineOrders: nextOnline }
      });
      if (result === false) return false;
      persisted.current = nextOnline;
      showAlert(t('common.success'), t('oo.saved'));
      return true;
    } catch (error) {
      showAlert(t('common.error'), error.message || String(error));
      return false;
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const save = async () => {
    if (areas.some((a) => a.enabled && !validDeliveryArea(a))) {
      showAlert(t('common.error'), areaText.invalid);
      return;
    }
    await commitSettings(form, 'all');
  };

  const saveArea = async (area) => {
    if (!validDeliveryArea(area)) return showAlert(t('common.error'), areaText.invalid);
    const baseline = persisted.current;
    const baseDelivery = { ...DEFAULTS.delivery, ...(baseline.delivery || {}) };
    const baseAreas = baseDelivery.areas || [];
    const nextAreas = baseAreas.some((item) => item.id === area.id)
      ? baseAreas.map((item) => item.id === area.id ? area : item)
      : [...baseAreas, area];
    await commitSettings({ ...baseline, delivery: { ...baseDelivery, areas: nextAreas } }, `save:${area.id}`);
  };

  const deleteArea = async (id) => {
    const baseline = persisted.current;
    const baseDelivery = { ...DEFAULTS.delivery, ...(baseline.delivery || {}) };
    const baseAreas = baseDelivery.areas || [];
    if (baseAreas.some((item) => item.id === id)) {
      const nextOnline = { ...baseline, delivery: { ...baseDelivery, areas: baseAreas.filter((item) => item.id !== id) } };
      if (!await commitSettings(nextOnline, `delete:${id}`)) return;
    } else if (busyRef.current) return;
    setForm((previous) => ({ ...previous, delivery: { ...previous.delivery, areas: (previous.delivery?.areas || []).filter((item) => item.id !== id) } }));
    setEditingAreaId((current) => current === id ? null : current);
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
        <button type="button" onClick={save} disabled={!!busy}
          style={{ flexShrink: 0, padding: '14px 28px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: 16, cursor: 'pointer', fontWeight: 'bold', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 10px 20px rgba(0,0,0,0.1)' }}>
          <Icon icon="lucide:save" />{t('common.save')}
        </button>
      </div>

      {/* Masonry via CSS columns: cards stack per column, so a tall card (delivery hours)
          doesn't leave a row-height gap under its neighbours like a grid does. */}
      <div style={{ columns: '350px', columnGap: 32 }}>
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
        {delivery.enabled && !!delivery.feeCents && !areas.length && <small style={{ color: '#ad6500' }}>{areaText.legacy}</small>}

          <label style={{ display: 'grid', gap: 6 }}>
            <strong>{t('oo.menu')}</strong>
            <select style={input} value={form.menuId ?? ''} onChange={e => setForm({ ...form, menuId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">{t('oo.menuActive')}</option>
              {menus.filter((m) => m.is_active && (m.kind === 'live' || m.kind === 'designed')).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <small style={{ color: 'var(--text-muted)' }}>{t('oo.menuDesc')}</small>
          </label>
        </Card>

        <Card icon="lucide:map" title={areaText.title}>
          <small style={{ color: 'var(--text-muted)' }}>{areaText.desc}</small>
          <label style={{ ...row, cursor: 'pointer' }}>
            <input type="checkbox" disabled={!!busy} checked={!!delivery.shippingEnabled} onChange={(e) => setDelivery({ shippingEnabled: e.target.checked })} />
            <strong>{areaText.shipping}</strong>
          </label>
          <small style={{ color: 'var(--text-muted)' }}>{areaText.shippingHelp}</small>
          {areas.map((area) => <div key={area.id} style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <strong>{area.name || areaText.new}</strong>
            <span>{area.kind === 'radius' ? areaText.radius : areaText.polygon}</span>
            <span>{formatForDisplay(area.feeCents || 0, lang)}</span>
          </div>)}
          <Dialog.Root open={editorOpen} onOpenChange={setEditorOpen}>
            <Dialog.Trigger asChild><button type="button" style={{ ...input, cursor: 'pointer', fontWeight: 800, alignSelf: 'flex-start' }}>{areaText.openEditor}</button></Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay style={{ position: 'fixed', inset: 0, zIndex: 2200, background: 'rgba(0,0,0,0.65)' }} />
              <Dialog.Content style={{ position: 'fixed', inset: '3vh 3vw', maxWidth: 1100, margin: 'auto', zIndex: 2201, background: 'var(--bg-surface)', color: 'var(--text-main)', borderRadius: 16, boxShadow: '0 18px 50px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, padding: 16 }}>
                <div style={{ display: 'grid', gap: 8 }}>
                  <Dialog.Title style={{ margin: 0, fontSize: '1.1rem', lineHeight: 1.3 }}>{areaText.title}</Dialog.Title>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button type="button" disabled={!!busy} style={{ ...input, cursor: 'pointer', fontWeight: 800 }} onClick={() => { const id = crypto.randomUUID(); setDelivery({ areas: [...areas, { id, name: '', enabled: true, kind: 'radius', center: null, radiusKm: 3, points: [], feeCents: 0, priority: 0 }] }); setEditingAreaId(id); }}>+ {areaText.add}</button>
                    <Dialog.Close asChild><button type="button" style={{ ...input, cursor: 'pointer' }}>{areaText.closeEditor}</button></Dialog.Close>
                  </div>
                </div>
                <Dialog.Description style={{ color: 'var(--text-muted)', margin: '8px 0 16px' }}>{areaText.desc} {areaText.editorHelp}</Dialog.Description>
                <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, display: 'grid', alignContent: 'start', gap: 12, paddingRight: 4 }}>
                  <Suspense fallback={<small>…</small>}><DeliveryCoverageOverview areas={areas} lang={lang} /></Suspense>
                  {areas.map((area) => {
                    const open = editingAreaId === area.id;
                    const baselineArea = (persisted.current.delivery?.areas || []).find((item) => item.id === area.id);
                    const dirty = !baselineArea || JSON.stringify(baselineArea) !== JSON.stringify(area);
                    const detailsId = `delivery-area-${area.id}`;
                    return <div key={area.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, display: 'grid', gap: 10 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', minWidth: 0 }}>
                        <button type="button" aria-expanded={open} aria-controls={detailsId} disabled={!!busy}
                          onClick={() => setEditingAreaId((current) => current === area.id ? null : area.id)}
                          style={{ ...input, cursor: 'pointer', flex: 1, minWidth: 0, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Icon icon={open ? 'lucide:chevron-down' : 'lucide:chevron-right'} style={{ flexShrink: 0 }} />
                          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><strong>{area.name || areaText.new}</strong><br /><small>{area.kind === 'radius' ? areaText.radius : areaText.polygon} · {formatForDisplay(area.feeCents || 0, lang)} · {area.enabled ? areaText.active : areaText.inactive}{dirty ? ` · ${areaText.unsaved}` : ''}</small></span>
                        </button>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button type="button" aria-label={`${areaText.save}: ${area.name || areaText.new}`} title={areaText.save} disabled={!!busy} style={{ ...input, cursor: 'pointer', width: 42, minHeight: 42, display: 'grid', placeItems: 'center', padding: 0 }} onClick={() => saveArea(area)}><Icon icon="lucide:save" width="18" /></button>
                          <button type="button" aria-label={`${areaText.remove}: ${area.name || areaText.new}`} title={areaText.remove} disabled={!!busy} style={{ ...input, cursor: 'pointer', width: 42, minHeight: 42, display: 'grid', placeItems: 'center', padding: 0, color: '#c0392b' }} onClick={() => deleteArea(area.id)}><Icon icon="lucide:trash-2" width="18" /></button>
                        </div>
                      </div>
                      <div id={detailsId} hidden={!open}>
                        {open && <fieldset disabled={!!busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'grid', gap: 10 }}>
                          <label style={{ ...row, cursor: 'pointer' }}><input type="checkbox" aria-label={`${area.name || areaText.name}: ${lang === 'en' ? 'enabled' : 'activa'}`} checked={!!area.enabled} onChange={(e) => setArea(area.id, { enabled: e.target.checked })} />
                            <input aria-label={areaText.name} style={{ ...input, flex: 1, minWidth: 100 }} placeholder={areaText.name} maxLength={80} value={area.name} onChange={(e) => setArea(area.id, { name: e.target.value })} /></label>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <select aria-label={`${area.name || areaText.name}: ${areaText.radius} / ${areaText.polygon}`} style={input} value={area.kind} onChange={(e) => setArea(area.id, { kind: e.target.value })}>
                              <option value="radius">{areaText.radius}</option><option value="polygon">{areaText.polygon}</option>
                            </select>
                            <label>{areaText.charge} <input style={{ ...input, width: 90 }} type="number" min="0" step="0.5" value={fromCents(area.feeCents)} onChange={(e) => setArea(area.id, { feeCents: Math.max(0, toCents(e.target.value)) })} /></label>
                            <label>{areaText.priority} <input style={{ ...input, width: 65 }} type="number" step="1" value={area.priority || 0} onChange={(e) => setArea(area.id, { priority: parseInt(e.target.value, 10) || 0 })} /></label>
                            {area.kind === 'radius' && <label>{areaText.km} <input style={{ ...input, width: 75 }} type="number" min="0.01" step="0.1" value={area.radiusKm || ''} onChange={(e) => setArea(area.id, { radiusKm: Number(e.target.value) })} /></label>}
                          </div>
                          {!busy && <Suspense fallback={<small>…</small>}><DeliveryAreaMap area={area} lang={lang} onChange={(next) => { if (!busyRef.current) setArea(area.id, next); }} /></Suspense>}
                          {area.kind === 'polygon' && (area.points || []).length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {area.points.map((_, i) => <button key={i} type="button" aria-label={`${areaText.corner} ${i + 1}`} style={{ ...input, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setArea(area.id, { points: area.points.filter((__, n) => n !== i) })}><Icon icon="lucide:x" aria-hidden="true" style={{ color: '#c0392b' }} />{lang === 'en' ? 'Corner' : 'Esquina'} {i + 1}</button>)}
                          </div>}
                        </fieldset>}
                      </div>
                    </div>;
                  })}
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
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
            <div style={{ display: 'grid', gap: 8 }}>
              {/* Shown to the customer as three boxes with copy buttons. */}
              {['bank', 'clabe', 'holder'].map((k) => (
                <input key={k} style={input} maxLength={k === 'clabe' ? 40 : 80} inputMode={k === 'clabe' ? 'numeric' : undefined}
                  placeholder={t(`oo.transfer_${k}`)} value={pay.transfer?.[k] || ''}
                  onChange={e => setPay({ transfer: { ...pay.transfer, [k]: e.target.value } })} />
              ))}
              {pay.transferInfo && !pay.transfer && <small style={{ color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{t('oo.transferLegacy')}: {pay.transferInfo}</small>}
            </div>
          )}
        </Card>

        <ClipCard input={input} showAlert={showAlert} />

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

      {menuData?.posSettings?.onlineOrders?.enabled && <MenuShareCard menuData={menuData} kind="order" />}
      <LegalSection menuData={menuData} saveSettingsToCloud={saveSettingsToCloud} showAlert={showAlert} />
    </div>
  );
}

// Per-business Clip credentials. Write-only: the secret never comes back to the
// browser; clip_status() only says whether one is stored and whether it's on.
// Saves on its own button (not the page-level Save) via set_clip_credentials().
function ClipCard({ input, showAlert }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState(null);
  const [key, setKey] = useState('');
  const [secret, setSecret] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const load = () => supabase.rpc('clip_status').then(({ data }) => { if (data) { setStatus(data); setEnabled(!!data.enabled); } });
  useEffect(() => { load(); }, []);
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc('set_clip_credentials', { p_key: key, p_secret: secret, p_enabled: enabled });
    setSaving(false);
    if (error) return showAlert(t('common.error'), error.message);
    setKey(''); setSecret(''); load();
    showAlert(t('common.success'), t('oo.clipSaved'));
  };
  return (
    <Card icon="lucide:credit-card" title={t('oo.clip')}>
      <small style={{ color: 'var(--text-muted)' }}>{t('oo.clipHint')}</small>
      {status?.configured && <strong style={{ color: 'var(--brand-color)' }}>{t('oo.clipConfigured')} ✓</strong>}
      <input style={input} autoComplete="off" placeholder={t('oo.clipKey')} value={key} onChange={e => setKey(e.target.value)} />
      <input style={input} type="password" autoComplete="new-password" placeholder={t('oo.clipSecret')} value={secret} onChange={e => setSecret(e.target.value)} />
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
        <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
        <span>{t('oo.clipEnabled')}</span>
      </label>
      <button type="button" onClick={save} disabled={saving} style={{ ...input, cursor: 'pointer', fontWeight: 800, alignSelf: 'flex-start' }}>{t('common.save')}</button>
    </Card>
  );
}

// Same card look as General Settings.
function Card({ icon, title, children }) {
  return (
    <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12, breakInside: 'avoid', marginBottom: 32 }}>
      <h3 style={{ margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon icon={icon} style={{ color: 'var(--brand-color)' }} />{title}
      </h3>
      {children}
    </div>
  );
}

export default OnlineOrdersTab;
