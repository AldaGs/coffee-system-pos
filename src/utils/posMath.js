/**
 * Monetary operations using the Integer/Centavos Pattern.
 * All monetary inputs/outputs are integers representing cents ($1.00 = 100).
 */

// 0. Simple integer validation/rounding helper
export const money = (n) => {
  if (n === null || n === undefined || isNaN(n)) return 0;
  return Math.round(n);
};

/**
 * 1. Calculate Tax Breakdown (e.g., SAT 16% IVA)
 * @param {number} totalCents - Total amount in cents
 * @param {number} taxRate - e.g., 16
 * @returns {object} - { subtotal, tax } in cents
 */
export const calculateTaxBreakdown = (totalCents, taxRate) => {
  const taxDecimal = taxRate / 100;
  // Subtotal = Total / (1 + taxRate)
  const subtotal = Math.round(totalCents / (1 + taxDecimal));
  const tax = totalCents - subtotal;
  
  return {
    subtotal: money(subtotal),
    tax: money(tax)
  };
};

/**
 * 2. Calculate Yield & Value-Added Cost (Roasting/Transformations)
 * Note: Unit costs are handled as Millicents (4 decimal places) to preserve precision.
 * @param {number} usedQty - Quantity used (e.g., grams)
 * @param {number} rawUnitMillicents - Cost per unit in millicents (unit * 10000)
 * @param {number} shrinkPerc - 0 to 100
 * @param {number} operationalCents - Extra cost in cents
 * @returns {object} - { yieldQty, newUnitMillicents }
 */
export const calculateTransformationCost = (usedQty, rawUnitMillicents, shrinkPerc, operationalCents) => {
  if (operationalCents < 0 || rawUnitMillicents < 0) throw new Error('Invalid transformation parameters: costs cannot be negative');
  if (shrinkPerc < 0 || shrinkPerc >= 100) throw new Error('Invalid transformation parameters: shrink percentage must be between 0 and 100');
  
  const yieldMultiplier = (100 - shrinkPerc) / 100;
  const finalYieldQty = usedQty * yieldMultiplier;
  
  if (finalYieldQty <= 0) throw new Error('Invalid transformation parameters: yield quantity must be greater than zero');
  
  // Total cost in millicents
  const totalRawMaterialCost = usedQty * rawUnitMillicents;
  const operationalMillicents = operationalCents * 100; // Convert cents to millicents (cents * 100 = unit * 10000)
  const totalCostMillicents = totalRawMaterialCost + operationalMillicents;
  
  const newUnitMillicents = Math.round(totalCostMillicents / finalYieldQty);

  return {
    yieldQty: Math.round(finalYieldQty),
    newUnitMillicents: newUnitMillicents
  };
};

/**
 * 3. Calculate Corte de Caja (Expected Cash in Drawer)
 * @param {number} cashSalesCents
 * @param {number} cashRefundsCents
 * @param {number} cashExpensesCents
 * @returns {number} - Expected cents
 */
export const calculateExpectedCash = (cashSalesCents, cashRefundsCents, cashExpensesCents) => {
  return (cashSalesCents || 0) - (cashRefundsCents || 0) - (cashExpensesCents || 0);
};
