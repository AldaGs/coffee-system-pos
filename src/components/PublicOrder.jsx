// Customer-facing online ordering (pickup or delivery, pay on receipt). No accounts.
//
//   /order?p=REF                  menu + cart + checkout
//   /order/track/<token>?p=REF    live status of one order
//
// Talks to Supabase only through the anon key and two RPCs: get_active_menu
// (menu), public_place_order (submit; server reprices) and get_order_status
// (token lookup). Customer details and past orders live in this browser's
// localStorage only. Connection bootstrap mirrors PublicMenu (?p= ref,
// custom domain, legacy ?u=&k=).

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Icon } from '@iconify/react';
import { formatForDisplay } from '../utils/moneyUtils';
import OrderTicket from './OrderTicket';
import { slotRules, timesFor, toLocalInput, fromLocalInput, firstSlot, asapOk } from '../utils/pickupSlots';

// MapLibre + its CSS only download when a customer picks delivery.
// The pin is optional: if the map chunk fails to load (bad network, stale deploy) checkout still works.
const PinMap = lazy(() => import('./PinMap').catch(() => ({ default: () => null })));

const CUSTOMER_KEY = 'tinypos_order_customer';
const HISTORY_KEY = 'tinypos_order_history';
// In-progress order (cart + checkout form), so a reload doesn't lose it. Cleared on submit.
const DRAFT_KEY = 'tinypos_order_draft';
const MAX_HISTORY = 10;

// Same whitelist the public menu applies: menu.data.category_names (empty = all).
const visibleCategories = (d) => {
  const names = d?.menu?.data?.category_names;
  return (d?.categories || []).filter((c) => !names?.length || names.includes(c.name));
};

const readJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const writeJson = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
};
const removeKey = (key) => { try { localStorage.removeItem(key); } catch { /* ignore */ } };

const PAY_METHODS = ['cash', 'card', 'transfer'];
const PAY_ICON = { cash: 'lucide:banknote', card: 'lucide:credit-card', transfer: 'lucide:landmark' };

