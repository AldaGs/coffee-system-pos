import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@iconify/react';
import { supabase } from '../../supabaseClient';
import { useTranslation } from '../../hooks/useTranslation';

function ActivityTab() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState('today');

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      let query = supabase.from('activity_logs').select('*').order('created_at', { ascending: false });

      if (timeFilter !== 'all') {
        const now = new Date();
        let startDate = new Date();

        if (timeFilter === 'today') {
          startDate.setHours(0, 0, 0, 0);
        } else if (timeFilter === 'week') {
          startDate.setDate(now.getDate() - 7);
        } else if (timeFilter === 'month') {
          startDate.setDate(now.getDate() - 30);
        }

        query = query.gte('created_at', startDate.toISOString());
      }

      // Limit to 500 to prevent browser crash on huge histories
      const { data, error } = await query.limit(500);

      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error("Error fetching activity logs:", err);
    } finally {
      setIsLoading(false);
    }
  }, [timeFilter]);

  useEffect(() => {
    // Wrap in a microtask to avoid "cascading renders" lint error
    // which triggers when setState is called synchronously inside an effect.
    Promise.resolve().then(() => {
      fetchLogs();
    });
  }, [fetchLogs]);

  const getActionIcon = (actionType) => {
    const type = actionType.toLowerCase();
    if (type.includes('discount')) return 'lucide:percent';
    if (type.includes('price')) return 'lucide:badge-dollar-sign';
    if (type.includes('team') || type.includes('cashier')) return 'lucide:users';
    if (type.includes('inventory') || type.includes('restock')) return 'lucide:database';
    if (type.includes('expense') || type.includes('gasto')) return 'lucide:receipt';
    if (type.includes('corte')) return 'lucide:clipboard-check';
    return 'lucide:scroll-text';
  };

  const getActionColor = (actionType) => {
    const type = actionType.toLowerCase();
    if (type.includes('discount')) return '#e74c3c'; // red
    if (type.includes('price')) return '#f39c12'; // orange
    if (type.includes('inventory')) return '#3498db'; // blue
    if (type.includes('expense') || type.includes('gasto')) return '#9b59b6'; // purple
    return 'var(--text-muted)';
  };

  return (
    <div className="admin-section fade-in">
      <div className="admin-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.8rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Icon icon="lucide:history" style={{ color: 'var(--brand-color)' }} />
            {t('activity.title')}
          </h2>
          <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0', fontSize: '1.1rem' }}>
            {t('activity.subtitle')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value)}
            style={{ padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border)', fontWeight: 'bold', background: 'var(--bg-surface)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}
          >
            <option value="today">{t('activity.filterToday')}</option>
            <option value="week">{t('activity.filterWeek')}</option>
            <option value="month">{t('activity.filterMonth')}</option>
            <option value="all">{t('activity.filterAll')}</option>
          </select>
          <button onClick={fetchLogs} style={{ padding: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', color: 'var(--text-main)', cursor: 'pointer', display: 'flex' }}>
            <Icon icon="lucide:refresh-cw" className={isLoading ? "spin" : ""} />
          </button>
        </div>
      </div>

      <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--admin-card-radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('activity.loading')}</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Icon icon="lucide:clipboard-list" style={{ fontSize: '3rem', opacity: 0.3, marginBottom: '12px' }} />
            <p>{t('activity.noActivity')}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {logs.map((log, index) => {
              const dateObj = new Date(log.created_at);
              const dateStr = dateObj.toLocaleDateString();
              const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

              return (
                <div key={log.id} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '16px',
                  padding: '20px',
                  borderBottom: index < logs.length - 1 ? '1px solid var(--border)' : 'none',
                  background: index % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)'
                }}>
                  <div style={{
                    minWidth: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    background: 'var(--bg-main)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Icon icon={getActionIcon(log.action_type)} style={{ fontSize: '1.4rem', color: getActionColor(log.action_type) }} />
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: '800', color: 'var(--text-main)', fontSize: '1.1rem' }}>{log.action_type}</span>
                      <div style={{ display: 'flex', gap: '12px', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 'bold' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Icon icon="lucide:user" /> {log.cashier_name}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Icon icon="lucide:calendar" /> {dateStr} {timeStr}</span>
                      </div>
                    </div>
                    <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: '1.5' }}>{log.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default ActivityTab;
