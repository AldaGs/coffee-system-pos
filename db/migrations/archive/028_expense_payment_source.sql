-- =============================================================================
-- 028_expense_payment_source.sql
--
-- Which pocket an expense was paid from. Inventory cash-outs (receive, restock,
-- transform) let the operator say how the cost was paid: Caja Chica (petty
-- cash), Banco (business bank account), or Dueño (the owner's own money).
--
-- This matters for the cash drawer Corte: only money that physically left the
-- register ('caja') should reduce expected cash. Bank/owner costs are still
-- real expenses for the books (COGS/P&L) but never touched the drawer, so the
-- reconciliation must skip them — otherwise the count never balances.
--
-- Until now the pocket was encoded as a tag in the reason text ("[Banco]" /
-- "[Dueño]") and the drawer filter matched on that substring, which was fragile
-- (a manual reason containing those characters would be misread). This promotes
-- the pocket to a first-class column the drawer math keys off instead. The
-- reason tag stays for human readability; the column is authoritative.
--
-- Default 'caja' so every existing row (and every manual register expense /
-- vendor payout, which are cash out) keeps counting against the drawer exactly
-- as before. Only 'banco'/'dueno' rows are excluded.
--
-- This file mirrors the same column added in api/install.js and
-- src/components/SetupScreen.jsx. Keep all three in sync.
-- =============================================================================

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS payment_source text NOT NULL DEFAULT 'caja';
