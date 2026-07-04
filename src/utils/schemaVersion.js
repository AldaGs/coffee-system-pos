// Single source of truth for the schema version this build of the app
// expects. The same string is also hardcoded into the SQL in
// api/install.js and src/components/SetupScreen.jsx — when bumping the
// schema, change ALL THREE in the same commit:
//
//   1. This constant
//   2. The literal in api/install.js schemaQuery (INSERT INTO schema_meta)
//   3. The literal in SetupScreen.jsx schemaQuery (mirror)
//
// The Update Schema button in General Settings reads `value` from
// public.schema_meta WHERE key='schema_version' and compares to this
// constant; if they differ, the UI surfaces "Update available."
//
// SCHEMA: bump me when changing the install SQL.
//
// 0.8 — public vs register hide split: the `menu_categories.public_hidden`
//       column plus a one-time backfill from is_hidden, and get_active_menu /
//       get_menu_by_id now filter the public menu on public_hidden (categories)
//       and menu_items.data->>'publicHidden' (items) instead of is_hidden
//       (migration 030). Lets a shop hide an item/category from the Register
//       independently of the customer-facing menu. Idempotent re-run picks up
//       the rewritten RPCs and (once) the backfill on existing installs.
// 0.7 — public-menu item extras: get_active_menu / get_menu_by_id now emit
//       per-item `roast_date` and `whatsapp_url` (from menu_items.data jsonb;
//       migration 029). Powers the coffee roast-date badge and the "order on
//       WhatsApp" button on the public menu. Idempotent re-run picks up the
//       rewritten RPCs on existing installs.
// 0.6 — expense payment source: the `expenses.payment_source` column (migration
//       028). Records which pocket an expense was paid from — Caja Chica (petty
//       cash), Banco, or Dueño. Only 'caja' reduces the cash drawer Corte;
//       bank/owner costs stay in the books but never touched the register.
// 0.5 — vendor payout ledger: the `vendor_payouts` table (migration 024). Records
//       money actually paid to each vendor and freezes the settlement it was paid
//       against in `data`, so the settlement report shows owed − paid balances and
//       payments are made against a locked statement.
// 0.4 — multi-vendor sales: the `vendors` registry table (migration 023). Lets a
//       shop tag products with the vendor that owns them and run a per-vendor
//       settlement report with commission payouts. The item -> vendor link rides
//       on menu_items.data jsonb, so no menu_items column change is needed.
// 0.3 — public menus stack: menus + menu_schedules tables, the
//       get_active_menu / get_public_menu / get_menu_by_id resolver RPCs,
//       the designed-canvas payload (menu.data jsonb, kind='designed'), the
//       menu-assets + menu (short-URL redirect) storage buckets, and the
//       per-item availability RPC. All DDL shipped during the tinymenu work
//       but the stamp was never moved off 0.2; bumping forces existing
//       installs to re-apply (idempotent) so they're guaranteed to have it.
//       Covers Public Menus, the canvas Editor, sharable QR, and TV/kiosk.
// 0.2 — drops auth.users FKs and the auth.users trigger; replaces them with
//       the claim_or_bootstrap_app_user RPC the client calls on sign-in.
//       Fix for Supabase project configs that restrict Management API ops
//       on the auth schema.
// 0.1 — initial introduction of app_users, schema_meta, and the cashier_pin
//       management RPCs.
export const APP_SCHEMA_VERSION = '0.8';
