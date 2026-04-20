import { useMemo } from 'react';
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ margin: 0, color: 'var(--text-main)' }}>{t('analytics.title')}</h1>
          <p style={{ color: 'var(--text-muted)', margin: '5px 0 0 0' }}>{t('analytics.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 'bold', background: 'var(--bg-surface)', color: 'var(--text-main)' }}>
            <option value="today">{t('analytics.filterToday')}</option>
            <option value="week">{t('analytics.filterWeek')}</option>
            <option value="month">{t('analytics.filterMonth')}</option>
            <option value="6months">{t('analytics.filter6Months')}</option>
            <option value="year">{t('analytics.filterYear')}</option>
            <option value="all">{t('analytics.filterAll')}</option>
          </select>
          <button onClick={handleDownloadCSV} style={{ padding: '10px 20px', background: '#3498db', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {t('analytics.exportCSV')}
          </button>
        </div>
      </div>

      {/* --- ROW 1: MENU HEALTH (SALES VS COGS) --- */}
      <h3 style={{ color: 'var(--text-main)', borderBottom: '2px solid var(--border)', paddingBottom: '8px', marginBottom: '16px' }}>{t('analytics.menuHealth')}</h3>
      <div style={{ display: 'flex', gap: '24px', marginBottom: '32px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '150px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderTop: '4px solid #3498db' }}>
          <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase' }}>{t('analytics.grossRevenue')}</h3>
          <p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-main)' }}>${totalRevenue.toFixed(2)}</p>
        </div>
        <div style={{ flex: 1, minWidth: '150px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderTop: '4px solid #e67e22' }}>
          <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase' }}>{t('analytics.cogs')}</h3>
          <p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#e67e22' }}>-${totalCOGS.toFixed(2)}</p>
        </div>
        <div style={{ flex: 1, minWidth: '150px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderTop: '4px solid #2ecc71' }}>
          <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase' }}>{t('analytics.grossProfit')}</h3>
          <p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#2ecc71' }}>${trueGrossProfit.toFixed(2)}</p>
        </div>
      </div>

      {/* --- ROW 2: BUSINESS HEALTHCARE  (LEAKS & BOTTOM LINE) --- */}
      <h3 style={{ color: 'var(--text-main)', borderBottom: '2px solid var(--border)', paddingBottom: '8px', marginBottom: '16px' }}>{t('analytics.bizHealth')}</h3>
      <div style={{ display: 'flex', gap: '24px', marginBottom: '32px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '150px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderTop: '4px solid #e74c3c' }}>
          <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase' }}>{t('analytics.wastage')}</h3>
          <p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#e74c3c' }}>-${totalWastage.toFixed(2)}</p>
        </div>
        <div style={{ flex: 1, minWidth: '150px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderTop: '4px solid #f39c12' }}>
          <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase' }}>{t('analytics.expenses')}</h3>
          <p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#f39c12' }}>-${(totalExpenses + totalRefunds).toFixed(2)}</p>
        </div>
        <div style={{ flex: 1, minWidth: '150px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderTop: '4px solid #27ae60' }}>
          <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase' }}>{t('analytics.netProfit')}</h3>
          <p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#27ae60' }}>${trueNetProfit.toFixed(2)}</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '300px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>{t('analytics.topItems')}</h3>
          {topItemsArray.length === 0 ? (<p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{t('analytics.noSales')}</p>) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>{topItemsArray.map(([itemName, count], index) => (<li key={itemName} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px dashed var(--border)', fontSize: '1.1rem', color: 'var(--text-main)' }}><span><span style={{ color: 'var(--text-muted)', marginRight: '10px' }}>#{index + 1}</span> {itemName}</span><span style={{ fontWeight: 'bold', background: 'var(--bg-main)', padding: '4px 12px', borderRadius: '20px', color: 'var(--text-main)' }}>{count} {t('analytics.sold')}</span></li>))}</ul>
          )}
        </div>
        <div style={{ flex: 1, minWidth: '300px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>{t('analytics.teamPerf')}</h3>
          {filteredSales.length === 0 ? (<p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{t('analytics.noCashier')}</p>) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {Object.entries(filteredSales.reduce((acc, order) => { const name = order.cashier_name || t('analytics.unknownCashier'); if (!acc[name]) acc[name] = { sales: 0, tickets: 0 }; acc[name].sales += order.total_amount || 0; acc[name].tickets += 1; return acc; }, {})).sort((a, b) => b[1].sales - a[1].sales).map(([name, data]) => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><div style={{ height: '36px', width: '36px', borderRadius: '18px', background: 'var(--brand-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1rem' }}>{name.charAt(0)}</div><div style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '1.05rem' }}>{name}</div></div>
                  <div style={{ textAlign: 'right' }}><div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#27ae60' }}>${data.sales.toFixed(2)}</div><div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{data.tickets} {t('analytics.tickets')}</div></div>
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