-- 4.6: Clip link generated from the POS for this ticket; the webhook flips online_paid.
ALTER TABLE public.active_tickets ADD COLUMN IF NOT EXISTS clip_payment_id text;
