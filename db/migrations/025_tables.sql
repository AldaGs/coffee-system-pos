-- =============================================================================
-- 025_tables.sql
--
-- Tables / floor-plan system. Adds a `floor_plan` registry so a full-service
-- venue can lay out its tables on a visual map and track tickets against them.
-- See docs/tables.md for the full design.
--
-- `floor_plan` is catalog/reference data (low-volume, admin-managed), so it
-- follows the same pattern as `vendors` (023): a client-generated text id, RLS
-- scoped TO authenticated, written directly (no offline sync queue / local_id).
-- Each row holds one floor/zone; its table nodes (number, name, seats, shape,
-- geometry) ride on the `data` jsonb as a canvas document, exactly like designed
-- menus store their layout on menus.data (016).
--
-- The table -> ticket link is NOT a column here: it rides on
-- active_tickets.table_id (+ active_tickets.seats), added below as additive
-- nullable columns so existing cafe/orders tickets are untouched (null = no
-- table). table_id is the client-generated id of a table NODE inside some
-- floor_plan.data.document — not a row id — so it is intentionally NOT a foreign
-- key (the parent floor is found by scanning, the way menu item bindings work).
-- seats is the per-ticket cover count, defaulting from the table's expectedSeats
-- but overridable on open (extra chair).
--
-- This file mirrors the same block embedded in api/install.js and
-- src/components/SetupScreen.jsx. Keep all three in sync.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.floor_plan (
  id          text PRIMARY KEY,                    -- client-generated uuid
  name        text NOT NULL,
  zone        text NOT NULL DEFAULT '',
  is_active   bool NOT NULL DEFAULT true,
  sort_order  int  NOT NULL DEFAULT 0,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { document: <canvas doc of table nodes> }
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.floor_plan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Hardware can access floor_plan" ON public.floor_plan;
CREATE POLICY "Hardware can access floor_plan" ON public.floor_plan
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Additive table<->ticket link. Nullable: existing tickets keep NULL (= not
-- seated at a table) and the cafe/orders layouts ignore these columns.
ALTER TABLE public.active_tickets
  ADD COLUMN IF NOT EXISTS table_id text;
ALTER TABLE public.active_tickets
  ADD COLUMN IF NOT EXISTS seats int;

-- Floor view queries open tickets per table.
CREATE INDEX IF NOT EXISTS active_tickets_table_id_idx
  ON public.active_tickets (table_id);
