import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { formatForDisplay } from '../../utils/moneyUtils';
import { useLegal } from '../../hooks/useLegal';
import { STR } from './strings';
import { DRAFT_KEY, HISTORY_KEY, centerStyle, inputStyle, menuColors, onceFor, readJson, releaseTracker, trackerFor, useWide, writeJson } from './shared';
import { lineKey } from './orderMath';
import { useOrderMenu, useDeepLinkAdd } from './orderHooks';
import { useCart } from './useCart';
import { useCheckout } from './useCheckout';
import { Loading, Page, Sheet, ShopHeader } from './ui';
import GateBanner from './GateBanner';
import CheckoutPanel from './CheckoutPanel';

function ModifierSheet({ picking, groups, brand, fmt, s, onToggle, onConfirm, onClose }) {
  return (
    <Sheet onClose={onClose}>
      <h3 style={{ marginTop: 0 }}>{picking.item.name}</h3>
      {(picking.item.modifier_group_ids || []).map((gid) => groups.get(gid)).filter(Boolean).map((g) => (
        <div key={g.id} style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: brand, textTransform: 'uppercase', fontSize: '0.8rem' }}>{g.name}</div>
          {g.options.map((o) => (
            <label key={o.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0' }}>
              <input type={g.allow_multiple ? 'checkbox' : 'radio'} name={g.id} checked={picking.mods.includes(o.id)} onChange={() => onToggle(g, o.id)} />
              <span style={{ flex: 1 }}>{o.name}</span>
              {!!o.price_delta_cents && <span style={{ color: '#666' }}>+{fmt(o.price_delta_cents)}</span>}
            </label>
          ))}
        </div>
      ))}
      <button type="button" onClick={onConfirm}
        style={{ width: '100%', background: brand, color: 'white', border: 'none', borderRadius: 12, padding: 14, fontWeight: 800, cursor: 'pointer' }}>{s.addToCart}</button>
    </Sheet>
  );
}

