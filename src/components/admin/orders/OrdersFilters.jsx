import { Icon } from '@iconify/react';

// Search box, time filter and the custom date range.
export default function OrdersFilters({ search, setSearch, timeFilter, setTimeFilter, dateRange, setDateRange, t, lang }) {
  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ position: 'relative' }}>
        <Icon icon="lucide:search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={lang === 'es' ? 'Buscar ticket, nombre o #id' : 'Search ticket, name or #id'}
          aria-label={lang === 'es' ? 'Buscar ticket' : 'Search ticket'}
          style={{ padding: '12px 16px 12px 38px', borderRadius: '12px', border: '1px solid var(--border)', fontWeight: 'bold', background: 'var(--bg-surface)', color: 'var(--text-main)', outline: 'none', minWidth: '240px' }}
        />
      </div>
      <div style={{ position: 'relative' }}>
        <Icon icon="lucide:calendar" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
        <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} style={{ padding: '12px 16px 12px 38px', borderRadius: '12px', border: '1px solid var(--border)', fontWeight: 'bold', background: 'var(--bg-surface)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer', appearance: 'none' }}>
          <option value="today">{t('analytics.filterToday') || 'Hoy'}</option>
          <option value="week">{t('analytics.filterWeek') || 'Semana'}</option>
          <option value="month">{t('analytics.filterMonth') || 'Mes'}</option>
          <option value="6months">{t('analytics.filter6Months') || '6 Meses'}</option>
          <option value="year">{t('analytics.filterYear') || 'Año'}</option>
          <option value="all">{t('analytics.filterAll') || 'Todo'}</option>
          <option value="custom">{t('analytics.customRange')}</option>
        </select>
      </div>

      {timeFilter === 'custom' && (
        <div className="fade-in" style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-main)', padding: '6px 12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '0.70rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('analytics.dateStart')}</label>
            <input
              type="date"
              value={dateRange?.start || ''}
              max={new Date().toISOString().split('T')[0]} // Prevents future dates
              onChange={(e) => {
                const newStart = e.target.value;
                let newEnd = dateRange?.end || '';
                // BULLETPROOF: If new start is after current end, push end date forward to match
                if (newEnd && new Date(newEnd) < new Date(newStart)) {
                  newEnd = newStart;
                }
                setDateRange({ start: newStart, end: newEnd });
              }}
              style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-main)', outline: 'none' }}
            />
          </div>
          <span style={{ fontWeight: 'bold', color: 'var(--text-muted)', marginTop: '14px' }}>—</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '0.70rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('analytics.dateEnd')}</label>
            <input
              type="date"
              value={dateRange?.end || ''}
              min={dateRange?.start || ''} // BULLETPROOF: Native browser lock
              max={new Date().toISOString().split('T')[0]}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-main)', outline: 'none' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
