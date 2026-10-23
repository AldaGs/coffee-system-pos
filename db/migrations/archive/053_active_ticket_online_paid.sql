-- 3.8: paid-online flag on the ticket (was a name marker staff could rename away).
ALTER TABLE public.active_tickets ADD COLUMN IF NOT EXISTS online_paid boolean NOT NULL DEFAULT false;
