-- =============================================================================
-- probe-management-api.sql
--
-- Self-contained probe to verify that Supabase's Management API
-- /database/query endpoint (which both /api/run-sql and /api/install proxy
-- to) is transactional and surfaces errors. Paste this whole file into the
-- Supabase SQL editor on a non-production project and click "Run".
--
-- Expected results:
--   - If the endpoint is transactional (our assumption): you get an error,
--     and NEITHER _probe_first NOR _probe_after exists afterwards.
--   - If the endpoint runs autocommit per-statement (silent-failure mode):
--     you get an error, _probe_first exists, AND _probe_after exists.
--     (This would be the dangerous case we'd need to guard against.)
--
-- After the run, check with:
--   SELECT to_regclass('public._probe_first')  AS first_existed,
--          to_regclass('public._probe_after')  AS after_existed;
--
-- Then clean up:
--   DROP TABLE IF EXISTS public._probe_first;
--   DROP TABLE IF EXISTS public._probe_after;
-- =============================================================================

-- Sanity: clean slate.
DROP TABLE IF EXISTS public._probe_first;
DROP TABLE IF EXISTS public._probe_after;

-- Statement A: succeeds. Creates _probe_first.
CREATE TABLE public._probe_first (id int);
INSERT INTO public._probe_first VALUES (1);

-- Statement B: deliberately fails (table doesn't exist). The whole batch
-- should roll back here if the endpoint is transactional.
INSERT INTO public._probe_nonexistent_table_xyz VALUES (1);

-- Statement C: would succeed IF the endpoint kept going past errors.
-- Used as the marker for the "autocommit / silent failure" case.
CREATE TABLE public._probe_after (id int);
INSERT INTO public._probe_after VALUES (2);
