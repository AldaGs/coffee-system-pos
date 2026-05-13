import { useMemo } from 'react';
import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';
import { formatForDisplay, millicentsToCents, normalizeUnitCostToMillicents } from '../../utils/moneyUtils';
import { computeCogsAndWastage } from '../../utils/cogsMath';

function AnalyticsTab({ timeFilter, setTimeFilter, dateRange, setDateRange, handleDownloadCSV, totalRevenue, totalExpenses, topItemsArray, filteredSales, inventoryLogs = [], inventoryItems = [], filteredExpenses = [], allSales = [], tipPayouts = [] }) {
  const { t } = useTranslation();

  // --- TRUE PROFIT MATH ENGINE ---
  const { totalCOGS, totalWastage, trueGrossProfit, trueNetProfit, totalTips } = useMemo(() => {
    // Tips are a custodial liability, not revenue. "Tips earned this period"
    // = tip_amount - tip_refunded for each sale. Legacy rows (pre-ledger) fall
    // back to a pro-rata heuristic against refund_amount.
    let tips = 0;
    filteredSales.forEach(sale => {
      const tip = Number(sale.tip_amount) || 0;
      if (!tip) return;
      const hasLedger = sale.tip_refunded !== undefined && sale.tip_refunded !== null;
      if (hasLedger) {
        tips += Math.max(0, tip - Number(sale.tip_refunded));
        return;
      }
      if (sale.status === 'refunded') return;
      if (sale.status === 'partial_refund') {
        const total = Number(sale.total_amount) || 0;
        const refund = Number(sale.refund_amount) || 0;
        const keptRatio = total > 0 ? Math.max(0, 1 - refund / total) : 0;
        tips += Math.round(tip * keptRatio);
      } else {
        tips += tip;
      }
    });

    const { totalCOGS: cogs, totalWastage: waste } = computeCogsAndWastage({
      filteredSales, inventoryLogs, inventoryItems, timeFilter, dateRange
    });

    const gross = totalRevenue - cogs;
    const net = gross - waste - totalExpenses;

    return {
      totalCOGS: cogs,
      totalWastage: waste,
      trueGrossProfit: gross,
      trueNetProfit: net,
      totalTips: tips
    };
  }, [filteredSales, inventoryLogs, inventoryItems, totalRevenue, totalExpenses, timeFilter, dateRange]);

  // Outstanding tip liability across ALL time (balance-sheet figure, period-independent).
  // Accrued = SUM(tip_amount - tip_refunded) on every sale ever.
  // Paid out = SUM(amount) on every tip_payouts row.
  // Payable = Accrued - Paid out. Should be >= 0; negative means the shop
  // paid out more than was collected (over-payment / data drift) — flag it.
  const tipsPayable = useMemo(() => {
    const accrued = (allSales || []).reduce((sum, s) => {
      const tip = Number(s.tip_amount) || 0;
      const refunded = Number(s.tip_refunded) || 0;
      return sum + Math.max(0, tip - refunded);
    }, 0);
    const paid = (tipPayouts || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    return { accrued, paid, balance: accrued - paid };
  }, [allSales, tipPayouts]);

  // COGS by sold product + count of items sold with no inventory tracking.
  // Allocation: each sale-type log is attributed to its ticket; the ticket's
  // total cost is then split across its line items proportionally to each
  // line's revenue (basePrice * qty). Items without inventoryMode/recipe
  // linkage are flagged separately so the user knows COGS is understated.
  const { cogsByProduct, untrackedItemCount } = useMemo(() => {
    const relevantTicketIds = new Set(
      filteredSales
        .map(sale => sale.ticket_id)
        .filter(tid => tid !== undefined && tid !== null && tid !== '')
        .map(String)
    );

    const costByTicket = new Map();
    inventoryLogs.forEach(log => {
      if (log.deduction_type !== 'sale') return;
      if (!log.ticket_id) return;
      const tid = String(log.ticket_id);
      if (!relevantTicketIds.has(tid)) return;
      const matchedItem = inventoryItems.find(i => i.name === log.item_name);
      const fallbackCost = matchedItem ? matchedItem.unit_cost : 0;
      const rawCost = (log.unit_cost !== undefined && log.unit_cost !== null) ? log.unit_cost : fallbackCost;
      const unitCost = normalizeUnitCostToMillicents(rawCost);
      const impact = millicentsToCents(log.qty_deducted * unitCost);
      costByTicket.set(tid, (costByTicket.get(tid) || 0) + impact);
    });

    const byProduct = {};
    let untrackedQty = 0;

    filteredSales.forEach(sale => {
      const tid = sale.ticket_id ? String(sale.ticket_id) : null;
      const ticketCogs = (tid && costByTicket.get(tid)) || 0;
      const items = Array.isArray(sale.items) ? sale.items : [];
      if (items.length === 0) return;

      const lineValues = items.map(it => (Number(it.basePrice ?? it.price) || 0) * (Number(it.qty) || 1));
      const totalLineValue = lineValues.reduce((s, v) => s + v, 0);

      items.forEach((it, idx) => {
        const name = it.name || 'Unknown';
        const qty = Number(it.qty) || 1;
        const tracked =
          (it.inventoryMode === 'standard' && it.linkedWarehouseId) ||
          (it.inventoryMode === 'recipe' && it.linkedRecipeId);
        if (!tracked) untrackedQty += qty;

        const share = totalLineValue > 0 ? lineValues[idx] / totalLineValue : 1 / items.length;
        const itemCogs = ticketCogs * share;
        if (!byProduct[name]) byProduct[name] = { qty: 0, cogs: 0 };
        byProduct[name].qty += qty;
        byProduct[name].cogs += itemCogs;
      });
    });

    const sorted = Object.entries(byProduct)
      .filter(([, v]) => v.cogs > 0)
      .sort((a, b) => b[1].cogs - a[1].cogs);

    return { cogsByProduct: sorted, untrackedItemCount: untrackedQty };
  }, [filteredSales, inventoryLogs, inventoryItems]);

  const totalInventoryValue = useMemo(() => {
    return inventoryItems.reduce((sum, item) => {
      const unitCost = normalizeUnitCostToMillicents(item.unit_cost);
      return sum + millicentsToCents((item.current_stock || 0) * unitCost);
    }, 0);
  }, [inventoryItems]);

  const expensesByCategory = useMemo(() => {
    return filteredExpenses
      .filter(exp => !(exp.reason || '').startsWith('RESTOCK:'))
      .reduce((acc, exp) => {
        const category = exp.category || 'General';
        acc[category] = (acc[category] || 0) + exp.amount;
        return acc;
      }, {});
  }, [filteredExpenses]);

  // Team Performance (extracted from JSX to fix Rules of Hooks violation)
  const teamPerformance = useMemo(() => {
    return Object.entries(
      filteredSales.reduce((acc, order) => {
        const name = order.cashier_name || t('analytics.unknownCashier');
        if (!acc[name]) acc[name] = { sales: 0, tickets: 0 };
        const netAmount = order.status === 'refunded'
          ? 0
          : (order.total_amount || 0) - (order.refund_amount || 0);
        acc[name].sales += netAmount;
        acc[name].tickets += 1;
        return acc;
      }, {})
    ).sort((a, b) => b[1].sales - a[1].sales);
  }, [filteredSales, t]);

  return (
    <div className="admin-section fade-in">
      <div className="admin-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <h1 style={{ margin: 0, color: 'var(--text-main)', fontSize: '2rem', fontWeight: '800' }}>{t('analytics.title')}</h1>
          <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0', fontSize: '1.1rem' }}>{t('analytics.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Icon icon="lucide:calendar" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} style={{ padding: '12px 16px 12px 38px', borderRadius: '12px', border: '1px solid var(--border)', fontWeight: 'bold', background: 'var(--bg-surface)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer', appearance: 'none' }}>
              <option value="today">{t('analytics.filterToday')}</option>
              <option value="week">{t('analytics.filterWeek')}</option>
              <option value="month">{t('analytics.filterMonth')}</option>
              <option value="6months">{t('analytics.filter6Months')}</option>
              <option value="year">{t('analytics.filterYear')}</option>
              <option value="all">{t('analytics.filterAll')}</option>
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
      <div className="admin-grid-responsive" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px', marginBottom: '40px' }}>
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', borderTop: '4px solid #3498db' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '800' }}>{t('analytics.grossRevenue')}</h3>
            <Icon icon="lucide:trending-up" style={{ color: '#3498db', fontSize: '1.5rem' }} />
          </div>
          <p style={{ margin: 0, fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', fontWeight: '900', color: 'var(--text-main)', letterSpacing: '-1px' }}>{formatForDisplay(totalRevenue)}</p>
        </div>

        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', borderTop: '4px solid #e67e22' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '800' }}>{t('analytics.cogs')}</h3>
            <Icon icon="lucide:shopping-bag" style={{ color: '#e67e22', fontSize: '1.5rem' }} />
          </div>
          <p style={{ margin: 0, fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', fontWeight: '900', color: '#e67e22', letterSpacing: '-1px' }}>-{formatForDisplay(totalCOGS)}</p>
          {untrackedItemCount > 0 && (
            <div style={{ marginTop: '12px', padding: '8px 12px', background: 'rgba(243, 156, 18, 0.1)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#b9770e' }}>
              <Icon icon="lucide:alert-triangle" style={{ flexShrink: 0 }} />
              <span>{t('analytics.untrackedWarning').replace('{count}', untrackedItemCount)}</span>
            </div>
          )}
        </div>

        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', borderTop: '4px solid #2ecc71' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '800' }}>{t('analytics.grossProfit')}</h3>
            <Icon icon="lucide:badge-dollar-sign" style={{ color: '#2ecc71', fontSize: '1.5rem' }} />
          </div>
          <p style={{ margin: 0, fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', fontWeight: '900', color: '#2ecc71', letterSpacing: '-1px' }}>{formatForDisplay(trueGrossProfit)}</p>
        </div>
      </div>

      {/* --- ROW 2: BUSINESS HEALTHCARE --- */}
      <h3 style={{ color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', fontSize: '1.2rem' }}>
        <Icon icon="lucide:activity" style={{ color: 'var(--brand-color)' }} />
        {t('analytics.bizHealth')}
      </h3>
      <div className="admin-grid-responsive" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px', marginBottom: '40px' }}>
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', borderTop: '4px solid #e74c3c' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '800' }}>{t('analytics.wastage')}</h3>
            <Icon icon="lucide:trash-2" style={{ color: '#e74c3c', fontSize: '1.5rem' }} />
          </div>
          <p style={{ margin: 0, fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', fontWeight: '900', color: '#e74c3c', letterSpacing: '-1px' }}>-{formatForDisplay(totalWastage)}</p>
        </div>

        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', borderTop: '4px solid #f39c12' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '800' }}>{t('analytics.expenses')}</h3>
            <Icon icon="lucide:receipt" style={{ color: '#f39c12', fontSize: '1.5rem' }} />
          </div>
          <p style={{ margin: 0, fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', fontWeight: '900', color: '#f39c12', letterSpacing: '-1px' }}>-{formatForDisplay(totalExpenses)}</p>
        </div>

        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', borderTop: '4px solid #27ae60' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '800' }}>{t('analytics.netProfit')}</h3>
            <Icon icon="lucide:rocket" style={{ color: '#27ae60', fontSize: '1.5rem' }} />
          </div>
          <p style={{ margin: 0, fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', fontWeight: '900', color: '#27ae60', letterSpacing: '-1px' }}>{formatForDisplay(trueNetProfit)}</p>
        </div>

        {/* --- TIPS CARD --- */}
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', borderTop: '4px solid #8e44ad' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '800' }}>{t('analytics.tips')}</h3>
            <Icon icon="lucide:heart-handshake" style={{ color: '#8e44ad', fontSize: '1.5rem' }} />
          </div>
          <p style={{ margin: 0, fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', fontWeight: '900', color: '#8e44ad', letterSpacing: '-1px' }}>{formatForDisplay(totalTips)}</p>
        </div>

        {/* --- TIPS PAYABLE (LIABILITY) CARD --- */}
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', borderTop: '4px solid #16a085' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ margin: '0 0 4px 0', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '800' }}>{t('analytics.tipsPayable')}</h3>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('analytics.tipsPayableDesc')}</span>
            </div>
            <Icon icon="lucide:wallet" style={{ color: '#16a085', fontSize: '1.5rem' }} />
          </div>
          <p style={{ margin: '8px 0 0 0', fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', fontWeight: '900', color: tipsPayable.balance < 0 ? '#e74c3c' : '#16a085', letterSpacing: '-1px' }}>{formatForDisplay(tipsPayable.balance)}</p>
          <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <span>{t('analytics.tipsAccrued')}: <b>{formatForDisplay(tipsPayable.accrued)}</b></span>
            <span>{t('analytics.tipsPaidOut')}: <b>{formatForDisplay(tipsPayable.paid)}</b></span>
          </div>
        </div>

        {/* --- INVENTORY ASSET VALUE CARD --- */}
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', borderTop: '4px solid #9b59b6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ margin: '0 0 4px 0', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '800' }}>{t('analytics.invValue')}</h3>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('analytics.invValueDesc')}</span>
            </div>
            <Icon icon="lucide:boxes" style={{ color: '#9b59b6', fontSize: '1.5rem' }} />
          </div>
          <p style={{ margin: '8px 0 0 0', fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', fontWeight: '900', color: '#9b59b6', letterSpacing: '-1px' }}>{formatForDisplay(totalInventoryValue)}</p>
        </div>
      </div>

      <div className="admin-grid-responsive" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '32px' }}>
        {/* TOP ITEMS */}
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)' }}>
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
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '24px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.3rem', fontWeight: '800' }}>
            <Icon icon="lucide:users-2" style={{ color: 'var(--brand-color)' }} />
            {t('analytics.teamPerf')}
          </h3>
          {filteredSales.length === 0 ? (<p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{t('analytics.noCashier')}</p>) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {teamPerformance.map(([name, data]) => (
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
                    <div style={{ fontSize: '1.3rem', fontWeight: '900', color: '#27ae60' }}>{formatForDisplay(data.sales)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* COGS BY PRODUCT */}
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '24px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.3rem', fontWeight: '800' }}>
            <Icon icon="lucide:shopping-bag" style={{ color: '#e67e22' }} />
            {t('analytics.cogsByProduct')}
          </h3>
          {cogsByProduct.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{t('analytics.noCogsData')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {cogsByProduct.map(([productName, data]) => (
                <div key={productName} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'var(--bg-main)', borderRadius: '16px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{productName}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{data.qty} {t('analytics.sold')}</span>
                  </div>
                  <span style={{ fontWeight: '800', color: '#e67e22' }}>-{formatForDisplay(data.cogs)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* EXPENSES BY CATEGORY */}
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '24px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.3rem', fontWeight: '800' }}>
            <Icon icon="lucide:layers" style={{ color: '#9b59b6' }} />
            {t('analytics.expensesByCategory')}
          </h3>
          {Object.keys(expensesByCategory).length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{t('analytics.noExpenses')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {Object.entries(expensesByCategory).sort((a, b) => b[1] - a[1]).map(([category, amount]) => (
                <div key={category} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'var(--bg-main)', borderRadius: '16px', border: '1px solid var(--border)' }}>
                  <span style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{category}</span>
                  <span style={{ fontWeight: '800', color: '#f39c12' }}>{formatForDisplay(amount)}</span>
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
