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
    setCountedCash, setLastCorteTimestamp, t, showAlert, showConfirm
  } = posState;

  const describeDiff = (diff) => {
    if (diff === 0) return t('corte.balanced');
    if (diff > 0) return `${t('corte.over')} ${formatForDisplay(diff)}`;
    return `${t('corte.short')} ${formatForDisplay(Math.abs(diff))}`;
  };

  const handleProcessCorte = async () => {
    const cashInDrawer = toCents(countedCash);
    const diff = cashInDrawer - expectedCash;
    const diffLabel = describeDiff(diff);

    const finalize = async () => {
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
        await logActivity('corte', null, corteRecord);
        setLastCorteTimestamp(corteRecord.timestamp);
        setIsCorteModalOpen(false);
        setCountedCash('');
        showAlert(t('corte.successTitle'), `${t('corte.successDesc')}\n\n${diffLabel}`);
      } catch (error) {
        console.error('Corte failed:', error);
        showAlert('Error', 'Could not process shift close. Please try again.');
      }
    };

    // Cash matches expected — close without an extra prompt (the modal itself
    // already shows the summary). Any short/over forces an explicit confirm
    // so the cashier can't auto-pilot past a $300 discrepancy.
    if (diff === 0) {
      await finalize();
    } else {
      showConfirm(`${t('corte.confirmTitle')} — ${diffLabel}`, t('corte.closeConfirm'), finalize);
    }
  };

  return { handleProcessCorte };
};
