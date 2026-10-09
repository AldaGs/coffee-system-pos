// Customer-facing online ordering (pickup or delivery, pay on receipt). No accounts.
//
//   /order?p=REF                  menu + cart + checkout
//   /order/track/<token>?p=REF    live status of one order
//
// Talks to Supabase only through the anon key and RPCs: get_order_menu
// (menu), public_place_order (submit; server reprices) and get_order_status
// (token lookup). Customer details and past orders live in this browser's
// localStorage only. Connection bootstrap mirrors PublicMenu (?p= ref,
// custom domain, legacy ?u=&k=).

import { isOpenNow, nextOpening, formatHours } from '../utils/pickupSlots';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Icon } from '@iconify/react';
import { formatForDisplay } from '../utils/moneyUtils';
import OrderTicket from './OrderTicket';
import OrderCatalog from './ordering/OrderCatalog';
import OrderDesignView from './ordering/OrderDesignView';
import LegalLinks from './LegalLinks';
import TransferDetails from './TransferDetails';
import CountryPicker from './CountryPicker';
import { CALLING_CODES, exactLength } from '../utils/callingCodes';
import { useLegal } from '../hooks/useLegal';
import { slotRules, timesFor, toLocalInput, fromLocalInput, firstSlot, asapOk, autoSlotIsToday, checkoutSlotStatus } from '../utils/pickupSlots';
import { fetchOrderMenu } from '../utils/orderMenu';
import { canOrderItem } from '../utils/canvasOrdering';

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

const PAY_METHODS = ['cash', 'card', 'transfer', 'clip'];
const PAY_ICON = { cash: 'lucide:banknote', card: 'lucide:credit-card', transfer: 'lucide:landmark', clip: 'lucide:link' };

