import { useState } from 'react';
import { Icon } from '@iconify/react';
import { db } from '../../db';
import { supabase } from '../../supabaseClient';
import { useTranslation } from '../../hooks/useTranslation';
import TicketImage from '../register/TicketImage';
import { printRawReceipt as printRawReceiptUtil, sendFinalMessage as sendFinalMessageUtil, saveTicketAsPNG as saveTicketAsPNGUtil } from '../../utils/sharingUtils';

function OrdersTab({ dexieSales, generalSettings, menuData, timeFilter, setTimeFilter, dateRange, setDateRange }) {
  const { t, lang } = useTranslation();
  const [sharingOrder, setSharingOrder] = useState(null);

  const getOrderTicket = (order) => {
    // If we have the full items array (saved in newer versions)
    if (order.items && Array.isArray(order.items)) {
      return {
        name: order.order_name || String(order.id),
        items: order.items,
        discount: order.discount,
        created_at: order.created_at
      };
    }
    
    // Legacy fallback: Create a lite ticket from items_sold names
    return {
      name: order.order_name || String(order.id),
      items: (order.items_sold || []).map(name => ({
        name: name,
        basePrice: 0, // We don't have historical item prices in legacy
        qty: 1,
        emoji: '☕',
        selectedModifiers: []
      })),
      created_at: order.created_at
    };
  };

  const handleSharePNG = async (order) => {
    setSharingOrder(order);
    // Wait for the DOM to update so TicketImage is rendered
    setTimeout(async () => {
      try {
        await saveTicketAsPNGUtil(`order-capture-${order.id}`, `ticket-${order.id}.png`);
      } catch (err) {
        alert("Error saving PNG: " + err.message);
      } finally {
        setSharingOrder(null);
      }
    }, 300);
  };

  const handleShareWA = (order) => {
    const phone = window.prompt(t('wa.promptPhone') || "Enter WhatsApp Phone (10 digits):");
    if (!phone || phone.length !== 10) return;
    
    const ticket = getOrderTicket(order);
    const receiptSettings = menuData?.receiptSettings || {
      header: generalSettings.name || 'TinyPOS',
      subheader: '',
      footer: 'Thank you for your visit! ✨',
      enableTaxBreakdown: false,
      taxRate: 16
    };
    
    sendFinalMessageUtil(phone, ticket, order.total_amount, { t, lang, receiptSettings });
  };

  const handlePrint = async (order) => {
    const ticket = getOrderTicket(order);
    const receiptSettings = menuData?.receiptSettings || {
      header: "TINY COFFEE BAR",
      subheader: "Puebla, Mexico",
      footer: "Thank you for your visit!",
      enableTaxBreakdown: false,
      taxRate: 16,
      logo: null
    };

    try {
      await printRawReceiptUtil(ticket, order.total_amount, { t, lang, receiptSettings });
    } catch (err) {
      if (err.message !== "unsupported") {
        alert("Printer Error: " + err.message);
      } else {
        alert("Unsupported Device: Direct printing is only supported on Windows/Mac via Chrome, or Android via the RawBT app.");
      }
    }
  };

  return (
    <div className="admin-section fade-in">
      {/* Hidden capture target for PNG generation */}
      {sharingOrder && (
        <div style={{ position: 'absolute', top: '-9999px', left: '-9999px', pointerEvents: 'none' }}>
           <TicketImage 
             id={`order-capture-${sharingOrder.id}`}
             ticket={getOrderTicket(sharingOrder)} 
             total={sharingOrder.total_amount} 
             receiptSettings={menuData?.receiptSettings || {}} 
             lang={lang} 
             t={t} 
           />
        </div>
      )}

      <div className="admin-section-header" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <h1 style={{ margin: 0, color: 'var(--text-main)', fontSize: '2rem', fontWeight: '800' }}>{t('orders.title')}</h1>
          <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0', fontSize: '1.1rem' }}>{t('orders.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Icon icon="lucide:calendar" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} style={{ padding: '12px 16px 12px 38px', borderRadius: '12px', border: '1px solid var(--border)', fontWeight: 'bold', background: 'var(--bg-surface)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer', appearance: 'none' }}>
              <option value="today">{t('analytics.filterToday') || 'Hoy'}</option>
              <option value="week">{t('analytics.filterWeek') || 'Semana'}</option>
              <option value="month">{t('analytics.filterMonth') || 'Mes'}</option>
              <option value="6months">{t('analytics.filter6Months') || '6 Meses'}</option>
              <option value="year">{t('analytics.filterYear') || 'Año'}</option>
              <option value="all">{t('analytics.filterAll') || 'Todo'}</option>
              <option value="custom">Rango (Personalizado)</option>
            </select>
          </div>

          {timeFilter === 'custom' && (
            <div className="fade-in" style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-main)', padding: '6px 12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '0.70rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>Inicio</label>
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
                <label style={{ fontSize: '0.70rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>Fin</label>
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
        </div>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {dexieSales.slice().reverse().map(order => (
          <div key={order.id} className="mobile-flex-stack" style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '0.9rem' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '1.3rem', color: 'var(--text-main)' }}>
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
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Icon icon="lucide:calendar" style={{ fontSize: '0.85rem' }} />
                    {new Date(order.created_at).toLocaleString(lang === 'es' ? 'es-MX' : 'en-US')}
                  </span>
                  <span style={{ height: '4px', width: '4px', background: 'var(--border)', borderRadius: '50%' }} className="desktop-only" />
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Icon icon="lucide:user" style={{ fontSize: '1rem' }} />
                    {order.cashier_name}
                  </span>
                </div>
              </div>
            </div>

            <div className="mobile-flex-stack" style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
              <div style={{ textAlign: 'inherit' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: '900', color: 'var(--text-main)', textDecoration: order.status === 'refunded' ? 'line-through' : 'none', letterSpacing: '-1px' }}>
                  ${Number(order.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                {order.refund_amount > 0 && (
                  <div style={{ color: '#e74c3c', fontWeight: '800', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'inherit', gap: '4px' }}>
                    <Icon icon="lucide:undo-2" />
                    -${Number(order.refund_amount).toFixed(2)} {t('orders.refundedLabel')}
                  </div>
                )}
              </div>

              {/* RE-SHARE BUTTONS */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  onClick={() => handlePrint(order)}
                  title={t('ticket.btnPrint')}
                  style={{ padding: '10px', background: 'rgba(52, 152, 219, 0.1)', color: '#3498db', border: 'none', borderRadius: '12px', cursor: 'pointer' }}
                >
                  <Icon icon="lucide:printer" />
                </button>
                <button 
                  onClick={() => handleSharePNG(order)}
                  title={t('ticket.btnPNG')}
                  style={{ padding: '10px', background: 'rgba(230, 126, 34, 0.1)', color: '#e67e22', border: 'none', borderRadius: '12px', cursor: 'pointer' }}
                >
                  <Icon icon="lucide:image" />
                </button>
                <button 
                  onClick={() => handleShareWA(order)}
                  title={t('ticket.btnWA')}
                  style={{ padding: '10px', background: 'rgba(37, 211, 102, 0.1)', color: '#25D366', border: 'none', borderRadius: '12px', cursor: 'pointer' }}
                >
                  <Icon icon="lucide:message-circle" />
                </button>
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
                  const prevRefund = Number(order.refund_amount || 0);
                  if ((prevRefund + rAmt) > order.total_amount + 0.001) return alert(t('orders.alertOverload'));
                  
                  let newStatus = 'completed';
                  if (rAmt >= order.total_amount) { 
                    newStatus = 'refunded'; 
                    rAmt = order.total_amount; 
                  } else if (rAmt > 0) { 
                    newStatus = 'partial_refund'; 
                  }
                  
                  db.sales.update(order.id, { status: newStatus, refund_amount: prevRefund + rAmt });
                  
                  if (navigator.onLine) { 
                    supabase.from('sales').update({ status: newStatus, refund_amount: prevRefund + rAmt }).eq('id', order.id).then(); 
                  }
                }} 
                disabled={order.status === 'refunded'} 
                style={{ 
                  padding: '12px 20px', 
                  background: order.status === 'refunded' ? 'var(--bg-main)' : 'rgba(231, 76, 60, 0.05)', 
                  color: order.status === 'refunded' ? 'var(--text-muted)' : '#e74c3c', 
                  border: `2px solid ${order.status === 'refunded' ? 'transparent' : 'rgba(231, 76, 60, 0.2)'}`, 
                  borderRadius: '16px', 
                  cursor: order.status === 'refunded' ? 'not-allowed' : 'pointer', 
                  fontWeight: '900', 
                  transition: '0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
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