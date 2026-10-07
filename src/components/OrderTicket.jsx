// The itemized ticket a customer sees on the /order tracker. Shared by
// PublicOrder (Track) and the admin Online Orders preview so they never drift.
// `items` is the online_orders.items snapshot: { qty, name, modifiers, line_cents, iva }.
// Delivery fee is untaxed; `totalCents` includes it.
import { formatForDisplay } from '../utils/moneyUtils';
import { calculateItemizedTaxBreakdown } from '../utils/posMath';

const TT = {
  es: { total: 'Total', delivery: 'Envío', subtotal: 'Subtotal', iva: 'IVA', withIva: 'con IVA', zero: 'tasa 0' },
  en: { total: 'Total', delivery: 'Delivery', subtotal: 'Subtotal', iva: 'VAT', withIva: 'incl. VAT', zero: '0% rate' },
};

function OrderTicket({ items = [], deliveryFeeCents = 0, totalCents, showIva = false, taxRate = 16, lang = 'es', style }) {
  const tt = TT[lang] || TT.es;
  const fmt = (c) => formatForDisplay(c, lang);
  const fee = deliveryFeeCents || 0;
  const goods = (totalCents ?? 0) - fee;
  const tax = showIva
    ? calculateItemizedTaxBreakdown(
      items.map((l) => ({ basePrice: l.line_cents, qty: 1, ivaTreatment: l.iva })), goods, taxRate)
    : null;
  const row = { display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 0' };
  return (
    <div style={{ background: 'white', color: '#222', border: '1px solid #eee', borderRadius: 12, padding: 16, ...style }}>
      {items.map((l, i) => (
        <div key={i} style={row}>
          <span>
            {l.qty}× {l.name}{l.modifiers?.length ? ` (${l.modifiers.map((m) => m.name).join(', ')})` : ''}
            {showIva && <small style={{ color: '#888' }}> · {l.iva === 'iva16' ? tt.withIva : tt.zero}</small>}
          </span>
          <span>{fmt(l.line_cents)}</span>
        </div>
      ))}
      {fee > 0 && <div style={row}><span>{tt.delivery}</span><span>{fmt(fee)}</span></div>}
      {tax && (
        <div style={{ borderTop: '1px solid #eee', marginTop: 8, paddingTop: 8, color: '#555' }}>
          <div style={row}><span>{tt.subtotal}</span><span>{fmt(tax.subtotal + (fee ? 0 : 0))}</span></div>
          <div style={row}><span>{tt.iva} ({taxRate}%)</span><span>{fmt(tax.tax)}</span></div>
        </div>
      )}
      <div style={{ ...row, fontWeight: 800, borderTop: '1px solid #eee', marginTop: 8, paddingTop: 8 }}>
        <span>{tt.total}</span><span>{fmt(totalCents)}</span>
      </div>
    </div>
  );
}

export default OrderTicket;
