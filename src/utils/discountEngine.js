/**
 * Discount engine — a pure, side-effect-free evaluator for auto-applied
 * discount rules. Extracted from the inline loop that used to live in
 * Register.jsx so the logic can be unit-tested and grown independently.
 *
 * A rule payload is stored verbatim as jsonb (see src/api/menu*.js), so the
 * schema below is additive: legacy rules omit the newer fields and fall back
 * to the original percentage/flat behavior.
 *
 *   {
 *     id, name, isActive,
 *     // Reward
 *     kind: 'standard' | 'buyXgetY',      // absent -> 'standard'
 *     type: 'percentage' | 'flat',        // standard
 *     value,                               // pct number, or cents (flat)
 *     targetType: 'cart' | 'item',         // standard
 *     targetValue,                         // item name (targetType='item')
 *     bogoItem, buyQty, payQty,            // buyXgetY (2x1 -> buy 2 pay 1)
 *     // Conditions (all optional, ANDed; absent -> always qualifies)
 *     conditions: {
 *       requiredItems: [{ name, minQty }],
 *       minSubtotal,                        // cents
 *       days: [0..6],                       // day-of-week (Sun=0); empty = any
 *       startDate, endDate,                 // 'YYYY-MM-DD' window
 *     },
 *     // Combination
 *     priority,                            // higher wins; absent -> 0
 *     allowStack,                          // stack beneath a higher rule; -> false
 *     // Recurrence
 *     usage: 'recurring' | 'once',         // 'once' = single-use coupon
 *     consumedAt,                          // ISO set once a single-use rule redeems
 *   }
 *
 * All money is in integer cents, matching the rest of the POS. The per-unit
 * cost is computed the same way as cartSubtotal in Register.jsx so the parts
 * always reconcile with the whole.
 */

import { normalizeMenuPrice } from './moneyUtils';

/** Cost of a single unit of a line item (base + modifiers), in cents. */
function unitCostCents(item) {
  let cost = normalizeMenuPrice(item.basePrice);
  (item.selectedModifiers || []).forEach(mod => { cost += normalizeMenuPrice(mod.price); });
  return cost;
}

/** Local-time 'YYYY-MM-DD' key for date-window comparisons. */
function dayKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Day-of-week + date-range gate. */
function scheduleAllows(rule, now) {
  const cond = rule.conditions;
  if (!cond) return true;
  if (Array.isArray(cond.days) && cond.days.length > 0 && !cond.days.includes(now.getDay())) {
    return false;
  }
  const today = dayKey(now);
  if (cond.startDate && today < cond.startDate) return false;
  if (cond.endDate && today > cond.endDate) return false;
  return true;
}

/** Required-items + minimum-subtotal gate. */
function conditionsMet(rule, items, cartSubtotal) {
  const cond = rule.conditions;
  if (!cond) return true;
  if (cond.minSubtotal && cartSubtotal < cond.minSubtotal) return false;
  if (Array.isArray(cond.requiredItems) && cond.requiredItems.length > 0) {
    for (const req of cond.requiredItems) {
      const have = items
        .filter(it => it.name === req.name)
        .reduce((sum, it) => sum + (it.qty || 1), 0);
      if (have < (req.minQty || 1)) return false;
    }
  }
  return true;
}

/**
 * Unclamped discount a single (already-qualifying) rule produces.
 * @returns {{ amount:number, byUid:Object, cart:number }} all in cents
 */
