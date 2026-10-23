import { lazy, Suspense } from 'react';
import { Icon } from '@iconify/react';
import LegalLinks from '../LegalLinks';
import TransferDetails from '../TransferDetails';
import CountryPicker from '../CountryPicker';
import SlotPicker from './SlotPicker';
import { Spinner } from './ui';
import { PAY_ICON } from './strings';
import { inputStyle, qtyBtn } from './shared';

// MapLibre + its CSS only download when a customer picks delivery.
// The pin is optional: if the map chunk fails to load (bad network, stale deploy) checkout still works.
const PinMap = lazy(() => import('../PinMap').catch(() => ({ default: () => null })));

const errText = { color: '#c0392b' };

function CartStep({ co, cartApi, feeCents, s, brand, fmt }) {
  const { cart, itemsById, optionName, setQty, unitCents } = cartApi;
  return (<>
    {cart.length === 0 && <p style={{ color: '#666' }}>{s.empty}</p>}
    {cart.map((l) => (
      <div key={l.key} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #eee' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>{itemsById.get(l.id)?.name}</div>
          <small style={{ color: '#666' }}>{l.mods.map(optionName).filter(Boolean).join(', ')}</small>
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
          <button key={ty} type="button" onClick={() => co.setOrderType(ty)}
            style={{ flex: 1, padding: '10px 8px', borderRadius: 10, fontWeight: 700, cursor: 'pointer', border: `1px solid ${brand}`,
              background: co.orderType === ty ? brand : 'white', color: co.orderType === ty ? 'white' : brand }}>
            {ty === 'pickup' ? s.typePickup : s.typeDelivery}
          </button>
        ))}
      </div>
    )}
    <div style={{ marginTop: 12 }}>
      <textarea style={inputStyle} placeholder={s.notes} maxLength={300} rows={2} value={co.notes} onChange={(e) => co.setNotes(e.target.value)} />
    </div>
  </>);
}

function LocationStep({ co, shop, s, lang, fmt }) {
  const { customer, setCustomer, delivery, quote } = co;
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <label style={{ display: 'grid', gap: 6 }}>
        <strong>{s.addressRequired}</strong>
        <textarea style={inputStyle} placeholder={s.address} autoComplete="street-address" required maxLength={250} rows={2} value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} />
      </label>
      {delivery && (
        <Suspense fallback={null}>
          <PinMap pin={customer.lat != null ? { lat: customer.lat, lng: customer.lng } : null} address={customer.address} s={s} lang={lang} areas={shop?.deliveryAreas}
            onPin={(lat, lng) => setCustomer((c) => ({ ...c, lat, lng }))} />
        </Suspense>
      )}
      {delivery && (customer.lat == null ? <small>{s.pinRequired}</small> : quote?.kind === 'unavailable' ? <small style={errText}>{s.areaUnavailable}</small> : quote?.kind === 'error' ? <small style={errText}>{s.quoteError}</small> : !quote ? <small>{s.quoteChecking}</small> : quote.kind === 'shipping' ? <small>{s.shippingPending}</small> : <small>{quote.area?.name}: {fmt(quote.fee_cents)}</small>)}
      {co.formErr && <small style={errText}>{co.formErr}</small>}
    </div>
  );
}

