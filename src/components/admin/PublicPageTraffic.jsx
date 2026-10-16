import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Icon } from '@iconify/react';
import { supabase } from '../../supabaseClient';
import { isLocalMode } from '../../utils/appMode';
import { useTranslation } from '../../hooks/useTranslation';
import { BarChart } from '../ui/arc';
import InfoTip from '../shared/InfoTip';

const DAY = 86400000;
const card = { background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', minWidth: 0 };
const cardTitle = { marginTop: 0, marginBottom: '20px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.3rem' };
const muted = { color: 'var(--text-muted)', fontSize: '0.9rem' };
const th = { textAlign: 'right', padding: '6px 8px', ...muted, fontWeight: 700 };
const td = { textAlign: 'right', padding: '6px 8px', color: 'var(--text-main)' };

const PERIODS = ['today', 'week', 'month', '6months'];

function periodRange(period) {
  const now = new Date();
  const to = new Date(now.getTime() + 60000);
  if (period === 'today') return [new Date(now.getFullYear(), now.getMonth(), now.getDate()), to];
  const days = { week: 7, month: 30, '6months': 180 }[period] || 30;
  return [new Date(now.getTime() - days * DAY), to];
}

const pct = (n, d) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');

/**
 * Section card + dialog with cookieless traffic for one public page
 * (page = 'menu' for Public Menus, 'order' for Online Orders). Schema 4.2.
 * Renders nothing in local mode, where the public pages don't exist.
 */
function PublicPageTraffic({ page }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (isLocalMode() || !supabase) return null;
  return (
    <div style={{ ...card, marginTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <h3 style={{ margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.1rem' }}>
          <Icon icon="lucide:mouse-pointer-click" style={{ color: 'var(--brand-color)' }} />
          {t(`traffic.title_${page}`)}
        </h3>
        <p style={{ ...muted, margin: '4px 0 0' }}>{t(`traffic.sectionDesc_${page}`)}</p>
      </div>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <button type="button" style={{ padding: '12px 18px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon icon="lucide:bar-chart-3" />{t('traffic.open')}
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay style={{ position: 'fixed', inset: 0, zIndex: 2200, background: 'rgba(0,0,0,0.65)' }} />
          <Dialog.Content style={{ position: 'fixed', inset: '3vh 3vw', maxWidth: 1100, margin: 'auto', zIndex: 2201, background: 'var(--bg-main)', color: 'var(--text-main)', borderRadius: 16, boxShadow: '0 18px 50px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 16, borderBottom: '1px solid var(--border)' }}>
              <Dialog.Title style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon icon="lucide:mouse-pointer-click" style={{ color: 'var(--brand-color)' }} />{t(`traffic.title_${page}`)}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" aria-label={t('traffic.close')} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 10, padding: 8, cursor: 'pointer', color: 'var(--text-main)', display: 'flex' }}>
                  <Icon icon="lucide:x" />
                </button>
              </Dialog.Close>
            </div>
            <div style={{ overflowY: 'auto', padding: 16, minHeight: 0 }}>
              <TrafficReport page={page} />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function TrafficReport({ page }) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState('month');
  const [state, setState] = useState({ data: null, error: null, key: null });
  const [from, to] = useMemo(() => periodRange(period), [period]);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc('get_page_analytics', { p_from: from.toISOString(), p_to: to.toISOString(), p_page: page })
      .then(({ data, error }) => { if (!cancelled) setState({ data, error, key: period }); });
    return () => { cancelled = true; };
  }, [from, to, page, period]);

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

  const title = (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
      {PERIODS.map((p) => (
        <button key={p} type="button" onClick={() => setPeriod(p)}
          style={{ padding: '8px 14px', borderRadius: 999, cursor: 'pointer', fontWeight: 700, border: `1px solid ${p === period ? 'var(--brand-color)' : 'var(--border)'}`, background: p === period ? 'var(--brand-color)' : 'var(--bg-surface)', color: p === period ? 'white' : 'var(--text-main)' }}>
          {t(`traffic.period_${p}`)}
        </button>
      ))}
    </div>
  );
  const note = <p style={{ ...muted, marginTop: 0, marginBottom: '20px' }}>{t('traffic.privacyNote')}{' '}<InfoTip text={t('traffic.privacyInfo')} section={page === 'order' ? 'onlineOrders' : 'menus'} /></p>;

  if (state.error) {
    // Most likely the install predates schema 4.2 (the RPC doesn't exist yet).
    return <div style={card}><p style={muted}>{t('traffic.needsUpdate')}</p></div>;
  }
  if (!state.data || state.key !== period) return <>{title}{note}<div style={card}><p style={muted}>…</p></div></>;

  const isOrder = page === 'order';
  const { totals = {}, funnel = {}, steps = {}, errors = {}, items = [], categories = [] } = state.data;
  const empty = !totals.events;
  const shownItems = isOrder ? items : items.filter((it) => it.whatsapp > 0);
  const stages = [
    ['traffic.funnelVisits', funnel.visits],
    ['traffic.funnelAdded', funnel.added],
    ['traffic.funnelCheckout', funnel.checkout],
    ...['location', 'time', 'pay'].filter((k) => steps[k] != null).map((k) => [`traffic.step_${k}`, steps[k]]),
    ['traffic.funnelPlaced', funnel.placed],
  ];
  const top = Math.max(1, Number(funnel.visits) || 0);
  const kpis = isOrder ? [
    ['lucide:shopping-bag', 'traffic.orderVisits', totals.order_visits],
    ['lucide:shopping-cart', 'traffic.funnelAdded', funnel.added],
    ['lucide:check-circle', 'traffic.ordersPlaced', funnel.placed],
    ['lucide:percent', 'traffic.conversion', pct(funnel.placed, funnel.visits)],
  ] : [
    ['lucide:book-open', 'traffic.menuVisits', totals.menu_visits],
    ['lucide:message-circle', 'traffic.whatsappClicks', items.reduce((n, it) => n + (Number(it.whatsapp) || 0), 0)],
  ];
  const errorRows = Object.entries(errors).sort((a, b) => b[1] - a[1]);

  return (
    <div>
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

          {isOrder && <div style={card}>
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
          </div>}

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
            <p style={{ ...muted, marginTop: -12 }}>{t(isOrder ? 'traffic.itemsHint' : 'traffic.itemsHintMenu')}</p>
            {shownItems.length === 0 ? <p style={muted}>—</p> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: 'left' }}>{t('traffic.item')}</th>
                    {isOrder && <th style={th}>{t('traffic.opens')}</th>}
                    {isOrder && <th style={th}>{t('traffic.adds')}</th>}
                    {isOrder && <th style={th}>{t('traffic.removes')}</th>}
                    {!isOrder && <th style={th}>WhatsApp</th>}
                  </tr>
                </thead>
                <tbody>
                  {shownItems.slice(0, 25).map((it) => (
                    <tr key={it.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ ...td, textAlign: 'left' }}>{it.name}</td>
                      {isOrder && <td style={td}>{it.opens}</td>}
                      {isOrder && <td style={td}>{it.adds}</td>}
                      {isOrder && <td style={td}>{it.removes}</td>}
                      {!isOrder && <td style={td}>{it.whatsapp}</td>}
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
