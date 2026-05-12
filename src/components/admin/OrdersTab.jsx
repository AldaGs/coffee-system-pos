import { useState } from 'react';
import { Icon } from '@iconify/react';
import { db } from '../../db';
import { supabase } from '../../supabaseClient';
import { useTranslation } from '../../hooks/useTranslation';
import TicketImage from '../register/TicketImage';
import PinChallengeModal from '../register/PinChallengeModal';
import { useDialog } from '../../hooks/useDialog';
import { useMenuStore } from '../../store/useMenuStore';
import { printRawReceipt as printRawReceiptUtil, sendFinalMessage as sendFinalMessageUtil, saveTicketAsPNG as saveTicketAsPNGUtil } from '../../utils/sharingUtils';
import { formatForDisplay, toCents } from '../../utils/moneyUtils';
import { recordTipRefund } from '../../services/tipsService';

function OrdersTab({ dexieSales, generalSettings, menuData, timeFilter, setTimeFilter, dateRange, setDateRange }) {
  const { t, lang } = useTranslation();
  const { showAlert, showPrompt } = useDialog();
  const { verifyAdminPin } = useMenuStore();
  const [sharingOrder, setSharingOrder] = useState(null);

  // --- PIN CHALLENGE STATE ---
  const [pinChallenge, setPinChallenge] = useState({ isOpen: false, title: "", onAuthorized: null });
  const [challengePinAttempt, setChallengePinAttempt] = useState('');
  const [challengeError, setChallengeError] = useState('');

  // --- REFUND MODAL STATE ---
  const [refundModal, setRefundModal] = useState({ isOpen: false, order: null });
  const [refundMode, setRefundMode] = useState('all'); // 'all' | 'custom'
  const [refundAmount, setRefundAmount] = useState('');
  // 'none' = staff keeps tip, 'proportional' = tip * (refund/total), 'full' = refund entire remaining tip.
  // Full refunds default to 'full' (no service was rendered); partials default to 'none'.
  const [tipRefundMode, setTipRefundMode] = useState('full');

  const handleChallengeSubmit = async () => {
    const isValid = await verifyAdminPin(challengePinAttempt);
    if (isValid) {
      const authorizedCallback = pinChallenge.onAuthorized;
      setPinChallenge({ isOpen: false, title: "", onAuthorized: null });
      setChallengePinAttempt('');
      setChallengeError('');
      if (authorizedCallback) authorizedCallback();
    } else {
      setChallengeError(t('orders.alertInvalidPin'));
      setChallengePinAttempt('');
    }
  };

  const handleProcessRefund = async () => {
    const { order } = refundModal;
    if (!order) return;

    const isFull = refundMode === 'all';
    let rAmt = isFull ? (order.total_amount - (order.refund_amount || 0)) : toCents(refundAmount);

    if (!isFull && (isNaN(rAmt) || rAmt <= 0)) return showAlert(t('common.error'), t('orders.alertInvalidAmt'));

    const prevRefund = order.refund_amount || 0;
    const totalAvailable = order.total_amount - prevRefund;

    rAmt = Math.min(rAmt, totalAvailable);
    if (rAmt <= 0) return showAlert(t('common.error'), t('orders.alertOverload'));

    let newStatus = 'completed';
    if (order.total_amount === (prevRefund + rAmt)) {
      newStatus = 'refunded';
      rAmt = totalAvailable;
    } else {
      newStatus = 'partial_refund';
    }

    // Tip refund decision — staff are the trustees of the tip, so we never
    // claw back tips silently. The operator picks the policy explicitly.
    const tipTotal = Number(order.tip_amount) || 0;
    const tipAlreadyRefunded = Number(order.tip_refunded) || 0;
    const tipRemaining = Math.max(0, tipTotal - tipAlreadyRefunded);
    let tipRefundDelta = 0;
    if (tipRemaining > 0) {
      if (isFull) {
        // On a full refund, default to giving the tip back too unless the
        // operator explicitly switched to 'none'/'proportional'.
        if (tipRefundMode === 'none') tipRefundDelta = 0;
        else if (tipRefundMode === 'proportional') {
          const denom = order.total_amount || 0;
          tipRefundDelta = denom > 0 ? Math.round(tipTotal * (rAmt / denom)) : 0;
        } else {
          tipRefundDelta = tipRemaining;
        }
      } else {
        if (tipRefundMode === 'full') tipRefundDelta = tipRemaining;
        else if (tipRefundMode === 'proportional') {
          const denom = order.total_amount || 0;
          tipRefundDelta = denom > 0 ? Math.round(tipTotal * (rAmt / denom)) : 0;
        } else {
          tipRefundDelta = 0;
        }
      }
      tipRefundDelta = Math.min(tipRefundDelta, tipRemaining);
    }

    try {
      const updateData = { status: newStatus, refund_amount: prevRefund + rAmt };
      if (tipRefundDelta > 0) updateData.tip_refunded = tipAlreadyRefunded + tipRefundDelta;
      await db.sales.update(order.id, updateData);

      // Legacy orders (created before local_id existed) won't have a local_id —
      // for those we fall back to the cloud `id` (which is what bulkPut stored).
      const queueEntry = {
        type: 'sale_update',
        local_id: order.local_id || null,
        cloud_id: order.local_id ? null : order.id,
        data: updateData
      };

      if (navigator.onLine) {
        const query = order.local_id
          ? supabase.from('sales').update(updateData).eq('local_id', order.local_id)
          : supabase.from('sales').update(updateData).eq('id', order.id);
        const { error } = await query;
        if (error) throw error;
      } else {
        await db.updateQueue.add(queueEntry);
      }

      if (tipRefundDelta > 0) {
        await recordTipRefund({
          saleLocalId: order.local_id || null,
          tipRefundedDeltaCents: tipRefundDelta,
          actor: order.cashier_name || null,
          reason: newStatus === 'refunded' ? 'full_refund' : 'partial_refund'
        });
      }

      setRefundModal({ isOpen: false, order: null });
      showAlert(t('toast.success'), t('toast.success'));
    } catch (err) {
      if (!navigator.onLine) {
         // Already handled by the if(navigator.onLine) but just in case of race
         await db.updateQueue.add({
           type: 'sale_update',
           local_id: order.local_id || null,
           cloud_id: order.local_id ? null : order.id,
           data: {
             status: newStatus,
             refund_amount: prevRefund + rAmt,
             ...(tipRefundDelta > 0 ? { tip_refunded: tipAlreadyRefunded + tipRefundDelta } : {})
           }
         });
         setRefundModal({ isOpen: false, order: null });
         return showAlert(t('toast.success'), t('toast.success') + " (Offline)");
      }
      showAlert(t('common.error'), err.message);
    }
  };

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
        showAlert(t('common.error'), t('receipt.capturePngErrorPrefix') + err.message);
      } finally {
        setSharingOrder(null);
      }
    }, 300);
  };

  const handleShareWA = (order) => {
    showPrompt(t('wa.promptPhone') || "Enter WhatsApp Phone (10 digits):", "", (phone) => {
      if (!phone || phone.length !== 10) return showAlert(t('common.error'), t('wa.invalidPhone'));

      const ticket = getOrderTicket(order);
      const receiptSettings = menuData?.receiptSettings || {
        header: generalSettings.name || 'TinyPOS',
        subheader: '',
        footer: '',
        enableTaxBreakdown: false,
        taxRate: 16
      };

      sendFinalMessageUtil(phone, ticket, order.total_amount, { t, lang, receiptSettings });
    });
  };


  const handlePrint = async (order) => {
    const ticket = getOrderTicket(order);
    const receiptSettings = menuData?.receiptSettings || {
      header: generalSettings?.name || "",
      subheader: "",
      footer: "",
      enableTaxBreakdown: false,
      taxRate: 16,
      logo: null
    };

    try {
      await printRawReceiptUtil(ticket, order.total_amount, { t, lang, receiptSettings });
    } catch (err) {
      if (err.message !== "unsupported") {
        showAlert(t('common.error'), t('receipt.printerErrorPrefix') + err.message);
      } else {
        showAlert(t('receipt.unsupportedTitle'), t('receipt.unsupportedMsg'));
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
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {dexieSales.slice().reverse().map(order => (
          <div key={order.id} className="mobile-flex-stack" style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '0.9rem' }}>
                  {order.order_name ? (
                    <>
                      <span style={{ fontWeight: 'bold', fontSize: '1.3rem', color: 'var(--text-main)' }}>
                        {order.order_name}
                      </span>
                      {order.ticket_id && (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', background: 'var(--bg-main)', padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                          {order.ticket_id.slice(-6)}
                        </span>
                      )}
                    </>
                  ) : order.ticket_id ? (
                    <span style={{ fontWeight: 'bold', fontSize: '1.3rem', color: 'var(--text-main)' }}>
                      {order.ticket_id.slice(-6)}
                    </span>
                  ) : (
                    <span style={{ fontWeight: 'bold', fontSize: '1.3rem', color: 'var(--text-main)' }}>
                      #{order.id}
                    </span>
                  )}

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
                  {formatForDisplay(order.total_amount || 0)}
                </div>
                {order.refund_amount > 0 && (
                  <div style={{ color: '#e74c3c', fontWeight: '800', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'inherit', gap: '4px' }}>
                    <Icon icon="lucide:undo-2" />
                    -{formatForDisplay(order.refund_amount)} {t('orders.refundedLabel')}
                  </div>
                )}
              </div>

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
                  setPinChallenge({
                    isOpen: true,
                    title: t('orders.promptPin'),
                    onAuthorized: () => {
                      setRefundMode('all');
                      setRefundAmount('');
                      // Sensible default: full refund -> return tip; partial -> keep tip with staff.
                      setTipRefundMode('full');
                      setRefundModal({ isOpen: true, order: order });
                    }
                  });
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

      {/* PIN CHALLENGE MODAL */}
      <PinChallengeModal
        pinChallenge={pinChallenge}
        setPinChallenge={setPinChallenge}
        challengePinAttempt={challengePinAttempt}
        setChallengePinAttempt={setChallengePinAttempt}
        challengeError={challengeError}
        setChallengeError={setChallengeError}
        handleChallengeSubmit={handleChallengeSubmit}
      />

      {/* REFUND DETAILS MODAL */}
      {refundModal.isOpen && (
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
              </div>
            </div>

            <div style={{ marginBottom: '32px' }}>
              <label style={{ display: 'block', marginBottom: '12px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('orders.refundTotal')}</label>
              {refundMode === 'all' ? (
                <div style={{ fontSize: '2.5rem', fontWeight: '900', color: 'var(--text-main)', textAlign: 'center', padding: '10px 0' }}>
                  {formatForDisplay(Number(refundModal.order.total_amount) - Number(refundModal.order.refund_amount || 0))}
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
              <button onClick={() => setRefundModal({ isOpen: false, order: null })} className="btn-cancel" style={{ flex: 1 }}>{t('common.cancel')}</button>
              <button onClick={handleProcessRefund} className="btn-confirm" style={{ flex: 2, background: 'var(--brand-color)', color: 'white' }}>{t('orders.btnConfirmRefund')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default OrdersTab;