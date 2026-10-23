-- 003_secure_pins.sql
-- Hashed PIN storage and verification RPC

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.cashier_pins (
    cashier_id BIGINT PRIMARY KEY,
    pin_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Migration of existing PINs (one-shot)
-- Extracts cashiers from shop_settings.menu_data and hashes their plaintext pins
INSERT INTO public.cashier_pins (cashier_id, pin_hash)
SELECT 
    (cashier->>'id')::BIGINT,
    crypt(cashier->>'pin', gen_salt('bf'))
FROM public.shop_settings,
     jsonb_array_elements(menu_data->'cashiers') AS cashier
ON CONFLICT (cashier_id) DO NOTHING;

-- Migration of Master PIN (ID 0)
INSERT INTO public.cashier_pins (cashier_id, pin_hash)
SELECT 
    0,
    crypt(menu_data->'posSettings'->>'pinCode', gen_salt('bf'))
FROM public.shop_settings
WHERE menu_data->'posSettings'->>'pinCode' IS NOT NULL
ON CONFLICT (cashier_id) DO NOTHING;


-- Verification function
CREATE OR REPLACE FUNCTION verify_pin(p_cashier_id BIGINT, p_pin TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_hash TEXT;
BEGIN
    SELECT pin_hash INTO v_hash FROM public.cashier_pins WHERE cashier_id = p_cashier_id;
    IF v_hash IS NULL THEN
        RETURN FALSE;
    END IF;
    RETURN v_hash = crypt(p_pin, v_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add RLS for cashier_pins (authenticated only)
ALTER TABLE public.cashier_pins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Hardware can access cashier_pins" ON public.cashier_pins FOR ALL TO authenticated USING (true) WITH CHECK (true);
