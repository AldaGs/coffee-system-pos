import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify/react';
import { supabase } from '../../supabaseClient';
import { isLocalMode } from '../../utils/appMode';
import { useTranslation } from '../../hooks/useTranslation';
import { BarChart } from '../ui/arc';

const DAY = 86400000;
const card = { background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', minWidth: 0 };
const cardTitle = { marginTop: 0, marginBottom: '20px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.3rem' };
const muted = { color: 'var(--text-muted)', fontSize: '0.9rem' };
const th = { textAlign: 'right', padding: '6px 8px', ...muted, fontWeight: 700 };
const td = { textAlign: 'right', padding: '6px 8px', color: 'var(--text-main)' };

// Same period semantics as the sales filter in Admin.jsx.
function periodRange(timeFilter, dateRange) {
  const now = new Date();
  const to = new Date(now.getTime() + 60000);
  if (timeFilter === 'today') return [new Date(now.getFullYear(), now.getMonth(), now.getDate()), to];
  if (timeFilter === 'custom' && dateRange?.start && dateRange?.end) {
    const end = new Date(dateRange.end);
    return [new Date(dateRange.start), new Date(end.getTime() + DAY)];
  }
  const days = { week: 7, month: 30, '6months': 180, year: 365 }[timeFilter] || 180;
  return [new Date(now.getTime() - days * DAY), to];
}

const pct = (n, d) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');

/** Cookieless traffic on the public /menu and /order pages (schema 4.2, page_events). */
function PublicPageTraffic({ timeFilter, dateRange }) {
  const { t } = useTranslation();
  const [state, setState] = useState({ data: null, error: null });
  const [from, to] = useMemo(() => periodRange(timeFilter, dateRange), [timeFilter, dateRange]);
  const enabled = !isLocalMode() && !!supabase;

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    supabase.rpc('get_page_analytics', { p_from: from.toISOString(), p_to: to.toISOString() })
      .then(({ data, error }) => { if (!cancelled) setState({ data, error }); });
    return () => { cancelled = true; };
  }, [enabled, from, to]);

  const hours = useMemo(() => {
    const h = state.data?.hours || {};
    const keys = Object.keys(h).map(Number);
    if (!keys.length) return [];
    const first = Math.min(...keys), last = Math.max(...keys);
    return Array.from({ length: last - first + 1 }, (_, i) => {
      const hr = first + i;
      return { key: `h${hr}`, label: `${hr}:00–${hr + 1}:00`, axisLabel: String(hr), value: Number(h[hr]) || 0 };
    });
  }, [state.data]);

  if (!enabled) return null;

  const title = (
    <h3 style={{ color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', fontSize: '1.2rem' }}>
      <Icon icon="lucide:mouse-pointer-click" style={{ color: 'var(--brand-color)' }} />
      {t('traffic.title')}
    </h3>
  );
  const note = <p style={{ ...muted, marginTop: 0, marginBottom: '20px' }}>{t('traffic.privacyNote')}</p>;

  if (state.error) {
    // Most likely the install predates schema 4.2 (the RPC doesn't exist yet).
    return <div style={{ marginBottom: '40px' }}>{title}<div style={card}><p style={muted}>{t('traffic.needsUpdate')}</p></div></div>;
  }
  if (!state.data) return <div style={{ marginBottom: '40px' }}>{title}{note}<div style={card}><p style={muted}>…</p></div></div>;

  const { totals = {}, funnel = {}, steps = {}, errors = {}, items = [], categories = [] } = state.data;
  const empty = !totals.events;
  const stages = [
    ['traffic.funnelVisits', funnel.visits],
    ['traffic.funnelAdded', funnel.added],
    ['traffic.funnelCheckout', funnel.checkout],
    ...['location', 'time', 'pay'].filter((k) => steps[k] != null).map((k) => [`traffic.step_${k}`, steps[k]]),
    ['traffic.funnelPlaced', funnel.placed],
  ];
  const top = Math.max(1, Number(funnel.visits) || 0);
  const kpis = [
    ['lucide:book-open', 'traffic.menuVisits', totals.menu_visits],
    ['lucide:shopping-bag', 'traffic.orderVisits', totals.order_visits],
    ['lucide:check-circle', 'traffic.ordersPlaced', funnel.placed],
    ['lucide:percent', 'traffic.conversion', pct(funnel.placed, funnel.visits)],
  ];
  const errorRows = Object.entries(errors).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ marginBottom: '40px' }}>
      {title}
      {note}
      {empty ? (
        <div style={card}><p style={{ ...muted, fontStyle: 'italic' }}>{t('traffic.empty')}</p></div>
      ) : (
        <div className="arc admin-grid-responsive" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
          <div style={{ ...card, gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>
            {kpis.map(([icon, key, value]) => (
              <div key={key}>
                <div style={{ ...muted, display: 'flex', alignItems: 'center', gap: 6 }}><Icon icon={icon} />{t(key)}</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-main)' }}>{value ?? 0}</div>
              </div>
            ))}
          </div>

          <div style={card}>
            <h3 style={cardTitle}><Icon icon="lucide:filter" style={{ color: 'var(--brand-color)' }} />{t('traffic.funnel')}</h3>
            {stages.map(([key, value]) => (
              <div key={key} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-main)', fontSize: '0.9rem' }}>
                  <span>{t(key)}</span><span><b>{value ?? 0}</b> <span style={muted}>· {pct(value, funnel.visits)}</span></span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: 'var(--border)', marginTop: 4 }}>
                  <div style={{ height: '100%', borderRadius: 4, background: 'var(--brand-color)', width: `${Math.min(100, ((Number(value) || 0) / top) * 100)}%` }} />
                </div>
              </div>
            ))}
            {errorRows.length > 0 && (
              <p style={{ ...muted, marginBottom: 0 }}>
                {t('traffic.errors')}: {errorRows.map(([code, n]) => `${code} (${n})`).join(', ')}
              </p>
            )}
          </div>

          <div style={card}>
            <h3 style={cardTitle}><Icon icon="lucide:clock" style={{ color: 'var(--brand-color)' }} />{t('traffic.byHour')}</h3>
            {hours.length === 0 ? <p style={muted}>—</p> : (
              <BarChart
                data={hours}
                label={t('traffic.byHour')}
                period={t('analytics.selectedPeriod')}
                averageLabel={t('analytics.hourlyAverage')}
                averageShort={t('analytics.avgShort')}
                valueLabel={t('traffic.visits')}
                categoryLabel={t('analytics.hour')}
              />
            )}
          </div>

          <div style={{ ...card, gridColumn: '1 / -1', overflowX: 'auto' }}>
            <h3 style={cardTitle}><Icon icon="lucide:list" style={{ color: 'var(--brand-color)' }} />{t('traffic.items')}</h3>
            <p style={{ ...muted, marginTop: -12 }}>{t('traffic.itemsHint')}</p>
            {items.length === 0 ? <p style={muted}>—</p> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: 'left' }}>{t('traffic.item')}</th>
                    <th style={th}>{t('traffic.opens')}</th>
                    <th style={th}>{t('traffic.adds')}</th>
                    <th style={th}>{t('traffic.removes')}</th>
                    <th style={th}>WhatsApp</th>
                  </tr>
                </thead>
                <tbody>
                  {items.slice(0, 25).map((it) => (
                    <tr key={it.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ ...td, textAlign: 'left' }}>{it.name}</td>
                      <td style={td}>{it.opens}</td>
                      <td style={td}>{it.adds}</td>
                      <td style={td}>{it.removes}</td>
                      <td style={td}>{it.whatsapp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {categories.length > 0 && (
              <p style={{ ...muted, marginBottom: 0 }}>
                <b>{t('traffic.categories')}:</b> {categories.slice(0, 10).map((c) => `${c.name} (${c.views})`).join(' · ')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default PublicPageTraffic;
