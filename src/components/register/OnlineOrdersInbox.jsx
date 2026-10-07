import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@iconify/react';
import { supabase } from '../../supabaseClient';
import { createRealtimeChannel } from '../../utils/realtime';
import { useTranslation } from '../../hooks/useTranslation';
import { formatForDisplay } from '../../utils/moneyUtils';
import { menuBaseUrl } from '../../utils/customDomainSync';
import {
  ONLINE_STATUS_RANK, acceptOnlineOrder, rejectOnlineOrder, sendOrderToLogistics, setOnlineOrderStatus
} from '../../services/onlineOrders';

const LIVE = ['requested', 'accepted', 'preparing', 'ready'];

// Tracking link the customer can reopen if they lost the page (same shape PublicOrder redirects to).
const trackUrl = (token) => {
  let ref = '';
  try { ref = new URL(localStorage.getItem('tinypos_supabase_url') || '').hostname.split('.')[0]; } catch { /* no cloud url */ }
  return `${menuBaseUrl()}/order/track/${token}${ref ? `?p=${ref}` : ''}`;
};
// ponytail: assumes 10-digit numbers are Mexican (+52); others are sent as typed.
const waPhone = (phone) => { const d = String(phone || '').replace(/\D/g, ''); return d.length === 10 ? `52${d}` : d; };

// Short two-tone beep; WebAudio so there is no asset to ship. Browsers may
// block it until the first user gesture, which is fine (the badge still shows).
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1175].forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      g.gain.value = 0.15; o.start(ctx.currentTime + i * 0.18); o.stop(ctx.currentTime + i * 0.18 + 0.15);
    });
    setTimeout(() => ctx.close(), 800);
  } catch { /* audio unavailable */ }
}

