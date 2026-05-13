-- Backfill ticket_id on legacy inventory_logs rows.
--
-- Why: AnalyticsTab attributes sale-type logs to filtered sales via ticket_id.
-- Logs written before ticket_id was added (pre-004) have NULL ticket_id and
-- fall through to a fragile timestamp-based fallback. Backfilling lets us
-- retire that fallback and removes ambiguity when two unrelated sales share
-- a created_at instant.
--
-- Strategy: for each sale-type log missing ticket_id, find the sale with the
-- same created_at and copy its ticket_id over. If a log has multiple
-- candidate sales (same exact timestamp) we leave it NULL — those rows
-- represent unresolvable ambiguity in the legacy data and should stay
-- uncounted rather than be misattributed.

WITH log_matches AS (
  SELECT
    il.id AS log_id,
    (SELECT s.ticket_id
       FROM public.sales s
      WHERE s.created_at = il.created_at
        AND s.ticket_id IS NOT NULL
        AND s.ticket_id <> ''
      LIMIT 1) AS resolved_ticket_id,
    (SELECT COUNT(*)
       FROM public.sales s
      WHERE s.created_at = il.created_at
        AND s.ticket_id IS NOT NULL
        AND s.ticket_id <> '') AS match_count
  FROM public.inventory_logs il
  WHERE il.deduction_type = 'sale'
    AND (il.ticket_id IS NULL OR il.ticket_id = '')
)
UPDATE public.inventory_logs il
SET ticket_id = lm.resolved_ticket_id
FROM log_matches lm
WHERE il.id = lm.log_id
  AND lm.match_count = 1;
