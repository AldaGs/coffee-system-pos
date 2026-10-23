import { useCallback, useEffect, useState } from 'react';
import { db } from '../db';

// Small key-value persistence for shift-level counters (nextOrderNum,
// lastResetDate, lastCorteTimestamp) in Dexie: atomic writes that survive the
// quota events that wipe localStorage.

export function useShiftStateValue(key, defaultValue) {
  const [value, setValue] = useState(defaultValue);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const row = await db.shift_state.get(key);
      if (!cancelled) {
        if (row !== undefined) setValue(row.value);
        setHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, [key]);

  const update = useCallback(async (next) => {
    const resolved = typeof next === 'function' ? next(value) : next;
    setValue(resolved);
    try {
      await db.shift_state.put({ key, value: resolved });
    } catch (err) {
      console.warn(`shift_state.put(${key}) failed:`, err);
    }
  }, [key, value]);

  return [value, update, hydrated];
}
