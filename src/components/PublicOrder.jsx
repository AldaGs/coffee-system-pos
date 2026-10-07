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

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Icon } from '@iconify/react';
import { formatForDisplay } from '../utils/moneyUtils';
import OrderTicket from './OrderTicket';

const CUSTOMER_KEY = 'tinypos_order_customer';
const HISTORY_KEY = 'tinypos_order_history';
const MAX_HISTORY = 10;

const readJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const writeJson = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
};
const removeKey = (key) => { try { localStorage.removeItem(key); } catch { /* ignore */ } };

const STR = {
  es: {
    loading: 'Cargando…', notOpen: 'No estamos aceptando pedidos en este momento.',
    paused: 'Los pedidos en línea están en pausa. Intenta de nuevo en un rato.',
    closed: 'Fuera del horario de pedidos.', badLink: 'Enlace inválido. Pide al negocio un enlace actualizado.',
    noMenu: 'El menú no está disponible para pedidos.', soldOut: 'Agotado', add: 'Agregar',
    options: 'Opciones', choose: 'Elige tus opciones', addToCart: 'Agregar al pedido', cancel: 'Cancelar',
    cart: 'Tu pedido', empty: 'Aún no agregas nada.', total: 'Total', checkout: 'Hacer pedido',
    name: 'Nombre', phone: 'Teléfono', notes: 'Notas (opcional)', pickup: 'Hora de recogida (opcional)',
    payAtPickup: 'Pagas al recoger.', send: 'Enviar pedido', sending: 'Enviando…',
    repeat: 'Repetir último pedido', forget: 'Olvidar mis datos', forgot: 'Datos borrados de este dispositivo.',
    pastOrders: 'Mis pedidos', view: 'Ver',
    invalid_name: 'Escribe tu nombre.', invalid_phone: 'Escribe un teléfono válido.', invalid_pickup: 'La hora de recogida no es válida.',
    invalid_items: 'Revisa tu pedido.', item_unavailable: 'Algún producto ya no está disponible. Actualiza el menú.',
    rate_limited: 'Demasiados intentos. Espera unos minutos.', generic: 'No se pudo enviar el pedido.',
    track: 'Seguimiento de tu pedido', notFound: 'Pedido no encontrado.', backToMenu: 'Volver al menú',
    rejectedWhy: 'Motivo', st_requested: 'Pedido enviado', st_accepted: 'Aceptado', st_preparing: 'Preparando',
    st_ready: 'Listo para recoger', st_completed: 'Entregado', st_delivered: 'Entregado', st_rejected: 'Rechazado',
    waiting: 'Esperando confirmación del negocio…', updating: 'Actualizando…',
    typePickup: 'Recoger', typeDelivery: 'Envío a domicilio', address: 'Dirección de entrega', deliveryFee: 'Envío',
    payOnDelivery: 'Pagas al recibir.', orderNo: 'Pedido', st_on_delivery: 'En camino', st_ready_delivery: 'Listo, esperando repartidor',
    invalid_address: 'Escribe tu dirección de entrega.', delivery_disabled: 'El envío a domicilio no está disponible.', invalid_type: 'Revisa tu pedido.',
  },
  en: {
    loading: 'Loading…', notOpen: 'We are not accepting orders right now.',
    paused: 'Online orders are paused. Please try again in a bit.',
    closed: 'Outside ordering hours.', badLink: 'Invalid link. Ask the shop for an updated link.',
    noMenu: 'The menu is not available for ordering.', soldOut: 'Sold out', add: 'Add',
    options: 'Options', choose: 'Choose your options', addToCart: 'Add to order', cancel: 'Cancel',
    cart: 'Your order', empty: 'Nothing added yet.', total: 'Total', checkout: 'Place order',
    name: 'Name', phone: 'Phone', notes: 'Notes (optional)', pickup: 'Pickup time (optional)',
    payAtPickup: 'You pay at pickup.', send: 'Send order', sending: 'Sending…',
    repeat: 'Repeat last order', forget: 'Forget my data', forgot: 'Data erased from this device.',
    pastOrders: 'My orders', view: 'View',
    invalid_name: 'Enter your name.', invalid_phone: 'Enter a valid phone number.', invalid_pickup: 'Pickup time is not valid.',
    invalid_items: 'Please review your order.', item_unavailable: 'An item is no longer available. Refresh the menu.',
    rate_limited: 'Too many attempts. Wait a few minutes.', generic: 'Could not send the order.',
    track: 'Track your order', notFound: 'Order not found.', backToMenu: 'Back to menu',
    rejectedWhy: 'Reason', st_requested: 'Order sent', st_accepted: 'Accepted', st_preparing: 'Preparing',
    st_ready: 'Ready for pickup', st_completed: 'Picked up', st_delivered: 'Delivered', st_rejected: 'Rejected',
    waiting: 'Waiting for the shop to confirm…', updating: 'Updating…',
    typePickup: 'Pickup', typeDelivery: 'Delivery', address: 'Delivery address', deliveryFee: 'Delivery',
    payOnDelivery: 'You pay on delivery.', orderNo: 'Order', st_on_delivery: 'On the way', st_ready_delivery: 'Ready, waiting for the driver',
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
    'invalid_pickup', 'invalid_items', 'item_unavailable', 'rate_limited', 'invalid_address', 'delivery_disabled', 'invalid_type'].find((c) => m.includes(c)) || null;
};

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
  const [cart, setCart] = useState([]); // { key, id, qty, mods: [optionId] }
  const [picking, setPicking] = useState(null); // { item, mods }
  const [checkingOut, setCheckingOut] = useState(false);
  const [customer, setCustomer] = useState(() => ({ name: '', phone: '', address: '', ...readJson(CUSTOMER_KEY, {}) }));
  const [history, setHistory] = useState(() => readJson(HISTORY_KEY, []));
  const [notes, setNotes] = useState('');
  const [pickup, setPickup] = useState('');
  const [feeCents, setFeeCents] = useState(null); // null = delivery not offered
  const [orderType, setOrderType] = useState('pickup');
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
      setData(menu.data);
      setActiveCat(menu.data?.categories?.[0]?.id ?? null);
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
  const optionPrice = (id) => {
    for (const g of groups.values()) { const o = g.options.find((x) => x.id === id); if (o) return o.price_delta_cents || 0; }
    return 0;
  };
  const unitCents = (line) => {
    const it = itemsById.get(line.id);
    return (it?.price_cents || 0) + line.mods.reduce((a, id) => a + optionPrice(id), 0);
  };
  const total = cart.reduce((a, l) => a + unitCents(l) * l.qty, 0);
  const delivery = orderType === 'delivery' && feeCents != null;
  const grand = total + (delivery ? feeCents : 0);
  const count = cart.reduce((a, l) => a + l.qty, 0);

  if (loadErr) return <div style={centerStyle}>{loadErr}</div>;
  if (!data) return <div style={centerStyle}>{s.loading}</div>;

  const brand = data.shop?.brand_color || '#f28b05';
  const categories = (data.categories || []).filter((c) => c.items.length > 0);
  const active = categories.find((c) => c.id === activeCat) || categories[0];
  const fmt = (c) => formatForDisplay(c, lang);

  const header = <ShopHeader shop={data.shop} lang={lang} setLang={setLang} />;

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
    removeKey(CUSTOMER_KEY); removeKey(HISTORY_KEY);
    setCustomer({ name: '', phone: '', address: '' }); setHistory([]);
    setFormErr(s.forgot);
  };

  const submit = async () => {
    setFormErr(null);
    setSending(true);
    const payload = {
      name: customer.name, phone: customer.phone, notes,
      order_type: delivery ? 'delivery' : 'pickup', address: delivery ? customer.address : null,
      pickup_at: pickup ? new Date(pickup).toISOString() : null,
      items: cart.map((l) => ({ id: l.id, qty: l.qty, modifiers: l.mods })),
    };
    const { data: token, error: err } = await client.rpc('public_place_order', { payload });
    setSending(false);
    if (err) { const c = errCode(err); setFormErr(s[c] || (c && c.startsWith('online_orders') ? s.notOpen : s.generic)); return; }
    writeJson(CUSTOMER_KEY, { name: customer.name, phone: customer.phone, address: customer.address || '' });
    writeJson(HISTORY_KEY, [{ token, total_cents: grand, items: cart.map((l) => ({ id: l.id, qty: l.qty, mods: l.mods })) }, ...history].slice(0, MAX_HISTORY));
    window.location.assign(`/order/track/${token}${window.location.search}`);
  };

  return (
    <div style={pageStyle}>
      {header}
      {last && !checkingOut && (
        <div style={{ padding: '12px 16px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={repeatLast} style={{ ...inputStyle, width: 'auto', cursor: 'pointer', fontWeight: 700, color: brand, border: `1px solid ${brand}` }}>{s.repeat}</button>
          <a href={`/order/track/${last.token}${window.location.search}`} style={{ alignSelf: 'center', color: brand, fontWeight: 700 }}>{s.pastOrders}</a>
        </div>
      )}

      <nav style={{ display: 'flex', overflowX: 'auto', gap: 12, padding: '12px 16px', background: 'white', borderBottom: '1px solid #eee', position: 'sticky', top: 0, zIndex: 5 }}>
        {categories.map((c) => (
          <button key={c.id} type="button" onClick={() => setActiveCat(c.id)}
            style={{ background: 'none', border: 'none', borderBottom: `2px solid ${c.id === active.id ? brand : 'transparent'}`, color: c.id === active.id ? brand : '#555', fontWeight: 700, padding: '8px 4px', whiteSpace: 'nowrap', cursor: 'pointer' }}>
            {c.name}
          </button>
        ))}
      </nav>

      <ul style={{ listStyle: 'none', margin: 0, padding: '8px 16px 140px' }}>
        {active.items.map((it) => {
          const out = it.available === false || it.price_type !== 'fixed';
          return (
            <li key={it.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #eee', opacity: out ? 0.5 : 1 }}>
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

      {count > 0 && !checkingOut && (
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

      {checkingOut && (
        <Sheet onClose={() => setCheckingOut(false)}>
          <h3 style={{ marginTop: 0 }}>{s.cart}</h3>
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
          {delivery && (
            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '12px 0 0' }}><span>{s.deliveryFee}</span><span>{fmt(feeCents)}</span></div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1.1rem', margin: '12px 0' }}><span>{s.total}</span><span>{fmt(grand)}</span></div>

          <div style={{ display: 'grid', gap: 10 }}>
            <input style={inputStyle} placeholder={s.name} autoComplete="name" maxLength={80} value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
            <input style={inputStyle} placeholder={s.phone} autoComplete="tel" inputMode="tel" maxLength={20} value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
            {delivery && <textarea style={inputStyle} placeholder={s.address} autoComplete="street-address" maxLength={250} rows={2} value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} />}
            <textarea style={inputStyle} placeholder={s.notes} maxLength={300} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            <label style={{ fontSize: '0.85rem', color: '#555' }}>{s.pickup}
              <input style={inputStyle} type="datetime-local" value={pickup} onChange={(e) => setPickup(e.target.value)} />
            </label>
          </div>
          <p style={{ color: '#666', fontSize: '0.9rem' }}>{delivery ? s.payOnDelivery : s.payAtPickup}</p>
          {formErr && <p style={{ color: '#c0392b', fontWeight: 600 }}>{formErr}</p>}
          <button type="button" disabled={sending || cart.length === 0} onClick={submit}
            style={{ width: '100%', background: brand, color: 'white', border: 'none', borderRadius: 12, padding: 14, fontWeight: 800, cursor: 'pointer', opacity: sending || cart.length === 0 ? 0.6 : 1 }}>
            {sending ? s.sending : s.send}
          </button>
          <button type="button" onClick={forget} style={{ background: 'none', border: 'none', color: '#888', marginTop: 12, textDecoration: 'underline', cursor: 'pointer' }}>{s.forget}</button>
        </Sheet>
      )}
    </div>
  );
}

// Brand-colored top bar (logo + name + language toggle), shared by /order and the tracker.
function ShopHeader({ shop, lang, setLang }) {
  return (
    <header style={{ background: shop?.brand_color || '#f28b05', color: 'white', padding: '20px 20px', textAlign: 'center', position: 'relative' }}>
      {shop?.logo && <img src={shop.logo} alt="" style={{ display: 'block', margin: '0 auto 8px', maxHeight: 56, maxWidth: 160, objectFit: 'contain' }} />}
      <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>{shop?.name || 'Menu'}</h1>
      <button type="button" onClick={() => setLang(lang === 'es' ? 'en' : 'es')}
        style={{ position: 'absolute', right: 12, top: 12, background: 'rgba(255,255,255,0.25)', border: 'none', color: 'white', borderRadius: 8, padding: '4px 10px', fontWeight: 700, cursor: 'pointer' }}>
        {lang === 'es' ? 'EN' : 'ES'}
      </button>
    </header>
  );
}

const qtyBtn = { width: 32, height: 32, borderRadius: 8, border: '1px solid #ddd', background: 'white', fontSize: '1.1rem', cursor: 'pointer' };

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
  const [polling, setPolling] = useState(false);
  const timer = useRef(null);
  const s = STR[lang] || STR.es;

  // Shop info (logo/name/brand) changes rarely: fetch once, not on every poll.
  useEffect(() => {
    let cancelled = false;
    client.rpc('get_public_menu').then(({ data }) => { if (!cancelled && data?.shop) setShop(data.shop); });
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
  const label = (st) => (isDelivery && (st === 'ready' || st === 'completed') ? (st === 'ready' ? s.st_ready_delivery : s.st_delivered) : s[`st_${st}`]);
  return (
    <div style={pageStyle}>
      <style>{'@keyframes tp-spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.tp-spin{animation:none!important}}'}</style>
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
        <OrderTicket style={{ marginTop: 16 }} items={order.items} deliveryFeeCents={order.delivery_fee_cents}
          totalCents={order.total_cents} showIva={!!order.show_iva} taxRate={order.tax_rate || 16} lang={lang} />
        <p style={{ marginTop: 20 }}>{back}</p>
      </div>
    </div>
  );
}

export default PublicOrder;
