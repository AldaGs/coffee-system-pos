import { useEffect, useState } from 'react';
import { CALLING_CODES, exactLength } from '../../utils/callingCodes';
import { timesFor, toLocalInput, checkoutSlotStatus, deliverySlotCap } from '../../utils/pickupSlots';
import { PAY_METHODS } from './strings';
import { cashChips, cashOk } from './orderMath';
import { CUSTOMER_KEY, DRAFT_KEY, HISTORY_KEY, MAX_HISTORY, errCode, readJson, releaseTracker, removeKey, writeJson } from './shared';

// Customer phone: country (ISO, Mexico default) + local digits only; stored as calling code + digits.
const fullPhone = (iso, phone) => (CALLING_CODES[iso] || '52') + String(phone || '').replace(/\D/g, '');

const EMPTY_CUSTOMER = { name: '', phone: '', address: '', lat: null, lng: null };

// Checkout wizard state: customer details, delivery quote, time slot, payment, and submit.
export function useCheckout({ client, data, feeCents, cartApi, draft, history, setHistory, track, trackOnce, s }) {
  const { cart, total } = cartApi;
  const [stepId, setStepId] = useState('cart');
  const [customer, setCustomer] = useState(() => {
    const c = { ...EMPTY_CUSTOMER, ...readJson(CUSTOMER_KEY, {}), ...draft.customer };
    // Older saved phones may hold spaces/dashes or a leading 52: keep the local 10 digits.
    const d = String(c.phone || '').replace(/\D/g, '');
    return { ...c, phone: !c.iso && d.length === 12 && d.startsWith('52') ? d.slice(2) : d };
  });
  const [notes, setNotes] = useState(draft.notes || '');
  const [pickup, setPickup] = useState(() => (/Z$/.test(draft.pickup || '') && Date.parse(draft.pickup) > Date.now() ? draft.pickup : ''));
  const [slotDate, setSlotDate] = useState(''); // Keeps a chosen day distinct from ASAP until a time is picked.
  const [slotNow, setSlotNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setSlotNow(Date.now()), 30000); return () => clearInterval(id); }, []);
  const [quote, setQuote] = useState(null);
  const [quoteRevision, setQuoteRevision] = useState(0);
  const [orderType, setOrderType] = useState(draft.orderType || 'pickup');
  const [payment, setPayment] = useState(draft.payment || '');
  const [cash, setCash] = useState(draft.cash || ''); // pesos typed by the customer ("pays with")
  const [sending, setSending] = useState(false);
  const [formErr, setFormErr] = useState(null);

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

  // One local delivery per slot: slots that already hold a delivery are hidden. Refreshed with
  // the slot clock (30s) and after a 'slot_taken' rejection; the server trigger has the final say.
  const capOn = deliverySlotCap(data?.shop?.slots) && orderType === 'delivery';
  const [taken, setTaken] = useState(() => new Set());
  const [takenRevision, setTakenRevision] = useState(0);
  useEffect(() => {
    if (!capOn) return undefined;
    let cancelled = false;
    client.rpc('get_taken_delivery_slots').then(({ data: rows, error }) => {
      if (!cancelled && !error) setTaken(new Set((rows || []).map((t) => Date.parse(t))));
    });
    return () => { cancelled = true; };
  }, [client, capOn, slotNow, takenRevision]);

  // Offered methods (default all); a lone method is preselected.
  const offered = PAY_METHODS.filter((m) => (data?.shop?.payments?.methods?.length ? data.shop.payments.methods : PAY_METHODS).includes(m));
  const pay = offered.includes(payment) ? payment : offered.length === 1 ? offered[0] : '';
  const delivery = orderType === 'delivery' && feeCents != null;
  const shipping = delivery && quote?.kind === 'shipping';
  const quotedFee = delivery && quote?.kind === 'delivery' ? quote.fee_cents : 0;
  const grand = total + quotedFee;
  const cashCents = pay === 'cash' && !shipping && cash !== '' ? Math.round(parseFloat(cash) * 100) : null;
  const cashBad = cashCents != null && !cashOk(cashCents, grand);

  // Phone: exactly 10 digits for Mexico/+1, else 6–12 (digits only; the input strips the rest).
  const phoneLen = exactLength(customer.iso || 'MX');
  const phoneDigits = String(customer.phone || '').replace(/\D/g, '');
  const phoneOk = phoneLen ? phoneDigits.length === phoneLen : phoneDigits.length >= 6 && phoneDigits.length <= 12;
  const phoneBad = phoneDigits.length > 0 && !phoneOk;

  const tz = data?.shop?.timezone || 'America/Mexico_City';
  const slotDateIntent = slotDate || (pickup ? toLocalInput(Date.parse(pickup), tz).slice(0, 10) : '');
  // Shipping (quote kind 'shipping') is stored as its own order type, so the cap is local delivery only.
  const slotCap = capOn && delivery && !shipping ? { taken, noAsap: true } : {};
  const slotContext = { tz, slots: data?.shop?.slots, schedule: data?.shop?.schedule, ...slotCap };
  const slotStatus = checkoutSlotStatus({ value: pickup, selectedDate: slotDateIntent, now: slotNow, ...slotContext });
  const slotHint = (status, at) => status === 'missing-time'
    ? timesFor(slotDateIntent, { ...slotContext, now: at }).length ? s.chooseTime : s.noTimes
    : status === 'asap-unavailable' ? s.pickup_required : s.invalid_pickup;

  // Checkout wizard: items + type + notes -> location (delivery only) -> date/time -> details + payment.
  // Earlier steps stay reachable (Back / step dots) until the order is sent.
  const steps = ['cart', ...(delivery ? ['location'] : []), 'time', 'pay'];
  const stepIdx = Math.max(steps.indexOf(stepId), 0);
  const step = steps[stepIdx];
  const locationBlocked = (customer.address || '').trim().length < 5 || customer.lat == null || customer.lng == null || !['delivery', 'shipping'].includes(quote?.kind);
  const stepBlock = { cart: cart.length === 0, location: locationBlocked, time: slotStatus !== 'valid', pay: delivery && locationBlocked || slotStatus !== 'valid' }[step];
  const go = (i) => {
    setFormErr(null); setStepId(steps[i]);
    if (i > 0) { trackOnce('checkout_start'); trackOnce('checkout_step', { detail: steps[i] }); }
  };

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
    if (err) {
      const c = errCode(err); track('order_error', { detail: c || 'unknown' }); setFormErr(s[c] || (c && c.startsWith('online_orders') ? s.notOpen : s.generic));
      if (c === 'quote_changed') { setQuoteRevision((n) => n + 1); setStepId('location'); }
      if (c === 'slot_taken') { setTakenRevision((n) => n + 1); setPickup(''); setStepId('time'); }
      return;
    }
    track('order_placed', { detail: delivery ? 'delivery' : 'pickup' });
    releaseTracker(client);
    writeJson(CUSTOMER_KEY, { name: customer.name, phone: customer.phone, iso: customer.iso || 'MX', address: customer.address || '', lat: customer.lat ?? null, lng: customer.lng ?? null });
    removeKey(DRAFT_KEY);
    writeJson(HISTORY_KEY, [{ token, total_cents: grand, items: cart.map((l) => ({ id: l.id, qty: l.qty, mods: l.mods })) }, ...history].slice(0, MAX_HISTORY));
    window.location.assign(`/order/track/${token}${window.location.search}`);
  };

  const forget = () => {
    removeKey(CUSTOMER_KEY); removeKey(HISTORY_KEY); removeKey(DRAFT_KEY);
    setCustomer(EMPTY_CUSTOMER); setHistory([]);
    setFormErr(s.forgot);
  };

  return {
    customer, setCustomer, notes, setNotes, pickup, setPickup, setSlotDate, slotDateIntent, slotNow, slotCap, slotStatus, slotHint,
    quote, orderType, setOrderType, payment, setPayment, cash, setCash, sending, formErr,
    offered, pay, delivery, shipping, quotedFee, grand, cashCents, cashBad, cashChips: cashChips(grand), phoneLen, phoneBad,
    steps, stepIdx, step, stepBlock, setStepId, go, submit, forget,
  };
}
