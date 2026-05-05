import { supabase } from '../supabaseClient';
import { db } from '../db';

/**
 * Hook to manage the loyalty system logic.
 * Issue 3.6: Extract from Register.jsx.
 */
export const useLoyalty = (posState) => {
  const { 
    loyaltyModal, setLoyaltyModal, activeTicket, menuData, 
    setPhoneError, showAlert, t 
  } = posState;

  const handleCheckLoyalty = async () => {
    // 1. SAFE FALLBACK: Merge cloud settings with our defaults!
    const loyaltySettings = {
      isActive: true,
      visitsRequired: 10,
      rewardDescription: "tu próxima bebida GRATIS",
      targetItem: "any",
      countMode: 'per_item',
      ...(menuData?.loyaltySettings || {})
    };

    const isLoyaltyActive = loyaltySettings.isActive === true || loyaltySettings.isActive === "true";

    if (!isLoyaltyActive) {
      setLoyaltyModal({ isOpen: false, step: 'phone', phone: '', data: null });
      return showAlert(t('loyalty.paused'), t('loyalty.noPromos'));
    }

    const cleanPhone = loyaltyModal.phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      setPhoneError(true);
      setTimeout(() => setPhoneError(false), 500);
      return;
    }

    let starsToEarn = 0;
    const targetItem = loyaltySettings.targetItem;
    const countMode = loyaltySettings.countMode;

    if (targetItem === 'any') {
      starsToEarn = 1;
    } else {
      if (activeTicket && activeTicket.items) {
        activeTicket.items.forEach(item => {
          if (item.name === targetItem) starsToEarn += (item.qty || 1);
        });
      }

      if (countMode === 'per_ticket' && starsToEarn > 0) {
        starsToEarn = 1;
      }
    }

    if (starsToEarn === 0) {
      setLoyaltyModal({ isOpen: false, step: 'phone', phone: '', data: null });
      return showAlert(t('loyalty.noQualify'), t('loyalty.noQualifyDesc'));
    }

    let currentVisits = starsToEarn;

    try {
      if (!navigator.onLine) throw new Error("Device is offline");

      const { data: customer } = await supabase.from('customers').select('visits').eq('phone', cleanPhone).maybeSingle();

      if (customer) {
        currentVisits = (customer.visits || 0) + starsToEarn;
        const { error: updateErr } = await supabase.from('customers').update({ visits: currentVisits }).eq('phone', cleanPhone);
        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await supabase.from('customers').insert([{ phone: cleanPhone, visits: starsToEarn }]);
        if (insertErr) throw insertErr;
      }
    } catch (err) {
      console.warn("Loyalty error, queueing update:", err);
      // Queue an INCREMENT (not absolute), so background sync adds to whatever
      // is already on the server instead of overwriting it with today's stars.
      await db.updateQueue.add({
        type: 'loyalty_increment',
        data: { phone: cleanPhone, increment: starsToEarn }
      });
      if (!navigator.onLine) {
        showAlert(t('loyalty.offlineTitle') || "Offline", t('loyalty.offlineDesc') || "Stars will sync when connection returns.");
      }
    }

    setLoyaltyModal(prev => ({
      ...prev,
      step: 'result',
      data: {
        visits: currentVisits,
        target: loyaltySettings.visitsRequired,
        reward: loyaltySettings.rewardDescription,
        earnedToday: starsToEarn,
        isRewardReady: currentVisits > 0 && (currentVisits % loyaltySettings.visitsRequired === 0)
      }
    }));
  };

  return { handleCheckLoyalty };
};
