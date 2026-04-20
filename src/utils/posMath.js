// src/utils/posMath.js

// 1. Calculate Tax Breakdown (e.g., SAT 16% IVA)
export const calculateTaxBreakdown = (total, taxRate) => {
  const taxDecimal = taxRate / 100;
  const baseSubtotal = total / (1 + taxDecimal);
  const extractedTax = total - baseSubtotal;
  
  return {
    subtotal: Number(baseSubtotal.toFixed(2)),
    tax: Number(extractedTax.toFixed(2))
  };
};

// 2. Calculate Yield & Value-Added Cost (Roasting/Transformations)
export const calculateTransformationCost = (usedQty, rawUnitCost, shrinkPerc, operationalCost) => {
  const yieldMultiplier = (100 - shrinkPerc) / 100;
  const finalYieldQty = usedQty * yieldMultiplier;
  
  const totalRawMaterialCost = usedQty * rawUnitCost;
  const totalCostWithLabor = totalRawMaterialCost + operationalCost;
  
  const newUnitCost = totalCostWithLabor / finalYieldQty;

  return {
    yieldQty: Number(finalYieldQty.toFixed(2)),
    newUnitCost: Number(newUnitCost.toFixed(4))
  };
};

// 3. Calculate Corte de Caja (Expected Cash in Drawer)
export const calculateExpectedCash = (cashSales, cashRefunds, cashExpenses) => {
  // Expected = (Inflow) - (Outflow)
  return Number((cashSales - cashRefunds - cashExpenses).toFixed(2));
};