function ItemList({ items, wide, gate, brand, fmt, s, onAdd }) {
  return (
    <ul style={wide
      ? { listStyle: 'none', margin: 0, padding: '16px 0 32px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }
      : { listStyle: 'none', margin: 0, padding: '8px 16px 16px' }}>
      {items.map((it) => {
        const out = it.available === false || it.price_type !== 'fixed';
        return (
          <li key={it.id} style={{ display: 'flex', gap: 12, alignItems: 'center', opacity: out ? 0.5 : 1,
            ...(wide ? { background: 'white', color: '#222', borderRadius: 14, padding: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.05)' } : { padding: '14px 0', borderBottom: '1px solid #eee' }) }}>
            {it.image_url ? <img src={it.image_url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10 }} /> : <span style={{ fontSize: '1.6rem' }}>{it.emoji}</span>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{it.name}</div>
              <div style={{ color: '#666' }}>{out && it.available === false ? s.soldOut : fmt(it.price_cents)}</div>
            </div>
            {!out && !gate && <button type="button" onClick={() => onAdd(it)} style={{ background: brand, color: 'white', border: 'none', borderRadius: 10, padding: '10px 16px', fontWeight: 800, cursor: 'pointer' }}>{s.add}</button>}
          </li>
        );
      })}
    </ul>
  );
}

export default function Order({ client, lang, setLang }) {
  const s = STR[lang] || STR.es;
  const draft = useMemo(() => readJson(DRAFT_KEY, {}), []);
  const [checkingOut, setCheckingOut] = useState(false);
  const [history, setHistory] = useState(() => readJson(HISTORY_KEY, []));
  const legal = useLegal(client); // consent line only when the shop wrote both texts
  const wide = useWide();
  const asideRef = useRef(null);

  // Cookieless visit analytics (see utils/pageTracker.js). `once` keeps
  // per-visit milestones (checkout start, each step) from counting twice.
  useEffect(() => () => releaseTracker(client), [client]);
  const track = (event, extra) => trackerFor(client).track(event, extra);
  const trackOnce = (event, extra) => {
    const seen = onceFor(client);
    const k = `${event}:${extra?.detail ?? ''}`;
    if (seen.has(k)) return;
    seen.add(k);
    track(event, extra);
  };

  const { data, gate, loadErr, activeCat, setActiveCat, feeCents } = useOrderMenu(client, setLang);
  const cartApi = useCart({ data, draft, track });
  const co = useCheckout({ client, data, feeCents, cartApi, draft, history, setHistory, track, trackOnce, s });
  const { deepOpen, pickerClosed } = useDeepLinkAdd({ data, gate, cartApi, track });
  const { cart, setCart, picking, setPicking, count, total } = cartApi;

  useEffect(() => {
    writeJson(DRAFT_KEY, { cart, customer: co.customer, notes: co.notes, pickup: co.pickup, orderType: co.orderType, payment: co.payment, cash: co.cash });
  }, [cart, co.customer, co.notes, co.pickup, co.orderType, co.payment, co.cash]);

  // Each deep-link bump opens the basket. Mobile: the checkout sheet (cart step).
  // Desktop: scroll to the side cart once it has rendered (returns that timer).
  const openBasket = useEffectEvent(() => {
    if (!wide) { co.setStepId('cart'); setCheckingOut(true); return null; }
    return setTimeout(() => asideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  });
  useEffect(() => {
    if (!deepOpen) return undefined;
    const id = openBasket();
    return () => clearTimeout(id);
  }, [deepOpen]);

  if (loadErr) return <div style={centerStyle}>{loadErr}</div>;
  if (!data) return <Loading text={s.loading} />;

  const colors = menuColors(data);
  const brand = colors.accent;
  const categories = (data.categories || []).filter((c) => c.items.length > 0);
  const active = categories.find((c) => c.id === activeCat) || categories[0];
  const fmt = (c) => formatForDisplay(c, lang);

  const openCart = () => (wide ? asideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) : setCheckingOut(true));
  const header = <ShopHeader shop={{ ...data.shop, brand_color: brand, home_url: colors.homeUrl, logo: colors.logoUrl || data.shop?.logo, hide_title: colors.hideTitle }} lang={lang} setLang={setLang} cartCount={count} onCart={gate ? null : openCart} cartLabel={s.cart} />;
  if (categories.length === 0) return <Page client={client} lang={lang} colors={colors}>{header}<div style={{ padding: 32, textAlign: 'center' }}>{s.noMenu}</div></Page>;

  const last = history[0];
  const repeatLast = () => {
    if (!last) return;
    const lines = last.items.filter((l) => cartApi.itemsById.get(l.id)?.available !== false && cartApi.itemsById.has(l.id));
    setCart(lines.map((l) => ({ key: lineKey(l.id, l.mods), id: l.id, qty: l.qty, mods: l.mods })));
    setCheckingOut(true);
  };

  const cartBody = <CheckoutPanel co={co} cartApi={cartApi} feeCents={feeCents} shop={data.shop} client={client} legal={legal} lang={lang} s={s} brand={brand} fmt={fmt} />;

  const menuCol = (
    <div style={{ minWidth: 0 }}>
      {/* Not taking orders (closed / paused / disabled): same menu, read-only, with a banner on top. */}
      {gate && <GateBanner s={s} gate={gate} shop={data.shop} />}
      {last && !gate && !checkingOut && (
        <div style={{ padding: '12px 16px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={repeatLast} style={{ ...inputStyle, width: 'auto', cursor: 'pointer', fontWeight: 700, color: brand, border: `1px solid ${brand}` }}>{s.repeat}</button>
          <a href={`/order/track/${last.token}${window.location.search}`} style={{ alignSelf: 'center', color: brand, fontWeight: 700 }}>{s.pastOrders}</a>
        </div>
      )}

      <nav style={{ display: 'flex', overflowX: 'auto', gap: 12, padding: wide ? '12px 4px' : '12px 16px', background: wide ? colors.background : 'white', color: wide ? colors.text : '#222', borderBottom: '1px solid #eee', position: 'sticky', top: 0, zIndex: 5 }}>
        {categories.map((c) => (
          <button key={c.id} type="button" onClick={() => { setActiveCat(c.id); track('category_view', { categoryId: c.id }); }}
            style={{ background: 'none', border: 'none', borderBottom: `2px solid ${c.id === active.id ? brand : 'transparent'}`, color: c.id === active.id ? brand : '#555', fontWeight: 700, padding: '8px 4px', whiteSpace: 'nowrap', cursor: 'pointer' }}>
            {c.name}
          </button>
        ))}
      </nav>

      <ItemList items={active.items} wide={wide} gate={gate} brand={brand} fmt={fmt} s={s} onAdd={cartApi.onAdd} />
    </div>
  );

  return (
    <Page client={client} lang={lang} colors={colors} bottomPad={!wide && !gate && count > 0 && !checkingOut ? 96 : 16}>
      {header}
      {wide && !gate ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 24, maxWidth: 1200, width: '100%', boxSizing: 'border-box', margin: '0 auto', padding: '0 24px', alignItems: 'start' }}>
          {menuCol}
          <aside ref={asideRef} style={{ position: 'sticky', top: 16, marginTop: 16, maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', background: 'white', color: '#222', borderRadius: 16, padding: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
            {cartBody}
          </aside>
        </div>
      ) : menuCol}

      {!wide && !gate && count > 0 && !checkingOut && (
        <button type="button" className="tp-up" onClick={() => setCheckingOut(true)}
          style={{ position: 'fixed', left: 16, right: 16, bottom: 16, zIndex: 10, background: brand, color: 'white', border: 'none', borderRadius: 14, padding: 16, fontWeight: 800, fontSize: '1.05rem', cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,0.25)' }}>
          {s.cart} ({count}) · {fmt(total)}
        </button>
      )}

      {picking && !gate && (
        <ModifierSheet picking={picking} groups={cartApi.groups} brand={brand} fmt={fmt} s={s} onToggle={cartApi.toggleMod}
          onClose={() => { pickerClosed(false); setPicking(null); }}
          onConfirm={() => { cartApi.addLine(picking.item.id, picking.mods); setPicking(null); pickerClosed(true); }} />
      )}

      {!wide && !gate && checkingOut && <Sheet onClose={() => setCheckingOut(false)}>{cartBody}</Sheet>}
    </Page>
  );
}
