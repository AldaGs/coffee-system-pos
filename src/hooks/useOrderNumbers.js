import { useEffect } from 'react';
import { useShiftStateValue } from './useShiftState';

// Monday of the date's week, as a local date string. Weeks start on Monday.
const weekStart = (d) => {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m.toDateString();
};

// Whether the order counter should go back to 1, given the last reset day and now.
export function resetDue(policy, last, today) {
  if (policy === 'daily') return today.toDateString() !== last.toDateString();
  if (policy === 'weekly') return weekStart(today) !== weekStart(last);
  if (policy === 'monthly') return today.getMonth() !== last.getMonth() || today.getFullYear() !== last.getFullYear();
  if (policy === 'yearly') return today.getFullYear() !== last.getFullYear();
  return false;
}

// The next order number, reset to 1 per the store's policy (daily by default).
export function useOrderNumbers(policy = 'daily') {
  const [nextOrderNum, setNextOrderNum] = useShiftStateValue('nextOrderNum', 1);
  const [lastResetDate, setLastResetDate] = useShiftStateValue('lastResetDate', new Date().toDateString());

  useEffect(() => {
    const today = new Date();
    if (!resetDue(policy, new Date(lastResetDate), today)) return;
    setNextOrderNum(1);
    setLastResetDate(today.toDateString());
  }, [policy, lastResetDate, setNextOrderNum, setLastResetDate]);

  return [nextOrderNum, setNextOrderNum];
}
