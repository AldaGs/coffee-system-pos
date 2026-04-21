import { db } from '../../db';
import { supabase } from '../../supabaseClient';
import { useTranslation } from '../../hooks/useTranslation';

function OrdersTab({ dexieSales, generalSettings, menuData }) {
  const { t, lang } = useTranslation();

  return (
    <div className="admin-section fade-in">
      <h1 style={{ color: 'var(--text-main)', marginBottom: '24px' }}>{t('orders.title')}</h1>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {dexieSales.slice().reverse().map(order => (
          <div key={order.id} style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <span style={{ fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--brand-color)' }}>
                  {t('orders.orderNum')}{order.id}
                </span>
                {order.status === 'refunded' && (
                  <span style={{ background: '#e74c3c', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                    {t('orders.voided')}
                  </span>
                )}
                {order.status === 'partial_refund' && (
                  <span style={{ background: '#f39c12', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                    {t('orders.partial')}
                  </span>
                )}
                {order.status === 'completed' && (
                  <span style={{ background: '#27ae60', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                    {t('orders.completed')}
                  </span>
                )}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                {new Date(order.created_at).toLocaleString(lang === 'es' ? 'es-MX' : 'en-US')} | {t('orders.cashier')}: {order.cashier_name} | {order.payment_method}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-main)', textDecoration: order.status === 'refunded' ? 'line-through' : 'none' }}>
                  ${Number(order.total_amount || 0).toFixed(2)}
                </div>
                {order.refund_amount > 0 && (
                  <div style={{ color: '#e74c3c', fontWeight: 'bold', fontSize: '0.9rem' }}>
                    -${Number(order.refund_amount).toFixed(2)} {t('orders.refundedLabel')}
                  </div>
                )}
              </div>
              <button 
                onClick={() => {
                  const typedPin = window.prompt(t('orders.promptPin'));
                  const isMasterMatch = typedPin === generalSettings.pinCode;
                  const isStaffAdminMatch = (menuData?.cashiers || []).some(c => c.isAdmin && c.pin === typedPin);
                  
                  if (!isMasterMatch && !isStaffAdminMatch) return alert(t('orders.alertInvalidPin'));
                  
                  const refundAmtRaw = window.prompt(t('orders.promptAmt'));
                  if (!refundAmtRaw) return;
                  
                  const isFull = refundAmtRaw.toUpperCase() === t('orders.keywordAll').toUpperCase();
                  let rAmt = isFull ? Number(order.total_amount) : parseFloat(refundAmtRaw);
                  
                  if (!isFull && (isNaN(rAmt) || rAmt <= 0)) return alert(t('orders.alertInvalidAmt'));
                  if (rAmt > order.total_amount) return alert(t('orders.alertOverload'));
                  
                  let newStatus = 'completed';
                  if (rAmt >= order.total_amount) { 
                    newStatus = 'refunded'; 
                    rAmt = order.total_amount; 
                  } else if (rAmt > 0) { 
                    newStatus = 'partial_refund'; 
                  }
                  
                  const prevRefund = Number(order.refund_amount || 0);
                  db.sales.update(order.id, { status: newStatus, refund_amount: prevRefund + rAmt });
                  
                  if (navigator.onLine) { 
                    supabase.from('sales').update({ status: newStatus, refund_amount: prevRefund + rAmt }).eq('id', order.id).then(); 
                  }
                }} 
                disabled={order.status === 'refunded'} 
                style={{ 
                  padding: '12px 24px', 
                  background: order.status === 'refunded' ? 'var(--bg-main)' : 'rgba(231, 76, 60, 0.1)', 
                  color: order.status === 'refunded' ? 'var(--text-muted)' : '#e74c3c', 
                  border: `2px solid ${order.status === 'refunded' ? 'transparent' : '#e74c3c'}`, 
                  borderRadius: '8px', 
                  cursor: order.status === 'refunded' ? 'not-allowed' : 'pointer', 
                  fontWeight: 'bold', 
                  transition: '0.2s' 
                }}
              >
                {t('orders.btnRefund')}
              </button>
            </div>
          </div>
        ))}
        {dexieSales.length === 0 && (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: '40px 0' }}>
            {t('orders.noHistory')}
          </p>
        )}
      </div>
    </div>
  );
}

export default OrdersTab;