import { useEffect } from 'react';
import { useShiftStateValue } from './useShiftState';

// The next order number, reset to 1 per the store's policy (daily by default).
export function useOrderNumbers(policy = 'daily') {
  const [nextOrderNum, setNextOrderNum] = useShiftStateValue('nextOrderNum', 1);
  const [lastResetDate, setLastResetDate] = useShiftStateValue('lastResetDate', new Date().toDateString());

  useEffect(() => {
    const today = new Date();
    const last = new Date(lastResetDate);
    const due = (policy === 'daily' && today.toDateString() !== last.toDateString())
      || (policy === 'monthly' && today.getMonth() !== last.getMonth())
      || (policy === 'yearly' && today.getFullYear() !== last.getFullYear());
    if (!due) return;
    setNextOrderNum(1);
    setLastResetDate(today.toDateString());
  }, [policy, lastResetDate, setNextOrderNum, setLastResetDate]);

  return [nextOrderNum, setNextOrderNum];
}
