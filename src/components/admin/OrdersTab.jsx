import { Icon } from '@iconify/react';
import { db } from '../../db';
import { supabase } from '../../supabaseClient';
import { useTranslation } from '../../hooks/useTranslation';

function OrdersTab({ dexieSales, generalSettings, menuData }) {
  const { t, lang } = useTranslation();

  return (
    <div className="admin-section fade-in">
      <div style={{ marginBottom: '40px' }}>
        <h1 style={{ margin: 0, color: 'var(--text-main)', fontSize: '2rem', fontWeight: '800' }}>{t('orders.title')}</h1>
        <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0', fontSize: '1.1rem' }}>{t('orders.subtitle') || 'View and manage recent transactions'}</p>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {dexieSales.slice().reverse().map(order => (
          <div key={order.id} style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '24px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ height: '56px', width: '56px', borderRadius: '16px', background: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)' }}>
                <Icon icon={order.payment_method === 'cash' ? 'lucide:banknote' : 'lucide:credit-card'} style={{ fontSize: '1.5rem', color: 'var(--brand-color)' }} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: '900', fontSize: '1.3rem', color: 'var(--text-main)' }}>
                    #{order.id}
                  </span>
                  {order.status === 'refunded' && (
                    <span style={{ background: 'rgba(231, 76, 60, 0.1)', color: '#e74c3c', padding: '6px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid rgba(231, 76, 60, 0.2)' }}>
                      <Icon icon="lucide:x-circle" />
                      {t('orders.voided')}
                    </span>
                  )}
                  {order.status === 'partial_refund' && (
                    <span style={{ background: 'rgba(243, 156, 18, 0.1)', color: '#f39c12', padding: '6px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid rgba(243, 156, 18, 0.2)' }}>
                      <Icon icon="lucide:alert-triangle" />
                      {t('orders.partial')}
                    </span>
                  )}
                  {order.status === 'completed' && (
                    <span style={{ background: 'rgba(46, 204, 113, 0.1)', color: '#27ae60', padding: '6px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid rgba(46, 204, 113, 0.2)' }}>
                      <Icon icon="lucide:check-circle-2" />
                      {t('orders.completed')}
                    </span>
                  )}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Icon icon="lucide:calendar" style={{ fontSize: '1rem' }} />
                    {new Date(order.created_at).toLocaleString(lang === 'es' ? 'es-MX' : 'en-US')}
                  </span>
                  <span style={{ height: '4px', width: '4px', background: 'var(--border)', borderRadius: '50%' }} />
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Icon icon="lucide:user" style={{ fontSize: '1rem' }} />
                    {order.cashier_name}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: '900', color: 'var(--text-main)', textDecoration: order.status === 'refunded' ? 'line-through' : 'none', letterSpacing: '-1px' }}>
                  ${Number(order.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                {order.refund_amount > 0 && (
                  <div style={{ color: '#e74c3c', fontWeight: '800', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                    <Icon icon="lucide:undo-2" />
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
                  background: order.status === 'refunded' ? 'var(--bg-main)' : 'rgba(231, 76, 60, 0.05)', 
                  color: order.status === 'refunded' ? 'var(--text-muted)' : '#e74c3c', 
                  border: `2px solid ${order.status === 'refunded' ? 'transparent' : 'rgba(231, 76, 60, 0.2)'}`, 
                  borderRadius: '16px', 
                  cursor: order.status === 'refunded' ? 'not-allowed' : 'pointer', 
                  fontWeight: '900', 
                  transition: '0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  textTransform: 'uppercase',
                  fontSize: '0.85rem'
                }}
              >
                <Icon icon="lucide:rotate-ccw" />
                {t('orders.btnRefund')}
              </button>
            </div>
          </div>
        ))}
        {dexieSales.length === 0 && (
          <div style={{ padding: '80px 20px', textAlign: 'center', background: 'var(--bg-surface)', borderRadius: '24px', border: '2px dashed var(--border)' }}>
            <Icon icon="lucide:receipt" style={{ fontSize: '4rem', color: 'var(--text-muted)', opacity: 0.2, marginBottom: '20px' }} />
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '1.2rem', fontWeight: 'bold' }}>
              {t('orders.noHistory')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default OrdersTab;