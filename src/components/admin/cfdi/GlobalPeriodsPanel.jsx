import { useState } from 'react';
import { Icon } from '@iconify/react';
import InfoTip from '../../shared/InfoTip';
import { fmtCents } from './cfdiShared';

// Reconciliation breakdown for a period summary object.
function PeriodSummary({ s, frozen = false, t }) {
  if (!s) return null;
  const rows = [
    { label: t('cfdiTab.sumTickets').replace('{n}', s.ticketCount), value: fmtCents(s.grossCents) },
    ...(s.refundCents ? [{ label: t('cfdiTab.sumRefunds'), value: `- ${fmtCents(s.refundCents)}` }] : []),
    { label: t('cfdiTab.sumNet'), value: fmtCents(s.netCents), strong: true },
    { label: t('cfdiTab.sumInvoiced').replace('{n}', s.invoicedCount), value: `- ${fmtCents(s.invoicedCents)}` },
    ...(s.pendingCount > 0 ? [{ label: t('cfdiTab.sumPending').replace('{n}', s.pendingCount), value: '⚠' }] : []),
  ];
  return (
    <div style={{ marginTop: '12px', padding: '14px', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px' }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: r.strong ? 'bold' : 'normal', padding: '2px 0' }}>
          <span style={{ color: r.strong ? 'var(--text-main)' : 'var(--text-muted)' }}>{r.label}</span>
          <span>{r.value}</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginTop: '8px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
        <span style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Icon icon="lucide:receipt-text" style={{ color: 'var(--brand-color)' }} />
          {t('cfdiTab.globalCount').replace('{n}', s.globalCount)}
        </span>
        <span style={{ fontWeight: '800', fontSize: '1.1rem', color: 'var(--text-main)' }}>{fmtCents(s.globalCents)}</span>
      </div>
      <p style={{ margin: '10px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
        {frozen
          ? t('cfdiTab.frozenHint')
          : t('cfdiTab.previewHint')}
      </p>
    </div>
  );
}

// Factura Global: preview a month, close it (freezing its totals), or reopen a closed one.
export default function GlobalPeriodsPanel({ periods, businessName, dateLocale, t }) {
  const { globalPeriods, newPeriod, setNewPeriod, isSavingPeriod, periodPreview, isLoadingPreview, handleCloseGlobalPeriod, handleReopenGlobalPeriod } = periods;
  const [expandedPeriod, setExpandedPeriod] = useState(null); // which closed row is expanded
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
      <h3 style={{ margin: '0 0 10px 0', fontSize: '1.2rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon icon="lucide:calendar-check" style={{ color: 'var(--brand-color)' }} />
        {t('cfdiTab.globalTitle')}
        <InfoTip text={businessName ? t('cfdiTab.globalInfoBusiness').replace('{name}', businessName) : t('cfdiTab.globalInfo')} section="cfdi" />
      </h3>
      <p style={{ margin: '0 0 16px 0', color: 'var(--text-muted)' }}>
        {t('cfdiTab.globalDesc')}
      </p>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: globalPeriods.length ? '20px' : 0 }}>
        <input
          type="month"
          value={newPeriod}
          onChange={e => setNewPeriod(e.target.value)}
          style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
        />
        <button
          type="button"
          onClick={handleCloseGlobalPeriod}
          disabled={isSavingPeriod || !newPeriod}
          style={{ background: 'var(--brand-color)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: (isSavingPeriod || !newPeriod) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: (isSavingPeriod || !newPeriod) ? 0.5 : 1, fontWeight: 'bold' }}
        >
          <Icon icon="lucide:lock" />
          {t('cfdiTab.closePeriod')}
        </button>
      </div>

      {newPeriod && (
        isLoadingPreview
          ? <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0 0 20px 0' }}>{t('cfdiTab.calculating').replace('{period}', newPeriod)}</p>
          : periodPreview
            ? <div style={{ marginBottom: '20px' }}>{<PeriodSummary s={periodPreview} t={t} />}</div>
            : null
      )}

      {globalPeriods.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {globalPeriods.map(p => {
            const isExpanded = expandedPeriod === p.period;
            return (
            <div key={p.period} style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)', fontWeight: 'bold', flexWrap: 'wrap' }}>
                  <Icon icon="lucide:lock" style={{ color: '#27ae60' }} /> {p.period}
                  {p.summary && <span style={{ fontWeight: 'normal', fontSize: '0.85rem', color: 'var(--text-muted)' }}>· Global {fmtCents(p.summary.globalCents)}</span>}
                  {p.closed_at && <span style={{ fontWeight: 'normal', fontSize: '0.8rem', color: 'var(--text-muted)' }}>· {t('cfdiTab.closedOn').replace('{date}', new Date(p.closed_at).toLocaleDateString(dateLocale))}</span>}
                </span>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  {p.summary && (
                    <button
                      type="button"
                      onClick={() => setExpandedPeriod(isExpanded ? null : p.period)}
                      style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-main)', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
                    >
                      <Icon icon={isExpanded ? 'lucide:chevron-up' : 'lucide:chevron-down'} /> {t('cfdiTab.summary')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleReopenGlobalPeriod(p.period)}
                    disabled={isSavingPeriod}
                    style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-main)', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
                  >
                    <Icon icon="lucide:unlock" /> {t('cfdiTab.reopen')}
                  </button>
                </div>
              </div>
              {isExpanded && <PeriodSummary s={p.summary} frozen t={t} />}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
