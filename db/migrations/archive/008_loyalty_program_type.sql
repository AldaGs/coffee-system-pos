-- 008_loyalty_program_type.sql
-- Distinguishes recurring vs one-time loyalty programs.
-- "Multiple" = customer keeps earning indefinitely (every Nth visit gets a reward).
-- "Single"   = customer earns the reward once, then freezes (no more accrual).

-- 1. Per-customer freeze flag. Set by the trigger when a Single-mode sale redeems.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;

-- 2. Sale row carries the program mode in effect at sale-time (denormalized,
--    so changing the setting later doesn't retroactively alter past behavior).
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS loyalty_program_type text;

-- 3. Trigger now: (a) suppresses accrual if customer is frozen,
--    (b) freezes the customer on a Single-mode redemption.
CREATE OR REPLACE FUNCTION public.award_loyalty_visits()
RETURNS TRIGGER AS $$
DECLARE
  v_awarded integer := COALESCE(NEW.loyalty_stars_awarded, 0);
  v_redeemed integer := COALESCE(NEW.loyalty_stars_redeemed, 0);
  v_completed timestamp with time zone;
  v_net integer;
BEGIN
  IF NEW.loyalty_phone IS NULL OR (v_awarded = 0 AND v_redeemed = 0) THEN
    RETURN NEW;
  END IF;

  SELECT completed_at INTO v_completed FROM public.customers WHERE phone = NEW.loyalty_phone;

  -- Frozen customers cannot earn more stars (Single-mode lockout).
  IF v_completed IS NOT NULL AND v_awarded > 0 THEN
    v_awarded := 0;
  END IF;

  v_net := v_awarded - v_redeemed;

  INSERT INTO public.customers (phone, visits)
  VALUES (NEW.loyalty_phone, GREATEST(0, v_net))
  ON CONFLICT (phone) DO UPDATE
    SET visits = GREATEST(0, public.customers.visits + v_net);

  -- Freeze on Single-mode redemption.
  IF NEW.loyalty_program_type = 'single' AND v_redeemed > 0 THEN
    UPDATE public.customers SET completed_at = now() WHERE phone = NEW.loyalty_phone;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
