import { useMemo } from 'react';
import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';

function AnalyticsTab({ timeFilter, setTimeFilter, handleDownloadCSV, totalRevenue, totalExpenses, totalRefunds, methodCounts, topItemsArray, filteredSales, inventoryLogs = [], inventoryItems = [] }) {
  const { t } = useTranslation();
  
  // --- TRUE PROFIT MATH ENGINE ---
  const { totalCOGS, totalWastage, trueGrossProfit, trueNetProfit } = useMemo(() => {
    // 1. Get the IDs of the sales currently visible in the date filter
    const relevantTicketIds = new Set(filteredSales.map(sale => sale.id));
    
    let cogs = 0;
    let waste = 0;

    // 2. Scan every inventory log ever recorded
    inventoryLogs.forEach(log => {
      // Find the current monetary value of the item in the warehouse
      const matchedItem = inventoryItems.find(i => i.name === log.item_name);
      const unitCost = matchedItem ? matchedItem.unit_cost : 0;
      const financialImpact = log.qty_deducted * unitCost;

      if (log.deduction_type === 'sale') {
        // Only count COGS if the sale is within our current Date Filter
        if (relevantTicketIds.has(log.ticket_id)) {
          cogs += financialImpact;
        }
      } else {
        // Count Wastage/Spillage/Audits (Ideally, we'd date-filter this too, but we track all-time here for simplicity)
        waste += financialImpact;
      }
    });

    const gross = totalRevenue - cogs;
    const net = gross - waste - totalExpenses - totalRefunds;

    return { totalCOGS: cogs, totalWastage: waste, trueGrossProfit: gross, trueNetProfit: net };
  }, [filteredSales, inventoryLogs, inventoryItems, totalRevenue, totalExpenses, totalRefunds]);

  return (
    <div className="admin-section fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <h1 style={{ margin: 0, color: 'var(--text-main)', fontSize: '2rem', fontWeight: '800' }}>{t('analytics.title')}</h1>
          <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0', fontSize: '1.1rem' }}>{t('analytics.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Icon icon="lucide:calendar" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} style={{ padding: '12px 16px 12px 38px', borderRadius: '12px', border: '1px solid var(--border)', fontWeight: 'bold', background: 'var(--bg-surface)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer', appearance: 'none' }}>
              <option value="today">{t('analytics.filterToday')}</option>
              <option value="week">{t('analytics.filterWeek')}</option>
              <option value="month">{t('analytics.filterMonth')}</option>
              <option value="6months">{t('analytics.filter6Months')}</option>
              <option value="year">{t('analytics.filterYear')}</option>
              <option value="all">{t('analytics.filterAll')}</option>
            </select>
          </div>
          <button onClick={handleDownloadCSV} style={{ padding: '12px 20px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(52, 152, 219, 0.2)' }}>
            <Icon icon="lucide:download" />
            {t('analytics.exportCSV')}
          </button>
        </div>
      </div>

      {/* --- ROW 1: MENU HEALTH --- */}
      <h3 style={{ color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', fontSize: '1.2rem' }}>
        <Icon icon="lucide:bar-chart-3" style={{ color: 'var(--brand-color)' }} />
        {t('analytics.menuHealth')}
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px', marginBottom: '40px' }}>
        <div style={{ background: 'var(--bg-surface)', padding: '32px', borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', borderTop: '4px solid #3498db' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '800' }}>{t('analytics.grossRevenue')}</h3>
            <Icon icon="lucide:trending-up" style={{ color: '#3498db', fontSize: '1.5rem' }} />
          </div>
          <p style={{ margin: 0, fontSize: '2.5rem', fontWeight: '900', color: 'var(--text-main)', letterSpacing: '-1px' }}>${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        
        <div style={{ background: 'var(--bg-surface)', padding: '32px', borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', borderTop: '4px solid #e67e22' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '800' }}>{t('analytics.cogs')}</h3>
            <Icon icon="lucide:shopping-bag" style={{ color: '#e67e22', fontSize: '1.5rem' }} />
          </div>
          <p style={{ margin: 0, fontSize: '2.5rem', fontWeight: '900', color: '#e67e22', letterSpacing: '-1px' }}>-${totalCOGS.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>

        <div style={{ background: 'var(--bg-surface)', padding: '32px', borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', borderTop: '4px solid #2ecc71' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '800' }}>{t('analytics.grossProfit')}</h3>
            <Icon icon="lucide:badge-dollar-sign" style={{ color: '#2ecc71', fontSize: '1.5rem' }} />
          </div>
          <p style={{ margin: 0, fontSize: '2.5rem', fontWeight: '900', color: '#2ecc71', letterSpacing: '-1px' }}>${trueGrossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* --- ROW 2: BUSINESS HEALTHCARE --- */}
      <h3 style={{ color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', fontSize: '1.2rem' }}>
        <Icon icon="lucide:activity" style={{ color: 'var(--brand-color)' }} />
        {t('analytics.bizHealth')}
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px', marginBottom: '40px' }}>
        <div style={{ background: 'var(--bg-surface)', padding: '32px', borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', borderTop: '4px solid #e74c3c' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '800' }}>{t('analytics.wastage')}</h3>
            <Icon icon="lucide:trash-2" style={{ color: '#e74c3c', fontSize: '1.5rem' }} />
          </div>
          <p style={{ margin: 0, fontSize: '2.5rem', fontWeight: '900', color: '#e74c3c', letterSpacing: '-1px' }}>-${totalWastage.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>

        <div style={{ background: 'var(--bg-surface)', padding: '32px', borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', borderTop: '4px solid #f39c12' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '800' }}>{t('analytics.expenses')}</h3>
            <Icon icon="lucide:receipt" style={{ color: '#f39c12', fontSize: '1.5rem' }} />
          </div>
          <p style={{ margin: 0, fontSize: '2.5rem', fontWeight: '900', color: '#f39c12', letterSpacing: '-1px' }}>-${(totalExpenses + totalRefunds).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>

        <div style={{ background: 'var(--bg-surface)', padding: '32px', borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', borderTop: '4px solid #27ae60' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '800' }}>{t('analytics.netProfit')}</h3>
            <Icon icon="lucide:rocket" style={{ color: '#27ae60', fontSize: '1.5rem' }} />
          </div>
          <p style={{ margin: 0, fontSize: '2.5rem', fontWeight: '900', color: '#27ae60', letterSpacing: '-1px' }}>${trueNetProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '32px' }}>
        {/* TOP ITEMS */}
        <div style={{ background: 'var(--bg-surface)', padding: '32px', borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '24px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.3rem', fontWeight: '800' }}>
            <Icon icon="lucide:award" style={{ color: 'var(--brand-color)' }} />
            {t('analytics.topItems')}
          </h3>
          {topItemsArray.length === 0 ? (<p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{t('analytics.noSales')}</p>) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {topItemsArray.map(([itemName, count], index) => (
                <li key={itemName} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'var(--bg-main)', borderRadius: '16px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ height: '32px', width: '32px', background: index === 0 ? '#f1c40f' : 'var(--border)', color: index === 0 ? 'white' : 'var(--text-muted)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.9rem' }}>
                      {index + 1}
                    </span>
                    <span style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '1.1rem' }}>{itemName}</span>
                  </div>
                  <span style={{ fontWeight: '800', background: 'var(--brand-color)', padding: '6px 14px', borderRadius: '12px', color: 'white', fontSize: '0.9rem' }}>
                    {count} {t('analytics.sold')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* TEAM PERFORMANCE */}
        <div style={{ background: 'var(--bg-surface)', padding: '32px', borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '24px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.3rem', fontWeight: '800' }}>
            <Icon icon="lucide:users-2" style={{ color: 'var(--brand-color)' }} />
            {t('analytics.teamPerf')}
          </h3>
          {filteredSales.length === 0 ? (<p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{t('analytics.noCashier')}</p>) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {Object.entries(filteredSales.reduce((acc, order) => { const name = order.cashier_name || t('analytics.unknownCashier'); if (!acc[name]) acc[name] = { sales: 0, tickets: 0 }; acc[name].sales += order.total_amount || 0; acc[name].tickets += 1; return acc; }, {})).sort((a, b) => b[1].sales - a[1].sales).map(([name, data]) => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'var(--bg-main)', borderRadius: '16px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ height: '48px', width: '48px', borderRadius: '14px', background: 'var(--brand-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '1.2rem', boxShadow: '0 4px 10px rgba(52, 152, 219, 0.2)' }}>
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: '800', color: 'var(--text-main)', fontSize: '1.1rem' }}>{name}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{data.tickets} {t('analytics.tickets')}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: '900', color: '#27ae60' }}>${data.sales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AnalyticsTab;