import { useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import { formatForDisplay } from '../../utils/moneyUtils';
import OrderTicket from '../OrderTicket';
import TransferDetails from '../TransferDetails';
import { STR, PAY_ICON } from './strings';
import { DRAFT_KEY, TRACKING_BASE, centerStyle, menuColors, orderMenu, readJson, visibleCategories, writeJson } from './shared';
import { Loading, Page, ShopHeader } from './ui';

const STEPS = ['requested', 'accepted', 'preparing', 'ready', 'completed'];
const DELIVERY_STEPS = ['requested', 'accepted', 'preparing', 'ready', 'on_delivery', 'completed'];
const STEP_ICON = {
  quote_pending: 'lucide:message-circle',
  requested: 'lucide:clipboard-list', accepted: 'lucide:check-circle', paid: 'lucide:credit-card', preparing: 'lucide:chef-hat',
  ready: 'lucide:shopping-bag', on_delivery: 'lucide:bike', completed: 'lucide:party-popper',
};
const STEP_ICON_DELIVERY = { ready: 'lucide:package-check', completed: 'lucide:house' };

export default function Track({ client, token, lang, setLang }) {
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
    orderMenu(client).then(({ data }) => { if (!cancelled && data?.shop) { setShop(data.shop); setMenu(data); } });
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
  const [allSteps, setAllSteps] = useState(false);
  if (order === undefined) return <Loading text={s.loading} />;
  const back = <a href={`/order${window.location.search}`} style={{ color: '#555' }}>{s.backToMenu}</a>;
  if (order === null) return <div style={centerStyle}><div><p>{s.notFound}</p>{back}</div></div>;

  const colors = menu ? menuColors(menu) : null;
  const brand = colors?.accent || shop?.brand_color || '#f28b05';
  const rejected = order.status === 'rejected';
  const isDelivery = order.order_type === 'delivery';
  const isShipping = order.order_type === 'shipping';
  const baseSteps = isDelivery ? DELIVERY_STEPS : isShipping ? ['quote_pending', ...STEPS] : STEPS;
  // Clip orders get a "paid" step right after accepted.
  const isClip = order.payment_method === 'clip';
  const steps = isClip ? baseSteps.flatMap((st) => (st === 'accepted' ? [st, 'paid'] : [st])) : baseSteps;
  // Accepted is done the moment it happens; the spinner moves on to the next step
  // ("paid" while a Clip order waits on payment, else "preparing").
  const idx = steps.indexOf(order.status) + (order.status === 'accepted' ? (isClip && order.payment_status === 'paid' ? 2 : 1) : 0);
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
  // Links to the tinylogistics tracking page and the CFDI portal, keyed by this shop's project ref.
  const ref = new URL(client.supabaseUrl).hostname.split('.')[0];
  const linkBtn = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 12, border: `2px solid ${brand}`, color: brand, fontWeight: 700, textDecoration: 'none' };
  const label = (st) => isShipping && st === 'ready' ? s.shippingReady
    : isShipping && st === 'completed' ? s.shippingDone
      : (isDelivery && (st === 'ready' || st === 'completed') ? (st === 'ready' ? s.st_ready_delivery : s.st_delivered) : s[`st_${st}`]);
  return (
    <Page client={client} lang={lang} colors={colors}>
      <style>{'.tp-marquee{scrollbar-width:none}.tp-marquee::-webkit-scrollbar{display:none}'}</style>
      <ShopHeader shop={{ ...shop, brand_color: brand, home_url: colors?.homeUrl, logo: colors?.logoUrl || shop?.logo, hide_title: colors?.hideTitle }} lang={lang} setLang={setLang} />
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
              if (!allSteps && i !== Math.min(Math.max(idx, 0), steps.length - 1)) return null;
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
        {!rejected && <button type="button" onClick={() => setAllSteps((v) => !v)} style={{ background: 'none', border: 'none', padding: 0, color: brand, fontWeight: 600, cursor: 'pointer' }}>{allSteps ? s.hideSteps : s.showSteps}</button>}
        {order.tracking_token && (<>
          <p style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#666', marginBottom: 8 }}><Icon icon="lucide:arrow-down" width="18" style={{ color: brand }} />{s.shipTrackHint}</p>
          <a href={`${TRACKING_BASE}/tracking?p=${ref}&id=${encodeURIComponent(order.tracking_token)}`} target="_blank" rel="noopener noreferrer" style={linkBtn}><Icon icon="lucide:truck" width="20" />{s.shipTrack}</a>
        </>)}
        {order.status === 'requested' && <p style={{ color: '#666' }}>{s.waiting}</p>}
        {order.status === 'quote_pending' && <p style={{ color: '#666' }}>{s.shippingPending}</p>}
        {order.payment_method && (
          <div style={{ marginTop: 16, padding: 12, borderRadius: 12, background: '#f5f5f5', color: '#222' }}>
            <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><Icon icon={PAY_ICON[order.payment_method]} width="20" />{s.payLabel}: {s[`pay_${order.payment_method}`]}</div>
            {order.payment_method === 'cash' && order.cash_amount_cents != null && <div style={{ marginTop: 6, fontSize: '0.9rem' }}>{s.cashPaysWith}: {formatForDisplay(order.cash_amount_cents, lang)} · {s.cashChange}: {formatForDisplay(order.cash_amount_cents - order.total_cents, lang)}</div>}
            {order.payment_method === 'transfer' && order.status !== 'completed' && order.payment_status !== 'paid' && !(isShipping && order.shipping_quote_cents == null) && <TransferDetails payments={shop?.payments} lang={lang} />}
            {order.payment_method === 'clip' && !rejected && order.payment_status !== 'paid' && (['requested', 'quote_pending'].includes(order.status)
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
        {order.cfdi_ref && (
          <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
            {order.cfdi_ref && <a href={`/cfdi/${encodeURIComponent(order.cfdi_ref)}?p=${ref}`} style={linkBtn}><Icon icon="lucide:file-text" width="20" />{s.cfdiRequest}</a>}
          </div>
        )}
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
