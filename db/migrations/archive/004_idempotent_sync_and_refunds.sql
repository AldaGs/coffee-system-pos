-- 004_idempotent_sync_and_refunds.sql
-- Idempotency for sync and safety constraints for refunds

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS local_id UUID UNIQUE;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS refund_amount NUMERIC DEFAULT 0;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS local_id UUID UNIQUE;
ALTER TABLE public.inventory_logs ADD COLUMN IF NOT EXISTS local_id UUID UNIQUE;

-- Issue 9: Refund constraint - ensure we never refund more than the total
ALTER TABLE public.sales ADD CONSTRAINT refund_limit_check CHECK (refund_amount <= total_amount);
