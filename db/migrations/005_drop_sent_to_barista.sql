-- 005_drop_sent_to_barista.sql
-- Removes the unused KDS column from active_tickets.

ALTER TABLE public.active_tickets DROP COLUMN IF EXISTS "sentToBarista";
