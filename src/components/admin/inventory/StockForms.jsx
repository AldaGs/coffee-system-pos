import { Icon } from '@iconify/react';
import { useTranslation } from '../../../hooks/useTranslation';

export function AddItemForm({ handleAddItem, newItem, setNewItem }) {
  const { t } = useTranslation();
  return (
    <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', marginBottom: '24px', border: '1px solid var(--border)', boxShadow: '0 10px 20px rgba(0,0,0,0.05)' }}>
      <h3 style={{ marginTop: 0, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon icon="lucide:package-plus" style={{ color: 'var(--brand-color)' }} />
        {t('inv.receiveTitle')}
      </h3>
      <div className="admin-form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.3fr auto', gap: '16px', alignItems: 'flex-end' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.itemName')}</label>
          <input type="text" value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.stockQty')}</label>
          <input type="number" value={newItem.current_stock} onChange={e => setNewItem({ ...newItem, current_stock: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.unit')}</label>
          <select value={newItem.unit} onChange={e => setNewItem({ ...newItem, unit: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}>
            <option value="g">{t('inv.unitG')}</option>
            <option value="ml">{t('inv.unitMl')}</option>
            <option value="units">{t('inv.unitPieces')}</option>
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.totalCost')}</label>
          <input type="number" placeholder={t('inv.invoiceTotal')} value={newItem.total_cost} onChange={e => setNewItem({ ...newItem, total_cost: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.paidWith') || '¿Cómo se pagó?'}</label>
          <select value={newItem.paymentSource} onChange={e => setNewItem({ ...newItem, paymentSource: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }} title="Solo aplica si hay costo">
            <option value="caja">{t('inv.paidCaja') || 'Caja Chica'}</option>
            <option value="banco">{t('inv.paidBanco') || 'Banco'}</option>
            <option value="dueno">{t('inv.paidOwner') || 'Dueño (mi dinero)'}</option>
          </select>
        </div>
        <button onClick={handleAddItem} style={{ padding: '12px 24px', background: '#2ecc71', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 10px rgba(46, 204, 113, 0.2)' }}>{t('inv.btnSave')}</button>
      </div>

      {/* Batch tracking: for roasted coffee / in-house batches received here
          (e.g. outsourced roasting). Reveals the roast + received dates. */}
      <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 600, color: 'var(--text-main)' }}>
          <input type="checkbox" className="switch" checked={newItem.trackLots} onChange={e => setNewItem({ ...newItem, trackLots: e.target.checked })} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
          <Icon icon="lucide:layers" style={{ color: '#16a085' }} />
          {t('inv.trackBatches')}
        </label>
        {newItem.trackLots && (
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '14px' }}>
            <div style={{ flex: '1 1 180px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.madeDate')}</label>
              <input type="date" value={newItem.madeDate} onChange={e => setNewItem({ ...newItem, madeDate: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
            </div>
            <div style={{ flex: '1 1 180px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.receivedDate')}</label>
              <input type="date" value={newItem.receivedDate} onChange={e => setNewItem({ ...newItem, receivedDate: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function TransformForm({ handleTransformStock, setTransformForm, sortedItems, transformForm }) {
  const { t } = useTranslation();
  return (
    <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', marginBottom: '24px', border: '2px solid #e67e22', boxShadow: '0 10px 20px rgba(230, 126, 34, 0.05)' }}>
      <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#e67e22', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon icon="lucide:flame" />
        {t('inv.roastTitle')}
      </h3>
      <div className="admin-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', alignItems: 'flex-end' }}>
        <div style={{ minWidth: '150px' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.rawMaterial')}</label>
          <select value={transformForm.sourceItemId} onChange={e => setTransformForm({ ...transformForm, sourceItemId: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}>
            <option value="">{t('inv.selectOption')}</option>
            {sortedItems.map(item => <option key={item.id} value={item.id}>{item.name} ({t('inv.has')} {item.current_stock}{item.unit})</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.usedQty')}</label>
          <input type="number" value={transformForm.amountUsed} onChange={e => setTransformForm({ ...transformForm, amountUsed: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.yieldQty')}</label>
          <input type="number" value={transformForm.yieldQty} onChange={e => setTransformForm({ ...transformForm, yieldQty: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.opCost')}</label>
          <input type="number" placeholder="e.g. 275" value={transformForm.operationalCost} onChange={e => setTransformForm({ ...transformForm, operationalCost: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.paidWith') || '¿Cómo se pagó?'}</label>
          <select value={transformForm.paymentSource} onChange={e => setTransformForm({ ...transformForm, paymentSource: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }} title="Solo aplica si hay costo de operación">
            <option value="caja">{t('inv.paidCaja') || 'Caja Chica'}</option>
            <option value="banco">{t('inv.paidBanco') || 'Banco'}</option>
            <option value="dueno">{t('inv.paidOwner') || 'Dueño (mi dinero)'}</option>
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.madeDate')}</label>
          <input type="date" value={transformForm.madeDate} onChange={e => setTransformForm({ ...transformForm, madeDate: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.receivedDate')}</label>
          <input type="date" value={transformForm.receivedDate} onChange={e => setTransformForm({ ...transformForm, receivedDate: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('inv.targetItem')}</label>
          <input
            type="text"
            list="inventory-names"
            placeholder={t('inv.typeNewOrSelect')}
            value={transformForm.targetItemName}
            onChange={e => setTransformForm({ ...transformForm, targetItemName: e.target.value })}
            style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }}
          />
          <datalist id="inventory-names">
            {sortedItems.map(item => <option key={item.id} value={item.name} />)}
          </datalist>
        </div>
        <button onClick={handleTransformStock} style={{ padding: '12px 24px', background: '#e67e22', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 10px rgba(230, 126, 34, 0.2)' }}>{t('inv.btnProcess')}</button>
      </div>
    </div>
  );
}
