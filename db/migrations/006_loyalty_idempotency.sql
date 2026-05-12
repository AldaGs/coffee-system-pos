-- 006_loyalty_idempotency.sql
-- Binds loyalty visit accrual to completed sales (one-time per sale, server-enforced).
-- Moves the customers.visits side-effect out of the "check loyalty" UI step
-- and into a trigger on sales INSERT, anchored by sales.local_id for idempotency.

-- 1. Columns on sales: persist who earned what on this transaction.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS loyalty_phone text,
  ADD COLUMN IF NOT EXISTS loyalty_stars_awarded integer DEFAULT 0;

-- 2. Column on active_tickets: phone attaches to the cart pre-payment,
--    so it survives reloads and multi-terminal sync.
ALTER TABLE public.active_tickets
  ADD COLUMN IF NOT EXISTS loyalty_phone text;

-- 3. Customers.phone must be unique for the trigger's ON CONFLICT clause.
--    Existing code already treats phone as a logical primary key; this enforces it.
--    If duplicates exist in your DB, run a dedupe first (keep highest visits per phone).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customers_phone_unique' AND conrelid = 'public.customers'::regclass
  ) THEN
    ALTER TABLE public.customers ADD CONSTRAINT customers_phone_unique UNIQUE (phone);
  END IF;
END $$;

-- 4. Trigger function: accrue visits for the sale's loyalty phone, if any.
CREATE OR REPLACE FUNCTION public.award_loyalty_visits()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.loyalty_phone IS NOT NULL AND NEW.loyalty_stars_awarded > 0 THEN
    INSERT INTO public.customers (phone, visits)
    VALUES (NEW.loyalty_phone, NEW.loyalty_stars_awarded)
    ON CONFLICT (phone) DO UPDATE
      SET visits = public.customers.visits + EXCLUDED.visits;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Wire the trigger. Fires on INSERT only — upsert conflicts (retries) do NOT fire it.
DROP TRIGGER IF EXISTS trg_award_loyalty ON public.sales;
CREATE TRIGGER trg_award_loyalty
  AFTER INSERT ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.award_loyalty_visits();
