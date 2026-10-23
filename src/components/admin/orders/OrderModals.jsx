import { Icon } from '@iconify/react';
import { formatForDisplay } from '../../../utils/moneyUtils';
import { itemsRefundCents, lineRefundableQty, lineUnitCents, restockCandidates } from './refundMath';

export function RefundModal({ refund, t }) {
  const { refundModal, closeRefund, refundMode, setRefundMode, refundAmount, setRefundAmount, refundItems, setRefundItems, tipRefundMode, setTipRefundMode, restockItems, setRestockItems, handleProcessRefund } = refund;
  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-content fade-in" style={{ maxWidth: '450px', background: 'var(--bg-surface)' }}>
        <h2 style={{ marginTop: 0, marginBottom: '24px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Icon icon="lucide:rotate-ccw" style={{ color: 'var(--brand-color)' }} />
          {t('orders.refundTitle')}
        </h2>

        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '12px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('orders.refundType')}</label>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => setRefundMode('all')}
              style={{
                flex: 1,
                padding: '16px',
                borderRadius: '12px',
                border: `2px solid ${refundMode === 'all' ? 'var(--brand-color)' : 'var(--border)'}`,
                background: refundMode === 'all' ? 'rgba(52, 152, 219, 0.05)' : 'transparent',
                color: refundMode === 'all' ? 'var(--brand-color)' : 'var(--text-muted)',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              {t('orders.refundAll')}
            </button>
            <button
              onClick={() => setRefundMode('custom')}
              style={{
                flex: 1,
                padding: '16px',
                borderRadius: '12px',
                border: `2px solid ${refundMode === 'custom' ? 'var(--brand-color)' : 'var(--border)'}`,
                background: refundMode === 'custom' ? 'rgba(52, 152, 219, 0.05)' : 'transparent',
                color: refundMode === 'custom' ? 'var(--brand-color)' : 'var(--text-muted)',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              {t('orders.refundCustom')}
            </button>
            {Array.isArray(refundModal.order.items) && refundModal.order.items.length > 0 && (
              <button
                onClick={() => setRefundMode('items')}
                style={{
                  flex: 1,
                  padding: '16px',
                  borderRadius: '12px',
                  border: `2px solid ${refundMode === 'items' ? 'var(--brand-color)' : 'var(--border)'}`,
                  background: refundMode === 'items' ? 'rgba(52, 152, 219, 0.05)' : 'transparent',
                  color: refundMode === 'items' ? 'var(--brand-color)' : 'var(--text-muted)',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                {t('orders.refundByItem')}
              </button>
            )}
          </div>
        </div>

        <div style={{ marginBottom: '32px' }}>
          <label style={{ display: 'block', marginBottom: '12px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('orders.refundTotal')}</label>
          {refundMode === 'all' ? (
            <div style={{ fontSize: '2.5rem', fontWeight: '900', color: 'var(--text-main)', textAlign: 'center', padding: '10px 0' }}>
              {formatForDisplay(Number(refundModal.order.total_amount) - Number(refundModal.order.refund_amount || 0))}
            </div>
          ) : refundMode === 'items' ? (
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                {(refundModal.order.items || []).map((line, idx) => {
                  const maxQty = lineRefundableQty(refundModal.order, idx, line);
                  const sel = Number(refundItems[idx]) || 0;
                  const disabled = maxQty <= 0;
                  const setQty = (q) => setRefundItems({ ...refundItems, [idx]: Math.max(0, Math.min(maxQty, q)) });
                  return (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: disabled ? 'transparent' : 'var(--bg-main)', opacity: disabled ? 0.5 : 1 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 'bold', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line.emoji ? `${line.emoji} ` : ''}{line.name}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {formatForDisplay(lineUnitCents(line))} · {disabled ? t('orders.refundedAll') : `${maxQty} ${t('orders.refundAvailable')}`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button disabled={disabled || sel <= 0} onClick={() => setQty(sel - 1)} style={{ width: 32, height: 32, borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-main)', cursor: 'pointer', fontWeight: 'bold' }}>−</button>
                        <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 'bold', color: 'var(--text-main)' }}>{sel}</span>
                        <button disabled={disabled || sel >= maxQty} onClick={() => setQty(sel + 1)} style={{ width: 32, height: 32, borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-main)', cursor: 'pointer', fontWeight: 'bold' }}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ textAlign: 'right', marginTop: '12px', fontSize: '1.3rem', fontWeight: '900', color: 'var(--text-main)' }}>
                {formatForDisplay(itemsRefundCents(refundModal.order, refundItems))}
              </div>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--text-muted)' }}>$</span>
              <input
                type="number"
                step="0.01"
                autoFocus
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                placeholder="0.00"
                style={{
                  width: '100%',
                  padding: '16px 16px 16px 32px',
                  fontSize: '1.5rem',
                  fontWeight: 'bold',
                  borderRadius: '12px',
                  border: '2px solid var(--border)',
                  background: 'var(--bg-main)',
                  color: 'var(--text-main)',
                  outline: 'none'
                }}
              />
            </div>
          )}
        </div>

        {/* --- BACK INTO STOCK? --- */}
        {/* A refunded latte's milk and shot are gone; a refunded bottle of
            water goes back on the shelf. Only the operator knows which, so
            every inventory-backed line is listed with a suggested default
            and nothing moves unless it is ticked. Custom-amount refunds
            carry no line information and so never appear here. */}
        {restockCandidates(refundModal.order, refundMode, refundItems).length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: 'var(--text-muted)' }}>
              {t('orders.restockLabel')}
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
              {restockCandidates(refundModal.order, refundMode, refundItems).map(({ line, idx, qty }) => {
                const checked = !!restockItems[idx];
                return (
                  <button
                    key={idx}
                    onClick={() => setRestockItems({ ...restockItems, [idx]: !checked })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px', width: '100%',
                      padding: '10px 12px', borderRadius: '10px', textAlign: 'left',
                      border: `2px solid ${checked ? 'var(--brand-color)' : 'var(--border)'}`,
                      background: checked ? 'rgba(52, 152, 219, 0.05)' : 'transparent',
                      cursor: 'pointer'
                    }}
                  >
                    <Icon
                      icon={checked ? 'lucide:check-square' : 'lucide:square'}
                      style={{ fontSize: '1.2rem', color: checked ? 'var(--brand-color)' : 'var(--text-muted)', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 'bold', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {line.emoji ? `${line.emoji} ` : ''}{line.name} × {qty}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {line.inventoryMode === 'recipe' ? t('orders.restockHintRecipe') : t('orders.restockHintStandard')}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <p style={{ margin: '8px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('orders.restockHelp')}</p>
          </div>
        )}

        {((Number(refundModal.order.tip_amount) || 0) - (Number(refundModal.order.tip_refunded) || 0)) > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: 'var(--text-muted)' }}>
              {t('orders.tipRefundLabel')}
              <span style={{ marginLeft: 8, fontWeight: '700', color: 'var(--text-main)' }}>
                {formatForDisplay((Number(refundModal.order.tip_amount) || 0) - (Number(refundModal.order.tip_refunded) || 0))}
              </span>
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                { key: 'none', label: t('orders.tipKeep') },
                { key: 'proportional', label: t('orders.tipProportional') },
                { key: 'full', label: t('orders.tipFull') }
              ].map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setTipRefundMode(opt.key)}
                  style={{
                    flex: 1,
                    minWidth: 100,
                    padding: '12px',
                    borderRadius: '10px',
                    border: `2px solid ${tipRefundMode === opt.key ? 'var(--brand-color)' : 'var(--border)'}`,
                    background: tipRefundMode === opt.key ? 'rgba(52, 152, 219, 0.05)' : 'transparent',
                    color: tipRefundMode === opt.key ? 'var(--brand-color)' : 'var(--text-muted)',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p style={{ margin: '8px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('orders.tipRefundHelp')}</p>
          </div>
        )}

        <div className="modal-actions">
          <button onClick={closeRefund} className="btn-cancel" style={{ flex: 1 }}>{t('common.cancel')}</button>
          <button onClick={handleProcessRefund} className="btn-confirm" style={{ flex: 2, background: 'var(--brand-color)', color: 'white' }}>{t('orders.btnConfirmRefund')}</button>
        </div>
      </div>
    </div>
  );
}

export function CfdiFolioModal({ actions, t }) {
  const { cfdiFolio, setCfdiFolio, closeCfdi, handleProcessCfdi } = actions;
  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '400px' }}>
        <h2 style={{ marginBottom: '5px', fontSize: '1.4rem' }}>Emitir Factura</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '20px', fontSize: '0.9rem' }}>
          Ingresa el folio del CFDI generado en el portal del SAT para enviarlo al cliente y marcar el ticket como facturado.
        </p>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-main)' }}>Folio Fiscal / ID de CFDI</label>
          <input
            type="text"
            autoFocus
            value={cfdiFolio}
            onChange={(e) => setCfdiFolio(e.target.value)}
            placeholder="Ej. AAA123..."
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '10px',
              border: '2px solid var(--border)',
              background: 'var(--bg-main)',
              color: 'var(--text-main)',
              fontSize: '1.1rem',
              outline: 'none'
            }}
          />
        </div>

        <div className="modal-actions">
          <button onClick={closeCfdi} className="btn-cancel" style={{ flex: 1 }}>{t('common.cancel')}</button>
          <button onClick={handleProcessCfdi} className="btn-confirm" disabled={!cfdiFolio.trim()} style={{ flex: 1, background: cfdiFolio.trim() ? '#2980b9' : 'var(--bg-main)', color: cfdiFolio.trim() ? 'white' : 'var(--text-muted)' }}>Guardar</button>
        </div>
      </div>
    </div>
  );
}
