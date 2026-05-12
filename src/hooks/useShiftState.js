import { useCallback, useEffect, useState } from 'react';
import { db } from '../db';

// Small key-value persistence for shift-level counters that used to live in
// localStorage (nextOrderNum, lastResetDate, lastCorteTimestamp). Dexie gives
// us atomic writes and survives the same quota events that nuke localStorage.

const LS_LEGACY_KEYS = {
  nextOrderNum: 'tinypos_nextOrderNum',
  lastResetDate: 'tinypos_lastResetDate',
  lastCorteTimestamp: 'tinypos_last_corte'
};
const LS_MIGRATED_FLAG = 'tinypos_shift_state_dexie_migrated';

async function migrateLegacyShiftState() {
  if (localStorage.getItem(LS_MIGRATED_FLAG) === '1') return;
  try {
    const entries = [];
    const num = localStorage.getItem(LS_LEGACY_KEYS.nextOrderNum);
    if (num !== null) entries.push({ key: 'nextOrderNum', value: parseInt(num) || 1 });
    const reset = localStorage.getItem(LS_LEGACY_KEYS.lastResetDate);
    if (reset !== null) entries.push({ key: 'lastResetDate', value: reset });
    const corte = localStorage.getItem(LS_LEGACY_KEYS.lastCorteTimestamp);
    if (corte !== null) entries.push({ key: 'lastCorteTimestamp', value: corte });
    if (entries.length > 0) await db.shift_state.bulkPut(entries);
    Object.values(LS_LEGACY_KEYS).forEach(k => localStorage.removeItem(k));
  } catch (err) {
    console.warn('Shift-state migration skipped:', err);
  }
  localStorage.setItem(LS_MIGRATED_FLAG, '1');
}

export function useShiftStateValue(key, defaultValue) {
  const [value, setValue] = useState(defaultValue);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await migrateLegacyShiftState();
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