const STR = {
  es: {
    loading: 'Cargando…', notOpen: 'No estamos aceptando pedidos en este momento.',
    paused: 'No estamos recibiendo pedidos por el momento.',
    closed: 'Cerrado por ahora', opensAt: 'Abrimos {when}', today: 'hoy', tomorrow: 'mañana', hoursTitle: 'Horario de la tienda', allDays: 'Todos los días', dayNames: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'], badLink: 'Enlace inválido. Pide al negocio un enlace actualizado.',
    noMenu: 'El menú no está disponible para pedidos.', soldOut: 'Agotado', add: 'Agregar',
    options: 'Opciones', choose: 'Elige tus opciones', addToCart: 'Agregar al pedido', cancel: 'Cancelar',
    cart: 'Tu pedido', empty: 'Aún no agregas nada.', total: 'Total', checkout: 'Hacer pedido',
    addressRequired: 'Dirección de entrega (obligatoria)', pinExpand: 'Ampliar mapa', pinReduce: 'Reducir mapa',
    name: 'Nombre', phone: 'Teléfono', phone10: 'Teléfono (10 dígitos)', phoneDigits: 'El teléfono debe tener {n} dígitos.', country: 'País', notes: 'Notas (opcional)', pickupAt: 'Fecha y hora de recolección', deliveryAt: 'Fecha y hora de entrega', chooseSlot: 'Escoge Fecha y Hora', asap: 'Lo antes posible', slotRule: 'Elige un horario disponible: {days} de {start} a {end}, cada {n} min', slotPast: 'Elige una fecha y hora futuras.', everyDay: 'todos los días', clearSlot: 'Quitar horario', step_cart: 'Tu pedido', step_location: 'Ubicación de entrega', step_time: 'Fecha y hora', step_pay: 'Tus datos y pago', stepOf: 'Paso {n} de {m}', next: 'Siguiente', back: 'Atrás', chooseTime: 'Elige la hora', noTimes: 'No hay horarios disponibles ese día.',
    legalA: 'Al enviar tu pedido aceptas el ', legalB: ' y los ', payAtPickup: 'Pagas al recoger.', send: 'Enviar pedido', sending: 'Enviando…',
    repeat: 'Repetir último pedido', forget: 'Olvidar mis datos', forgot: 'Datos borrados de este dispositivo.',
    pastOrders: 'Mis pedidos', view: 'Ver',
    invalid_name: 'Escribe tu nombre.', invalid_phone: 'Escribe un teléfono válido.', invalid_pickup: 'Ese horario ya no está disponible, elige otro.',
    invalid_items: 'Revisa tu pedido.', item_unavailable: 'Algún producto ya no está disponible. Actualiza el menú.',
    rate_limited: 'Demasiados intentos. Espera unos minutos.', generic: 'No se pudo enviar el pedido.',
    track: 'Seguimiento de tu pedido', notFound: 'Pedido no encontrado.', backToMenu: 'Volver al menú',
    rejectedWhy: 'Motivo', st_requested: 'Pedido enviado', st_accepted: 'Aceptado', st_preparing: 'Preparando',
    st_ready: 'Listo para recoger', st_completed: 'Entregado', st_delivered: 'Entregado', st_rejected: 'Rechazado',
    waiting: 'Esperando confirmación del negocio…', updating: 'Actualizando…', st_quote_pending: 'Esperando cotización de envío',
    typePickup: 'Recoger', pinUseMine: 'Usar mi ubicación', pinSearch: 'Buscar dirección en el mapa', pinClear: 'Quitar pin', pinHint: 'Obligatorio: toca el mapa o arrastra el pin a la entrada exacta.', pinNoGeo: 'No pudimos obtener tu ubicación.', pinNeedAddr: 'Escribe tu dirección primero.', pinNotFound: 'No encontramos esa dirección.', mightLike: 'También te puede gustar', pinNeedHttps: 'La ubicación requiere HTTPS: escribe la dirección o mueve el pin.', pinDenied: 'Permiso de ubicación denegado: escribe la dirección o mueve el pin.', pinStreet: 'Calle encontrada: arrastra el pin a tu puerta exacta.', zoneCostInfo: 'El costo de entrega se calcula según la zona. La ubicación exacta de tu pin determina la cotización final.', typeDelivery: 'Envío a domicilio', address: 'Dirección de entrega', deliveryFee: 'Envío', pinRequired: 'Confirma la entrada exacta con el pin.', areaUnavailable: 'Esta dirección está fuera de nuestras zonas de entrega. Puedes recoger tu pedido.', shippingPending: 'Envío fuera de zona: contactaremos contigo para confirmar el precio antes de aceptar el pedido.', pendingPrice: 'Pendiente', subtotal: 'Subtotal', quoteChecking: 'Comprobando cobertura…', quoteError: 'No se pudo comprobar la cobertura. Mueve el pin para reintentar.', shippingReady: 'Listo para envío', shippingDone: 'Pedido completado',
    payOnDelivery: 'Pagas al recibir.', payLabel: 'Forma de pago', pay_cash: 'Efectivo', pay_card: 'Tarjeta', pay_transfer: 'Transferencia', invalid_payment: 'Elige una forma de pago.',
    cashPay: '¿Con cuánto pagas? (opcional)', cashExact: 'Exacto', cashPaysWith: 'Paga con', cashChange: 'Cambio', invalid_cash: 'Escribe un monto igual o mayor al total (máximo $1,000 más).',
    upcomingSlot: 'Próxima entrega disponible hoy: {when}', upcomingSlotPickup: 'Próxima recolección disponible hoy: {when}', noMoreSlots: 'Ya no hay entregas hoy: programado para {when}', noMoreSlotsPickup: 'Ya no hay recolecciones hoy: programado para {when}', pickup_required: 'Elige una fecha y hora de entrega o recolección.',
    payNote: { cash: ['Pagas en efectivo al recoger.', 'Pagas en efectivo al recibir.'], card: ['Pagas con tarjeta en terminal al recoger.', 'Pagas con tarjeta al recibir (el repartidor lleva terminal).'], transfer: ['Transfiere con estos datos y muestra tu comprobante al recoger.', 'Transfiere con estos datos y muestra tu comprobante al recibir.'], clip: ['Cuando aceptemos tu pedido te mostraremos el botón para pagar con tarjeta en línea.', 'Cuando aceptemos tu pedido te mostraremos el botón para pagar con tarjeta en línea.'] },
    pay_clip: 'Tarjeta en línea', clipWait: 'Te mostraremos el botón para pagar en cuanto aceptemos tu pedido.', payNow: 'Pagar ahora', payBy: 'Paga antes de las', payIn: 'Tiempo para pagar:', clipPaid: 'Pagado ✓', clipError: 'No se pudo abrir el pago. Intenta de nuevo o llámanos.', clipExpired: 'El tiempo para pagar terminó.', clipHeld: 'Empezamos a preparar tu pedido en cuanto se confirme el pago.',
    orderNo: 'Pedido', st_on_delivery: 'En camino', st_ready_delivery: 'Listo, esperando repartidor',
    invalid_address: 'Escribe tu dirección de entrega.', delivery_disabled: 'El envío a domicilio no está disponible.', delivery_outside: 'Dirección fuera de nuestras zonas de entrega.', pin_required: 'Confirma la entrada con el pin.', quote_changed: 'La cobertura o el precio cambió. Revisa la nueva cotización antes de continuar.', invalid_type: 'Revisa tu pedido.',
  },
  en: {
    loading: 'Loading…', notOpen: 'We are not accepting orders right now.',
    paused: 'We are not taking orders right now.',
    closed: 'Closed for now', opensAt: 'We open {when}', today: 'today', tomorrow: 'tomorrow', hoursTitle: 'Store hours', allDays: 'Every day', dayNames: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], badLink: 'Invalid link. Ask the shop for an updated link.',
    noMenu: 'The menu is not available for ordering.', soldOut: 'Sold out', add: 'Add',
    options: 'Options', choose: 'Choose your options', addToCart: 'Add to order', cancel: 'Cancel',
    cart: 'Your order', empty: 'Nothing added yet.', total: 'Total', checkout: 'Place order',
    addressRequired: 'Delivery address (required)', pinExpand: 'Expand map', pinReduce: 'Reduce map',
    name: 'Name', phone: 'Phone', phone10: 'Phone (10 digits)', phoneDigits: 'Phone must have {n} digits.', country: 'Country', notes: 'Notes (optional)', pickupAt: 'Pickup date & time', deliveryAt: 'Delivery date & time', chooseSlot: 'Choose date & time', asap: 'As soon as possible', slotRule: 'Pick an available time: {days}, {start} to {end}, every {n} min', slotPast: 'Pick a future date and time.', everyDay: 'every day', clearSlot: 'Clear time', step_cart: 'Your order', step_location: 'Delivery location', step_time: 'Date & time', step_pay: 'Your details & payment', stepOf: 'Step {n} of {m}', next: 'Next', back: 'Back', chooseTime: 'Choose a time', noTimes: 'No times available that day.',
    payAtPickup: 'You pay at pickup.', send: 'Send order', sending: 'Sending…',
    legalA: 'By sending your order you accept the ', legalB: ' and the ',
    repeat: 'Repeat last order', forget: 'Forget my data', forgot: 'Data erased from this device.',
    pastOrders: 'My orders', view: 'View',
    invalid_name: 'Enter your name.', invalid_phone: 'Enter a valid phone number.', invalid_pickup: 'That time is no longer available, please pick another.',
    invalid_items: 'Please review your order.', item_unavailable: 'An item is no longer available. Refresh the menu.',
    rate_limited: 'Too many attempts. Wait a few minutes.', generic: 'Could not send the order.',
    track: 'Track your order', notFound: 'Order not found.', backToMenu: 'Back to menu',
    rejectedWhy: 'Reason', st_requested: 'Order sent', st_accepted: 'Accepted', st_preparing: 'Preparing',
    st_ready: 'Ready for pickup', st_completed: 'Picked up', st_delivered: 'Delivered', st_rejected: 'Rejected',
    waiting: 'Waiting for the shop to confirm…', updating: 'Updating…', st_quote_pending: 'Waiting for shipping quote',
    typePickup: 'Pickup', pinUseMine: 'Use my location', pinSearch: 'Search address on map', pinClear: 'Remove pin', pinHint: 'Required: tap the map or drag the pin to the exact entrance.', pinNoGeo: 'Could not get your location.', pinNeedAddr: 'Enter your address first.', pinNotFound: 'Address not found.', mightLike: 'You might also like', pinNeedHttps: 'Location needs HTTPS: type the address or move the pin.', pinDenied: 'Permission denied: enter the address or move the pin.', pinStreet: 'Street found: drag the pin to your exact door.', zoneCostInfo: 'Delivery cost depends on the area. Your exact pin location determines the final quote.', typeDelivery: 'Delivery', address: 'Delivery address', deliveryFee: 'Delivery', pinRequired: 'Confirm the exact entrance with the pin.', areaUnavailable: 'This address is outside our delivery areas. Pickup is available.', shippingPending: 'Outside-area shipping: we will contact you to confirm the price before accepting the order.', pendingPrice: 'Pending', subtotal: 'Subtotal', quoteChecking: 'Checking coverage…', quoteError: 'Could not check coverage. Move the pin to retry.', shippingReady: 'Ready to ship', shippingDone: 'Order completed',
    payOnDelivery: 'You pay on delivery.', payLabel: 'Payment method', pay_cash: 'Cash', pay_card: 'Card', pay_transfer: 'Bank transfer', invalid_payment: 'Choose a payment method.',
    cashPay: 'How much will you pay with? (optional)', cashExact: 'Exact', cashPaysWith: 'Paying with', cashChange: 'Change', invalid_cash: 'Enter an amount equal to or above the total (at most $1,000 more).',
    upcomingSlot: 'Next delivery available today: {when}', upcomingSlotPickup: 'Next pickup available today: {when}', noMoreSlots: 'No more deliveries today: scheduled for {when}', noMoreSlotsPickup: 'No more pickups today: scheduled for {when}', pickup_required: 'Choose a delivery or pickup date and time.',
    payNote: { cash: ['You pay in cash at pickup.', 'You pay in cash on delivery.'], card: ['You pay by card at the terminal on pickup.', 'You pay by card on delivery (the driver brings a terminal).'], transfer: ['Transfer using these details and show your receipt at pickup.', 'Transfer using these details and show your receipt on delivery.'], clip: ['Once we accept your order you will see a button to pay by card online.', 'Once we accept your order you will see a button to pay by card online.'] },
    pay_clip: 'Card online', clipWait: 'You will see the pay button as soon as we accept your order.', payNow: 'Pay now', payBy: 'Pay before', payIn: 'Time left to pay:', clipPaid: 'Paid ✓', clipError: 'Could not open the payment. Try again or call us.', clipExpired: 'The time to pay has run out.', clipHeld: 'We start preparing your order as soon as the payment is confirmed.',
    orderNo: 'Order', st_on_delivery: 'On the way', st_ready_delivery: 'Ready, waiting for the driver',
    invalid_address: 'Enter your delivery address.', delivery_disabled: 'Delivery is not available.', delivery_outside: 'Address outside our delivery areas.', pin_required: 'Confirm the entrance with the pin.', quote_changed: 'Coverage or the price changed. Review the new quote before continuing.', invalid_type: 'Please review your order.',
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
    'invalid_pickup', 'invalid_items', 'item_unavailable', 'rate_limited', 'invalid_address', 'delivery_disabled', 'delivery_outside', 'pin_required', 'quote_changed', 'invalid_type', 'invalid_payment', 'invalid_cash', 'pickup_required'].find((c) => m.includes(c)) || null;
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

