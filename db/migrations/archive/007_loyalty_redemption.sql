-- 007_loyalty_redemption.sql
-- Adds explicit reward redemption: customers can burn stars on a sale.
-- Closes the modulo loop (visits >= target stayed "reward ready" forever).

-- 1. Sale records how many stars were redeemed (debited) on this transaction.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS loyalty_stars_redeemed integer DEFAULT 0;

-- 2. Active ticket carries the pending redemption through pre-payment edits.
ALTER TABLE public.active_tickets
  ADD COLUMN IF NOT EXISTS loyalty_stars_pending integer DEFAULT 0;

-- 3. Trigger now applies the NET change: awarded - redeemed. Floors at 0.
--    Still fires AFTER INSERT only, so retries via upsert(onConflict: local_id) are idempotent.
CREATE OR REPLACE FUNCTION public.award_loyalty_visits()
RETURNS TRIGGER AS $$
DECLARE
  v_awarded integer := COALESCE(NEW.loyalty_stars_awarded, 0);
  v_redeemed integer := COALESCE(NEW.loyalty_stars_redeemed, 0);
  v_net integer := v_awarded - v_redeemed;
BEGIN
  IF NEW.loyalty_phone IS NOT NULL AND (v_awarded > 0 OR v_redeemed > 0) THEN
    INSERT INTO public.customers (phone, visits)
    VALUES (NEW.loyalty_phone, GREATEST(0, v_net))
    ON CONFLICT (phone) DO UPDATE
      SET visits = GREATEST(0, public.customers.visits + v_net);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
