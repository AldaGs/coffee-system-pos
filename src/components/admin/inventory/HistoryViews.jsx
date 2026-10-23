import { Icon } from '@iconify/react';
import { formatForDisplay, millicentsToCents } from '../../../utils/moneyUtils';
import { useTranslation } from '../../../hooks/useTranslation';

export function DeletedView({ historyFilterItem, historyLogs, inventoryItems, setHistoryFilterItem }) {
  const { t } = useTranslation();
  const deletedItemNames = [...new Set(historyLogs.map(l => l.item_name))].filter(name => !inventoryItems.find(i => i.name === name));
  return (
  <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', marginBottom: '24px', border: '1px solid var(--border)', boxShadow: '0 10px 20px rgba(0,0,0,0.05)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
      <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#e74c3c' }}>
        <Icon icon="lucide:trash-2" />
        {t('inv.deletedTitle')}
      </h3>
      <div style={{ width: '250px' }}>
        <select value={historyFilterItem} onChange={e => setHistoryFilterItem(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}>
          <option value="">{t('inv.filterAll')}</option>
          {deletedItemNames.sort().map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>
    </div>

    <div style={{ overflowX: 'auto' }}>
      <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thDate')}</th>
            <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.itemName')}</th>
            <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thType')}</th>
            <th style={{ textAlign: 'right', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thQty')}</th>
            <th style={{ textAlign: 'right', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thImpact')}</th>
            <th style={{ textAlign: 'right', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thTicket')}</th>
          </tr>
        </thead>
        <tbody>
          {historyLogs.filter(l => deletedItemNames.includes(l.item_name)).filter(l => !historyFilterItem || l.item_name === historyFilterItem).map((log, idx) => {
            const qty = -log.qty_deducted;
            const isPositive = qty > 0;
            const color = isPositive ? '#2ecc71' : (qty < 0 ? '#e74c3c' : 'var(--text-main)');
            const dateStr = new Date(log.created_at).toLocaleString();
            const impactInCents = millicentsToCents(Math.abs(qty) * (log.unit_cost || 0));
            
            let actionLabel = log.deduction_type;
            if (log.deduction_type === 'added') actionLabel = t('inv.logAdded');
            if (log.deduction_type === 'restock') actionLabel = t('inv.logRestocked');
            if (log.deduction_type === 'sale') actionLabel = t('inv.logSale');
            if (log.deduction_type === 'transform_out') actionLabel = t('inv.logTransformOut');
            if (log.deduction_type === 'transform_in') actionLabel = t('inv.logTransformIn');
            if (log.deduction_type === 'removed') actionLabel = t('inv.logRemoved');
            if (log.deduction_type === 'refund_return') actionLabel = t('inv.logRefundReturn');
            if (log.deduction_type === 'checkout_rollback') actionLabel = t('inv.logRollback');
            if (log.deduction_type === 'unresolved_target') actionLabel = t('inv.logUnresolved');
            if (log.deduction_type === 'waste' || log.deduction_type === 'audit_correction') {
              actionLabel = isPositive ? t('inv.logAuditGain') : t('inv.logAuditLoss');
            }

            return (
              <tr key={log.id || log.local_id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>{dateStr}</td>
                <td style={{ padding: '12px', fontWeight: 'bold' }}>{log.item_name}</td>
                <td style={{ padding: '12px' }}>
                  <span style={{ background: 'var(--bg-main)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem' }}>{actionLabel}</span>
                </td>
                <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color }}>
                  {isPositive ? '+' : ''}{qty}
                </td>
                <td style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)' }}>
                  {impactInCents > 0 ? formatForDisplay(impactInCents) : '-'}
                </td>
                <td style={{ padding: '12px', textAlign: 'right', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{log.ticket_id}</td>
              </tr>
            );
          })}
          {historyLogs.length === 0 && (
            <tr>
              <td colSpan="6" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('inv.noHistory')}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
  );
}

export function HistoryModal({ historyLogs, historyModalItem, setHistoryModalItem }) {
  const { t } = useTranslation();
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
      <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '16px', width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, color: '#8e44ad', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon icon="lucide:history" />
            {t('inv.historyTitle')} - {historyModalItem}
          </h3>
          <button onClick={() => setHistoryModalItem(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem', display: 'flex' }}>
            <Icon icon="lucide:x" />
          </button>
        </div>
        
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thDate')}</th>
                <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thType')}</th>
                <th style={{ textAlign: 'right', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thQty')}</th>
                <th style={{ textAlign: 'right', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thImpact')}</th>
              </tr>
            </thead>
            <tbody>
              {historyLogs.filter(l => l.item_name === historyModalItem).map((log, idx) => {
                const qty = -log.qty_deducted;
                const isPositive = qty > 0;
                const color = isPositive ? '#2ecc71' : (qty < 0 ? '#e74c3c' : 'var(--text-main)');
                const dateStr = new Date(log.created_at).toLocaleString();
                const impactInCents = millicentsToCents(Math.abs(qty) * (log.unit_cost || 0));
                
                let actionLabel = log.deduction_type;
                if (log.deduction_type === 'added') actionLabel = t('inv.logAdded');
                if (log.deduction_type === 'restock') actionLabel = t('inv.logRestocked');
                if (log.deduction_type === 'sale') actionLabel = t('inv.logSale');
                if (log.deduction_type === 'transform_out') actionLabel = t('inv.logTransformOut');
                if (log.deduction_type === 'transform_in') actionLabel = t('inv.logTransformIn');
                if (log.deduction_type === 'removed') actionLabel = t('inv.logRemoved');
              if (log.deduction_type === 'refund_return') actionLabel = t('inv.logRefundReturn');
              if (log.deduction_type === 'checkout_rollback') actionLabel = t('inv.logRollback');
              if (log.deduction_type === 'unresolved_target') actionLabel = t('inv.logUnresolved');
                if (log.deduction_type === 'waste' || log.deduction_type === 'audit_correction') {
                  actionLabel = isPositive ? t('inv.logAuditGain') : t('inv.logAuditLoss');
                }

                return (
                  <tr key={log.id || log.local_id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>{dateStr}</td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ background: 'var(--bg-main)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem' }}>{actionLabel}</span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color }}>
                      {isPositive ? '+' : ''}{qty}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)' }}>
                      {impactInCents > 0 ? formatForDisplay(impactInCents) : '-'}
                    </td>
                  </tr>
                );
              })}
              {historyLogs.filter(l => l.item_name === historyModalItem).length === 0 && (
                <tr>
                  <td colSpan="4" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('inv.noHistory')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
