import { formatForDisplay } from '../../utils/moneyUtils';

// Premium, vendor-facing settlement statement. Rendered off-screen and snapshot
// to PNG for sharing, so it uses an explicit LIGHT palette (not theme vars) —
// the shared document should look clean and consistent even if the shop runs in
// dark mode. Fixed width for a crisp, predictable capture.

const INK = '#1f2937';
const MUTED = '#6b7280';
const HAIR = '#e5e7eb';
const DEFAULT_ACCENT = '#b45309';   // amber-700 fallback when no brand color
const PANEL = '#faf8f5';

// Brand color → translucent tint (for the split-type pill background).
const tint = (hex, alpha = 0.12) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return '#fdf3e7';
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
};

const HEAD = { fontSize: '11px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '0 0 10px', borderBottom: `2px solid ${HAIR}` };
const CELL = { padding: '10px 0', borderBottom: `1px solid ${HAIR}`, fontSize: '14px', fontVariantNumeric: 'tabular-nums' };
const perUnit = (totalCents, units) => Math.round((totalCents || 0) / (units || 1));

function Row({ label, value, strong, color, big }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: big ? '10px 0' : '6px 0' }}>
      <span style={{ color: strong ? INK : MUTED, fontSize: big ? '15px' : '13px', fontWeight: strong ? 700 : 500 }}>{label}</span>
      <span style={{ color: color || INK, fontSize: big ? '22px' : '14px', fontWeight: strong || big ? 800 : 600, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

export default function VendorStatement({ id, row, paidCents = 0, range = {}, branding = {}, accent, t }) {
  if (!row) return null;
  const ACCENT = accent || DEFAULT_ACCENT;
  const balance = row.payoutCents - paidCents;
  const hasTax = row.taxCents > 0;
  const isCost = row.splitType === 'cost';
  const shopName = branding.header || 'TinyPOS';
  const generated = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const splitLabel = row.splitType === 'cost'
    ? t('vendors.splitCost')
    : `${t('vendors.colCommission')} · ${row.commissionPercent}%`;

  return (
    <div id={id} style={{
      width: '680px', boxSizing: 'border-box', background: '#ffffff', color: INK,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      padding: '0', borderRadius: '20px', overflow: 'hidden',
    }}>
      {/* Header band */}
      <div style={{ background: INK, color: '#fff', padding: '28px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {branding.logo
            ? <img src={branding.logo} alt="" style={{ height: '48px', width: '48px', objectFit: 'contain', borderRadius: '10px', background: '#fff', padding: '4px' }} />
            : null}
          <div>
            <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '0.2px' }}>{shopName}</div>
            {branding.subheader ? <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '2px' }}>{branding.subheader}</div> : null}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '11px', letterSpacing: '2px', color: '#cbd5e1', fontWeight: 700 }}>{t('vendors.statementTitle').toUpperCase()}</div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>{generated}</div>
        </div>
      </div>

      {/* Accent rule */}
      <div style={{ height: '4px', background: ACCENT }} />

      <div style={{ padding: '32px 40px 36px' }}>
        {/* Vendor + period */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
            <div style={{ fontSize: '12px', color: MUTED, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>{t('vendors.statementFor')}</div>
            <div style={{ fontSize: '26px', fontWeight: 800, marginTop: '4px' }}>{row.vendorName}</div>
            <div style={{ display: 'inline-block', marginTop: '8px', fontSize: '12px', fontWeight: 700, color: ACCENT, background: tint(ACCENT), borderRadius: '999px', padding: '4px 12px' }}>{splitLabel}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '12px', color: MUTED, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>{t('vendors.statementPeriod')}</div>
            <div style={{ fontSize: '15px', fontWeight: 700, marginTop: '6px' }}>{range.from || '—'}</div>
            <div style={{ fontSize: '12px', color: MUTED }}>{t('vendors.to').toLowerCase()}</div>
            <div style={{ fontSize: '15px', fontWeight: 700 }}>{range.to || '—'}</div>
          </div>
        </div>

        {/* Items — split-type aware breakdown */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
          <thead>
            <tr>
              <th style={{ ...HEAD, textAlign: 'left' }}>{t('vendors.colVendor')}</th>
              <th style={{ ...HEAD, textAlign: 'right' }}>{t('vendors.colUnits')}</th>
              <th style={{ ...HEAD, textAlign: 'right' }}>{t('vendors.colUnitPrice')}</th>
              {isCost ? <th style={{ ...HEAD, textAlign: 'right' }}>{t('vendors.colUnitCost')}</th> : null}
              {isCost
                ? <th style={{ ...HEAD, textAlign: 'right' }}>{t('vendors.colProfit')}</th>
                : <th style={{ ...HEAD, textAlign: 'right' }}>{t('vendors.colGross')}</th>}
            </tr>
          </thead>
          <tbody>
            {row.items.map((it) => (
              <tr key={it.name}>
                <td style={{ ...CELL, fontWeight: 600 }}>{it.name}</td>
                <td style={{ ...CELL, textAlign: 'right', color: MUTED }}>{it.units}</td>
                <td style={{ ...CELL, textAlign: 'right' }}>{formatForDisplay(perUnit(it.grossCents, it.units))}</td>
                {isCost ? <td style={{ ...CELL, textAlign: 'right', color: MUTED }}>{formatForDisplay(perUnit(it.costCents, it.units))}</td> : null}
                {isCost
                  ? <td style={{ ...CELL, textAlign: 'right', fontWeight: 700, color: '#15803d' }}>{formatForDisplay(it.grossCents - it.costCents)}</td>
                  : <td style={{ ...CELL, textAlign: 'right', fontWeight: 600 }}>{formatForDisplay(it.grossCents)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {/* Deal terms line — reinforces the split applied to this statement */}
        <div style={{ fontSize: '12px', color: MUTED, margin: '-12px 0 24px' }}>
          {isCost
            ? t('vendors.termsCost')
            : t('vendors.termsCommission').replace('{pct}', String(row.commissionPercent))}
        </div>

        {/* Summary panel */}
        <div style={{ background: PANEL, borderRadius: '16px', padding: '20px 24px', border: `1px solid ${HAIR}` }}>
          <Row label={t('vendors.colGross')} value={formatForDisplay(row.grossCents)} />
          {row.refundCents ? <Row label={t('vendors.colRefunds')} value={`- ${formatForDisplay(row.refundCents)}`} color="#dc2626" /> : null}
          {hasTax ? <Row label={t('vendors.colBase')} value={formatForDisplay(row.baseCents)} /> : null}
          {hasTax ? <Row label={t('vendors.colTax')} value={formatForDisplay(row.taxCents)} /> : null}
          <Row label={splitLabel} value={`- ${formatForDisplay(row.commissionCents)}`} color="#dc2626" />
          <div style={{ borderTop: `2px solid ${HAIR}`, margin: '8px 0 2px' }} />
          <Row label={t('vendors.colPayout')} value={formatForDisplay(row.payoutCents)} strong big color={ACCENT} />
          {paidCents ? <Row label={t('vendors.colPaid')} value={`- ${formatForDisplay(paidCents)}`} color={MUTED} /> : null}
          <div style={{ marginTop: '12px', background: balance > 0 ? '#fef3c7' : '#dcfce7', borderRadius: '12px', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 800, color: INK }}>{t('vendors.colBalance')}</span>
            <span style={{ fontSize: '24px', fontWeight: 900, color: balance > 0 ? '#92400e' : '#15803d', fontVariantNumeric: 'tabular-nums' }}>{formatForDisplay(balance)}</span>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: '28px', textAlign: 'center', color: MUTED }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: INK }}>{t('vendors.statementThanks')}</div>
          {branding.footer ? <div style={{ fontSize: '12px', marginTop: '4px' }}>{branding.footer}</div> : null}
          <div style={{ fontSize: '11px', marginTop: '10px', color: '#9ca3af' }}>{shopName} · {generated}</div>
        </div>
      </div>
    </div>
  );
}