// Page wrapper: the content column fills at least the viewport so the legal links
// always sit at the very bottom (below short pages, after everything on long ones).
function Page({ client, lang, bottomPad = 16, children }) {
  return (
    <div style={pageStyle}>
      <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        {children}
        <footer style={{ marginTop: 'auto', textAlign: 'center', color: '#888', fontSize: '0.8rem', padding: `24px 16px ${bottomPad}px` }}>
          <LegalLinks client={client} lang={lang} />
        </footer>
      </div>
    </div>
  );
}

// Customer phone: country (ISO, Mexico default) + local digits only; stored as calling code + digits.
const fullPhone = (iso, phone) => (CALLING_CODES[iso] || '52') + String(phone || '').replace(/\D/g, '');

const pageStyle = {
  height: '100dvh', overflowY: 'auto', background: '#fafafa', color: '#222', WebkitOverflowScrolling: 'touch',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};
// Shared motion: slide-up for the bottom bar and sheets, fade for wizard steps, spinner for waits.
// Rendered once at the page root; reduced-motion users get none of it.
const MOTION_CSS = '@keyframes tp-spin{to{transform:rotate(360deg)}}@keyframes tp-up{from{transform:translateY(100%);opacity:0}}@keyframes tp-fade{from{opacity:0;transform:translateY(6px)}}@keyframes tp-dim{from{opacity:0}}'
  + '.tp-spin{animation:tp-spin .9s linear infinite}.tp-up{animation:tp-up .32s cubic-bezier(.2,.8,.2,1)}.tp-fade{animation:tp-fade .25s ease-out}.tp-dim{animation:tp-dim .2s ease-out}'
  + '@media (prefers-reduced-motion:reduce){.tp-spin,.tp-up,.tp-fade,.tp-dim{animation:none!important}}';
const Spinner = ({ size = '1.1em' }) => <Icon icon="lucide:loader-2" className="tp-spin" style={{ fontSize: size, verticalAlign: '-0.15em' }} />;
const Loading = ({ text }) => <div style={centerStyle}><div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}><Spinner size="2rem" />{text}</div></div>;
const centerStyle = { minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: '#444', fontFamily: 'system-ui, sans-serif' };
const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 10, border: '1px solid #ddd', fontSize: '1rem', background: 'white' };

