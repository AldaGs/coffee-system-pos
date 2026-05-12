import { supabase } from '../supabaseClient';
import { db } from '../db';

export const computeStarsForTicket = (ticket, loyaltySettings) => {
  if (!ticket || !loyaltySettings) return 0;
  const { targetItem = 'any', countMode = 'per_item' } = loyaltySettings;

  if (targetItem === 'any') return 1;

  let stars = 0;
  (ticket.items || []).forEach(item => {
    if (item.name === targetItem) stars += (item.qty || 1);
  });
  if (countMode === 'per_ticket' && stars > 0) return 1;
  return stars;
};

export const useLoyalty = (posState) => {
  const {
    loyaltyModal, setLoyaltyModal, activeTicket, menuData,
    setPhoneError, showAlert, t
  } = posState;

  const handleCheckLoyalty = async () => {
    const loyaltySettings = {
      isActive: true,
      visitsRequired: 10,
      rewardDescription: "tu próxima bebida GRATIS",
      targetItem: "any",
      countMode: 'per_item',
      rewardMenuItem: null,
      programType: 'multiple',
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

    const starsToEarn = computeStarsForTicket(activeTicket, loyaltySettings);

    if (starsToEarn === 0 && !(activeTicket?.loyalty_stars_pending > 0)) {
      setLoyaltyModal({ isOpen: false, step: 'phone', phone: '', data: null });
      return showAlert(t('loyalty.noQualify'), t('loyalty.noQualifyDesc'));
    }

    let currentVisits = 0;
    let completedAt = null;
    let lookupOk = true;
    try {
      if (!navigator.onLine) throw new Error("Device is offline");
      const { data: customer, error } = await supabase
        .from('customers')
        .select('visits, completed_at')
        .eq('phone', cleanPhone)
        .maybeSingle();
      if (error) throw error;
      currentVisits = customer?.visits || 0;
      completedAt = customer?.completed_at || null;
    } catch (err) {
      lookupOk = false;
      console.warn("Loyalty lookup failed (showing projection only):", err);
    }

    // Single-mode lockout: completed customers can't earn more stars.
    const isCompleted = !!completedAt;
    const effectiveStars = (loyaltySettings.programType === 'single' && isCompleted) ? 0 : starsToEarn;

    if (activeTicket) {
      try {
        await db.active_tickets.update(activeTicket.id, { loyalty_phone: cleanPhone });
        if (navigator.onLine) {
          supabase.from('active_tickets').update({ loyalty_phone: cleanPhone }).eq('id', activeTicket.id);
        }
      } catch (err) {
        console.warn("Could not attach loyalty phone to active ticket:", err);
      }
    }

    const pendingRedeem = activeTicket?.loyalty_stars_pending || 0;
    const target = loyaltySettings.visitsRequired;
    const netVisits = currentVisits + effectiveStars - pendingRedeem;
    // Completed customers can't redeem again in single mode.
    const canRedeem = !isCompleted && currentVisits >= target && pendingRedeem === 0;

    setLoyaltyModal(prev => ({
      ...prev,
      step: 'result',
      data: {
        visits: Math.max(0, netVisits),
        currentVisits,
        target,
        reward: loyaltySettings.rewardDescription,
        rewardMenuItem: loyaltySettings.rewardMenuItem || null,
        earnedToday: effectiveStars,
        pendingRedeem,
        canRedeem,
        isProjection: true,
        lookupOk,
        programType: loyaltySettings.programType,
        isCompleted
      }
    }));
  };

  const handleRedeemReward = async () => {
    if (!activeTicket) return;
    const data = loyaltyModal.data;
    if (!data || !data.canRedeem) return;

    const target = data.target;
    const rewardMenuItem = data.rewardMenuItem;
    const items = activeTicket.items || [];

    let updatedItems = items;
    let matchedIdx = -1;

    if (rewardMenuItem) {
      matchedIdx = items.findIndex(it => it.name === rewardMenuItem && !it.loyaltyOriginalPrice);
      if (matchedIdx === -1) {
        return showAlert(
          t('loyalty.redeemNeedItemTitle') || 'Add the reward item',
          (t('loyalty.redeemNeedItemDesc') || 'Add {{item}} to the cart to redeem this reward.').replace('{{item}}', rewardMenuItem)
        );
      }
      updatedItems = items.map((it, idx) => {
        if (idx !== matchedIdx) return it;
        return { ...it, loyaltyOriginalPrice: it.basePrice, basePrice: 0 };
      });
    }

    try {
      await db.active_tickets.update(activeTicket.id, {
        items: updatedItems,
        loyalty_stars_pending: target
      });
      if (navigator.onLine) {
        supabase.from('active_tickets')
          .update({ items: updatedItems, loyalty_stars_pending: target })
          .eq('id', activeTicket.id);
      }
    } catch (err) {
      console.warn("Could not persist redemption:", err);
    }

    setLoyaltyModal(prev => ({
      ...prev,
      data: {
        ...prev.data,
        canRedeem: false,
        pendingRedeem: target,
        visits: Math.max(0, (prev.data.currentVisits || 0) + (prev.data.earnedToday || 0) - target),
        justRedeemed: true
      }
    }));
  };

  const handleDetachLoyalty = async () => {
    if (!activeTicket) return;
    const items = (activeTicket.items || []).map(it => {
      if (it.loyaltyOriginalPrice) {
        const { loyaltyOriginalPrice, ...rest } = it;
        return { ...rest, basePrice: loyaltyOriginalPrice };
      }
      return it;
    });

    try {
      await db.active_tickets.update(activeTicket.id, {
        loyalty_phone: null,
        loyalty_stars_pending: 0,
        items
      });
      if (navigator.onLine) {
        supabase.from('active_tickets')
          .update({ loyalty_phone: null, loyalty_stars_pending: 0, items })
          .eq('id', activeTicket.id);
      }
    } catch (err) {
      console.warn("Could not detach loyalty from ticket:", err);
    }
  };

  return { handleCheckLoyalty, handleRedeemReward, handleDetachLoyalty };
};
