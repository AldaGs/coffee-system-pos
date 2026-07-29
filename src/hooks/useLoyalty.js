import { supabase } from '../supabaseClient';
import { db } from '../db';
import { isLocalMode } from '../utils/appMode';
import { isCloudReachable } from '../utils/network';
import { cleanPhone, isValidPhone } from '../utils/customerCapture';

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

  const handleCheckLoyalty = async (phoneOverride) => {
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

    const cleanPhone = (phoneOverride ?? loyaltyModal.phone).replace(/\D/g, '');
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
      if (isLocalMode()) {
        // Local ('guest') mode: read the on-device customers store.
        const customer = await db.customers.get(cleanPhone);
        currentVisits = customer?.visits || 0;
        completedAt = customer?.completed_at || null;
      } else {
        if (!isCloudReachable()) throw new Error("Device is offline");
        const { data: customer, error } = await supabase
          .from('customers')
          .select('visits, completed_at')
          .eq('phone', cleanPhone)
          .maybeSingle();
        if (error) throw error;
        currentVisits = customer?.visits || 0;
        completedAt = customer?.completed_at || null;
      }
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
        if (!isLocalMode() && isCloudReachable()) {
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

  /**
   * Shared capture pipeline — every input method (manual entry, QR scan, NFC
   * tap, or the discounts-only "lite" flow) funnels here. It attaches the phone
   * to the active ticket (which immediately drives the discounts member/
   * non-member gate) and records the customer in the directory so they exist
   * even when the loyalty stamp program is paused.
   *
   * Recording happens here rather than at checkout because the sale-time
   * `trg_award_loyalty` trigger short-circuits at zero stars — so a member with
   * no punch-card would never get a row. The register is authenticated, so a
   * client-side upsert is both allowed (RLS) and immediate.
   *
   * @returns {Promise<boolean>} whether a valid phone was attached
   */
  const handleAttachCustomer = async (rawPhone) => {
    if (!activeTicket) return false;
    if (!isValidPhone(rawPhone)) {
      setPhoneError(true);
      setTimeout(() => setPhoneError(false), 500);
      return false;
    }
    const phone = cleanPhone(rawPhone);

    // 1. Attach to the ticket (local-first, cloud best-effort). Mirrors the
    //    attach step in handleCheckLoyalty so both paths behave identically.
    try {
      await db.active_tickets.update(activeTicket.id, { loyalty_phone: phone });
      if (!isLocalMode() && isCloudReachable()) {
        supabase.from('active_tickets').update({ loyalty_phone: phone }).eq('id', activeTicket.id);
      }
    } catch (err) {
      console.warn('Could not attach customer phone to active ticket:', err);
    }

    // 2. Record the customer without disturbing any existing visit count.
    //    ignoreDuplicates -> INSERT ... ON CONFLICT DO NOTHING, so a returning
    //    customer's stamps are never reset to zero.
    try {
      if (isLocalMode()) {
        const existing = await db.customers.get(phone);
        if (!existing) await db.customers.put({ phone, visits: 0, completed_at: null });
      } else if (isCloudReachable()) {
        supabase.from('customers')
          .upsert({ phone, visits: 0 }, { onConflict: 'phone', ignoreDuplicates: true })
          .then(({ error }) => { if (error) console.warn('Customer record upsert failed:', error.message); });
      }
    } catch (err) {
      console.warn('Could not record customer:', err);
    }

    return true;
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
      if (!isLocalMode() && isCloudReachable()) {
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
      if (!isLocalMode() && isCloudReachable()) {
        supabase.from('active_tickets')
          .update({ loyalty_phone: null, loyalty_stars_pending: 0, items })
          .eq('id', activeTicket.id);
      }
    } catch (err) {
      console.warn("Could not detach loyalty from ticket:", err);
    }
  };

  return { handleCheckLoyalty, handleRedeemReward, handleDetachLoyalty, handleAttachCustomer };
};
