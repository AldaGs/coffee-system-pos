/**
 * Utility for the Integer/Centavos Pattern.
 * Handles conversions between decimal floats/strings and integer cents.
 */

/**
 * Converts a decimal number or string to integer cents.
 * Handles rounding to the nearest cent.
 * @param {number|string} val - e.g., 15.50 or "15.50"
 * @returns {number} - e.g., 1550
 */
export const toCents = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
};

/**
 * Detects if a menu price is in legacy decimal or new centavo format.
 * Returns the value in integer Cents.
 */
export const normalizeMenuPrice = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return 0;
  // If price is > 0 and < 2000, it's likely a legacy decimal dollar (e.g. 500.00)
  // New centavo format for $500.00 is 50000.
  if (num > 0 && num < 2000) return Math.round(num * 100);
  return Math.round(num);
};

/**
 * Converts a decimal dollar value (or string) to integer Millicents.
 * 1 Millicent = $0.0001
 */
export const toMillicents = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return 0;
  return Math.round(num * 10000);
};

/**
 * Converts integer cents back to a decimal float.
 * @param {number} cents - e.g., 1550
 * @returns {number} - e.g., 15.50
 */
export const fromCents = (cents) => {
  if (!cents || isNaN(cents)) return 0;
  return cents / 100;
};

/**
 * Converts integer Millicents back to decimal dollar value.
 */
export const fromMillicents = (millicents) => {
  if (!millicents || isNaN(millicents)) return 0;
  return millicents / 10000;
};

/**
 * Formats integer cents as a localized currency string.
 * @param {number} cents - e.g., 1550
 * @param {string} lang - 'es' or 'en'
 * @returns {string} - e.g., "$15.50"
 */
export const formatForDisplay = (cents, lang = 'es') => {
  const amount = fromCents(cents);
  return new Intl.NumberFormat(lang === 'es' ? 'es-MX' : 'en-US', {
    style: 'currency',
    currency: 'MXN', // Default to MXN but works for USD as well
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};