function computeRuleAmount(rule, items, cartSubtotal) {
  const byUid = {};
  let cart = 0;
  let amount = 0;

  if ((rule.kind || 'standard') === 'buyXgetY') {
    const buyQty = parseInt(rule.buyQty, 10) || 0;
    const payQty = parseInt(rule.payQty, 10);
    const pay = Number.isNaN(payQty) ? 0 : payQty;
    // Need a valid group where at least one unit becomes free.
    if (buyQty <= 0 || pay < 0 || pay >= buyQty) return { amount, byUid, cart };
    const freePerGroup = buyQty - pay;

    // Expand matching lines into individual units so we can free the cheapest.
    const units = [];
    items.forEach(it => {
      if (it.name === rule.bogoItem) {
        const cost = unitCostCents(it);
        const qty = it.qty || 1;
        for (let i = 0; i < qty; i++) units.push({ uid: it.uniqueId, cost });
      }
    });
    const freeUnits = Math.floor(units.length / buyQty) * freePerGroup;
    if (freeUnits > 0) {
      units.sort((a, b) => a.cost - b.cost);
      for (let i = 0; i < freeUnits; i++) {
        amount += units[i].cost;
        byUid[units[i].uid] = (byUid[units[i].uid] || 0) + units[i].cost;
      }
    }
    return { amount, byUid, cart };
  }

  // ---- standard percentage / flat ----
  const isPct = rule.type === 'percentage';
  if (rule.targetType === 'cart') {
    const value = isPct
      ? Math.round(cartSubtotal * (rule.value / 100))
      : normalizeMenuPrice(rule.value);
    amount = value;
    cart = value;
    return { amount, byUid, cart };
  }

  // targetType === 'item'
  items.forEach(it => {
    if (it.name === rule.targetValue) {
      const qty = it.qty || 1;
      const lineCost = unitCostCents(it) * qty;
      const value = isPct
        ? Math.round(lineCost * (rule.value / 100))
        : normalizeMenuPrice(rule.value) * qty;
      amount += value;
      byUid[it.uniqueId] = (byUid[it.uniqueId] || 0) + value;
    }
  });
  return { amount, byUid, cart };
}

/**
 * Evaluate every rule against a ticket and return the merged auto-discount.
 *
 * Combination is priority-ordered: the highest-priority qualifying rule always
 * applies; lower-priority rules apply only when they opt in with allowStack.
 * The merged total is clamped to the subtotal and the per-item / cart breakdown
 * is scaled proportionally so the parts still sum to the whole.
 *
 * @returns {{
 *   autoDiscountAmount:number, autoDiscountCart:number,
 *   autoDiscountByItemUid:Object, appliedRuleNames:string[], appliedRuleIds:Array
 * }}
 */
export function evaluateDiscounts({ rules, ticket, cartSubtotal, now = new Date() }) {
  const empty = {
    autoDiscountAmount: 0,
    autoDiscountCart: 0,
    autoDiscountByItemUid: {},
    appliedRuleNames: [],
    appliedRuleIds: [],
  };
  if (!ticket || !Array.isArray(ticket.items) || ticket.items.length === 0) return empty;
  if (!Array.isArray(rules) || rules.length === 0) return empty;
  if (!(cartSubtotal > 0)) return empty;

  const items = ticket.items;

  // 1. Keep rules that are active, un-consumed, scheduled, conditioned, and
  //    actually produce a discount.
  const qualifying = [];
  rules.forEach(rule => {
    if (!rule.isActive) return;
    if (rule.usage === 'once' && rule.consumedAt) return;
    if (!scheduleAllows(rule, now)) return;
    if (!conditionsMet(rule, items, cartSubtotal)) return;
    const res = computeRuleAmount(rule, items, cartSubtotal);
    if (res.amount > 0) qualifying.push({ rule, ...res });
  });
  if (qualifying.length === 0) return empty;

  // 2. Highest priority applies; lower ones only if they allow stacking.
  qualifying.sort((a, b) => (b.rule.priority || 0) - (a.rule.priority || 0));
  const selected = qualifying.filter((q, idx) => idx === 0 || q.rule.allowStack === true);

  // 3. Merge the selected rules.
  let autoDiscountAmount = 0;
  let autoDiscountCart = 0;
  const autoDiscountByItemUid = {};
  const appliedRuleNames = [];
  const appliedRuleIds = [];
  selected.forEach(q => {
    autoDiscountAmount += q.amount;
    autoDiscountCart += q.cart;
    Object.entries(q.byUid).forEach(([uid, cents]) => {
      autoDiscountByItemUid[uid] = (autoDiscountByItemUid[uid] || 0) + cents;
    });
    if (q.rule.name) appliedRuleNames.push(q.rule.name);
    appliedRuleIds.push(q.rule.id);
  });

  // 4. Clamp to subtotal and scale the breakdown so the parts still sum.
  const unclamped = autoDiscountAmount;
  autoDiscountAmount = Math.max(0, Math.min(autoDiscountAmount, cartSubtotal));
  if (unclamped > autoDiscountAmount && unclamped > 0) {
    const scale = autoDiscountAmount / unclamped;
    autoDiscountCart = Math.round(autoDiscountCart * scale);
    Object.keys(autoDiscountByItemUid).forEach(uid => {
      autoDiscountByItemUid[uid] = Math.round(autoDiscountByItemUid[uid] * scale);
    });
  }

  return { autoDiscountAmount, autoDiscountCart, autoDiscountByItemUid, appliedRuleNames, appliedRuleIds };
}
