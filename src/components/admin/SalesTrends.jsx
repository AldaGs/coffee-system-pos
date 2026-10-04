import { useMemo } from 'react';
import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';
import { formatForDisplay } from '../../utils/moneyUtils';
import { ActivityHeatmap, BarChart, DonutChart } from '../ui/arc';

const HEATMAP_DAYS = 365;

// Net revenue a sale contributes, in cents (refunds removed), matching totalRevenue in Admin.
const netCents = (sale) => {
  if (sale.status === 'refunded') return 0;
  const amount = Number(sale.total_amount) || 0;
  return sale.status === 'partial_refund' ? amount - (Number(sale.refund_amount) || 0) : amount;
};

const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const card = { background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', minWidth: 0 };
const cardTitle = { marginTop: 0, marginBottom: '20px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.3rem' };

/** Busiest hours, product mix and a daily-orders calendar for the Analytics tab. */
function SalesTrends({ filteredSales = [], allSales = [] }) {
  const { t, lang } = useTranslation();
  const locale = lang === 'es' ? 'es-MX' : 'en-US';
  const money = (cents) => formatForDisplay(cents);

  // Revenue by hour of day across the selected period, trimmed to the hours the café actually trades.
  const byHour = useMemo(() => {
    const cents = new Array(24).fill(0);
    let first = 24, last = -1;
    filteredSales.forEach(sale => {
      const value = netCents(sale);
      if (!sale.created_at || value <= 0) return;
      const h = new Date(sale.created_at).getHours();
      cents[h] += value;
      first = Math.min(first, h); last = Math.max(last, h);
    });
    if (last < 0) return [];
    return cents.slice(first, last + 1).map((value, i) => {
      const h = first + i;
      return { key: `h${h}`, label: `${h}:00–${h + 1}:00`, axisLabel: String(h), value };
    });
  }, [filteredSales]);

  // Units sold per product; the chart folds the long tail into "Other".
  const productMix = useMemo(() => {
    const counts = {};
    filteredSales.forEach(sale => {
      if (sale.status === 'refunded' || !Array.isArray(sale.items_sold)) return;
      sale.items_sold.forEach(name => { counts[name] = (counts[name] || 0) + 1; });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ key: name, label: name, value }));
  }, [filteredSales]);

  // Orders per day for the last 12 months, independent of the period filter.
  const days = useMemo(() => {
    const counts = new Map();
    allSales.forEach(sale => {
      if (!sale.created_at || sale.status === 'refunded') return;
      const key = isoDay(new Date(sale.created_at));
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const today = new Date();
    return Array.from({ length: HEATMAP_DAYS }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (HEATMAP_DAYS - 1 - i));
      const key = isoDay(d);
      return { date: key, count: counts.get(key) || 0 };
    });
  }, [allSales]);

  const empty = <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{t('analytics.noSales')}</p>;

  return (
    <>
      <h3 style={{ color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', fontSize: '1.2rem' }}>
        <Icon icon="lucide:trending-up" style={{ color: 'var(--brand-color)' }} />
        {t('analytics.trends')}
      </h3>
      <div className="arc admin-grid-responsive" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        <div style={card}>
          <h3 style={cardTitle}><Icon icon="lucide:clock" style={{ color: 'var(--brand-color)' }} />{t('analytics.busyHours')}</h3>
          {byHour.length === 0 ? empty : (
            <BarChart
              data={byHour}
              label={t('analytics.busyHours')}
              period={t('analytics.selectedPeriod')}
              formatValue={money}
              averageLabel={t('analytics.hourlyAverage')}
              averageShort={t('analytics.avgShort')}
              valueLabel={t('analytics.revenue')}
              categoryLabel={t('analytics.hour')}
            />
          )}
        </div>
        <div style={card}>
          <h3 style={cardTitle}><Icon icon="lucide:pie-chart" style={{ color: 'var(--brand-color)' }} />{t('analytics.productMix')}</h3>
          {productMix.length === 0 ? empty : (
            <DonutChart
              data={productMix}
              label={t('analytics.productMix')}
              totalLabel={t('analytics.unitsSold')}
              otherLabel={t('analytics.other')}
              emptyLabel={t('analytics.noSales')}
              maxSegments={5}
              andMore={(n) => t('analytics.andMore').replace('{n}', n)}
            />
          )}
        </div>
      </div>
      <div className="arc" style={{ ...card, marginBottom: '40px' }}>
        <h3 style={cardTitle}><Icon icon="lucide:calendar" style={{ color: 'var(--brand-color)' }} />{t('analytics.dailyOrders')}</h3>
        <ActivityHeatmap
          days={days}
          label={t('analytics.dailyOrders')}
          period={t('analytics.last12Months')}
          unit={{ one: t('analytics.orderOne'), other: t('analytics.orderOther') }}
          weekStartsOn={1}
          locale={locale}
          text={lang === 'es' ? { in: 'en', no: 'Sin', to: 'a', orMore: 'o más', with: 'con', day: 'día', days: 'días', less: 'Menos', more: 'Más' } : undefined}
        />
      </div>
    </>
  );
}

export default SalesTrends;
