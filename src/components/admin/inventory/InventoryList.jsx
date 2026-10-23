import { Icon } from '@iconify/react';
import { SortableDataTable } from '../../ui/arc';
import { formatForDisplay, formatMillicentsForDisplay, fromMillicents, millicentsToCents } from '../../../utils/moneyUtils';
import { isLowStock } from './stockMath';
import { todayStr } from './inventoryStore';
import { useTranslation } from '../../../hooks/useTranslation';

const menuItemStyle = { width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: 'transparent', border: 'none', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-main)', fontWeight: 600, fontSize: '0.92rem', textAlign: 'left' };

export function LowStockAlert({ returnToItemId, setActiveView, setAuditingItem, setEditingItem, setRestockingItem, sortedItems }) {
  const { t } = useTranslation();
  const lowItems = sortedItems.filter(isLowStock);
  if (lowItems.length === 0) return null;
  return (
    <div style={{ background: 'rgba(231, 76, 60, 0.06)', border: '1px solid rgba(231, 76, 60, 0.25)', borderRadius: 'var(--admin-card-radius)', padding: '16px 20px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', color: '#c0392b', fontWeight: 800 }}>
        <Icon icon="lucide:alert-triangle" style={{ fontSize: '1.3rem' }} />
        {t('inv.reorderAlertTitle')} · {lowItems.length}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {lowItems.map(item => (
          <button
            key={item.id}
            onClick={() => { returnToItemId.current = item.id; setRestockingItem({ ...item, qtyBought: '', totalPaid: '', paymentSource: 'caja', madeDate: todayStr(), receivedDate: todayStr() }); setEditingItem(null); setAuditingItem(null); setActiveView('list'); }}
            title={t('inv.restock')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px', background: 'var(--bg-surface)', border: '1px solid rgba(231, 76, 60, 0.3)', borderRadius: '20px', cursor: 'pointer', color: 'var(--text-main)', fontWeight: 'bold', fontSize: '0.9rem' }}
          >
            <Icon icon="lucide:package-plus" style={{ color: '#27ae60' }} />
            {item.name}
            <span style={{ color: '#c0392b' }}>{item.current_stock}{item.unit}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function InventoryList({ fetchHistoryLogs, handleDelete, inventoryRows, menuAnchor, menuOpenId, returnToItemId, rowRefs, setActiveView, setAuditingItem, setEditingItem, setHistoryModalItem, setMenuAnchor, setMenuOpenId, setRestockingItem, setSortConfig, sortConfig }) {
  const { t } = useTranslation();
  return (
    <>
    <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--admin-card-radius)', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
      <div className="arc">
        <SortableDataTable
          rows={inventoryRows}
          rowKey="id"
          caption={t('admin.inventory')}
          defaultSort={sortConfig}
          onSortChange={setSortConfig}
          columns={[
            {
              key: 'name', label: t('inv.thName'),
              // The ref lets an edit/restock panel scroll its row back into view on close.
              render: (_, row) => <span ref={(el) => { if (el) rowRefs.current.set(row.item.id, el); else rowRefs.current.delete(row.item.id); }} style={{ fontWeight: 700, scrollMarginTop: '16px', scrollMarginBottom: '16px' }}>{row.name}</span>,
            },
            {
              key: 'current_stock', label: t('inv.thStock'), numeric: false,
              render: (_, { item }) => (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: isLowStock(item) ? 'rgba(231, 76, 60, 0.1)' : 'rgba(46, 204, 113, 0.1)', borderRadius: '20px', color: isLowStock(item) ? '#e74c3c' : '#27ae60', fontWeight: 'bold', fontSize: '0.95rem' }} title={Number(item.reorder_point) > 0 ? `${t('inv.reorderPoint')}: ${item.reorder_point} ${item.unit}` : undefined}>
                  <Icon icon={isLowStock(item) ? 'lucide:alert-circle' : 'lucide:check-circle'} />
                  {item.current_stock} {item.unit}
                </div>
              ),
            },
            {
              key: 'unit_cost', label: t('inv.thCost'), numeric: false,
              render: (_, { item }) => (
                <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  {formatMillicentsForDisplay(item.unit_cost || 0)} / {item.unit}
                </span>
              ),
            },
            {
              key: 'actions', label: t('inv.thActions'), sortable: false,
              render: (_, { item }) => (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <button
                    onClick={(e) => {
                      if (menuOpenId === item.id) { setMenuOpenId(null); return; }
                      const r = e.currentTarget.getBoundingClientRect();
                      setMenuAnchor({ top: r.top, bottom: r.bottom, right: window.innerWidth - r.right });
                      setMenuOpenId(item.id);
                    }}
                    title={t('inv.thActions')}
                    aria-haspopup="menu"
                    aria-expanded={menuOpenId === item.id}
                    style={{ padding: '10px', background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', display: 'flex' }}
                  >
                    <Icon icon="lucide:more-vertical" style={{ fontSize: '1.2rem' }} />
                  </button>

                  {menuOpenId === item.id && menuAnchor && (() => {
                    // Flip upward when there isn't room for the ~5-item menu below.
                    const MENU_H = 260;
                    const openUp = menuAnchor.bottom + MENU_H > window.innerHeight;
                    return (
                    <>
                      {/* click-away backdrop */}
                      <div onClick={() => setMenuOpenId(null)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                      <div role="menu" style={{ position: 'fixed', ...(openUp ? { bottom: window.innerHeight - menuAnchor.top + 6 } : { top: menuAnchor.bottom + 6 }), right: menuAnchor.right, zIndex: 41, minWidth: '180px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', boxShadow: '0 12px 30px rgba(0,0,0,0.18)', overflow: 'hidden', padding: '6px' }}>
                        <button role="menuitem" className="inv-menu-item" onClick={() => { setMenuOpenId(null); setHistoryModalItem(item.name); fetchHistoryLogs(); }} style={menuItemStyle}>
                          <Icon icon="lucide:history" style={{ fontSize: '1.15rem', color: '#8e44ad' }} />{t('inv.btnHistory')}
                        </button>
                        <button role="menuitem" className="inv-menu-item" onClick={() => { setMenuOpenId(null); returnToItemId.current = item.id; setRestockingItem({ ...item, qtyBought: '', totalPaid: '', paymentSource: 'caja', madeDate: todayStr(), receivedDate: todayStr() }); setEditingItem(null); setAuditingItem(null); setActiveView('list'); }} style={menuItemStyle}>
                          <Icon icon="lucide:package-plus" style={{ fontSize: '1.15rem', color: '#27ae60' }} />{t('inv.restock')}
                        </button>
                        <button role="menuitem" className="inv-menu-item" onClick={() => { setMenuOpenId(null); returnToItemId.current = item.id; setAuditingItem({ ...item, actualCount: item.current_stock, reason: 'waste' }); setEditingItem(null); setRestockingItem(null); setActiveView('list'); }} style={menuItemStyle}>
                          <Icon icon="lucide:clipboard-check" style={{ fontSize: '1.15rem', color: '#e67e22' }} />{t('inv.btnAudit')}
                        </button>
                        <button role="menuitem" className="inv-menu-item" onClick={() => { setMenuOpenId(null); returnToItemId.current = item.id; setEditingItem({ ...item, unit_cost: fromMillicents(item.unit_cost || 0), total_cost: formatForDisplay(millicentsToCents(item.current_stock * (item.unit_cost || 0))) }); setAuditingItem(null); setRestockingItem(null); setActiveView('list'); }} style={menuItemStyle}>
                          <Icon icon="lucide:edit-2" style={{ fontSize: '1.15rem', color: 'var(--brand-color)' }} />{t('inv.btnEdit')}
                        </button>
                        <button role="menuitem" className="inv-menu-item" onClick={() => { setMenuOpenId(null); handleDelete(item.id, item.name); }} style={menuItemStyle}>
                          <Icon icon="lucide:trash-2" style={{ fontSize: '1.15rem', color: '#e74c3c' }} />{t('inv.btnDelete')}
                        </button>
                      </div>
                    </>
                    );
                  })()}
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>

    <style>{`
      .hover-row:hover {
        background: rgba(0,0,0,0.01);
      }
      .inv-menu-item:hover {
        background: var(--bg-main) !important;
      }
    `}</style>
    </>
  );
}
