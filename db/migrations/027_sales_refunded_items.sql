-- =============================================================================
-- 027_sales_refunded_items.sql
--
-- Per-line refund attribution. Until now a refund was a single scalar
-- (sales.refund_amount) with no line detail, so the multi-vendor settlement
-- (023/024) had to spread a refund across EVERY vendor on the ticket by gross
-- share — under-paying the vendors whose items weren't the ones returned
-- (see the NOTE in src/utils/vendorUtils.js).
--
-- This column stores which lines were refunded, keyed by the line's index in
-- sales.items:  { "<lineIndex>": { qty, amountCents } }  (cumulative across
-- repeated partial refunds). computeSettlement consumes it to charge each
-- refund to the exact line/vendor; when it's null/absent (legacy sales, or a
-- custom-amount refund) settlement falls back to the proportional split.
--
-- This file mirrors the same column added in api/install.js and
-- src/components/SetupScreen.jsx. Keep all three in sync.
-- =============================================================================

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS refunded_items jsonb;
