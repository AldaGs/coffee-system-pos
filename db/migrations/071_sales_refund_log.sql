-- 5.8: sales.refund_log dates each refund ([{ at, cents }]) so the corte subtracts
-- a cash refund in the shift it was paid out, even for a sale from an earlier shift.
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS refund_log jsonb;
