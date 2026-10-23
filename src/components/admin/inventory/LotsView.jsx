import { Fragment } from 'react';
import { Icon } from '@iconify/react';
import { formatMillicentsForDisplay } from '../../../utils/moneyUtils';
import { useTranslation } from '../../../hooks/useTranslation';

export function LotsView({ addingLot, expandedLotId, handleAddBatch, inventoryItems, lotConsumptions, lotFilterItem, lotForm, lots, lottedRemaining, setAddingLot, setLotFilterItem, setLotForm, sortedItems, toggleLotExpand }) {
  const { t } = useTranslation();
  const lotItemNames = [...new Set(lots.map(l => l.item_name))].sort();
  const shown = lots.filter(l => !lotFilterItem || l.item_name === lotFilterItem);
  return (
  <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', marginBottom: '24px', border: '1px solid var(--border)', boxShadow: '0 10px 20px rgba(0,0,0,0.05)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '12px' }}>
      <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#16a085' }}>
        <Icon icon="lucide:layers" />
        {t('inv.lotsTitle')}
      </h3>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ width: '220px' }}>
          <select value={lotFilterItem} onChange={e => setLotFilterItem(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}>
            <option value="">{t('inv.filterAll')}</option>
            {lotItemNames.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
        <button onClick={() => setAddingLot(v => !v)} style={{ padding: '10px 16px', background: addingLot ? '#95a5a6' : '#16a085', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Icon icon={addingLot ? 'lucide:x' : 'lucide:plus'} />{addingLot ? t('inv.btnCancel') : t('inv.btnAddBatch')}
        </button>
      </div>
    </div>
    <p style={{ margin: '0 0 20px', fontSize: '0.88rem', color: 'var(--text-muted)' }}>{t('inv.lotsSubtitle')}</p>

    {addingLot && (() => {
      const selected = inventoryItems.find(i => String(i.id) === String(lotForm.itemId));
      const gap = selected ? Math.max(0, (Number(selected.current_stock) || 0) - lottedRemaining(selected.name)) : 0;
      return (
      <div style={{ background: 'rgba(22, 160, 133, 0.05)', border: '1px solid rgba(22, 160, 133, 0.25)', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 'bold', color: '#16a085', textTransform: 'uppercase', marginBottom: '12px' }}>{t('inv.addBatchTitle')}</div>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '2 1 200px' }}>
            <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.itemName')}</label>
            <select value={lotForm.itemId} onChange={e => {
                const it = inventoryItems.find(i => String(i.id) === String(e.target.value));
                const prefill = it ? Math.max(0, (Number(it.current_stock) || 0) - lottedRemaining(it.name)) : '';
                setLotForm({ ...lotForm, itemId: e.target.value, qty: prefill ? String(prefill) : '' });
              }} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}>
              <option value="">{t('inv.selectOption')}</option>
              {sortedItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 120px' }}>
            <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.thReceivedQty')}{selected ? ` (${selected.unit})` : ''}</label>
            <input type="number" value={lotForm.qty} onChange={e => setLotForm({ ...lotForm, qty: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.madeDate')}</label>
            <input type="date" value={lotForm.madeDate} onChange={e => setLotForm({ ...lotForm, madeDate: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
          </div>
          <div style={{ flex: '1 1 150px' }}>
            <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.receivedDate')}</label>
            <input type="date" value={lotForm.receivedDate} onChange={e => setLotForm({ ...lotForm, receivedDate: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
          </div>
          <button onClick={handleAddBatch} style={{ padding: '12px 22px', background: '#16a085', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}>{t('inv.btnSave')}</button>
        </div>
        <p style={{ margin: '12px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          {t('inv.addBatchHint')}{selected ? ` ${t('inv.addBatchUntracked')}: ${gap}${selected.unit}.` : ''}
        </p>
      </div>
      );
    })()}

    <div style={{ overflowX: 'auto' }}>
      <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: '820px' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thLotCode')}</th>
            <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.itemName')}</th>
            <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thMadeDate')}</th>
            <th style={{ textAlign: 'left', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thReceivedDate')}</th>
            <th style={{ textAlign: 'right', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thReceivedQty')}</th>
            <th style={{ textAlign: 'right', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thSold')}</th>
            <th style={{ textAlign: 'right', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thRemaining')}</th>
            <th style={{ textAlign: 'right', padding: '12px', borderBottom: '2px solid var(--border)' }}>{t('inv.thUnitCost')}</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((lot, idx) => {
            const sold = Math.max(0, (Number(lot.qty_received) || 0) - (Number(lot.qty_remaining) || 0));
            const isOpen = expandedLotId === lot.id;
            return (
            <Fragment key={lot.id || lot.local_id || idx}>
            <tr onClick={() => toggleLotExpand(lot)} className="hover-row" style={{ borderBottom: isOpen ? 'none' : '1px solid var(--border)', cursor: 'pointer' }}>
              <td style={{ padding: '12px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                <Icon icon={isOpen ? 'lucide:chevron-down' : 'lucide:chevron-right'} style={{ verticalAlign: 'middle', marginRight: '6px', color: 'var(--text-muted)' }} />
                {lot.lot_code || '—'}
              </td>
              <td style={{ padding: '12px' }}>{lot.item_name}</td>
              <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{lot.made_date || '—'}</td>
              <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{lot.received_date || '—'}</td>
              <td style={{ padding: '12px', textAlign: 'right' }}>{lot.qty_received}{lot.unit}</td>
              <td style={{ padding: '12px', textAlign: 'right', color: 'var(--text-muted)' }}>{sold}{lot.unit}</td>
              <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>{lot.qty_remaining}{lot.unit}</td>
              <td style={{ padding: '12px', textAlign: 'right' }}>{formatMillicentsForDisplay(lot.unit_cost || 0)}/{lot.unit}</td>
            </tr>
            {isOpen && (
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td colSpan={8} style={{ padding: '0 12px 16px 34px', background: 'rgba(22, 160, 133, 0.04)' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', padding: '12px 0 6px' }}>{t('inv.drawdownTitle')}</div>
                  {lotConsumptions.length === 0 ? (
                    <div style={{ padding: '8px 0 4px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('inv.drawdownEmpty')}</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                        {lotConsumptions.map((c, i) => (
                          <tr key={c.id || c.local_id || i}>
                            <td style={{ padding: '5px 0', color: 'var(--text-muted)', fontSize: '0.88rem', width: '190px' }}>{c.created_at ? new Date(c.created_at).toLocaleString() : '—'}</td>
                            <td style={{ padding: '5px 0', fontSize: '0.88rem' }}>{t('inv.drawdownTicket')} {c.ticket_id || '—'}</td>
                            <td style={{ padding: '5px 0', textAlign: 'right', fontWeight: 'bold', fontSize: '0.88rem' }}>{c.qty}{lot.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </td>
              </tr>
            )}
            </Fragment>
            );
          })}
          {shown.length === 0 && (
            <tr>
              <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('inv.lotsEmpty')}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
  );
}
