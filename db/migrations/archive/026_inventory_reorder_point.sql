-- =============================================================================
-- 026_inventory_reorder_point.sql
--
-- Reorder points for inventory. Adds a per-item `reorder_point` so the
-- Inventory screen can surface "needs reordering" alerts when stock drops to or
-- below the threshold the operator sets for that item.
--
-- Until now the low-stock indicator used a hardcoded threshold (2000 for grams,
-- 10 otherwise). That heuristic stays as the FALLBACK when reorder_point is 0
-- (unset), so existing installs keep their current behavior; setting a positive
-- value overrides it per item.
--
-- This is an operational signal only — it feeds a human reorder decision (the
-- actual purchase order lives in tinybooks). No stock/cost math depends on it.
--
-- This file mirrors the same column added in api/install.js and
-- src/components/SetupScreen.jsx. Keep all three in sync.
-- =============================================================================

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS reorder_point numeric NOT NULL DEFAULT 0;
