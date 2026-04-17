function AnalyticsTab({ timeFilter, setTimeFilter, handleDownloadCSV, totalRevenue, totalExpenses, totalRefunds, netProfit, methodCounts, topItemsArray, filteredSales }) {
  return (
    <div className="admin-section fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ margin: 0, color: 'var(--text-main)' }}>Dashboard Overview</h1>
          <p style={{ color: 'var(--text-muted)', margin: '5px 0 0 0' }}>Real-time sales performance and inventory movement.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 'bold', background: 'var(--bg-surface)', color: 'var(--text-main)' }}>
            <option value="today">Today</option><option value="week">Last 7 Days</option><option value="month">Last 30 Days</option><option value="6months">Last 6 Months</option><option value="year">Last Year</option><option value="all">All Time</option>
          </select>
          <button onClick={handleDownloadCSV} style={{ padding: '10px 20px', background: '#3498db', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>📥 Export CSV</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '24px', marginBottom: '32px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '150px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderTop: '4px solid #2980b9' }}><h3 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase' }}>Gross Revenue</h3><p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-main)' }}>${totalRevenue.toFixed(2)}</p></div>
        <div style={{ flex: 1, minWidth: '150px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderTop: '4px solid #e74c3c' }}><h3 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase' }}>Total Expenses</h3><p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#e74c3c' }}>-${totalExpenses.toFixed(2)}</p></div>
        <div style={{ flex: 1, minWidth: '150px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderTop: '4px solid #f39c12' }}><h3 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase' }}>Total Refunded</h3><p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#f39c12' }}>${totalRefunds.toFixed(2)}</p></div>
        <div style={{ flex: 1, minWidth: '150px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderTop: '4px solid #27ae60' }}><h3 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase' }}>Net Profit</h3><p style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold', color: '#27ae60' }}>${netProfit.toFixed(2)}</p></div>
        <div style={{ flex: 1, minWidth: '150px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderTop: '4px solid #9b59b6' }}><h3 style={{ margin: '0 0 16px 0', color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase' }}>Payment Methods</h3><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', color: 'var(--text-main)', fontWeight: 'bold', flexWrap: 'wrap', gap: '8px' }}><span>💵 {methodCounts['Cash'] || 0}</span><span>💳 {methodCounts['Card'] || 0}</span><span>📱 {methodCounts['Transfer'] || 0}</span>{(methodCounts['Split'] > 0) && <span style={{ color: 'var(--brand-color)' }}>🔀 {methodCounts['Split']} Splits</span>}</div></div>
      </div>
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '300px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>Top Selling Drinks</h3>
          {topItemsArray.length === 0 ? (<p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No sales data yet.</p>) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>{topItemsArray.map(([itemName, count], index) => (<li key={itemName} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px dashed var(--border)', fontSize: '1.1rem', color: 'var(--text-main)' }}><span><span style={{ color: 'var(--text-muted)', marginRight: '10px' }}>#{index + 1}</span> {itemName}</span><span style={{ fontWeight: 'bold', background: 'var(--bg-main)', padding: '4px 12px', borderRadius: '20px', color: 'var(--text-main)' }}>{count} sold</span></li>))}</ul>
          )}
        </div>
        <div style={{ flex: 1, minWidth: '300px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>Team Performance</h3>
          {filteredSales.length === 0 ? (<p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No cashier data yet.</p>) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {Object.entries(filteredSales.reduce((acc, order) => { const name = order.cashier_name || 'Unknown'; if (!acc[name]) acc[name] = { sales: 0, tickets: 0 }; acc[name].sales += order.total_amount || 0; acc[name].tickets += 1; return acc; }, {})).sort((a, b) => b[1].sales - a[1].sales).map(([name, data]) => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><div style={{ height: '36px', width: '36px', borderRadius: '18px', background: 'var(--brand-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1rem' }}>{name.charAt(0)}</div><div style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '1.05rem' }}>{name}</div></div>
                  <div style={{ textAlign: 'right' }}><div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#27ae60' }}>${data.sales.toFixed(2)}</div><div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{data.tickets} tickets</div></div>
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
