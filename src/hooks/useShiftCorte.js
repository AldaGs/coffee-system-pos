import { logActivity } from '../services/activityService';
import { toCents, formatForDisplay } from '../utils/moneyUtils';

/**
 * Hook to manage shift closing (Corte).
 * Issue 3.6: Extract from Register.jsx.
 */
export const useShiftCorte = (posState) => {
  const { 
    expectedCash, countedCash, shiftCashSales, shiftCardSales, shiftTransferSales, 
    shiftTotalExpenses, activeCashier, myDeviceId, setIsCorteModalOpen, 
    setCountedCash, setLastCorteTimestamp, t, showAlert 
  } = posState;

  const handleProcessCorte = async () => {
    const cashInDrawer = toCents(countedCash);
    const diff = cashInDrawer - expectedCash;

    const corteRecord = {
      cashier_id: activeCashier?.id,
      cashier_name: activeCashier?.name || 'Unknown',
      device_id: myDeviceId,
      timestamp: new Date().toISOString(),
      expected_cash: expectedCash,
      actual_cash: cashInDrawer,
      difference: diff,
      sales_breakdown: {
        cash: shiftCashSales,
        card: shiftCardSales,
        transfer: shiftTransferSales
      },
      expenses_total: shiftTotalExpenses
    };

    try {
      // 1. Log the activity (Cloud + Local)
      await logActivity('corte', null, corteRecord);

      // 2. Clear current session data locally
      const now = corteRecord.timestamp;
      setLastCorteTimestamp(now);
      localStorage.setItem('tinypos_lastCorteTimestamp', now);

      // 3. UI feedback
      setIsCorteModalOpen(false);
      setCountedCash('');
      showAlert(t('corte.successTitle'), t('corte.successDesc').replace('{{diff}}', formatForDisplay(diff)));

    } catch (error) {
      console.error("Corte failed:", error);
      showAlert("Error", "Could not process shift close. Please try again.");
    }
  };

  return { handleProcessCorte };
};
