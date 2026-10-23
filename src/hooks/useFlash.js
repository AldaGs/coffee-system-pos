import { useCallback, useEffect, useRef, useState } from 'react';

// State that resets itself after `ms` (a "Copied!" label, an error shake).
// flash(v) shows v and schedules the reset; set(v) changes it and cancels any
// pending reset. The timer is cleared on unmount.
export function useFlash(ms, initial = false) {
  const [value, setValue] = useState(initial);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const flash = useCallback((next = true) => {
    clearTimeout(timer.current);
    setValue(next);
    timer.current = setTimeout(() => setValue(initial), ms);
  }, [ms, initial]);

  const set = useCallback((next) => {
    clearTimeout(timer.current);
    setValue(next);
  }, []);

  return [value, flash, set];
}