const STR = {
  es: {
    loading: 'Cargando…', notOpen: 'No estamos aceptando pedidos en este momento.',
    paused: 'Los pedidos en línea están en pausa. Intenta de nuevo en un rato.',
    closed: 'Fuera del horario de pedidos.', badLink: 'Enlace inválido. Pide al negocio un enlace actualizado.',
    noMenu: 'El menú no está disponible para pedidos.', soldOut: 'Agotado', add: 'Agregar',
    options: 'Opciones', choose: 'Elige tus opciones', addToCart: 'Agregar al pedido', cancel: 'Cancelar',
    cart: 'Tu pedido', empty: 'Aún no agregas nada.', total: 'Total', checkout: 'Hacer pedido',
    name: 'Nombre', phone: 'Teléfono', notes: 'Notas (opcional)', pickupAt: 'Fecha y hora de recolección', deliveryAt: 'Fecha y hora de entrega', chooseSlot: 'Escoge Fecha y Hora', asap: 'Lo antes posible', slotRule: 'Elige un horario disponible: {days} de {start} a {end}, cada {n} min', slotPast: 'Elige una fecha y hora futuras.', everyDay: 'todos los días', clearSlot: 'Quitar horario', step_cart: 'Tu pedido', step_location: 'Ubicación de entrega', step_time: 'Fecha y hora', step_pay: 'Tus datos y pago', stepOf: 'Paso {n} de {m}', next: 'Siguiente', back: 'Atrás', chooseTime: 'Elige la hora', noTimes: 'No hay horarios disponibles ese día.',
    payAtPickup: 'Pagas al recoger.', send: 'Enviar pedido', sending: 'Enviando…',
    repeat: 'Repetir último pedido', forget: 'Olvidar mis datos', forgot: 'Datos borrados de este dispositivo.',
    pastOrders: 'Mis pedidos', view: 'Ver',
    invalid_name: 'Escribe tu nombre.', invalid_phone: 'Escribe un teléfono válido.', invalid_pickup: 'Ese horario ya no está disponible, elige otro.',
    invalid_items: 'Revisa tu pedido.', item_unavailable: 'Algún producto ya no está disponible. Actualiza el menú.',
    rate_limited: 'Demasiados intentos. Espera unos minutos.', generic: 'No se pudo enviar el pedido.',
    track: 'Seguimiento de tu pedido', notFound: 'Pedido no encontrado.', backToMenu: 'Volver al menú',
    rejectedWhy: 'Motivo', st_requested: 'Pedido enviado', st_accepted: 'Aceptado', st_preparing: 'Preparando',
    st_ready: 'Listo para recoger', st_completed: 'Entregado', st_delivered: 'Entregado', st_rejected: 'Rechazado',
    waiting: 'Esperando confirmación del negocio…', updating: 'Actualizando…',
    typePickup: 'Recoger', pinUseMine: 'Usar mi ubicación', pinSearch: 'Buscar dirección en el mapa', pinClear: 'Quitar pin', pinHint: 'Opcional: toca el mapa o arrastra el pin a tu puerta.', pinNoGeo: 'No pudimos obtener tu ubicación.', pinNeedAddr: 'Escribe tu dirección primero.', pinNotFound: 'No encontramos esa dirección.', mightLike: 'También te puede gustar', pinNeedHttps: 'La ubicación requiere HTTPS: escribe la dirección o mueve el pin.', pinDenied: 'Permiso de ubicación denegado: escribe la dirección o mueve el pin.', pinStreet: 'Calle encontrada: arrastra el pin a tu puerta exacta.', typeDelivery: 'Envío a domicilio', address: 'Dirección de entrega', deliveryFee: 'Envío',
    payOnDelivery: 'Pagas al recibir.', payLabel: 'Forma de pago', pay_cash: 'Efectivo', pay_card: 'Tarjeta', pay_transfer: 'Transferencia', invalid_payment: 'Elige una forma de pago.',
    cashPay: '¿Con cuánto pagas? (opcional)', cashExact: 'Exacto', cashPaysWith: 'Paga con', cashChange: 'Cambio', invalid_cash: 'Escribe un monto igual o mayor al total (máximo $1,000 más).',
    noMoreSlots: 'Ya no hay entregas hoy: programado para {when}', noMoreSlotsPickup: 'Ya no hay recolecciones hoy: programado para {when}', pickup_required: 'Elige una fecha y hora de entrega o recolección.',
    payNote: { cash: ['Pagas en efectivo al recoger.', 'Pagas en efectivo al recibir.'], card: ['Pagas con tarjeta en terminal al recoger.', 'Pagas con tarjeta al recibir (el repartidor lleva terminal).'], transfer: ['Transfiere con estos datos y muestra tu comprobante al recoger.', 'Transfiere con estos datos y muestra tu comprobante al recibir.'] },
    orderNo: 'Pedido', st_on_delivery: 'En camino', st_ready_delivery: 'Listo, esperando repartidor',
    invalid_address: 'Escribe tu dirección de entrega.', delivery_disabled: 'El envío a domicilio no está disponible.', invalid_type: 'Revisa tu pedido.',
  },
  en: {
    loading: 'Loading…', notOpen: 'We are not accepting orders right now.',
    paused: 'Online orders are paused. Please try again in a bit.',
    closed: 'Outside ordering hours.', badLink: 'Invalid link. Ask the shop for an updated link.',
    noMenu: 'The menu is not available for ordering.', soldOut: 'Sold out', add: 'Add',
    options: 'Options', choose: 'Choose your options', addToCart: 'Add to order', cancel: 'Cancel',
    cart: 'Your order', empty: 'Nothing added yet.', total: 'Total', checkout: 'Place order',
    name: 'Name', phone: 'Phone', notes: 'Notes (optional)', pickupAt: 'Pickup date & time', deliveryAt: 'Delivery date & time', chooseSlot: 'Choose date & time', asap: 'As soon as possible', slotRule: 'Pick an available time: {days}, {start} to {end}, every {n} min', slotPast: 'Pick a future date and time.', everyDay: 'every day', clearSlot: 'Clear time', step_cart: 'Your order', step_location: 'Delivery location', step_time: 'Date & time', step_pay: 'Your details & payment', stepOf: 'Step {n} of {m}', next: 'Next', back: 'Back', chooseTime: 'Choose a time', noTimes: 'No times available that day.',
    payAtPickup: 'You pay at pickup.', send: 'Send order', sending: 'Sending…',
    repeat: 'Repeat last order', forget: 'Forget my data', forgot: 'Data erased from this device.',
    pastOrders: 'My orders', view: 'View',
    invalid_name: 'Enter your name.', invalid_phone: 'Enter a valid phone number.', invalid_pickup: 'That time is no longer available, please pick another.',
    invalid_items: 'Please review your order.', item_unavailable: 'An item is no longer available. Refresh the menu.',
    rate_limited: 'Too many attempts. Wait a few minutes.', generic: 'Could not send the order.',
    track: 'Track your order', notFound: 'Order not found.', backToMenu: 'Back to menu',
    rejectedWhy: 'Reason', st_requested: 'Order sent', st_accepted: 'Accepted', st_preparing: 'Preparing',
    st_ready: 'Ready for pickup', st_completed: 'Picked up', st_delivered: 'Delivered', st_rejected: 'Rejected',
    waiting: 'Waiting for the shop to confirm…', updating: 'Updating…',
    typePickup: 'Pickup', pinUseMine: 'Use my location', pinSearch: 'Search address on map', pinClear: 'Remove pin', pinHint: 'Optional: tap the map or drag the pin to your door.', pinNoGeo: 'Could not get your location.', pinNeedAddr: 'Enter your address first.', pinNotFound: 'Address not found.', mightLike: 'You might also like', pinNeedHttps: 'Location needs HTTPS: type the address or move the pin.', pinDenied: 'Location permission denied: type the address or move the pin.', pinStreet: 'Street found: drag the pin to your exact door.', typeDelivery: 'Delivery', address: 'Delivery address', deliveryFee: 'Delivery',
    payOnDelivery: 'You pay on delivery.', payLabel: 'Payment method', pay_cash: 'Cash', pay_card: 'Card', pay_transfer: 'Bank transfer', invalid_payment: 'Choose a payment method.',
    cashPay: 'How much will you pay with? (optional)', cashExact: 'Exact', cashPaysWith: 'Paying with', cashChange: 'Change', invalid_cash: 'Enter an amount equal to or above the total (at most $1,000 more).',
    noMoreSlots: 'No more deliveries today: scheduled for {when}', noMoreSlotsPickup: 'No more pickups today: scheduled for {when}', pickup_required: 'Choose a delivery or pickup date and time.',
    payNote: { cash: ['You pay in cash at pickup.', 'You pay in cash on delivery.'], card: ['You pay by card at the terminal on pickup.', 'You pay by card on delivery (the driver brings a terminal).'], transfer: ['Transfer using these details and show your receipt at pickup.', 'Transfer using these details and show your receipt on delivery.'] },
    orderNo: 'Order', st_on_delivery: 'On the way', st_ready_delivery: 'Ready, waiting for the driver',
    invalid_address: 'Enter your delivery address.', delivery_disabled: 'Delivery is not available.', invalid_type: 'Please review your order.',
  },
};

// Resolve an anon Supabase client from the page URL (same schemes as /menu).
async function connect() {
  const params = new URLSearchParams(window.location.search);
  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  let ref = params.get('p');
  if (!ref) {
    const host = window.location.hostname;
    const custom = host && !host.includes('localhost') && !host.includes('127.0.0.1')
      && !host.endsWith('.vercel.app') && host !== 'tinypos.app' && host !== 'www.tinypos.app';
    if (custom) {
      const r = await (await fetch(`/api/resolve-domain?domain=${host}`)).json();
      ref = r.projectRef;
    }
  }
  if (ref) {
    const url = `https://${ref}.supabase.co`;
    const res = await fetch(`${url}/storage/v1/object/public/menu/config.json`);
    if (!res.ok) throw new Error('config');
    const { k } = await res.json();
    if (!k) throw new Error('config');
    return createClient(url, k, opts);
  }
  const dec = (v) => { try { return atob(v.replace(/-/g, '+').replace(/_/g, '/')); } catch { return ''; } };
  const u = dec(params.get('u') || ''); const k = dec(params.get('k') || '');
  if (!u || !k) throw new Error('config');
  return createClient(u, k, opts);
}

function useClient() {
  const [state, setState] = useState({ client: null, error: null });
  useEffect(() => {
    let cancelled = false;
    connect().then(
      (client) => !cancelled && setState({ client, error: null }),
      (err) => !cancelled && setState({ client: null, error: err.message || 'config' })
    );
    return () => { cancelled = true; };
  }, []);
  return state;
}

