import { useState } from 'react';
import { db } from '../db';
import { logActivity } from '../services/activityService';
import { consumePendingAuthorizer } from '../utils/overrideAuthorizer';
import { gateRegisterAction } from '../utils/actionGate';
import { toCents } from '../utils/moneyUtils';

const EMPTY_FORM = { type: 'percentage', value: '' };

// The discount modal: a manual amount on the ticket, or cashier-applied promos.
export function useTicketDiscounts({ activeTicket, posSettings, activeCashier, requirePin, showAlert, t }) {
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [discountForm, setDiscountForm] = useState(EMPTY_FORM);

  const close = () => {
    setIsDiscountModalOpen(false);
    setDiscountForm(EMPTY_FORM);
  };

  // The amount is optional (presets and codes apply on tap), so an empty field just closes.
  const handleApplyDiscount = async () => {
    const raw = String(discountForm.value ?? '').trim();
    if (raw === '') { close(); return; }
    const val = discountForm.type === 'percentage' ? parseFloat(raw) : toCents(raw);
    if (isNaN(val) || val <= 0) return showAlert(t('discount.invalidTitle'), t('discount.invalidDesc'));

    if (activeTicket) {
      await db.active_tickets.update(activeTicket.id, { discount: { type: discountForm.type, value: val } });
      // The fourth argument is the manager override, if the gate asked for one.
      logActivity('discount_applied', null, { type: discountForm.type, value: val, ticket_name: activeTicket.name }, consumePendingAuthorizer());
    }
    close();
  };

  const handleRemoveDiscount = async () => {
    if (activeTicket) {
      const rest = { ...activeTicket };
      delete rest.discount;
      await db.active_tickets.put(rest);
    }
    setIsDiscountModalOpen(false);
  };

  // A manual-trigger promo only counts while its id is in activatedManualRuleIds.
  // Applying one that requires approval goes through the manager PIN; removing never does.
  const handleToggleManualRule = async (rule) => {
    if (!activeTicket) return;
    const current = activeTicket.activatedManualRuleIds || [];
    const isOn = current.includes(rule.id);
    const applyToggle = async (authorizer) => {
      await db.active_tickets.update(activeTicket.id, {
        activatedManualRuleIds: isOn ? current.filter((id) => id !== rule.id) : [...current, rule.id],
      });
      if (!isOn) {
        logActivity('discount_applied', null, { promo: rule.name, ticket_name: activeTicket.name }, authorizer || consumePendingAuthorizer());
      }
    };
    if (!isOn && rule.requireApproval) {
      gateRegisterAction({ posSettings, activeCashier, requirePin, title: t('disc.approvalTitle'), run: (authorizer) => applyToggle(authorizer) });
      return;
    }
    applyToggle();
  };

  return { isDiscountModalOpen, setIsDiscountModalOpen, discountForm, setDiscountForm, handleApplyDiscount, handleRemoveDiscount, handleToggleManualRule };
}
