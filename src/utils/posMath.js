// src/utils/posMath.js

// 0. Money rounding helper
export const money = (n) => {
  if (n === null || n === undefined || isNaN(n)) return 0;
  return Math.round((n + Math.sign(n) * Number.EPSILON) * 100) / 100;
};



// 1. Calculate Tax Breakdown (e.g., SAT 16% IVA)
export const calculateTaxBreakdown = (total, taxRate) => {
  const taxDecimal = taxRate / 100;
  const baseSubtotal = total / (1 + taxDecimal);
  const extractedTax = total - baseSubtotal;
  
  return {
    subtotal: money(baseSubtotal),
    tax: money(extractedTax)
  };
};

// 2. Calculate Yield & Value-Added Cost (Roasting/Transformations)
export const calculateTransformationCost = (usedQty, rawUnitCost, shrinkPerc, operationalCost) => {
  if (operationalCost < 0 || rawUnitCost < 0) throw new Error('Invalid transformation parameters: costs cannot be negative');
  if (shrinkPerc < 0 || shrinkPerc >= 100) throw new Error('Invalid transformation parameters: shrink percentage must be between 0 and 100');
  
  const yieldMultiplier = (100 - shrinkPerc) / 100;
  const finalYieldQty = usedQty * yieldMultiplier;
  
  if (finalYieldQty <= 0) throw new Error('Invalid transformation parameters: yield quantity must be greater than zero');
  
  const totalRawMaterialCost = usedQty * rawUnitCost;
  const totalCostWithLabor = totalRawMaterialCost + operationalCost;
  
  const newUnitCost = totalCostWithLabor / finalYieldQty;

  return {
    yieldQty: money(finalYieldQty),
    newUnitCost: Number(newUnitCost.toFixed(4))
  };
};

// 3. Calculate Corte de Caja (Expected Cash in Drawer)
export const calculateExpectedCash = (cashSales, cashRefunds, cashExpenses) => {
  // Expected = (Inflow) - (Outflow)
  return money(cashSales - cashRefunds - cashExpenses);
};