const errCode = (error) => {
  const m = String(error?.message || '');
  return ['online_orders_disabled', 'online_orders_paused', 'online_orders_closed', 'invalid_name', 'invalid_phone',
    'invalid_pickup', 'invalid_items', 'item_unavailable', 'rate_limited', 'invalid_address', 'delivery_disabled', 'invalid_type', 'invalid_payment', 'invalid_cash', 'pickup_required'].find((c) => m.includes(c)) || null;
};

// Desktop gets a two-column layout with the cart as a side panel.
const WIDE_QUERY = '(min-width: 900px)';
function useWide() {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(WIDE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

const pageStyle = {
  height: '100dvh', overflowY: 'auto', background: '#fafafa', color: '#222', WebkitOverflowScrolling: 'touch',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};
const centerStyle = { minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: '#444', fontFamily: 'system-ui, sans-serif' };
const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 10, border: '1px solid #ddd', fontSize: '1rem', background: 'white' };

function PublicOrder() {
  const trackToken = window.location.pathname.startsWith('/order/track/')
    ? window.location.pathname.split('/order/track/')[1].replace(/\/$/, '') : null;
  const { client, error } = useClient();
  const [lang, setLang] = useState(() => (navigator.language || 'es').startsWith('en') ? 'en' : 'es');
  const s = STR[lang] || STR.es;

  if (error) return <div style={centerStyle}>{s.badLink}</div>;
  if (!client) return <div style={centerStyle}>{s.loading}</div>;
  return trackToken
    ? <Track client={client} token={trackToken} lang={lang} setLang={setLang} />
    : <Order client={client} lang={lang} setLang={setLang} />;
}

function Order({ client, lang, setLang }) {
  const [data, setData] = useState(null);
  const [gate, setGate] = useState(null); // null = open, else an error code
  const [loadErr, setLoadErr] = useState(null);
  const [activeCat, setActiveCat] = useState(null);
  const draft = useMemo(() => readJson(DRAFT_KEY, {}), []);
  const [cart, setCart] = useState(() => draft.cart || []); // { key, id, qty, mods: [optionId] }
  const [picking, setPicking] = useState(null); // { item, mods }
  const [checkingOut, setCheckingOut] = useState(false);
  const [stepId, setStepId] = useState('cart'); // checkout wizard step
  const wide = useWide();
  const asideRef = useRef(null);
  const [customer, setCustomer] = useState(() => ({ name: '', phone: '', address: '', lat: null, lng: null, ...readJson(CUSTOMER_KEY, {}), ...draft.customer }));
  const [history, setHistory] = useState(() => readJson(HISTORY_KEY, []));
  const [notes, setNotes] = useState(draft.notes || '');
  const [pickup, setPickup] = useState(() => (/Z$/.test(draft.pickup || '') && Date.parse(draft.pickup) > Date.now() ? draft.pickup : ''));
  const [feeCents, setFeeCents] = useState(null); // null = delivery not offered
  const [orderType, setOrderType] = useState(draft.orderType || 'pickup');
  const [payment, setPayment] = useState(draft.payment || '');
  const [cash, setCash] = useState(draft.cash || ''); // pesos typed by the customer ("pays with")
  const [sending, setSending] = useState(false);
  const [formErr, setFormErr] = useState(null);
  const s = STR[lang] || STR.es;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [menu, probe] = await Promise.all([
        client.rpc('get_active_menu'),
        client.rpc('public_place_order', { payload: { check: true } }),
      ]);
      if (cancelled) return;
      if (menu.error) { setLoadErr(menu.error.message); return; }
      const filtered = { ...menu.data, categories: visibleCategories(menu.data) };
      setData(filtered);
      setActiveCat(filtered.categories[0]?.id ?? null);
      if (menu.data?.shop?.language) setLang(menu.data.shop.language === 'en' ? 'en' : 'es');
      const m = /^open:(\d+)$/.exec(String(probe.data || ''));
      setFeeCents(m ? Number(m[1]) : null);
      setGate(probe.error ? (errCode(probe.error) || 'online_orders_disabled') : null);
    })();
    return () => { cancelled = true; };
  }, [client, setLang]);

  const groups = useMemo(() => new Map((data?.modifier_groups || []).map((g) => [g.id, g])), [data]);
  const itemsById = useMemo(() => {
    const m = new Map();
    (data?.categories || []).forEach((c) => c.items.forEach((i) => m.set(i.id, i)));
    return m;
  }, [data]);
  useEffect(() => {
    writeJson(DRAFT_KEY, { cart, customer, notes, pickup, orderType, payment, cash });
  }, [cart, customer, notes, pickup, orderType, payment, cash]);
  // Drop restored lines whose item left the menu or sold out since the draft was saved.
  useEffect(() => {
    if (data) setCart((prev) => prev.filter((l) => itemsById.has(l.id) && itemsById.get(l.id).available !== false));
  }, [data, itemsById]);
  const optionPrice = (id) => {
    for (const g of groups.values()) { const o = g.options.find((x) => x.id === id); if (o) return o.price_delta_cents || 0; }
    return 0;
  };
  const unitCents = (line) => {
    const it = itemsById.get(line.id);
    return (it?.price_cents || 0) + line.mods.reduce((a, id) => a + optionPrice(id), 0);
  };
  const total = cart.reduce((a, l) => a + unitCents(l) * l.qty, 0);
  // Offered methods (default all three); a lone method is preselected.
  const offered = PAY_METHODS.filter((m) => (data?.shop?.payments?.methods?.length ? data.shop.payments.methods : PAY_METHODS).includes(m));
  const pay = offered.includes(payment) ? payment : offered.length === 1 ? offered[0] : '';
  const delivery = orderType === 'delivery' && feeCents != null;
  const grand = total + (delivery ? feeCents : 0);
  const count = cart.reduce((a, l) => a + l.qty, 0);
  const cashCents = pay === 'cash' && cash !== '' ? Math.round(parseFloat(cash) * 100) : null;
  const cashBad = cashCents != null && !(cashCents >= grand && cashCents <= grand + 100000);
  // Exact + the next few round bills above the total.
  const cashChips = [grand, ...[...new Set([50, 100, 200, 500].map((b) => Math.ceil(grand / (b * 100)) * b * 100))].filter((c) => c > grand).slice(0, 3)];

  if (loadErr) return <div style={centerStyle}>{loadErr}</div>;
  if (!data) return <div style={centerStyle}>{s.loading}</div>;

  const brand = data.shop?.brand_color || '#f28b05';
  const categories = (data.categories || []).filter((c) => c.items.length > 0);
  const active = categories.find((c) => c.id === activeCat) || categories[0];
  const fmt = (c) => formatForDisplay(c, lang);

  const openCart = () => (wide ? asideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) : setCheckingOut(true));
  const header = <ShopHeader shop={data.shop} lang={lang} setLang={setLang} cartCount={count} onCart={openCart} cartLabel={s.cart} />;

  if (gate) {
    const msg = gate === 'online_orders_paused' ? s.paused : gate === 'online_orders_closed' ? s.closed : s.notOpen;
    return <div style={pageStyle}>{header}<div style={{ padding: 32, textAlign: 'center', color: '#555' }}>{msg}</div></div>;
  }
  if (categories.length === 0) return <div style={pageStyle}>{header}<div style={{ padding: 32, textAlign: 'center' }}>{s.noMenu}</div></div>;

  const addLine = (id, mods) => {
    const key = `${id}|${[...mods].sort().join(',')}`;
    setCart((prev) => {
      const found = prev.find((l) => l.key === key);
      return found ? prev.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l)) : [...prev, { key, id, qty: 1, mods }];
    });
  };
  const onAdd = (item) => {
    const hasMods = (item.modifier_group_ids || []).some((gid) => groups.get(gid));
    if (hasMods) setPicking({ item, mods: [] });
    else addLine(item.id, []);
  };
  const toggleMod = (g, optId) => setPicking((p) => {
    const has = p.mods.includes(optId);
    const others = g.allow_multiple ? p.mods : p.mods.filter((m) => !g.options.some((o) => o.id === m));
    return { ...p, mods: has ? p.mods.filter((m) => m !== optId) : [...others, optId] };
  });
  const setQty = (key, qty) => setCart((prev) => prev.flatMap((l) => (l.key !== key ? [l] : qty > 0 ? [{ ...l, qty }] : [])));

  const last = history[0];
  const repeatLast = () => {
    if (!last) return;
    const lines = last.items.filter((l) => itemsById.get(l.id)?.available !== false && itemsById.has(l.id));
    setCart(lines.map((l) => ({ key: `${l.id}|${[...l.mods].sort().join(',')}`, id: l.id, qty: l.qty, mods: l.mods })));
    setCheckingOut(true);
  };
  const forget = () => {
    removeKey(CUSTOMER_KEY); removeKey(HISTORY_KEY); removeKey(DRAFT_KEY);
    setCustomer({ name: '', phone: '', address: '', lat: null, lng: null }); setHistory([]);
    setFormErr(s.forgot);
  };

  const submit = async () => {
    setFormErr(null);
    if (!pay) { setFormErr(s.invalid_payment); return; }
    if (cashBad) { setFormErr(s.invalid_cash); return; }
    if (!pickup && !asapOk({ tz: data.shop?.timezone || 'America/Mexico_City', slots: data.shop?.slots, schedule: data.shop?.schedule })) { setFormErr(s.pickup_required); return; }
    setSending(true);
    const payload = {
      name: customer.name, phone: customer.phone, notes,
      order_type: delivery ? 'delivery' : 'pickup', address: delivery ? customer.address : null,
      lat: delivery ? customer.lat : null, lng: delivery ? customer.lng : null,
      pickup_at: pickup || null, payment_method: pay, cash_amount_cents: cashCents,
      items: cart.map((l) => ({ id: l.id, qty: l.qty, modifiers: l.mods })),
    };
    const { data: token, error: err } = await client.rpc('public_place_order', { payload });
    setSending(false);
    if (err) { const c = errCode(err); setFormErr(s[c] || (c && c.startsWith('online_orders') ? s.notOpen : s.generic)); return; }
    writeJson(CUSTOMER_KEY, { name: customer.name, phone: customer.phone, address: customer.address || '', lat: customer.lat ?? null, lng: customer.lng ?? null });
    removeKey(DRAFT_KEY);
    writeJson(HISTORY_KEY, [{ token, total_cents: grand, items: cart.map((l) => ({ id: l.id, qty: l.qty, mods: l.mods })) }, ...history].slice(0, MAX_HISTORY));
    window.location.assign(`/order/track/${token}${window.location.search}`);
  };

  // Checkout wizard: items + type + notes -> location (delivery only) -> date/time -> details + payment.
  // Earlier steps stay reachable (Back / step dots) until the order is sent.
  const steps = ['cart', ...(delivery ? ['location'] : []), 'time', 'pay'];
  const stepIdx = Math.max(steps.indexOf(stepId), 0);
  const step = steps[stepIdx];
  const stepBlock = { cart: cart.length === 0, location: (customer.address || '').trim().length < 5 }[step];
  const go = (i) => { setFormErr(null); setStepId(steps[i]); };
  const nextBtn = { flex: 1, background: brand, color: 'white', border: 'none', borderRadius: 12, padding: 14, fontWeight: 800, cursor: 'pointer' };
  const backBtn = { flex: '0 0 auto', background: 'white', color: brand, border: `1px solid ${brand}`, borderRadius: 12, padding: '14px 18px', fontWeight: 800, cursor: 'pointer' };
  const cartBody = (
    <>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      {steps.map((st, i) => (
        <button key={st} type="button" aria-label={s[`step_${st}`]} disabled={i > stepIdx} onClick={() => go(i)}
          style={{ flex: 1, height: 6, borderRadius: 999, border: 'none', padding: 0, background: i <= stepIdx ? brand : '#e5e5e5', cursor: i < stepIdx ? 'pointer' : 'default' }} />
      ))}
    </div>
    <small style={{ color: '#888' }}>{s.stepOf.replace('{n}', stepIdx + 1).replace('{m}', steps.length)}</small>
    <h3 style={{ margin: '4px 0 12px' }}>{s[`step_${step}`]}</h3>

    {step === 'cart' && (<>
    {cart.length === 0 && <p style={{ color: '#666' }}>{s.empty}</p>}
    {cart.map((l) => (
      <div key={l.key} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #eee' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>{itemsById.get(l.id)?.name}</div>
          <small style={{ color: '#666' }}>{l.mods.map((id) => { for (const g of groups.values()) { const o = g.options.find((x) => x.id === id); if (o) return o.name; } return ''; }).filter(Boolean).join(', ')}</small>
        </div>
        <button type="button" onClick={() => setQty(l.key, l.qty - 1)} style={qtyBtn}>−</button>
        <strong>{l.qty}</strong>
        <button type="button" onClick={() => setQty(l.key, l.qty + 1)} style={qtyBtn}>+</button>
        <span style={{ width: 80, textAlign: 'right' }}>{fmt(unitCents(l) * l.qty)}</span>
      </div>
    ))}
    {feeCents != null && (
      <div style={{ display: 'flex', gap: 8, margin: '12px 0 0' }}>
        {['pickup', 'delivery'].map((ty) => (
          <button key={ty} type="button" onClick={() => setOrderType(ty)}
            style={{ flex: 1, padding: '10px 8px', borderRadius: 10, fontWeight: 700, cursor: 'pointer', border: `1px solid ${brand}`,
              background: orderType === ty ? brand : 'white', color: orderType === ty ? 'white' : brand }}>
            {ty === 'pickup' ? s.typePickup : s.typeDelivery}
          </button>
        ))}
      </div>
    )}
    <div style={{ marginTop: 12 }}>
      <textarea style={inputStyle} placeholder={s.notes} maxLength={300} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
    </div>
    </>)}

    {step === 'location' && (
      <div style={{ display: 'grid', gap: 10 }}>
      <textarea style={inputStyle} placeholder={s.address} autoComplete="street-address" maxLength={250} rows={2} value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} />
      {delivery && (
        <Suspense fallback={null}>
          <PinMap pin={customer.lat != null ? { lat: customer.lat, lng: customer.lng } : null} address={customer.address} s={s}
            onPin={(lat, lng) => setCustomer((c) => ({ ...c, lat, lng }))} />
        </Suspense>
      )}
      </div>
    )}

    {step === 'time' && (
      <div style={{ display: 'grid', gap: 10 }}>
      <SlotPicker delivery={delivery} label={delivery ? s.deliveryAt : s.pickupAt} value={pickup} onChange={setPickup} shop={data?.shop} lang={lang} s={s} brand={brand} />
      </div>
    )}

    {step === 'pay' && (<>
      <div style={{ display: 'grid', gap: 10 }}>
      <input style={inputStyle} placeholder={s.name} autoComplete="name" maxLength={80} value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
      <input style={inputStyle} placeholder={s.phone} autoComplete="tel" inputMode="tel" maxLength={20} value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
      </div>
    <div role="radiogroup" aria-label={s.payLabel} style={{ margin: '12px 0 0' }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{s.payLabel}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        {offered.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={pay === m} onClick={() => setPayment(m)}
            style={{ flex: 1, padding: '10px 4px', borderRadius: 10, fontWeight: 700, cursor: 'pointer', border: `1px solid ${brand}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              background: pay === m ? brand : 'white', color: pay === m ? 'white' : brand }}>
            <Icon icon={PAY_ICON[m]} width="20" />{s[`pay_${m}`]}
          </button>
        ))}
      </div>
    </div>
    {pay === 'transfer' && data.shop?.payments?.transferInfo && (
      <div style={{ marginTop: 8, padding: 10, borderRadius: 10, background: '#f5f5f5', whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{data.shop.payments.transferInfo}</div>
    )}
    {pay === 'cash' && (
      <div style={{ marginTop: 8 }}>
        <label style={{ fontWeight: 700, display: 'block', marginBottom: 6 }}>{s.cashPay}</label>
        <input style={inputStyle} inputMode="decimal" placeholder="$" value={cash} aria-invalid={cashBad}
          onChange={(e) => setCash(e.target.value.replace(/[^0-9.]/g, ''))} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          {cashChips.map((c, i) => (
            <button key={c} type="button" onClick={() => setCash(String(c / 100))}
              style={{ padding: '6px 12px', borderRadius: 999, border: `1px solid ${brand}`, background: cashCents === c ? brand : 'white', color: cashCents === c ? 'white' : brand, fontWeight: 700, cursor: 'pointer' }}>
              {i === 0 ? s.cashExact : fmt(c)}
            </button>
          ))}
        </div>
        {cashBad && <small style={{ color: '#c0392b', display: 'block', marginTop: 4 }}>{s.invalid_cash}</small>}
        {cashCents != null && !cashBad && <div style={{ fontWeight: 700, marginTop: 6 }}>{s.cashChange}: {fmt(cashCents - grand)}</div>}
      </div>
    )}
    <p style={{ color: '#666', fontSize: '0.9rem' }}>{pay ? s.payNote[pay][delivery ? 1 : 0] : delivery ? s.payOnDelivery : s.payAtPickup}</p>
    </>)}

    {delivery && (
      <div style={{ display: 'flex', justifyContent: 'space-between', margin: '12px 0 0' }}><span>{s.deliveryFee}</span><span>{fmt(feeCents)}</span></div>
    )}
    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1.1rem', margin: '12px 0' }}><span>{s.total}</span><span>{fmt(grand)}</span></div>
    {step === 'location' && stepBlock && <small style={{ color: '#888', display: 'block', marginBottom: 8 }}>{s.invalid_address}</small>}
    {step === 'pay' && formErr && <p style={{ color: '#c0392b', fontWeight: 600 }}>{formErr}</p>}
    <div style={{ display: 'flex', gap: 8 }}>
      {stepIdx > 0 && <button type="button" disabled={sending} onClick={() => go(stepIdx - 1)} style={backBtn}>{s.back}</button>}
      {step !== 'pay' ? (
        <button type="button" disabled={stepBlock} onClick={() => go(stepIdx + 1)} style={{ ...nextBtn, opacity: stepBlock ? 0.6 : 1 }}>{s.next}</button>
      ) : (
        <button type="button" disabled={sending || cart.length === 0} onClick={submit} style={{ ...nextBtn, opacity: sending || cart.length === 0 ? 0.6 : 1 }}>
          {sending ? s.sending : s.send}
        </button>
      )}
    </div>
    {step === 'cart' && <button type="button" onClick={forget} style={{ background: 'none', border: 'none', color: '#888', marginTop: 12, textDecoration: 'underline', cursor: 'pointer' }}>{s.forget}</button>}
    </>
  );

  const menuCol = (
    <div style={{ minWidth: 0 }}>
      {last && !checkingOut && (
        <div style={{ padding: '12px 16px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={repeatLast} style={{ ...inputStyle, width: 'auto', cursor: 'pointer', fontWeight: 700, color: brand, border: `1px solid ${brand}` }}>{s.repeat}</button>
          <a href={`/order/track/${last.token}${window.location.search}`} style={{ alignSelf: 'center', color: brand, fontWeight: 700 }}>{s.pastOrders}</a>
        </div>
      )}

      <nav style={{ display: 'flex', overflowX: 'auto', gap: 12, padding: wide ? '12px 4px' : '12px 16px', background: wide ? '#fafafa' : 'white', borderBottom: '1px solid #eee', position: 'sticky', top: 0, zIndex: 5 }}>
        {categories.map((c) => (
          <button key={c.id} type="button" onClick={() => setActiveCat(c.id)}
            style={{ background: 'none', border: 'none', borderBottom: `2px solid ${c.id === active.id ? brand : 'transparent'}`, color: c.id === active.id ? brand : '#555', fontWeight: 700, padding: '8px 4px', whiteSpace: 'nowrap', cursor: 'pointer' }}>
            {c.name}
          </button>
        ))}
      </nav>

      <ul style={wide
        ? { listStyle: 'none', margin: 0, padding: '16px 0 32px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }
        : { listStyle: 'none', margin: 0, padding: '8px 16px 140px' }}>
        {active.items.map((it) => {
          const out = it.available === false || it.price_type !== 'fixed';
          return (
            <li key={it.id} style={{ display: 'flex', gap: 12, alignItems: 'center', opacity: out ? 0.5 : 1,
              ...(wide ? { background: 'white', borderRadius: 14, padding: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.05)' } : { padding: '14px 0', borderBottom: '1px solid #eee' }) }}>
              {it.image_url ? <img src={it.image_url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10 }} /> : <span style={{ fontSize: '1.6rem' }}>{it.emoji}</span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{it.name}</div>
                <div style={{ color: '#666' }}>{out && it.available === false ? s.soldOut : fmt(it.price_cents)}</div>
              </div>
              {!out && <button type="button" onClick={() => onAdd(it)} style={{ background: brand, color: 'white', border: 'none', borderRadius: 10, padding: '10px 16px', fontWeight: 800, cursor: 'pointer' }}>{s.add}</button>}
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <div style={pageStyle}>
      {header}
      {wide ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 24, maxWidth: 1200, margin: '0 auto', padding: '0 24px', alignItems: 'start' }}>
          {menuCol}
          <aside ref={asideRef} style={{ position: 'sticky', top: 16, marginTop: 16, maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', background: 'white', borderRadius: 16, padding: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
            {cartBody}
          </aside>
        </div>
      ) : menuCol}

      {!wide && count > 0 && !checkingOut && (
        <button type="button" onClick={() => setCheckingOut(true)}
          style={{ position: 'fixed', left: 16, right: 16, bottom: 16, background: brand, color: 'white', border: 'none', borderRadius: 14, padding: 16, fontWeight: 800, fontSize: '1.05rem', cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,0.25)' }}>
          {s.cart} ({count}) · {fmt(total)}
        </button>
      )}

      {picking && (
        <Sheet onClose={() => setPicking(null)}>
          <h3 style={{ marginTop: 0 }}>{picking.item.name}</h3>
          {(picking.item.modifier_group_ids || []).map((gid) => groups.get(gid)).filter(Boolean).map((g) => (
            <div key={g.id} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, color: brand, textTransform: 'uppercase', fontSize: '0.8rem' }}>{g.name}</div>
              {g.options.map((o) => (
                <label key={o.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0' }}>
                  <input type={g.allow_multiple ? 'checkbox' : 'radio'} name={g.id} checked={picking.mods.includes(o.id)} onChange={() => toggleMod(g, o.id)} />
                  <span style={{ flex: 1 }}>{o.name}</span>
                  {!!o.price_delta_cents && <span style={{ color: '#666' }}>+{fmt(o.price_delta_cents)}</span>}
                </label>
              ))}
            </div>
          ))}
          <button type="button" onClick={() => { addLine(picking.item.id, picking.mods); setPicking(null); }}
            style={{ width: '100%', background: brand, color: 'white', border: 'none', borderRadius: 12, padding: 14, fontWeight: 800, cursor: 'pointer' }}>{s.addToCart}</button>
        </Sheet>
      )}

      {!wide && checkingOut && <Sheet onClose={() => setCheckingOut(false)}>{cartBody}</Sheet>}
    </div>
  );
}

// Brand-colored top bar (logo + name + language toggle), shared by /order and the tracker.
function ShopHeader({ shop, lang, setLang, cartCount, onCart, cartLabel }) {
  return (
    <header style={{ background: shop?.brand_color || '#f28b05', color: 'white', padding: '20px 20px', textAlign: 'center', position: 'relative' }}>
      {shop?.logo && <img src={shop.logo} alt="" style={{ display: 'block', margin: '0 auto 8px', maxHeight: 56, maxWidth: 160, objectFit: 'contain' }} />}
      <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>{shop?.name || 'Menu'}</h1>
      <button type="button" onClick={() => setLang(lang === 'es' ? 'en' : 'es')}
        style={{ position: 'absolute', right: 12, top: 12, background: 'rgba(255,255,255,0.25)', border: 'none', color: 'white', borderRadius: 8, padding: '4px 10px', fontWeight: 700, cursor: 'pointer' }}>
        {lang === 'es' ? 'EN' : 'ES'}
      </button>
      {onCart && (
        <button type="button" onClick={onCart} aria-label={cartLabel}
          style={{ position: 'absolute', left: 12, top: 10, background: 'rgba(255,255,255,0.25)', border: 'none', color: 'white', borderRadius: 10, width: 42, height: 42, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon icon="lucide:shopping-basket" style={{ fontSize: '1.4rem' }} />
          {cartCount > 0 && (
            <span style={{ position: 'absolute', top: -4, right: -4, background: 'white', color: shop?.brand_color || '#f28b05', borderRadius: 999, minWidth: 20, height: 20, fontSize: '0.75rem', fontWeight: 800, lineHeight: '20px', textAlign: 'center', padding: '0 4px', boxSizing: 'border-box' }}>{cartCount}</span>
          )}
        </button>
      )}
    </header>
  );
}

const qtyBtn = { width: 32, height: 32, borderRadius: 8, border: '1px solid #ddd', background: 'white', fontSize: '1.1rem', cursor: 'pointer' };

// Optional pickup/delivery time: native datetime-local (shop timezone) behind the same button.
// Always blocks the past; with slots.enabled it also applies lead/range/step and re-checks the rules on pick.
// Date via the native calendar, then a time list holding only times that are actually
// allowed that day (native pickers can't block hours, so they accepted then rejected).
function SlotPicker({ label, value, onChange, shop, lang, s, delivery }) {
  const ref = useRef(null);
  const tz = shop?.timezone || 'America/Mexico_City';
  const locale = lang === 'en' ? 'en-US' : 'es-MX';
  const rules = shop?.slots?.enabled ? slotRules(shop.slots, shop.schedule) : null;
  const ctx = { tz, slots: shop?.slots, schedule: shop?.schedule };
  const [date, setDate] = useState(() => (value ? toLocalInput(Date.parse(value), tz).slice(0, 10) : ''));
  // Clock read on open (not during render); the time list is refreshed each time the calendar opens.
  const [now, setNow] = useState(() => Date.now());
  const minDate = toLocalInput(now, tz).slice(0, 10);
  const maxDate = toLocalInput(now + (rules?.daysAhead ?? 14) * 86400000, tz).slice(0, 10);
  const times = date ? timesFor(date, { ...ctx, now }) : [];
  const time = value ? toLocalInput(Date.parse(value), tz).slice(11) : '';

  const asap = asapOk(ctx);
  // ASAP isn't served right now: preselect the first available slot (the customer can still change it).
  const [auto, setAuto] = useState('');
  useEffect(() => {
    if (value || asapOk(ctx)) return;
    const ms = firstSlot(ctx);
    if (ms == null) return;
    const iso = new Date(ms).toISOString();
    setDate(toLocalInput(ms, tz).slice(0, 10)); setAuto(iso); onChange(iso);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const open = () => { setNow(Date.now()); const el = ref.current; try { el.showPicker(); } catch { el.focus(); el.click(); } };
  const pickDate = (e) => { if (!e.target.value) return; setNow(Date.now()); setDate(e.target.value); onChange(''); };
  const pickTime = (e) => onChange(e.target.value ? new Date(fromLocalInput(`${date}T${e.target.value}`, tz)).toISOString() : '');
  const clear = () => { setDate(''); onChange(''); if (ref.current) ref.current.value = ''; };
  const fmtDate = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
  const fmtTime = (hhmm) => new Date(`2000-01-01T${hhmm}:00Z`).toLocaleTimeString(locale, { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' });
  const days = rules && (rules.days ? [0, 1, 2, 3, 4, 5, 6].filter((i) => rules.days & (1 << i)).map((i) => new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' })).join(', ') : s.everyDay);

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ fontSize: '0.85rem', color: '#555', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={open} style={{ ...inputStyle, flex: 1, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textAlign: 'left', background: 'white' }}>
          <Icon icon="lucide:calendar" />{date ? `${fmtDate(date)}${time ? `, ${fmtTime(time)}` : ''}` : s.chooseSlot}
        </button>
        {date && asap && <button type="button" aria-label={s.clearSlot} onClick={clear} style={{ ...qtyBtn, width: 44, height: 'auto' }}><Icon icon="lucide:x" /></button>}
      </div>
      {/* visually hidden, not display:none (that blocks showPicker in some browsers) */}
      <input ref={ref} type="date" tabIndex={-1} aria-hidden="true" defaultValue={date} min={minDate} max={maxDate} onChange={pickDate}
        style={{ position: 'absolute', left: 0, top: 24, width: 1, height: 1, opacity: 0, pointerEvents: 'none', border: 0, padding: 0 }} />
      {date && times.length > 0 && (
        <select value={time} onChange={pickTime} style={{ ...inputStyle, marginTop: 8, cursor: 'pointer' }} aria-label={label}>
          <option value="">{s.chooseTime}</option>
          {times.map((t) => <option key={t} value={t}>{fmtTime(t)}</option>)}
        </select>
      )}
      {date && times.length === 0 && (
        <small style={{ color: '#c0392b', display: 'block', marginTop: 6 }}>
          {s.noTimes}{rules ? ` ${s.slotRule.replace('{days}', days).replace('{start}', rules.start).replace('{end}', rules.end).replace('{n}', rules.interval)}` : ''}
        </small>
      )}
      {!date && asap && <small style={{ color: '#777' }}>{s.asap}</small>}
      {auto && value === auto && (
        <small style={{ color: '#a05a00', display: 'block', marginTop: 6 }}>
          {(delivery ? s.noMoreSlots : s.noMoreSlotsPickup).replace('{when}', `${fmtDate(date)}, ${fmtTime(time)}`)}
        </small>
      )}
    </div>
  );
}

function Sheet({ children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 20, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', width: '100%', maxWidth: 520, maxHeight: '90dvh', overflowY: 'auto', borderRadius: '18px 18px 0 0', padding: 20, boxSizing: 'border-box' }}>
        {children}
      </div>
    </div>
  );
}

const STEPS = ['requested', 'accepted', 'preparing', 'ready', 'completed'];
const DELIVERY_STEPS = ['requested', 'accepted', 'preparing', 'ready', 'on_delivery', 'completed'];
const STEP_ICON = {
  requested: 'lucide:clipboard-list', accepted: 'lucide:check-circle', preparing: 'lucide:chef-hat',
  ready: 'lucide:shopping-bag', on_delivery: 'lucide:bike', completed: 'lucide:party-popper',
};
const STEP_ICON_DELIVERY = { ready: 'lucide:package-check', completed: 'lucide:house' };

function Track({ client, token, lang, setLang }) {
  const [order, setOrder] = useState(undefined); // undefined = loading, null = not found
  const [shop, setShop] = useState(null);
  const [menu, setMenu] = useState(null);
  const [polling, setPolling] = useState(false);
  const timer = useRef(null);
  const s = STR[lang] || STR.es;

  // Shop info (logo/name/brand) changes rarely: fetch once, not on every poll.
  useEffect(() => {
    let cancelled = false;
    client.rpc('get_public_menu').then(({ data }) => { if (!cancelled && data?.shop) { setShop(data.shop); setMenu(data); } });
    return () => { cancelled = true; };
  }, [client]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      setPolling(true);
      const { data } = await client.rpc('get_order_status', { p_token: token });
      if (cancelled) return;
      setPolling(false);
      setOrder(data?.found ? data : null);
      const done = !data?.found || ['completed', 'rejected'].includes(data.status);
      if (!done) timer.current = setTimeout(poll, 8000);
    };
    poll();
    return () => { cancelled = true; clearTimeout(timer.current); };
  }, [client, token]);

  if (order === undefined) return <div style={centerStyle}>{s.loading}</div>;
  const back = <a href={`/order${window.location.search}`} style={{ color: '#555' }}>{s.backToMenu}</a>;
  if (order === null) return <div style={centerStyle}><div><p>{s.notFound}</p>{back}</div></div>;

  const brand = shop?.brand_color || '#f28b05';
  const rejected = order.status === 'rejected';
  const isDelivery = order.order_type === 'delivery';
  const steps = isDelivery ? DELIVERY_STEPS : STEPS;
  const idx = steps.indexOf(order.status);
  const finished = order.status === 'completed';
  // "You might also like": trackShowcase rides on the menu's shop block (fetched once above),
  // not on get_order_status, so the 8s poll payload doesn't grow.
  const sc = shop?.showcase;
  const picks = !sc?.mode || sc.mode === 'off' ? [] : visibleCategories(menu)
    .filter((c) => sc.mode !== 'categories' || (sc.categories || []).includes(c.name))
    .flatMap((c) => c.items)
    .filter((i) => i.available !== false && i.price_type === 'fixed' && (sc.mode !== 'items' || (sc.items || []).includes(i.id)))
    .slice(0, 12);
  // One marquee copy holds at least 6 cards so a short list still fills the strip.
  const loop = picks.length ? Array.from({ length: Math.ceil(6 / picks.length) }, () => picks).flat() : [];
  const addFromShowcase = (id) => {
    const d = readJson(DRAFT_KEY, {});
    const cart = d.cart || [];
    const key = `${id}|`;
    const next = cart.some((l) => l.key === key) ? cart.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l)) : [...cart, { key, id, qty: 1, mods: [] }];
    writeJson(DRAFT_KEY, { ...d, cart: next });
    window.location.assign(`/order${window.location.search}`);
  };
  const label = (st) => (isDelivery && (st === 'ready' || st === 'completed') ? (st === 'ready' ? s.st_ready_delivery : s.st_delivered) : s[`st_${st}`]);
  return (
    <div style={pageStyle}>
      <style>{'@keyframes tp-spin{to{transform:rotate(360deg)}}@keyframes tp-marquee{to{transform:translateX(-50%)}}.tp-track{animation:tp-marquee linear infinite}.tp-marquee:hover .tp-track,.tp-marquee:active .tp-track{animation-play-state:paused}@media (prefers-reduced-motion:reduce){.tp-spin,.tp-track{animation:none!important}.tp-marquee{overflow-x:auto!important}}'}</style>
      <ShopHeader shop={shop || { brand_color: brand }} lang={lang} setLang={setLang} />
      <div style={{ maxWidth: 480, margin: '0 auto', padding: 24 }}>
        <h2 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          {s.track}
          {polling && <Icon icon="lucide:refresh-cw" width="14" aria-label={s.updating} title={s.updating} style={{ color: '#999' }} />}
        </h2>
        {order.order_num != null && <div style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 8 }}>{s.orderNo} #{order.order_num}</div>}
        {rejected ? (
          <div style={{ background: '#fdecea', color: '#c0392b', padding: 16, borderRadius: 12, fontWeight: 700, display: 'flex', gap: 10, alignItems: 'center' }}>
            <Icon icon="lucide:circle-x" width="24" />
            <span>{s.st_rejected}{order.reject_reason ? ` — ${s.rejectedWhy}: ${order.reject_reason}` : ''}</span>
          </div>
        ) : (
          <ol style={{ listStyle: 'none', padding: 0, margin: '16px 0' }}>
            {steps.map((st, i) => {
              const current = i === idx && !finished;
              const done = i < idx || (finished && i <= idx);
              const icon = (isDelivery && STEP_ICON_DELIVERY[st]) || STEP_ICON[st];
              return (
                <li key={st} aria-current={current ? 'step' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', opacity: i <= idx ? 1 : 0.35, fontWeight: current ? 800 : 500 }}>
                  <span style={{ width: 36, height: 36, borderRadius: 999, background: done ? '#27ae60' : current ? brand : '#ddd', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon icon={icon} width="20" />
                  </span>
                  <span style={{ flex: 1 }}>{label(st)}</span>
                  {done && <Icon icon="lucide:check" width="20" style={{ color: '#27ae60' }} />}
                  {current && <Icon className="tp-spin" icon="lucide:loader-2" width="20" style={{ color: brand, animation: 'tp-spin 1s linear infinite' }} />}
                </li>
              );
            })}
          </ol>
        )}
        {order.status === 'requested' && <p style={{ color: '#666' }}>{s.waiting}</p>}
        {order.payment_method && (
          <div style={{ marginTop: 16, padding: 12, borderRadius: 12, background: '#f5f5f5' }}>
            <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><Icon icon={PAY_ICON[order.payment_method]} width="20" />{s.payLabel}: {s[`pay_${order.payment_method}`]}</div>
            {order.payment_method === 'cash' && order.cash_amount_cents != null && <div style={{ marginTop: 6, fontSize: '0.9rem' }}>{s.cashPaysWith}: {formatForDisplay(order.cash_amount_cents, lang)} · {s.cashChange}: {formatForDisplay(order.cash_amount_cents - order.total_cents, lang)}</div>}
            {order.payment_method === 'transfer' && shop?.payments?.transferInfo && <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{shop.payments.transferInfo}</div>}
          </div>
        )}
        <OrderTicket style={{ marginTop: 16 }} items={order.items} deliveryFeeCents={order.delivery_fee_cents}
          totalCents={order.total_cents} showIva={!!order.show_iva} taxRate={order.tax_rate || 16} lang={lang} />
        {picks.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h3 style={{ margin: '0 0 8px' }}>{s.mightLike}</h3>
            {/* Infinite marquee: the row is rendered twice and slid by exactly one copy (-50%).
                Short lists repeat to fill the strip; reduced-motion users get a static, scrollable row. */}
            <div className="tp-marquee" style={{ overflow: 'hidden', paddingBottom: 6 }}>
              <div className="tp-track" style={{ display: 'flex', width: 'max-content', animationDuration: `${Math.max(loop.length, 3) * 3}s` }}>
                {[...loop, ...loop].map((it, i) => (
                  <button key={i} type="button" onClick={() => addFromShowcase(it.id)} aria-hidden={i >= loop.length || undefined} tabIndex={i >= loop.length ? -1 : 0}
                    style={{ flex: '0 0 120px', marginRight: 10, border: '1px solid #ddd', borderRadius: 12, background: 'white', padding: 8, cursor: 'pointer', textAlign: 'center' }}>
                    {it.image_url ? <img src={it.image_url} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 10 }} /> : <div style={{ fontSize: '2rem', height: 80, lineHeight: '80px' }}>{it.emoji}</div>}
                    <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{it.name}</div>
                    <div style={{ color: '#666', fontSize: '0.85rem' }}>{formatForDisplay(it.price_cents, lang)}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        <p style={{ marginTop: 20 }}>{back}</p>
      </div>
    </div>
  );
}

export default PublicOrder;