function PayStep({ co, shop, s, lang, brand, fmt }) {
  const { customer, setCustomer, phoneLen, pay, offered, shipping, delivery, cashCents, cashBad, grand } = co;
  return (<>
    <div style={{ display: 'grid', gap: 10 }}>
      <input style={inputStyle} placeholder={s.name} autoComplete="name" maxLength={80} value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
      <div style={{ display: 'flex', gap: 8 }}>
        <CountryPicker value={customer.iso || 'MX'} lang={lang} label={s.country} onChange={(iso) => setCustomer({ ...customer, iso })} />
        <input style={{ ...inputStyle, flex: 1, minWidth: 0 }} placeholder={phoneLen ? s.phone10 : s.phone} autoComplete="tel-national" inputMode="numeric"
          maxLength={phoneLen || 12} value={customer.phone}
          onChange={(e) => setCustomer({ ...customer, phone: e.target.value.replace(/\D/g, '').slice(0, phoneLen || 12) })} />
      </div>
      {co.phoneBad && <small style={errText}>{s.phoneDigits.replace('{n}', phoneLen || '6–12')}</small>}
    </div>
    <div role="radiogroup" aria-label={s.payLabel} style={{ margin: '12px 0 0' }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{s.payLabel}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        {offered.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={pay === m} onClick={() => co.setPayment(m)}
            style={{ flex: 1, padding: '10px 4px', borderRadius: 10, fontWeight: 700, cursor: 'pointer', border: `1px solid ${brand}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              background: pay === m ? brand : 'white', color: pay === m ? 'white' : brand }}>
            <Icon icon={PAY_ICON[m]} width="20" />{s[`pay_${m}`]}
          </button>
        ))}
      </div>
    </div>
    {pay === 'transfer' && !shipping && <TransferDetails payments={shop?.payments} lang={lang} />}
    {pay === 'cash' && !shipping && (
      <div style={{ marginTop: 8 }}>
        <label style={{ fontWeight: 700, display: 'block', marginBottom: 6 }}>{s.cashPay}</label>
        <input style={inputStyle} inputMode="decimal" placeholder="$" value={co.cash} aria-invalid={cashBad}
          onChange={(e) => co.setCash(e.target.value.replace(/[^0-9.]/g, ''))} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          {co.cashChips.map((c, i) => (
            <button key={c} type="button" onClick={() => co.setCash(String(c / 100))}
              style={{ padding: '6px 12px', borderRadius: 999, border: `1px solid ${brand}`, background: cashCents === c ? brand : 'white', color: cashCents === c ? 'white' : brand, fontWeight: 700, cursor: 'pointer' }}>
              {i === 0 ? s.cashExact : fmt(c)}
            </button>
          ))}
        </div>
        {cashBad && <small style={{ ...errText, display: 'block', marginTop: 4 }}>{s.invalid_cash}</small>}
        {cashCents != null && !cashBad && <div style={{ fontWeight: 700, marginTop: 6 }}>{s.cashChange}: {fmt(cashCents - grand)}</div>}
      </div>
    )}
    <p style={{ color: '#666', fontSize: '0.9rem' }}>{shipping ? s.shippingPending : pay ? s.payNote[pay][delivery ? 1 : 0] : delivery ? s.payOnDelivery : s.payAtPickup}</p>
  </>);
}

// Why "Next" is disabled on the location step.
function LocationBlockedHint({ co, s }) {
  const { customer, quote } = co;
  const missing = [(customer.address || '').trim().length < 5 && s.invalid_address, customer.lat == null && s.pinRequired].filter(Boolean);
  const msg = missing.length ? missing.join(' ') : quote?.kind === 'unavailable' ? s.areaUnavailable : quote?.kind === 'error' ? s.quoteError : s.quoteChecking;
  const bad = missing.length || ['unavailable', 'error'].includes(quote?.kind);
  return <small role="status" style={{ color: bad ? '#c0392b' : '#888', fontWeight: bad ? 700 : 400, display: 'block', marginBottom: 8 }}>{msg}</small>;
}

// The checkout wizard body: the mobile sheet and the desktop side cart render the same thing.
export default function CheckoutPanel({ co, cartApi, feeCents, shop, client, legal, lang, s, brand, fmt }) {
  const { steps, stepIdx, step, stepBlock, go, sending, formErr, slotStatus, slotHint, slotNow, delivery, shipping } = co;
  const empty = cartApi.cart.length === 0;
  const nextBtn = { flex: 1, background: brand, color: 'white', border: 'none', borderRadius: 12, padding: 14, fontWeight: 800, cursor: 'pointer' };
  const backBtn = { flex: '0 0 auto', background: 'white', color: brand, border: `1px solid ${brand}`, borderRadius: 12, padding: '14px 18px', fontWeight: 800, cursor: 'pointer' };
  const hint = { ...errText, display: 'block', marginBottom: 8 };
  return (
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
        {step === 'cart' && <CartStep co={co} cartApi={cartApi} feeCents={feeCents} s={s} brand={brand} fmt={fmt} />}
        {step === 'location' && <LocationStep co={co} shop={shop} s={s} lang={lang} fmt={fmt} />}
        {step === 'time' && (
          <div style={{ display: 'grid', gap: 10 }}>
            <SlotPicker delivery={delivery} label={delivery ? s.deliveryAt : s.pickupAt} value={co.pickup} onChange={co.setPickup} date={co.slotDateIntent} onDateChange={co.setSlotDate} shop={shop} cap={co.slotCap} lang={lang} s={s} />
          </div>
        )}
        {step === 'pay' && <PayStep co={co} shop={shop} s={s} lang={lang} brand={brand} fmt={fmt} />}
      </div>

      {delivery && (
        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '12px 0 0' }}><span>{s.deliveryFee}</span><span>{shipping ? s.pendingPrice : co.quote?.kind === 'delivery' ? fmt(co.quotedFee) : '—'}</span></div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1.1rem', margin: '12px 0' }}><span>{shipping ? s.subtotal : s.total}</span><span>{fmt(co.grand)}</span></div>
      {step === 'location' && stepBlock && <LocationBlockedHint co={co} s={s} />}
      {step === 'time' && slotStatus !== 'valid' && <small style={hint}>{slotHint(slotStatus, slotNow)}</small>}
      {step === 'time' && formErr && <small style={hint}>{formErr}</small>}
      {step === 'pay' && slotStatus !== 'valid' && <small style={hint}>{slotHint(slotStatus, slotNow)}</small>}
      {step === 'pay' && formErr && <p style={{ ...errText, fontWeight: 600 }}>{formErr}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        {stepIdx > 0 && <button type="button" disabled={sending} onClick={() => go(stepIdx - 1)} style={backBtn}>{s.back}</button>}
        {step !== 'pay' ? (
          <button type="button" disabled={stepBlock} onClick={() => go(stepIdx + 1)} style={{ ...nextBtn, opacity: stepBlock ? 0.6 : 1 }}>{s.next}</button>
        ) : (
          <button type="button" disabled={sending || empty || stepBlock} onClick={() => co.submit(Date.now())} style={{ ...nextBtn, opacity: sending || empty || stepBlock ? 0.6 : 1 }}>
            {sending ? <><Spinner /> {s.sending}</> : s.send}
          </button>
        )}
      </div>
      {step === 'pay' && legal?.privacy && legal?.terms && (
        <p style={{ color: '#888', fontSize: '0.8rem', margin: '10px 0 0' }}>
          {s.legalA}<LegalLinks client={client} lang={lang} only="privacy" />{s.legalB}<LegalLinks client={client} lang={lang} only="terms" />.
        </p>
      )}
      {step === 'cart' && <button type="button" onClick={co.forget} style={{ background: 'none', border: 'none', color: '#888', marginTop: 12, textDecoration: 'underline', cursor: 'pointer' }}>{s.forget}</button>}
    </>
  );
}
