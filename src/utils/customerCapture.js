/**
 * Customer capture — decide *when* the register should offer to identify and
 * record a customer, independent of whether the loyalty punch-card is running.
 *
 * Background: the discounts engine can target a rule at `member` / `nonmember`
 * customers, and membership is simply "a phone is attached to this ticket"
 * (see discountEngine `customerMatches`). Historically the only way to attach a
 * phone was the loyalty stamp flow, which is gated behind the loyalty program
 * being active. So a shop that pauses stamps but runs a "members get 10% off"
 * discount had no way to identify — let alone record — a single member.
 *
 * These helpers let capture surface whenever it's actually useful: loyalty is
 * active, OR a live discount rule keys off membership. Everything else in the
 * capture stack (the strip, the modal, QR, NFC) funnels through the same
 * `attachCustomerToTicket` pipeline, so the input method never matters.
 */

/** Loyalty stamp program is switched on. Tolerates the legacy string "true". */
export function isLoyaltyActive(loyaltySettings) {
  return loyaltySettings?.isActive === true || loyaltySettings?.isActive === 'true';
}

/** At least one active discount rule keys its reward off customer membership. */
export function hasMemberTargetedRule(discountRules) {
  if (!Array.isArray(discountRules)) return false;
  return discountRules.some(r =>
    r?.isActive &&
    (r.conditions?.customer === 'member' || r.conditions?.customer === 'nonmember')
  );
}

/**
 * The register should surface customer capture (the "+ Customer" strip, QR,
 * NFC) whenever stamps are being awarded OR a membership-gated discount is live.
 */
export function needsCustomerCapture(loyaltySettings, discountRules) {
  return isLoyaltyActive(loyaltySettings) || hasMemberTargetedRule(discountRules);
}

/** Strip everything but digits from a raw phone entry. */
export function cleanPhone(raw) {
  return (raw || '').replace(/\D/g, '');
}

/** MX mobile numbers are 10 digits — the key the `customers` table is keyed on. */
export function isValidPhone(raw) {
  return cleanPhone(raw).length === 10;
}

/**
 * Pull a 10-digit phone out of a scanned QR / NFC payload. A personal loyalty
 * card encodes `${origin}/enroll?c=<phone>` (so scanning it with any camera
 * opens the enroll page too), but we also accept a bare number or any string
 * that contains a 10-digit run, so hand-made tags and older cards still work.
 * @returns {string|null} the 10-digit phone, or null if none found
 */
export function parsePhoneFromScan(text) {
  if (!text || typeof text !== 'string') return null;

  // Preferred: an explicit ?c= / ?phone= query param on an enroll URL.
  const param = text.match(/[?&](?:c|phone)=(\d{10})\b/);
  if (param) return param[1];

  // Fallback: the first standalone 10-digit run anywhere in the payload.
  const digits = cleanPhone(text);
  if (digits.length === 10) return digits;
  const run = digits.match(/\d{10}/);
  return run ? run[0] : null;
}
