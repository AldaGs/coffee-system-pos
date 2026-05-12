import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import { usePos } from '../../utils/PosContext';
import { useTranslation } from '../../hooks/useTranslation';
import { supabase } from '../../supabaseClient';
import { computeStarsForTicket } from '../../hooks/useLoyalty';

const formatPhone = (p) => (p || '').replace(/(\d{2})(\d{4})(\d{4})/, '$1 $2 $3');

function CustomerStrip() {
  const { t } = useTranslation();
  const {
    activeTicket, menuData, posSettings,
    setLoyaltyModal, handleRedeemReward, handleDetachLoyalty,
    showConfirm
  } = usePos();

  const loyaltySettings = menuData?.loyaltySettings;
  const isLoyaltyActive = loyaltySettings?.isActive === true || loyaltySettings?.isActive === "true";
  const isAdvanced = posSettings?.isAdvancedMode === true;

  const phone = activeTicket?.loyalty_phone || null;
  const pending = activeTicket?.loyalty_stars_pending || 0;

  const [currentVisits, setCurrentVisits] = useState(null);
  const [completedAt, setCompletedAt] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!phone) { setCurrentVisits(null); setCompletedAt(null); return; }
    (async () => {
      try {
        if (!navigator.onLine) return;
        const { data, error } = await supabase
          .from('customers').select('visits, completed_at').eq('phone', phone).maybeSingle();
        if (!cancelled && !error) {
          setCurrentVisits(data?.visits || 0);
          setCompletedAt(data?.completed_at || null);
        }
      } catch (err) {
        if (!cancelled) console.warn("CustomerStrip lookup failed:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [phone]);

  if (!activeTicket || !isLoyaltyActive || !isAdvanced) return null;

  const openModal = () => {
    setLoyaltyModal({ isOpen: true, step: 'phone', phone: phone || '', data: null });
  };

  const onDetach = (e) => {
    e.stopPropagation();
    showConfirm(
      t('cust.detachTitle') || 'Remove customer?',
      t('cust.detachDesc') || 'This unlinks the phone from this ticket and restores any free items to their normal price.',
      handleDetachLoyalty
    );
  };

  const onRedeem = (e) => {
    e.stopPropagation();
    handleRedeemReward();
  };

  // EMPTY STATE
  if (!phone) {
    return (
      <button
        onClick={openModal}
        style={{
          margin: '0 0 12px 0', width: '100%', padding: '12px 16px',
          background: 'var(--bg-main)', color: 'var(--text-main)',
          border: '2px dashed var(--brand-color)', borderRadius: '10px',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          fontWeight: 'bold', fontSize: '1rem'
        }}
      >
        <Icon icon="lucide:user-plus" style={{ color: 'var(--brand-color)', fontSize: '1.2rem' }} />
        {t('cust.addCustomer') || '+ Customer'}
      </button>
    );
  }

  // ATTACHED STATE
  const target = loyaltySettings?.visitsRequired || 10;
  const programType = loyaltySettings?.programType || 'multiple';
  const isCompleted = !!completedAt;
  const rawStars = computeStarsForTicket(activeTicket, loyaltySettings);
  const projectedStars = (programType === 'single' && isCompleted) ? 0 : rawStars;
  const baseVisits = (currentVisits ?? 0);
  const canRedeem = !isCompleted && baseVisits >= target && pending === 0;
  const netAfter = Math.max(0, baseVisits + projectedStars - pending);

  return (
    <div style={{ margin: '0 0 12px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div
        onClick={openModal}
        style={{
          padding: '12px 14px', background: 'var(--bg-main)',
          border: '1px solid var(--border)', borderRadius: '10px',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px'
        }}
      >
        <Icon icon="lucide:star" style={{ color: '#f1c40f', fontSize: '1.3rem', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '1rem' }}>
            {currentVisits === null
              ? formatPhone(phone)
              : `${baseVisits}/${target} · ${formatPhone(phone)}`}
          </div>
          {currentVisits !== null && (
            <div style={{ fontSize: '0.8rem', color: isCompleted ? '#27ae60' : 'var(--text-muted)' }}>
              {isCompleted
                ? `✓ ${t('cust.programCompleted') || 'Program completed'}`
                : pending > 0
                  ? `${t('cust.willRedeem') || 'Will redeem'} ${pending}★ · ${t('cust.afterPay') || 'after pay'}: ${netAfter}★`
                  : `${t('cust.afterPay') || 'after pay'}: ${netAfter}/${target}★`}
            </div>
          )}
        </div>
        <button
          onClick={onDetach}
          aria-label={t('cust.detachAria') || 'Remove customer'}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', padding: '4px', display: 'flex'
          }}
        >
          <Icon icon="lucide:x" style={{ fontSize: '1.1rem' }} />
        </button>
      </div>

      {canRedeem && (
        <button
          onClick={onRedeem}
          style={{
            padding: '10px 14px', background: '#ff1493', color: 'white',
            border: 'none', borderRadius: '10px', cursor: 'pointer',
            fontWeight: 'bold', fontSize: '0.95rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
          }}
        >
          <Icon icon="lucide:gift" />
          {t('cust.redeemHere') || 'Apply free reward'}
        </button>
      )}
      {pending > 0 && (
        <div style={{
          padding: '8px 12px', background: 'rgba(46, 204, 113, 0.1)', color: '#27ae60',
          borderRadius: '8px', fontSize: '0.85rem', fontWeight: 'bold',
          display: 'flex', alignItems: 'center', gap: '6px'
        }}>
          <Icon icon="lucide:check-circle" />
          {t('cust.pendingApplied') || 'Reward applied — will burn on payment'}
        </div>
      )}
    </div>
  );
}

export default CustomerStrip;