// Floating inbox for online orders: badge + sound for new ones, accept/reject,
// and the preparing/ready steps (manual, or driven by the KDS).
export default function OnlineOrdersInbox({
  tickets, activeCashier, myDeviceId, menuData, activeTicketId, nextOrderNum, setNextOrderNum, kdsEnabled, handleSendToKds,
  setActiveTicketId, showAlert, showPrompt, showToast
}) {
  const { t } = useTranslation();
  const [orders, setOrders] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const ordersRef = useRef([]);
  useEffect(() => { ordersRef.current = orders; }, [orders]);

  const refetch = useCallback(async () => {
    const { data } = await supabase.from('online_orders').select('*').in('status', LIVE).order('created_at');
    if (data) setOrders(data);
  }, []);

  useEffect(() => {
    refetch();
    const orderCh = createRealtimeChannel(
      'register-online-orders',
      { event: '*', schema: 'public', table: 'online_orders' },
      (payload) => {
        const row = payload.new;
        if (payload.eventType === 'DELETE') {
          setOrders((p) => p.filter((o) => o.id !== payload.old?.id));
          return;
        }
        if (!row?.id) return;
        if (payload.eventType === 'INSERT' && row.status === 'requested') beep();
        setOrders((p) => {
          const rest = p.filter((o) => o.id !== row.id);
          return LIVE.includes(row.status) ? [...rest, row].sort((a, b) => a.created_at.localeCompare(b.created_at)) : rest;
        });
      },
      { poll: refetch }
    );
    // KDS drives preparing/ready for accepted orders whose ticket was sent to the kitchen.
    // ponytail: assumes tinykds writes 'ready' and one of preparing/in_progress/cooking; manual buttons cover any other value.
    const kdsCh = createRealtimeChannel(
      'register-online-orders-kds',
      { event: 'UPDATE', schema: 'public', table: 'order_fulfillment' },
      (payload) => {
        const row = payload.new;
        const order = ordersRef.current.find((o) => o.active_ticket_id != null && o.active_ticket_id === row?.active_ticket_id);
        if (!order) return;
        const next = row.status === 'ready' ? 'ready'
          : ['preparing', 'in_progress', 'cooking'].includes(row.status) ? 'preparing' : null;
        if (next && ONLINE_STATUS_RANK[next] > ONLINE_STATUS_RANK[order.status]) setOnlineOrderStatus(order.id, next);
      }
    );
    return () => { orderCh.cleanup(); kdsCh.cleanup(); };
  }, [refetch]);

  const run = async (order, fn) => {
    setBusy(order.id);
    try { await fn(); } catch (err) { showAlert(t('common.error'), err.message || String(err)); }
    setBusy(null);
  };

  const accept = (o) => run(o, async () => {
    const id = await acceptOnlineOrder(o, { activeCashier, myDeviceId, menuData, orderNum: nextOrderNum, feeLabel: t('oo.deliveryFeeLine') });
    if (id == null) return showToast(t('oo.alreadyHandled'), 'warning');
    setNextOrderNum(nextOrderNum + 1);
    setActiveTicketId(id);
    setOpen(false);
  });
  const reject = (o) => showPrompt(t('oo.rejectTitle'), t('oo.rejectDesc'),
    (reason) => run(o, () => rejectOnlineOrder(o.id, (reason || '').trim())), '', t('oo.reject'), t('reg.btnCancel'));
  const toKitchen = (o) => run(o, async () => {
    const ticket = tickets.find((tk) => tk.id === o.active_ticket_id);
    if (ticket) await handleSendToKds(ticket);
    await setOnlineOrderStatus(o.id, 'preparing');
  });

  const toLogistics = (o) => run(o, async () => {
    const ticket = tickets.find((tk) => tk.id === o.active_ticket_id);
    // With the KDS on, go through its send path first so the row is created once.
    if (ticket && kdsEnabled && !ticket.kds_sent) await handleSendToKds(ticket, { silent: true });
    await sendOrderToLogistics(o, ticket);
    showToast(t('oo.sentLogistics'));
  });

  const pending = orders.filter((o) => o.status === 'requested').length;
  const btn = (bg) => ({ background: bg, color: 'white', border: 'none', borderRadius: 8, padding: '8px 12px', fontWeight: 700, cursor: 'pointer' });

  // Status/step buttons, shared by the inbox list and the open ticket's footer.
  const actions = (o) => (<>
                  {o.status === 'requested' && (<>
                    <button type="button" disabled={busy === o.id} onClick={() => accept(o)} style={btn('#27ae60')}>{t('oo.accept')}</button>
                    <button type="button" disabled={busy === o.id} onClick={() => reject(o)} style={btn('#e74c3c')}>{t('oo.reject')}</button>
                  </>)}
                  {o.status === 'accepted' && (<>
                    {kdsEnabled && <button type="button" disabled={busy === o.id} onClick={() => toKitchen(o)} style={btn('#8e44ad')}>{t('oo.sendKitchen')}</button>}
                    <button type="button" disabled={busy === o.id} onClick={() => run(o, () => setOnlineOrderStatus(o.id, 'preparing'))} style={btn('#2980b9')}>{t('oo.markPreparing')}</button>
                  </>)}
                  {(o.status === 'accepted' || o.status === 'preparing') && (
                    <button type="button" disabled={busy === o.id} onClick={() => run(o, () => setOnlineOrderStatus(o.id, 'ready'))} style={btn('#16a085')}>{t('oo.markReady')}</button>
                  )}
                  {o.order_type === 'delivery' && o.active_ticket_id != null && o.status !== 'requested' && (
                    <button type="button" disabled={busy === o.id} onClick={() => toLogistics(o)} style={btn('#d35400')}>{t('oo.sendLogistics')}</button>
                  )}
                  <a href={`https://wa.me/${waPhone(o.phone)}?text=${encodeURIComponent(`${t('oo.trackMsg')} ${trackUrl(o.token)}`)}`} target="_blank" rel="noopener noreferrer" style={{ ...btn('#25D366'), textDecoration: 'none' }}>{t('oo.sendTrackLink')}</a>
  </>);

  const current = activeTicketId != null && orders.find((o) => String(o.active_ticket_id) === String(activeTicketId));
  // The slot lives in TicketArea's footer; look it up after commit so a footer
  // mounted in this same render (ticket just opened) is found.
  const [slot, setSlot] = useState(null);
  useEffect(() => { setSlot(document.getElementById('online-order-slot')); }, [activeTicketId, current]);

  return (
    <>
      {current && slot && createPortal(
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 10, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('oo.inboxTitle')} · {t(`oo.st_${current.status}`)}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions(current)}</div>
        </div>, slot)}
      <button type="button" onClick={() => setOpen(true)} aria-label={t('oo.inboxTitle')}
        style={{ position: 'fixed', left: 16, bottom: 16, zIndex: 900, width: 52, height: 52, borderRadius: 999, border: 'none', cursor: 'pointer',
          background: pending ? '#e74c3c' : 'var(--brand-color)', color: 'white', fontSize: '1.4rem', boxShadow: '0 4px 14px rgba(0,0,0,0.3)' }}>
        <Icon icon="lucide:shopping-bag" />
        {orders.length > 0 && (
          <span style={{ position: 'absolute', top: -4, right: -4, background: '#111', color: 'white', borderRadius: 999, minWidth: 20, height: 20, fontSize: '0.75rem', fontWeight: 800, lineHeight: '20px' }}>{pending || orders.length}</span>
        )}
      </button>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-surface)', color: 'var(--text-main)', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '85dvh', overflowY: 'auto', padding: 20 }}>
            <h3 style={{ marginTop: 0 }}>{t('oo.inboxTitle')}</h3>
            {orders.length === 0 && <p style={{ color: 'var(--text-muted)' }}>{t('oo.noOrders')}</p>}
            {orders.map((o) => (
              <div key={o.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{o.customer_name} · {o.phone}</strong>
                  <span style={{ fontWeight: 700 }}>{t(`oo.st_${o.status}`)}</span>
                </div>
                {o.order_type === 'delivery' && (
                  <div style={{ fontWeight: 700 }}>{t('oo.delivery')}: {o.delivery_address}
                    {o.delivery_lat != null && <> · <a href={`https://www.google.com/maps?q=${o.delivery_lat},${o.delivery_lng}`} target="_blank" rel="noreferrer">{t('oo.map')}</a></>}
                  </div>
                )}
                {o.pickup_at && <div style={{ color: 'var(--text-muted)' }}>{t('oo.pickupAt')}: {new Date(o.pickup_at).toLocaleString()}</div>}
                {o.notes && <div style={{ color: 'var(--text-muted)' }}>{o.notes}</div>}
                <ul style={{ margin: '8px 0', paddingLeft: 18 }}>
                  {(o.items || []).map((l, i) => (
                    <li key={i}>{l.qty}x {l.name}{l.modifiers?.length ? ` (${l.modifiers.map((m) => m.name).join(', ')})` : ''}</li>
                  ))}
                </ul>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>{formatForDisplay(o.total_cents)}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {actions(o)}
                  {o.active_ticket_id != null && (
                    <button type="button" onClick={() => { setActiveTicketId(o.active_ticket_id); setOpen(false); }} style={btn('#7f8c8d')}>{t('oo.openTicket')}</button>
                  )}
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setOpen(false)} style={{ ...btn('#7f8c8d'), width: '100%' }}>{t('common.close')}</button>
          </div>
        </div>
      )}
    </>
  );
}
