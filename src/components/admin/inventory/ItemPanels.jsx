import { Icon } from '@iconify/react';
import InfoTip from '../../shared/InfoTip';
import { formatForDisplay, millicentsToCents, toMillicents } from '../../../utils/moneyUtils';
import { useTranslation } from '../../../hooks/useTranslation';

export function EditPanel({ editingItem, handleSaveEdit, panelRef, setEditingItem }) {
  const { t } = useTranslation();
  return (
    <div ref={panelRef} style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', marginBottom: '24px', border: '1px solid var(--brand-color)', boxShadow: '0 10px 30px rgba(52, 152, 219, 0.1)', scrollMarginTop: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, color: 'var(--brand-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon icon="lucide:edit-3" />
          {t('inv.editTitle')}
        </h3>
        <button onClick={() => setEditingItem(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem', display: 'flex' }}>
          <Icon icon="lucide:x" />
        </button>
      </div>

      <div className="admin-form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: '16px', alignItems: 'flex-end' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.itemName')}</label>
          <input type="text" value={editingItem.name} onChange={e => setEditingItem({ ...editingItem, name: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.currentStock')}</label>
          <input type="number" value={editingItem.current_stock} onChange={e => {
            const newStock = e.target.value;
            setEditingItem({
              ...editingItem,
              current_stock: newStock,
              total_cost: newStock === '' ? '' : formatForDisplay(millicentsToCents(parseFloat(newStock) * editingItem.unit_cost))
            })
          }} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--brand-color)' }}>{t('inv.unitCost')}</label>
          <input type="number" step="0.0001" value={editingItem.unit_cost} onChange={e => {
            const newUnit = e.target.value;
            const stock = parseFloat(editingItem.current_stock) || 0;
            setEditingItem({
              ...editingItem,
              unit_cost: newUnit,
              total_cost: newUnit === '' ? '' : formatForDisplay(millicentsToCents(stock * toMillicents(newUnit)))
            })
          }} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--brand-color)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.reorderPoint')}{' '}<InfoTip text={t('inv.reorderPointHint')} section="inventory" /></label>
          <input type="number" min="0" step="any" placeholder="0" value={editingItem.reorder_point ?? ''} onChange={e => setEditingItem({ ...editingItem, reorder_point: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
        </div>

        <button onClick={handleSaveEdit} style={{ padding: '12px 24px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 10px rgba(52, 152, 219, 0.2)' }}>{t('inv.btnUpdate')}</button>
      </div>
    </div>
  );
}

export function RestockPanel({ handleSaveRestock, panelRef, restockingItem, setRestockingItem }) {
  const { t } = useTranslation();
  return (
    <div ref={panelRef} style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', marginBottom: '24px', border: '2px solid #27ae60', boxShadow: '0 10px 30px rgba(39, 174, 96, 0.1)', scrollMarginTop: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, color: '#27ae60', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon icon="lucide:package-plus" />
          {t('inv.restock')} - {restockingItem.name}
        </h3>
        <button onClick={() => setRestockingItem(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem', display: 'flex' }}>
          <Icon icon="lucide:x" />
        </button>
      </div>

      <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>{t('inv.restockDesc')}</p>

      <div className="admin-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '16px', alignItems: 'flex-start' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.qtyBought')} ({restockingItem.unit})</label>
          <input type="number" placeholder="0" value={restockingItem.qtyBought || ''} onChange={e => setRestockingItem({ ...restockingItem, qtyBought: e.target.value })} style={{ width: '100%', padding: '16px', fontSize: '1.2rem', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.totalPaid')} ($)</label>
          <input type="number" placeholder="0.00" value={restockingItem.totalPaid || ''} onChange={e => setRestockingItem({ ...restockingItem, totalPaid: e.target.value })} style={{ width: '100%', padding: '16px', fontSize: '1.2rem', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />

          <div style={{ marginTop: '14px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.paidWith') || '¿Cómo se pagó?'}</label>
            <select value={restockingItem.paymentSource || 'caja'} onChange={e => setRestockingItem({ ...restockingItem, paymentSource: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}>
              <option value="caja">{t('inv.paidCaja') || 'Caja Chica'}</option>
              <option value="banco">{t('inv.paidBanco') || 'Banco'}</option>
              <option value="dueno">{t('inv.paidOwner') || 'Dueño (mi dinero)'}</option>
            </select>
          </div>
        </div>

        <div style={{ alignSelf: 'stretch', display: 'flex', alignItems: 'flex-start' }}>
          <button onClick={handleSaveRestock} style={{ height: '55px', padding: '0 30px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 10px rgba(39, 174, 96, 0.2)' }}>
            {t('inv.restock')}
          </button>
        </div>
      </div>

      {/* Batch-tracked item: a restock is a new delivery, so it opens a new
          lot. Capture the roast + received dates for it. */}
      {restockingItem.track_lots && (
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '18px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#16a085', fontWeight: 600, flex: '1 1 100%' }}>
            <Icon icon="lucide:layers" />{t('inv.restockNewBatch')}
          </div>
          <div style={{ flex: '1 1 180px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.madeDate')}</label>
            <input type="date" value={restockingItem.madeDate} onChange={e => setRestockingItem({ ...restockingItem, madeDate: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
          </div>
          <div style={{ flex: '1 1 180px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.receivedDate')}</label>
            <input type="date" value={restockingItem.receivedDate} onChange={e => setRestockingItem({ ...restockingItem, receivedDate: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
          </div>
        </div>
      )}
    </div>
  );
}

export function AuditPanel({ auditingItem, handleSaveAudit, panelRef, setAuditingItem }) {
  const { t } = useTranslation();
  return (
    <div ref={panelRef} style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', marginBottom: '24px', border: '2px solid #e74c3c', boxShadow: '0 10px 30px rgba(231, 76, 60, 0.1)', scrollMarginTop: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, color: '#e74c3c', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon icon="lucide:clipboard-check" />
          {t('inv.auditTitle')}
        </h3>
        <button onClick={() => setAuditingItem(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem', display: 'flex' }}>
          <Icon icon="lucide:x" />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', alignItems: 'start' }}>

        <div style={{ background: 'var(--bg-main)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border)', textAlign: 'center' }}>
          <p style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase' }}>{t('inv.expectedStock')}</p>
          <div style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-main)' }}>{auditingItem.current_stock} <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>{auditingItem.unit}</span></div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '8px', fontWeight: 'bold', color: '#e74c3c' }}>{t('inv.actualCount')}</label>
          <input type="number" autoFocus value={auditingItem.actualCount || ''} onChange={e => {
            setAuditingItem({ ...auditingItem, actualCount: e.target.value })
          }} style={{ width: '100%', padding: '16px', borderRadius: '12px', border: '2px solid #e74c3c', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1.5rem', fontWeight: '800', textAlign: 'center', outline: 'none' }} />
        </div>

        {auditingItem.actualCount !== undefined && auditingItem.actualCount !== '' && (() => {
          const variance = parseFloat(auditingItem.actualCount) - auditingItem.current_stock;
          const isLoss = variance < 0;

          const unitCost = auditingItem.unit_cost || 0;
          const financialImpactInCents = millicentsToCents(Math.abs(variance * unitCost));

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="mobile-flex-stack" style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1, padding: '12px', background: isLoss ? 'rgba(231,76,60,0.05)' : 'rgba(46,204,113,0.05)', borderRadius: '12px', border: `1px solid ${isLoss ? 'rgba(231,76,60,0.2)' : 'rgba(46,204,113,0.2)'}`, textAlign: 'center' }}>
                  <p style={{ margin: '0 0 4px 0', fontSize: '0.75rem', color: isLoss ? '#e74c3c' : '#2ecc71', fontWeight: 'bold' }}>{t('inv.variance')}</p>
                  <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: isLoss ? '#e74c3c' : '#2ecc71' }}>{variance > 0 ? '+' : ''}{variance} {auditingItem.unit}</div>
                </div>
                <div style={{ flex: 1, padding: '12px', background: isLoss ? 'rgba(231,76,60,0.05)' : 'rgba(46,204,113,0.05)', borderRadius: '12px', border: `1px solid ${isLoss ? 'rgba(231,76,60,0.2)' : 'rgba(46,204,113,0.2)'}`, textAlign: 'center' }}>
                  <p style={{ margin: '0 0 4px 0', fontSize: '0.75rem', color: isLoss ? '#e74c3c' : '#2ecc71', fontWeight: 'bold' }}>{t('inv.financialImpact')}</p>
                  <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: isLoss ? '#e74c3c' : '#2ecc71' }}>{isLoss ? '-' : '+'}{formatForDisplay(financialImpactInCents)}</div>
                </div>
              </div>

              {isLoss && (
                <select value={auditingItem.reason || 'waste'} onChange={e => setAuditingItem({ ...auditingItem, reason: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}>
                  <option value="waste">{t('inv.reasonWaste')}</option>
                  <option value="expired">{t('inv.reasonExpired')}</option>
                  <option value="comp">{t('inv.reasonComp')}</option>
                  <option value="audit_correction">{t('inv.reasonAudit')}</option>
                </select>
              )}

              <button onClick={handleSaveAudit} style={{ padding: '16px', background: isLoss ? '#e74c3c' : '#2ecc71', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1.1rem', boxShadow: `0 8px 20px ${isLoss ? 'rgba(231, 76, 60, 0.2)' : 'rgba(46, 204, 113, 0.2)'}` }}>
                {isLoss ? t('inv.btnConfirmLoss') : t('inv.btnConfirmAdj')}
              </button>
            </div>
          );
        })()}

      </div>
    </div>
  );
}