function PublicOrder() {
  const trackToken = window.location.pathname.startsWith('/order/track/')
    ? window.location.pathname.split('/order/track/')[1].replace(/\/$/, '') : null;
  const { client, error } = useClient();
  const [lang, setLang] = useState(() => (navigator.language || 'es').startsWith('en') ? 'en' : 'es');
  const s = STR[lang] || STR.es;

  if (error) return <div style={centerStyle}>{s.badLink}</div>;
  if (!client) return <><style>{MOTION_CSS}</style><Loading text={s.loading} /></>;
  return <><style>{MOTION_CSS}</style>{trackToken
    ? <Track client={client} token={trackToken} lang={lang} setLang={setLang} />
    : <Order client={client} lang={lang} setLang={setLang} />}</>;
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
  const legal = useLegal(client); // consent line only when the shop wrote both texts
  const wide = useWide();
  const asideRef = useRef(null);
  const [customer, setCustomer] = useState(() => {
    const c = { name: '', phone: '', address: '', lat: null, lng: null, ...readJson(CUSTOMER_KEY, {}), ...draft.customer };
    // Older saved phones may hold spaces/dashes or a leading 52: keep the local 10 digits.
    const d = String(c.phone || '').replace(/\D/g, '');
    return { ...c, phone: !c.iso && d.length === 12 && d.startsWith('52') ? d.slice(2) : d };
  });
  const [history, setHistory] = useState(() => readJson(HISTORY_KEY, []));
  const [notes, setNotes] = useState(draft.notes || '');
  const [pickup, setPickup] = useState(() => (/Z$/.test(draft.pickup || '') && Date.parse(draft.pickup) > Date.now() ? draft.pickup : ''));
  const [slotDate, setSlotDate] = useState(''); // Keeps a chosen day distinct from ASAP until a time is picked.
  const [slotNow, setSlotNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setSlotNow(Date.now()), 30000); return () => clearInterval(id); }, []);
  const [feeCents, setFeeCents] = useState(null); // null = address service not offered
  const [quote, setQuote] = useState(null);
  const [quoteRevision, setQuoteRevision] = useState(0);
  const [orderType, setOrderType] = useState(draft.orderType || 'pickup');
  const [payment, setPayment] = useState(draft.payment || '');
  const [cash, setCash] = useState(draft.cash || ''); // pesos typed by the customer ("pays with")
  const [sending, setSending] = useState(false);
  const [formErr, setFormErr] = useState(null);
  const s = STR[lang] || STR.es;

  // Probe answer: 'open' or 'open:delivery' (address service offered).
  // One parser for the first load and the 60s re-check (the re-check once had a broken regex
  // that hid delivery a minute in).
  const applyProbe = (probe) => {
    setFeeCents(probe.data === 'open:delivery' ? 0 : null);
    setGate(probe.error ? (errCode(probe.error) || 'online_orders_disabled') : null);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [menu, probe] = await Promise.all([
        fetchOrderMenu(client),
        client.rpc('public_place_order', { payload: { check: true } }),
      ]);
      if (cancelled) return;
      if (menu.error) { setLoadErr(menu.error.message); return; }
      const filtered = { ...menu.data, categories: visibleCategories(menu.data) };
      setData(filtered);
      setActiveCat(filtered.categories[0]?.id ?? null);
      if (menu.data?.shop?.language) setLang(menu.data.shop.language === 'en' ? 'en' : 'es');
      applyProbe(probe);
    })();
    return () => { cancelled = true; };
  }, [client, setLang]);

  // Re-check the gate every minute so the page unlocks (or locks) without a reload.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!data) return undefined;
    const id = setInterval(async () => {
      const probe = await client.rpc('public_place_order', { payload: { check: true } });
      // A network blip (no known error code) keeps the current state instead of locking the page.
      if (probe.error && !errCode(probe.error)) return;
      applyProbe(probe);
      setTick((n) => n + 1);
    }, 60000);
    return () => clearInterval(id);
  }, [client, data]);

  // Preview from the same server function used at submit. A stale response
  // cannot overwrite a quote for a newer pin.
  useEffect(() => {
    if (feeCents == null || customer.lat == null || customer.lng == null) { setQuote(null); return; }
    let cancelled = false;
    setQuote(null);
    client.rpc('get_delivery_quote', { p_lat: customer.lat, p_lng: customer.lng })
      .then(({ data: result, error }) => { if (!cancelled) setQuote(error ? { kind: 'error' } : result); });
    return () => { cancelled = true; };
  }, [client, feeCents, customer.lat, customer.lng, quoteRevision]);

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
    if (data) setCart((prev) => prev.filter((l) => canOrderItem(l.id, itemsById)));
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
  const shipping = delivery && quote?.kind === 'shipping';
  const quotedFee = delivery && quote?.kind === 'delivery' ? quote.fee_cents : 0;
  const grand = total + quotedFee;
  const count = cart.reduce((a, l) => a + l.qty, 0);
  const cashCents = pay === 'cash' && !shipping && cash !== '' ? Math.round(parseFloat(cash) * 100) : null;
  const cashBad = cashCents != null && !(cashCents >= grand && cashCents <= grand + 100000);
  // Exact + the next few round bills above the total.
  const cashChips = [grand, ...[...new Set([50, 100, 200, 500].map((b) => Math.ceil(grand / (b * 100)) * b * 100))].filter((c) => c > grand).slice(0, 3)];

  if (loadErr) return <div style={centerStyle}>{loadErr}</div>;
  if (!data) return <Loading text={s.loading} />;

  const brand = data.shop?.brand_color || '#f28b05';
  const categories = (data.categories || []).filter((c) => c.items.length > 0);
  const active = categories.find((c) => c.id === activeCat) || categories[0];
  const fmt = (c) => formatForDisplay(c, lang);

  const openCart = () => (wide ? asideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) : setCheckingOut(true));
  const header = <ShopHeader shop={data.shop} lang={lang} setLang={setLang} cartCount={count} onCart={gate ? null : openCart} cartLabel={s.cart} />;
  // Not taking orders (closed / paused / disabled): same menu, read-only, with a banner on top.
  const banner = gate && <GateBanner s={s} gate={gate} shop={data.shop} />;

  const addLine = (id, mods) => {
    if (!canOrderItem(id, itemsById, gate)) return;
    const key = `${id}|${[...mods].sort().join(',')}`;
    setCart((prev) => {
      const found = prev.find((l) => l.key === key);
      return found ? prev.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l)) : [...prev, { key, id, qty: 1, mods }];
    });
  };
  const onAdd = (item) => {
    if (!canOrderItem(item.id, itemsById, gate)) return;
    item = itemsById.get(item.id);
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
    if (!last || gate) return;
    const lines = last.items.filter((l) => canOrderItem(l.id, itemsById, gate));
    setCart(lines.map((l) => ({ key: `${l.id}|${[...l.mods].sort().join(',')}`, id: l.id, qty: l.qty, mods: l.mods })));
    setCheckingOut(true);
  };
  const forget = () => {
    removeKey(CUSTOMER_KEY); removeKey(HISTORY_KEY); removeKey(DRAFT_KEY);
    setCustomer({ name: '', phone: '', address: '', lat: null, lng: null }); setHistory([]);
    setFormErr(s.forgot);
  };

  // Phone: exactly 10 digits for Mexico/+1, else 6–12 (digits only; the input strips the rest).
  const phoneLen = exactLength(customer.iso || 'MX');
  const phoneDigits = String(customer.phone || '').replace(/\D/g, '');
  const phoneOk = phoneLen ? phoneDigits.length === phoneLen : phoneDigits.length >= 6 && phoneDigits.length <= 12;
  const phoneBad = phoneDigits.length > 0 && !phoneOk;
  const slotDateIntent = slotDate || (pickup ? toLocalInput(Date.parse(pickup), data.shop?.timezone || 'America/Mexico_City').slice(0, 10) : '');
  const slotContext = { tz: data.shop?.timezone || 'America/Mexico_City', slots: data.shop?.slots, schedule: data.shop?.schedule };
  const slotStatus = checkoutSlotStatus({ value: pickup, selectedDate: slotDateIntent, now: slotNow, ...slotContext });
  const slotHint = (status, at) => status === 'missing-time'
    ? timesFor(slotDateIntent, { ...slotContext, now: at }).length ? s.chooseTime : s.noTimes
    : status === 'asap-unavailable' ? s.pickup_required : s.invalid_pickup;
  const submit = async (freshNow) => {
    setFormErr(null);
    if (!phoneOk) { setFormErr(s.phoneDigits.replace('{n}', phoneLen || '6–12')); return; }
    if (!pay) { setFormErr(s.invalid_payment); return; }
    if (cashBad) { setFormErr(s.invalid_cash); return; }
    const freshSlotStatus = checkoutSlotStatus({ value: pickup, selectedDate: slotDateIntent, now: freshNow, ...slotContext });
    if (freshSlotStatus !== 'valid') { setFormErr(slotHint(freshSlotStatus, freshNow)); setStepId('time'); return; }
    setSending(true);
    const payload = {
      name: customer.name, phone: fullPhone(customer.iso || 'MX', customer.phone), notes,
      order_type: delivery ? 'delivery' : 'pickup', address: delivery ? customer.address : null,
      lat: delivery ? customer.lat : null, lng: delivery ? customer.lng : null,
      expected_quote_kind: delivery ? quote?.kind : null,
      expected_fee_cents: delivery && quote?.kind === 'delivery' ? quote.fee_cents : null,
      expected_area_id: delivery && quote?.kind === 'delivery' ? quote.area?.id : null,
      pickup_at: pickup || null, payment_method: pay, cash_amount_cents: cashCents,
      items: cart.map((l) => ({ id: l.id, qty: l.qty, modifiers: l.mods })),
    };
    const { data: token, error: err } = await client.rpc('public_place_order', { payload });
    setSending(false);
    if (err) { const c = errCode(err); setFormErr(s[c] || (c && c.startsWith('online_orders') ? s.notOpen : s.generic));
      if (c === 'quote_changed') { setQuoteRevision((n) => n + 1); setStepId('location'); }
      return; }
    writeJson(CUSTOMER_KEY, { name: customer.name, phone: customer.phone, iso: customer.iso || 'MX', address: customer.address || '', lat: customer.lat ?? null, lng: customer.lng ?? null });
    removeKey(DRAFT_KEY);
    writeJson(HISTORY_KEY, [{ token, total_cents: grand, items: cart.map((l) => ({ id: l.id, qty: l.qty, mods: l.mods })) }, ...history].slice(0, MAX_HISTORY));
    window.location.assign(`/order/track/${token}${window.location.search}`);
  };

  // Checkout wizard: items + type + notes -> location (delivery only) -> date/time -> details + payment.
  // Earlier steps stay reachable (Back / step dots) until the order is sent.
  const steps = ['cart', ...(delivery ? ['location'] : []), 'time', 'pay'];
  const stepIdx = Math.max(steps.indexOf(stepId), 0);
  const step = steps[stepIdx];
  const locationBlocked = (customer.address || '').trim().length < 5 || customer.lat == null || customer.lng == null || !['delivery', 'shipping'].includes(quote?.kind);
  const stepBlock = { cart: cart.length === 0, location: locationBlocked, time: slotStatus !== 'valid', pay: delivery && locationBlocked || slotStatus !== 'valid' }[step];
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
    <div key={step} className="tp-fade">

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
      <label style={{ display: 'grid', gap: 6 }}>
        <strong>{s.addressRequired}</strong>
        <textarea style={inputStyle} placeholder={s.address} autoComplete="street-address" required maxLength={250} rows={2} value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value, lat: null, lng: null })} />
      </label>
      {delivery && (
        <Suspense fallback={null}>
          <PinMap pin={customer.lat != null ? { lat: customer.lat, lng: customer.lng } : null} address={customer.address} s={s} lang={lang} areas={data.shop?.deliveryAreas}
            onPin={(lat, lng) => setCustomer((c) => ({ ...c, lat, lng }))} />
        </Suspense>
      )}
      {delivery && (customer.lat == null ? <small>{s.pinRequired}</small> : quote?.kind === 'unavailable' ? <small style={{ color: '#c0392b' }}>{s.areaUnavailable}</small> : quote?.kind === 'error' ? <small style={{ color: '#c0392b' }}>{s.quoteError}</small> : !quote ? <small>{s.quoteChecking}</small> : quote.kind === 'shipping' ? <small>{s.shippingPending}</small> : <small>{quote.area?.name}: {fmt(quote.fee_cents)}</small>)}
      {formErr && <small style={{ color: '#c0392b' }}>{formErr}</small>}
      </div>
    )}

    {step === 'time' && (
      <div style={{ display: 'grid', gap: 10 }}>
      <SlotPicker delivery={delivery} label={delivery ? s.deliveryAt : s.pickupAt} value={pickup} onChange={setPickup} date={slotDateIntent} onDateChange={setSlotDate} shop={data?.shop} lang={lang} s={s} />
      </div>
    )}

    {step === 'pay' && (<>
      <div style={{ display: 'grid', gap: 10 }}>
      <input style={inputStyle} placeholder={s.name} autoComplete="name" maxLength={80} value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
      <div style={{ display: 'flex', gap: 8 }}>
        <CountryPicker value={customer.iso || 'MX'} lang={lang} label={s.country} onChange={(iso) => setCustomer({ ...customer, iso })} />
        <input style={{ ...inputStyle, flex: 1, minWidth: 0 }} placeholder={phoneLen ? s.phone10 : s.phone} autoComplete="tel-national" inputMode="numeric"
          maxLength={phoneLen || 12} value={customer.phone}
          onChange={(e) => setCustomer({ ...customer, phone: e.target.value.replace(/\D/g, '').slice(0, phoneLen || 12) })} />
      </div>
      {phoneBad && <small style={{ color: '#c0392b' }}>{s.phoneDigits.replace('{n}', phoneLen || '6–12')}</small>}
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
    {pay === 'transfer' && !shipping && <TransferDetails payments={data.shop?.payments} lang={lang} />}
    {pay === 'cash' && !shipping && (
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
    <p style={{ color: '#666', fontSize: '0.9rem' }}>{shipping ? s.shippingPending : pay ? s.payNote[pay][delivery ? 1 : 0] : delivery ? s.payOnDelivery : s.payAtPickup}</p>
    </>)}
    </div>

    {delivery && (
      <div style={{ display: 'flex', justifyContent: 'space-between', margin: '12px 0 0' }}><span>{s.deliveryFee}</span><span>{shipping ? s.pendingPrice : quote?.kind === 'delivery' ? fmt(quotedFee) : '—'}</span></div>
    )}
    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1.1rem', margin: '12px 0' }}><span>{shipping ? s.subtotal : s.total}</span><span>{fmt(grand)}</span></div>
    {step === 'location' && stepBlock && <small style={{ color: '#888', display: 'block', marginBottom: 8 }}>{(customer.address || '').trim().length < 5 ? s.invalid_address : customer.lat == null ? s.pinRequired : quote?.kind === 'unavailable' ? s.areaUnavailable : quote?.kind === 'error' ? s.quoteError : s.quoteChecking}</small>}
    {step === 'time' && slotStatus !== 'valid' && <small style={{ color: '#c0392b', display: 'block', marginBottom: 8 }}>{slotHint(slotStatus, slotNow)}</small>}
    {step === 'time' && formErr && <small style={{ color: '#c0392b', display: 'block', marginBottom: 8 }}>{formErr}</small>}
    {step === 'pay' && slotStatus !== 'valid' && <small style={{ color: '#c0392b', display: 'block', marginBottom: 8 }}>{slotHint(slotStatus, slotNow)}</small>}
    {step === 'pay' && formErr && <p style={{ color: '#c0392b', fontWeight: 600 }}>{formErr}</p>}
    <div style={{ display: 'flex', gap: 8 }}>
      {stepIdx > 0 && <button type="button" disabled={sending} onClick={() => go(stepIdx - 1)} style={backBtn}>{s.back}</button>}
      {step !== 'pay' ? (
        <button type="button" disabled={stepBlock} onClick={() => go(stepIdx + 1)} style={{ ...nextBtn, opacity: stepBlock ? 0.6 : 1 }}>{s.next}</button>
      ) : (
        <button type="button" disabled={sending || cart.length === 0 || stepBlock} onClick={() => submit(Date.now())} style={{ ...nextBtn, opacity: sending || cart.length === 0 || stepBlock ? 0.6 : 1 }}>
          {sending ? <><Spinner /> {s.sending}</> : s.send}
        </button>
      )}
    </div>
    {step === 'pay' && legal?.privacy && legal?.terms && (
      <p style={{ color: '#888', fontSize: '0.8rem', margin: '10px 0 0' }}>
        {s.legalA}<LegalLinks client={client} lang={lang} only="privacy" />{s.legalB}<LegalLinks client={client} lang={lang} only="terms" />.
      </p>
    )}
    {step === 'cart' && <button type="button" onClick={forget} style={{ background: 'none', border: 'none', color: '#888', marginTop: 12, textDecoration: 'underline', cursor: 'pointer' }}>{s.forget}</button>}
    </>
  );

  const menuCol = (
    <div style={{ minWidth: 0 }}>
      {banner}
      {last && !gate && !checkingOut && (
        <div style={{ padding: '12px 16px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={repeatLast} style={{ ...inputStyle, width: 'auto', cursor: 'pointer', fontWeight: 700, color: brand, border: `1px solid ${brand}` }}>{s.repeat}</button>
          <a href={`/order/track/${last.token}${window.location.search}`} style={{ alignSelf: 'center', color: brand, fontWeight: 700 }}>{s.pastOrders}</a>
        </div>
      )}

      <OrderDesignView data={data} lang={lang} brand={brand} gate={gate} onSelectItem={onAdd}
        catalog={categories.length ? <OrderCatalog categories={categories} active={active} setActiveCat={setActiveCat} wide={wide} brand={brand} gate={gate} s={s} fmt={fmt} onAdd={onAdd} /> : <div style={{ padding: 32, textAlign: 'center' }}>{s.noMenu}</div>} />
    </div>
  );

  return (
    <Page client={client} lang={lang} bottomPad={!wide && !gate && count > 0 && !checkingOut ? 96 : 16}>
      {header}
      {wide && !gate ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 24, maxWidth: 1200, width: '100%', boxSizing: 'border-box', margin: '0 auto', padding: '0 24px', alignItems: 'start' }}>
          {menuCol}
          <aside ref={asideRef} style={{ position: 'sticky', top: 16, marginTop: 16, maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', background: 'white', borderRadius: 16, padding: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
            {cartBody}
          </aside>
        </div>
      ) : menuCol}

      {!wide && !gate && count > 0 && !checkingOut && (
        <button type="button" className="tp-up" onClick={() => setCheckingOut(true)}
          style={{ position: 'fixed', left: 16, right: 16, bottom: 16, background: brand, color: 'white', border: 'none', borderRadius: 14, padding: 16, fontWeight: 800, fontSize: '1.05rem', cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,0.25)' }}>
          {s.cart} ({count}) · {fmt(total)}
        </button>
      )}

      {picking && !gate && (
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

      {!wide && !gate && checkingOut && <Sheet onClose={() => setCheckingOut(false)}>{cartBody}</Sheet>}
    </Page>
  );
}

// Read-only banner: why orders are off, when we open next, and the store hours by day.
function GateBanner({ s, gate, shop }) {
  const tz = shop?.timezone || 'America/Mexico_City';
  let text = gate === 'online_orders_paused' ? s.paused : gate === 'online_orders_closed' ? s.closed : s.notOpen;
  const lines = gate === 'online_orders_closed' ? formatHours(shop?.open_hours, s.dayNames, s.allDays) : [];
  if (gate === 'online_orders_closed' && !isOpenNow(shop?.open_hours, { tz })) {
    const n = nextOpening(shop?.open_hours, { tz });
    if (n) text += ' · ' + s.opensAt.replace('{when}', `${n.dayOffset === 0 ? s.today : n.dayOffset === 1 ? s.tomorrow : s.dayNames[n.dow]} ${n.time}`);
  }
  return (
    <div role="status" style={{ margin: '12px 16px 0', padding: '14px 16px', borderRadius: 12, background: '#fff4e5', border: '1px solid #f5d9a8', color: '#5a3b00' }}>
      <div style={{ fontWeight: 800 }}>{text}</div>
      {lines.length > 0 && (
        <details open style={{ marginTop: 6 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{s.hoursTitle}</summary>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{lines.map((l) => <li key={l}>{l}</li>)}</ul>
        </details>
      )}
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
function SlotPicker({ label, value, onChange, date, onDateChange, shop, lang, s, delivery }) {
  const ref = useRef(null);
  const tz = shop?.timezone || 'America/Mexico_City';
  const locale = lang === 'en' ? 'en-US' : 'es-MX';
  const rules = shop?.slots?.enabled ? slotRules(shop.slots, shop.schedule) : null;
  const ctx = { tz, slots: shop?.slots, schedule: shop?.schedule };
  // Clock read on open (not during render); the time list is refreshed each time the calendar opens.
  const [now, setNow] = useState(() => Date.now());
  const minDate = toLocalInput(now, tz).slice(0, 10);
  const maxDate = toLocalInput(now + (rules?.daysAhead ?? 14) * 86400000, tz).slice(0, 10);
  const times = date ? timesFor(date, { ...ctx, now }) : [];
  const time = value ? toLocalInput(Date.parse(value), tz).slice(11) : '';

  const asap = asapOk(ctx);
  // ASAP isn't served right now: preselect the first available slot (the customer can still change it).
  const [auto, setAuto] = useState(null);
  useEffect(() => {
    const selectedAt = now;
    if (value || date || asapOk({ ...ctx, now: selectedAt })) return;
    const ms = firstSlot({ ...ctx, now: selectedAt });
    if (ms == null) return;
    const iso = new Date(ms).toISOString();
    onDateChange(toLocalInput(ms, tz).slice(0, 10)); setAuto({ iso, today: autoSlotIsToday(ms, selectedAt, tz) }); onChange(iso);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const open = () => { setNow(Date.now()); const el = ref.current; try { el.showPicker(); } catch { el.focus(); el.click(); } };
  const pickDate = (e) => { if (!e.target.value) return; setAuto(null); setNow(Date.now()); onDateChange(e.target.value); onChange(''); };
  const pickTime = (e) => { setAuto(null); onChange(e.target.value ? new Date(fromLocalInput(`${date}T${e.target.value}`, tz)).toISOString() : ''); };
  const clear = () => { setAuto(null); onDateChange(''); onChange(''); };
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
      <input ref={ref} type="date" tabIndex={-1} aria-hidden="true" value={date} min={minDate} max={maxDate} onChange={pickDate}
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
      {auto && value === auto.iso && (
        <small style={{ color: '#a05a00', display: 'block', marginTop: 6 }}>
          {(auto.today ? (delivery ? s.upcomingSlot : s.upcomingSlotPickup) : (delivery ? s.noMoreSlots : s.noMoreSlotsPickup)).replace('{when}', `${fmtDate(date)}, ${fmtTime(time)}`)}
        </small>
      )}
    </div>
  );
}

function Sheet({ children, onClose }) {
  return (
    <div onClick={onClose} className="tp-dim" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 20, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} className="tp-up" style={{ background: 'white', width: '100%', maxWidth: 520, maxHeight: '90dvh', overflowY: 'auto', borderRadius: '18px 18px 0 0', padding: 20, boxSizing: 'border-box' }}>
        {children}
      </div>
    </div>
  );
}

const STEPS = ['requested', 'accepted', 'preparing', 'ready', 'completed'];
const DELIVERY_STEPS = ['requested', 'accepted', 'preparing', 'ready', 'on_delivery', 'completed'];
const STEP_ICON = {
  quote_pending: 'lucide:message-circle',
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
  const prevStatus = useRef(null);
  const [paying, setPaying] = useState(false);
  const [payErr, setPayErr] = useState('');
  // 1s clock for the Clip countdown; only ticks while a deadline is on screen.
  const [now, setNow] = useState(() => Date.now());
  const counting = order?.payment_method === 'clip' && order.payment_status !== 'paid' && !!order.pay_by;
  useEffect(() => {
    if (!counting) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [counting]);
  const s = STR[lang] || STR.es;

  // Shop info (logo/name/brand) changes rarely: fetch once, not on every poll.
  useEffect(() => {
    let cancelled = false;
    fetchOrderMenu(client).then(({ data }) => { if (!cancelled && data?.shop) { setShop(data.shop); setMenu(data); } });
    return () => { cancelled = true; };
  }, [client]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      setPolling(true);
      const { data } = await client.rpc('get_order_status', { p_token: token });
      if (cancelled) return;
      setPolling(false);
      // Clip: buzz when the pay button appears (accepted while the customer waits).
      if (data?.payment_method === 'clip' && data.status === 'accepted' && prevStatus.current === 'requested') navigator.vibrate?.([200, 100, 200]);
      prevStatus.current = data?.status;
      setOrder(data?.found ? data : null);
      const done = !data?.found || ['completed', 'rejected'].includes(data.status);
      if (!done) timer.current = setTimeout(poll, 8000);
    };
    poll();
    return () => { cancelled = true; clearTimeout(timer.current); };
  }, [client, token]);

  // Auto-scroll ~30px/s; pauses while touched/hovered and for 2s after, so a swipe isn't fought.
  const marqueeRef = useRef(null);
  useEffect(() => {
    const el = marqueeRef.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf, last = performance.now(), holdUntil = 0, pos = el.scrollLeft;
    const hold = () => { holdUntil = performance.now() + 2000; };
    const evs = ['pointerdown', 'touchstart', 'wheel', 'mouseenter', 'mousemove'];
    evs.forEach((e) => el.addEventListener(e, hold, { passive: true }));
    const tick = (now) => {
      const half = el.scrollWidth / 2;
      if (now < holdUntil) pos = el.scrollLeft;
      else pos += (now - last) * 0.03;
      if (half > 0 && pos >= half) pos -= half;
      if (half > 0 && pos <= 0 && now < holdUntil && el.scrollLeft <= 0) pos = half; // swiped back past the start
      if (now >= holdUntil || Math.abs(el.scrollLeft - pos) > 1) el.scrollLeft = pos;
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); evs.forEach((e) => el.removeEventListener(e, hold)); };
  }, [shop, menu, order]); // strip mounts once the order + menu are in
  if (order === undefined) return <Loading text={s.loading} />;
  const back = <a href={`/order${window.location.search}`} style={{ color: '#555' }}>{s.backToMenu}</a>;
  if (order === null) return <div style={centerStyle}><div><p>{s.notFound}</p>{back}</div></div>;

  const brand = shop?.brand_color || '#f28b05';
  const rejected = order.status === 'rejected';
  const isDelivery = order.order_type === 'delivery';
  const isShipping = order.order_type === 'shipping';
  const steps = isDelivery ? DELIVERY_STEPS : isShipping ? ['quote_pending', ...STEPS] : STEPS;
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
  // Clip link is created on tap, from the current server total (staff may have edited the order).
  const payClip = async () => {
    setPaying(true); setPayErr('');
    const { data, error } = await client.functions.invoke('clip-checkout', { body: { token, return_url: window.location.href } });
    if (!error && data?.url) return window.location.assign(data.url);
    setPaying(false);
    setPayErr(s.clipError);
  };
  const label = (st) => isShipping && st === 'ready' ? s.shippingReady
    : isShipping && st === 'completed' ? s.shippingDone
      : (isDelivery && (st === 'ready' || st === 'completed') ? (st === 'ready' ? s.st_ready_delivery : s.st_delivered) : s[`st_${st}`]);
  return (
    <Page client={client} lang={lang}>
      <style>{'.tp-marquee{scrollbar-width:none}.tp-marquee::-webkit-scrollbar{display:none}'}</style>
      <ShopHeader shop={shop || { brand_color: brand }} lang={lang} setLang={setLang} />
      <div style={{ maxWidth: 480, width: '100%', boxSizing: 'border-box', margin: '0 auto', padding: 24 }}>
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
        {order.status === 'quote_pending' && <p style={{ color: '#666' }}>{s.shippingPending}</p>}
        {order.payment_method && (
          <div style={{ marginTop: 16, padding: 12, borderRadius: 12, background: '#f5f5f5' }}>
            <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><Icon icon={PAY_ICON[order.payment_method]} width="20" />{s.payLabel}: {s[`pay_${order.payment_method}`]}</div>
            {order.payment_method === 'cash' && order.cash_amount_cents != null && <div style={{ marginTop: 6, fontSize: '0.9rem' }}>{s.cashPaysWith}: {formatForDisplay(order.cash_amount_cents, lang)} · {s.cashChange}: {formatForDisplay(order.cash_amount_cents - order.total_cents, lang)}</div>}
            {order.payment_method === 'transfer' && !(isShipping && order.shipping_quote_cents == null) && <TransferDetails payments={shop?.payments} lang={lang} />}
            {order.payment_method === 'clip' && !rejected && (order.payment_status === 'paid'
              ? <div style={{ marginTop: 8, color: '#27ae60', fontWeight: 800 }}>{s.clipPaid}</div>
              : ['requested', 'quote_pending'].includes(order.status)
                ? <div style={{ marginTop: 6, fontSize: '0.9rem' }}>{s.clipWait}</div>
                : order.pay_by && Date.parse(order.pay_by) <= now
                  ? <div style={{ marginTop: 6, color: '#c0392b' }}>{s.clipExpired}</div>
                  : (
                    <div style={{ marginTop: 8 }}>
                      <button type="button" disabled={paying} onClick={payClip}
                        style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: brand, color: 'white', fontWeight: 800, fontSize: '1.1rem', cursor: 'pointer' }}>
                        {paying ? '…' : `${s.payNow} · ${formatForDisplay(order.total_cents, lang)}`}
                      </button>
                      {order.pay_by && (() => {
                        const left = Math.max(0, Math.ceil((Date.parse(order.pay_by) - now) / 1000));
                        return (
                          <div role="timer" aria-live="off" style={{ marginTop: 10, textAlign: 'center' }}>
                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: left < 120 ? '#c0392b' : 'inherit' }}>
                              {s.payIn} {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#666' }}>{s.payBy} {new Date(order.pay_by).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })}</div>
                          </div>
                        );
                      })()}
                      <div style={{ marginTop: 4, fontSize: '0.85rem', color: '#666' }}>{s.clipHeld}</div>
                      {payErr && <div style={{ marginTop: 6, color: '#c0392b' }}>{payErr}</div>}
                    </div>
                  ))}
          </div>
        )}
        <OrderTicket style={{ marginTop: 16 }} items={order.items} deliveryFeeCents={order.delivery_fee_cents} pendingShipping={isShipping && order.shipping_quote_cents == null}
          totalCents={order.total_cents} showIva={!!order.show_iva} taxRate={order.tax_rate || 16} lang={lang} />
        {picks.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h3 style={{ margin: '0 0 8px' }}>{s.mightLike}</h3>
            {/* Infinite marquee: a real scroll row (swipeable) rendered twice; JS nudges scrollLeft and wraps by one copy.
                Short lists repeat to fill the strip; reduced-motion users get a static, scrollable row. */}
            <div className="tp-marquee" ref={marqueeRef} style={{ overflowX: 'auto', paddingBottom: 6 }}>
              <div style={{ display: 'flex', width: 'max-content' }}>
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
    </Page>
  );
}

export default PublicOrder;
