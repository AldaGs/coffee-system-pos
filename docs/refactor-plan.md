# Refactor plan: big files, comments and patches

Status: **1b, 2, the Admin.jsx, CanvasEditor.jsx and SetupScreen.jsx splits, and useFlash done** (2026-10-22). InventoryTab, GeneralSettingsTab and Register.jsx, PublicOrder.jsx, PublicMenu.jsx, CfdiTab and MenusTab done; next: OrdersTab.

## Goals

1. No source file longer than about 400 lines (data files excepted, see Phase 4).
2. Comments explain *why*, not *what*: one short line, only where the code can't say it itself.
3. Fix the root cause behind each patch instead of moving the patch to a new file.
4. No behavior changes during a split. Fixes go in their own commits.

## Inventory: files over 1,000 lines

| File | Lines | What's actually in it |
|---|---|---|
| `api/_schemaDeltas.js` | 7,244 | SQL migrations per version (data) |
| `src/components/SetupScreen.jsx` | 5,082 | **~4,035 lines are a copy of the install SQL** (lines 221–4257); ~1,050 lines of UI |
| `src/utils/translations.js` | 4,651 | Translation strings (data) |
| `api/install.js` | 4,299 | **~4,180 lines are the install SQL** (lines 38–4219) |
| `db/schema-latest.sql` | 4,181 | A third copy of the schema, header says schema **3.2** (current is 5.5) |
| `src/components/menuCanvas/CanvasEditor.jsx` | 3,440 | Editor, toolbar, node renderers, panels; ~390 comment lines |
| `src/Admin.jsx` | 2,337 | Admin shell and tab state; ~255 comment lines |
| `src/components/admin/InventoryTab.jsx` | 1,585 | |
| `src/components/admin/GeneralSettingsTab.jsx` | 1,270 | Includes the schema-update UI and the "legacy price repair" tool |
| `src/Register.jsx` | 1,205 | |
| `src/components/PublicOrder.jsx` | 1,154 | Done: 33 lines + `publicOrder/` (shared, ui, strings, orderMath, hooks, CheckoutPanel, Order, Track) |
| `src/components/admin/CfdiTab.jsx` | 1,134 | Done: 102 lines + `admin/cfdi/` (4 hooks, panels, RequestCard, modals; monthSummary tested) |
| `src/components/PublicMenu.jsx` | 1,132 | Done: 169 lines + `publicMenu/` (useMenuData, shared, items, templates, UploadedMenu, TvMode, states) |
| `src/components/admin/MenusTab.jsx` | 1,115 | Done: 162 lines + `admin/menus/` (useMenusList, MenuCard, editors, share block) |
| `src/components/admin/OrdersTab.jsx` | 1,105 | |

## Root problems found (what we fix, not just move)

### P1: The database schema is copied in three places, and the copies have drifted (high priority)

`src/utils/schemaVersion.js` documents a manual "change all three" rule: `api/install.js`, `SetupScreen.jsx` and `_schemaDeltas.js`. In practice:

- The SetupScreen copy and the `install.js` copy differ by **~580 lines**. For example, SetupScreen creates `order_fulfillment` and `active_tickets.kds_sent/table_id/seats` in places where `install.js` doesn't. A first install from SetupScreen and a full reinstall from `install.js` can therefore produce different databases.
- `db/schema-latest.sql` calls itself a mirror but is stuck at 3.2.

**Decision: migrations are the only source.** `db/migrations/` already has 68 files (001–068), and the same SQL is copied into `_schemaDeltas.js`, `install.js`, `SetupScreen.jsx` and `schema-latest.sql`.

1. Check that the 68 files really build what `install.js` builds today, and add the missing pieces as new migrations.
2. Review each migration and tag it as **feature** or **fix** (a fix corrects an unwanted behavior from an earlier migration).
3. Recommended: squash everything up to today into `000_baseline.sql` for new installs, with each fix folded into its feature. Already-applied files are never edited, because existing installs have run them. An automated test checks that the baseline and running the 68 files one by one produce the same database.
4. Track applied migrations in a `schema_migrations` table, replacing the single `schema_version` string. `/api/install` runs only the missing files, one request per file or small batch, so each request stays under the Vercel time limit.
5. Delete the SQL copies from `install.js`, `SetupScreen.jsx`, `_schemaDeltas.js` and `schema-latest.sql`, along with the manual sync rule in `schemaVersion.js`.

### P2: `setTimeout(..., 0)` used to get around React's "no setState in effect" rule

There are 7+ cases (`App.jsx:117`, `SetupScreen.jsx:81`, `PublicCFDI.jsx:135,137`, `PublicMenu.jsx:141,808`, `CanvasEditor.jsx:134,577`, `GeneralSettingsTab.jsx:144,152`, `MenuShareCard.jsx:101`, `CfdiTab.jsx:169`). They delay a state update by one tick only to silence the lint rule, at the cost of an extra render and a brief flash of wrong state.
**Fix:** compute the value while rendering, set it in the event handler, or use lazy initial state.

### P3: 30 `eslint-disable react-hooks/exhaustive-deps`

Most of them hide effects that use stale values or should be events (`CfdiTab`, `GeneralSettingsTab`, `MenusTab`, `DevicesTab`, `TablesTab`, `OnlineOrdersInbox`, `PublicOrder`, `CanvasEditor` ×4, …).
**Fix:** review each one. Use stable callbacks (`useCallback`), move the logic into the handler, or pass the right dependencies. Keep a disable only where it's justified in one line.

### P4: Timing-based waits instead of real signals

- `OrdersTab.jsx:417`: waits with `setTimeout` for the DOM to render `TicketImage` before capturing it. The fix is to render it and capture from a ref callback or effect.
- `SetupScreen.jsx:4332`: a fixed 1-second "wait for UX". Remove it.
- `MenuHistoryPanel.jsx:72`, `PublicCFDI.jsx:198`: `window.location.reload()` to refresh data. The fix is to refetch state.
- Done for 10 of the ~15 `setTimeout(() => setX(false), N)` flag resets via `src/hooks/useFlash.js`. Left: `useCheckout`/`useLoyalty` (they receive the setter from their caller) and MenuShareCard's `error`, which also holds real errors; convert them when those files are split.

### P5: Legacy paths that may be dead

Each one needs a yes/no from you: are there still installs that need it?

- ~~`GeneralSettingsTab` "Scan / Repair Legacy Prices" tool~~: removed. It was already unreachable (button and scanner commented out).
- `PublicMenu` long URL `?u=&k=` (base64 keys in the URL) plus its 5-minute polling.
- `OrdersTab` "lite ticket" built from `items_sold` names for orders from before `local_id`.
- One-time localStorage migrations: `useExpenses.migrateLegacyExpenses`, `useShiftState.migrateLegacyShiftState`.
- `InventoryTab` reorder heuristic (2000 g / 10) used when `reorder_point` is unset.
- `activityFormatter` mapping for old `action_type` values.

**Decision:** we review each path one at a time before deciding. If a path is no longer needed, delete it. If it is, keep it isolated in a `legacy/` helper with a one-line reason.

### P6: Unfinished placeholder

`PublicMenu.jsx:244` still shows a "Phase 4" placeholder for `kind='designed'` menus. The designed renderer (`CanvasRenderer`) exists now. **Decision:** postponed. No changes until the end of the refactor.

### P7: Translations embedded in components

`OnlineOrdersTab.jsx:52–58` and `PublicOrder.jsx:111` have their own EN/ES dictionaries next to `translations.js`. Move them into the shared translations.

## Step 1a: migration review

Status: **draft for your review**. I tagged each migration from its file header and from `src/utils/schemaVersion.js`. Nothing has been run against a database yet.

Tags:
- **Feature:** adds something the app uses.
- **Fix:** corrects an earlier migration or an unwanted behavior. **Fix → NNN** names the migration it corrects.
- **Security / Perf:** hardening or speed, with no change to behavior.
- **Data:** a one-time backfill or conversion of existing rows.

### Gaps: schema that exists only in `install.js`

The 68 files don't describe the whole database. These pieces exist in `install.js` but have no migration file. They have to become migrations, or go into the baseline, before the migration files can be the only source:

| Missing | Notes |
|---|---|
| **Core tables** from before 001: `sales`, `active_tickets`, `customers`, `inventory`, `inventory_logs`, `recipes`, `expenses`, `shop_settings`, `activity_logs`, `app_users`, `schema_meta`, `tip_events`, `tip_payouts` + `is_app_admin`, `claim_or_bootstrap_app_user` | No migration creates them. This becomes the start of the baseline. |
| **Schema 1.9 → 3.1, online ordering** (13 versions): `online_orders`, `public_place_order`, `get_order_status`, delivery fields, map pin, time slots, payment method, cash amount, store hours, `get_legal`, `get_order_menu` | Written straight into `install.js` without migration files (`_schemaDeltas.js` starts at 3.2). The largest gap. |
| `order_fulfillment` columns (delivery_*, 2.0 / 2.2 / 3.0) | The table belongs to tinylogistics. `install.js` only `ALTER`s it, but **SetupScreen `CREATE`s it**, which is drift (see below). |

### Drift between the copies

| Item | install.js | SetupScreen | Migrations | Correct version (proposed) |
|---|---|---|---|---|
| `floor_plan` table | only listed in grants, not created | created | 025 creates it | migration 025; install.js is missing it |
| `order_fulfillment` | `ALTER` only | `CREATE TABLE` | none | don't create it (tinylogistics owns it); SetupScreen is wrong |
| `active_tickets.kds_sent / table_id / seats` | missing | present | 025 (`table_id`, `seats`) | to check one by one in 1b |
| `push_subscriptions` | — | — | 055 created, 056 replaced it | leave out of tinypos SQL; the deployed table is tinylogistics' (never drop it) |
| `notify_cfdi_request` / `sales_cfdi_notify` | missing | — | 060 | migration 060 (deployed); install.js is missing it |
| `db/schema-latest.sql` | — | — | — | stale (3.2). Delete it. |

### Deployed check (2026-10-22, JardinOcultoPOS, `schema_version` 5.5)

Read-only check of the tables, functions and triggers in `public`, compared by name against `install.js` and `db/migrations/`. Columns were only checked where noted.

- **Shared database confirmed.** `schema_meta` also holds `logistics_schema_version` (0.16) and `logistics_migration`, and the same `public` schema has 22 `book_*` tables (tinybooks) plus `employees_logistics`, `logistics_settings`, `notification_*`, `order_fulfillment`, `google_calendar_config`, `calendar_sync_settings`, `tracking_pin_attempts` and the tracking/fulfillment functions and triggers (tinylogistics). The baseline must not create or drop any of these. The comparison test has to ignore them.
- **`push_subscriptions` belongs to tinylogistics.** The deployed table has `user_id`, so it's tinylogistics' version (`tinylogistics/db/migrations/0001_logistics_core.sql`), not the one from 055. "Drop from the baseline" means leaving it out of tinypos's SQL. Never `DROP` it.
- **`active_tickets.kds_sent` exists in production and is used by the app** (`Register.jsx`, `TicketArea.jsx`, `onlineOrders.js`), but only SetupScreen creates it. A reinstall from `install.js` or the migrations alone would miss it. It goes into the baseline.
- **`notify_cfdi_request` + trigger `sales_cfdi_notify` are deployed** (migration 060) but `install.js` doesn't create them. A full reinstall loses CFDI request alerts. The baseline takes them from 060.
- **`floor_plan` is deployed** (migration 025). `install.js` only grants on it, which confirms that `install.js` is missing it.
- **No known source:** `app_runtime_config` (key/value table) and `tips_reconciliation` (shaped like a view) aren't in any `.sql` in the four repos. They were probably created by hand in the dashboard. Decide in 1b: adopt them into a migration or drop them.
- Nothing that `install.js` or the migrations create is missing from production.

The ~580-line SetupScreen vs install.js diff will be checked line by line in 1b with a script that runs both on a test Postgres and compares the resulting databases.

### Migration list

| # | Version | What it does | Tag |
|---|---|---|---|
| 001 | — | RLS policies from `public` to `authenticated` | Security (fixes the original install) |
| 002 | — | Atomic inventory deduction RPC | Fix: race condition |
| 003 | — | Hashed PINs + verify RPC; converts plaintext PINs | Security + Data |
| 004 | — | Sync idempotency; refund ≤ total constraint | Fix |
| 005 | — | Drop unused `sent_to_barista` | Cleanup |
| 006 | — | Loyalty visits counted by a sales trigger, once per sale | Fix: double counting |
| 007 | — | Loyalty redemption (spend stars) | Feature (also fixes "reward ready forever") |
| 008 | — | Recurring vs one-time loyalty | Feature |
| 009 | — | Backfill `ticket_id` on old inventory logs | Data |
| 010 | — | Split `menu_data` JSON into tables | Feature + Data |
| 011 | — | `get_public_menu` RPC | Feature |
| 012 | — | Repair FKs from a draft of 010 | Fix → 010 |
| 013 | — | Menu item photos + storage bucket | Feature |
| 014 | — | Menu version snapshots + restore | Feature |
| 015 | — | Multiple menus + schedules | Feature |
| 016 | — | Designed-menu payload | Feature (P6, postponed) |
| 017 | — | `get_menu_by_id` deep link | Feature |
| 018 | — | Per-item availability in public menu | Feature |
| 019 | — | Safe cast in `menu_item_available` | Fix → 018 |
| 020 | — | `menu` bucket for short-URL redirects | Feature |
| 021 | — | Hide/show modifier groups | Feature |
| 022 | — | IVA breakdown on sales | Feature |
| 023 | — | Vendors | Feature |
| 024 | — | Vendor payouts | Feature |
| 025 | — | Tables / floor plan | Feature |
| 026 | — | Inventory reorder point | Feature (see P5 heuristic) |
| 027 | — | Per-line refunded items | Feature |
| 028 | — | Expense payment source | Feature |
| 029 | — | Roast + WhatsApp fields in public menu | Feature |
| 030 | — | Separate "hidden from public" vs "hidden from POS" | Feature (fixes a mixed flag) |
| 031 | — | CFDI `fiscal_profiles` + anon policies | Feature (anon access removed by 039/040) |
| 032 | — | CFDI indexes | Perf: fixes timeouts |
| 033 | — | CFDI global invoice periods | Feature |
| 034 | 1.1 | Idempotent inventory deduction | Fix → 002 |
| 035 | — | Inventory lots | Feature |
| 036 | — | FIFO lot consumption | Feature |
| 037 | 1.4 | Restock RPC + availability check that never fired | Feature + Fix → 018 |
| 038 | 1.5 | Release dedup claim on short stock | Fix → 034 |
| 039 | 1.6 | CFDI portal RPCs | Security → 031/033 |
| 040 | 1.6 | Drop CFDI anon policies | Security → 031/033 |
| 041 | 1.6 | Function EXECUTE grants (old revokes didn't work) | Security: fixes install.js |
| 042 | 1.6 | Enforce `app_users` allowlist in RLS | Security |
| 043 | 1.6 | Hide `cashier_pins` | Security → 003 |
| 044 | 1.6 | Rate limiting PIN + CFDI | Security |
| 045 | 1.6 | Rate-limit feedback (why / how long) | Fix → 044 |
| 046 | 1.6 | Pin `search_path` | Security |
| 047 | 1.7 | Indexes + RLS initplan | Perf |
| 048 | 1.8 | One fiscal profile per CFDI request | Fix → 039 (shared RFC overwrite) |
| — | 1.9–3.1 | Online ordering | **Missing, see Gaps** |
| 049 | 3.2 | Delivery areas + shipping quotes | Feature |
| 050 | 3.3 | Public delivery coverage | Feature |
| 051 | 3.4 | Clip payments | Feature |
| 052 | 3.5 | Clip pay window | Feature |
| — | 3.6, 3.7 | No SQL (redeploys Edge Functions) | — |
| 053 | 3.8 | `online_paid` flag | Fix: replaces a ticket-name marker |
| 054 | 3.9 | Cashier-only modifier groups | Feature |
| 055 | 4.0 | Order alerts (pg_net → Edge Function) | Feature |
| 056 | 4.1 | `order_alert_devices` | Fix → 055 (table name collision) |
| 057 | 4.2 | Page analytics | Feature |
| 058 | 4.3 | Analytics page filter | Feature → 057 |
| 059 | 4.4 | One delivery per slot | Feature |
| 060 | 4.5 | CFDI request alert | Feature |
| 061 | 4.6 | Clip link on ticket | Feature |
| 062 | 4.7 | Clip auto-accept | Feature |
| 063 | 4.8 | Per-destination alert events | Feature |
| — | 4.9, 5.0 | No SQL (redeploys order-alert) | — |
| 064 | 5.1 | CFDI ZIP download | Feature |
| 065 | 5.2 | CFDI reopen note | Feature |
| 066 | 5.3 | CFDI email | Feature |
| 067 | 5.4 | CFDI email text | Feature |
| 068 | 5.5 | Tracking + CFDI links on order status | Feature |

**Summary:** about 40 feature, about 25 fix/security/perf/data. Fix chains that fold together in a baseline: 002→034→038, 010→012, 018→019→037, 031/033→039/040→048, 003→043, 044→045, 055→056.

### Proposed migration layout after cleanup

```
db/migrations/
  000_baseline.sql        # schema as of 5.5, fixes folded in; new installs only
  069_….sql               # every change after this, one file each
```
Existing installs at 5.5 are marked as having `000` applied and only run 069+. Installs older than 5.5 run the old files 001–068 (kept in `db/migrations/archive/`) plus the 1.9–3.1 files we write from `install.js`.

## Before starting

1. **Compare against a deployed database, not just `install.js`.** The deployed schema is the truth. In 1b, take a schema-only dump of at least one real tenant (the Supabase MCP is connected to one) and diff it against the baseline. That catches hand patches and skipped deltas.
2. **Check the sibling apps.** tinykds, tinylogistics and tinybooks share the Supabase project. Check whether any of them reads `schema_meta` / `schema_version` or creates shared tables (`order_fulfillment`). Keep writing `schema_version` next to `schema_migrations` for at least one release, for them and for cached PWA clients.
3. **Smoke tests before Phase 3.** Add about 3 end-to-end checks: ring a sale and sync it, place a public order, request a CFDI. Run them after every split PR.
4. **The schema-copy test.** The existing test that requires the SQL copies to match will fail once 1b removes them. Rewriting it is part of 1b.
5. **Feature freeze on schema during Phase 1.** A migration added while 1b is in flight has to land in both the baseline and the archive. Ship pending work (e.g. `docs/online-orders-inbox-ux.md`) before 1b or after it.

## Step 1b: done

- `db/migrations/000_baseline.sql` = old install.js script + drift fixes (floor_plan, `active_tickets.kds_sent/table_id/seats`, realtime, 060's CFDI-request trigger; `order_fulfillment` ALTERs only when tinylogistics' table exists). 001–068 moved to `archive/`.
- Simplification vs the plan: no 1.9–3.1 files written. The baseline is idempotent, so installs older than 5.5 just run it (same as the old full-script fallback).
- `/api/install` runs pending files from `public.schema_migrations`, one request each, then stamps `schema_version`. SetupScreen calls it, then seeds only the admin PIN.
- Removed: `_schemaDeltas.js`, `schema-latest.sql`, the SQL copies in install.js/SetupScreen (5,082 → 1,040 lines).
- `schemaBaseline.test.js` applies all migrations twice on PGlite with a Supabase stub.
- Deployed diff (JardinOcultoPOS): tables/columns/triggers match. Prod-only and left out: `verify_admin_pin`, `provision_schema`, `deduct_inventory(jsonb)`, `active_tickets.senttobarista`, `app_runtime_config`, `tips_reconciliation` (no app uses them).
- Follow-up fix done in migration 069 (5.6): `get_order_status` tolerates a missing `order_fulfillment`.

## Comment rules (applied to every file we touch)

- Delete comments that repeat the code (`// set loading to true`), section banners on tiny blocks, and stale history ("added in v2.3…").
- Keep business rules, tax/CFDI and Clip quirks, and non-obvious constraints, each as one short sentence.
- Use one JSDoc line on exported helpers when the name isn't enough.
- Change history belongs in git and `schemaVersion.js`, not in code comments.

## Split pattern

```
src/components/admin/<area>/   (decision)
  <Area>Tab.jsx         // layout + composition only
  components/…          // one section/step per file
  use<Area>Data.js      // fetching, saving, derived state
  <area>Math.js         // pure logic, unit-tested
```

### Reference: the Admin.jsx split (2,337 → 300 lines)

`src/Admin.jsx` only wires things together; everything else is in `src/components/admin/shell/`:
- One hook per job (`useAdminSession`, `useAdminData`, `useCatalogActions`, `useModifierActions`, `useDiscountActions`, `useMenuAssets`, `useSettingsActions`, `useAdminAnalytics`, `useRecipeActions`), each under ~240 lines.
- Hooks read `useMenuStore`, `useDialog` and `useTranslation` themselves instead of taking them as props. They take only what another hook owns (`runMenuWrite`, `setIsSaving`, vendors).
- Pure logic goes in a `*Math.js` file with a test (`analyticsMath.js`: the period filter that was copied three times is now one function).
- Presentational pieces are plain components (`AdminLogin`, `AdminSidebar`, `StaleBanner`); the tab list is data (`adminTabs.js`).
- P3 in this file: both `exhaustive-deps` disables removed (`useCallback` for `recheckCloud`; the item form's default category is now computed while rendering instead of pushed in by the loader).
- Found, not fixed (no behavior changes in a split): a custom date range ends a day early west of UTC (`new Date('YYYY-MM-DD')` is UTC midnight); the menu history card errors in local mode (`listVersions` has no local-mode guard).

### CanvasEditor.jsx split (3,440 → 616 lines)

- Subcomponents moved as-is to `src/components/menuCanvas/editor/` (node renderers, stage tools, rulers, toolbar, context menu, properties panels, styles).
- Document edits are pure functions in `editor/docOps.js` (layer order, grouping, align/distribute, snapping, guides, paste, product links), tested in `canvasDocOps.test.js`.
- Hooks: `useCanvasHistory`, `useStageZoom`, `useRulerGuides`, `usePenTool`, `useDocFonts`, `useNodeDrag`, `useNodeOps`. New-element defaults are data in `nodeTemplates.js`.
- P2: both `setTimeout(…, 0)` gone (path editing is derived from the selection; the mobile sheet opens via a render-time check).
- P3: 6 disables → 3, each with a one-line reason (font loading keyed on the font list, one-shot PNG export, text measuring that ignores the parent's new `onMeasure` each render).
- The rest of CanvasEditor.jsx is mostly the JSX layout of the stage and panels; splitting it further would only pass props around.

### SetupScreen.jsx split (1,041 → 128 lines)

- `src/components/setup/`: `useProvisioning` (OAuth return, projects, create + poll, install, connect), one component per step (`AuthorizeStep`, `ProjectStep`, `AdminStep`), `setupStyles.js`.
- P2: `authorized` is read from the URL as initial state instead of `setTimeout(…, 0)`; the OAuth effect's disable is gone (`fetchProjects` is a stable callback).
- P4: the 1-second "wait for UX" before booting is removed; the alert uses `useFlash`.
- Removed two `console.log`s; one printed the project's API keys (service_role included) to the browser console.

### InventoryTab.jsx split (1,585 → 177 lines)

- `src/components/admin/inventory/`: `inventoryStore.js` (two-mode writes, lots, expenses), `stockMath.js` (reorder point, cost blending for restock and roast; tested), `useLots`, `useStockActions`, and one component per block (forms, lots, deleted/history, item panels, list).
- The roast now registers its lot through `registerLot` instead of a second inline copy; the `drawDownLotsFIFO` pass-through wrapper is gone.
- Fixed: the "See Deleted" view never rendered (its JSX returned a function, `})}` instead of `})()}`).

### GeneralSettingsTab.jsx split (1,258 → 139 lines)

- `src/components/admin/settings/`: `useSchemaUpdate` (version read + OAuth resume), `useAdvancedModeToggle` (PIN challenge), `parseColor.js` (tested), section components (`CoreSections`, `SchemaSection`, `WorkflowCard`, `DeviceSections`) and `fields.jsx`.
- Removed dead code: the legacy price repair (unreachable) and a commented-out sign-out card; Admin.jsx no longer passes `setInventoryItems`/`dexieSales` here.
- P2/P3: the three `setTimeout(…, 0)` and the OAuth-resume `eslint-disable` are gone (initial state computed up front, real effect deps).

### Register.jsx split (1,205 → 432 lines)

- Money math moved to `src/utils/registerTotals.js` (`cartTotals`, `shiftTotals`) with tests; the code was moved as-is.
- New hooks in `src/hooks/`: `useRegisterSync` (boot load + live mirrors), `useRegisterLock`, `useKdsSend`, `useTicketDiscounts`, `useItemPicker` (+ `createItemClick`), `useOrderNumbers`, `useReceiptSharing`, `useTablesLayout`.
- P3: the auto-lock disable is gone; three remain, each with a reason (restore-on-login, KDS immediate send, the context memo).
- Also fixed (found while checking JSX names): the CanvasEditor split had dropped `Image as KImage`, so designed menus with images crashed. Fixed in its own commit.

## Open bugs found during the refactor (not fixed; need a decision)

1. **Corte double-counts cash refunds.** `shiftTotals`: a sale refunded in the same shift is already counted net of its refund, and `shiftCashRefunds` subtracts the refund again, so expected cash is too low by the refunded amount. A refund on a sale from an earlier shift isn't counted at all. The test in `registerTotals.test.js` pins the current numbers.
2. **Weekly order-number reset never happens.** Settings offers "weekly", `useOrderNumbers` only handles daily/monthly/yearly.
3. **Custom date range ends a day early** west of UTC (`new Date('YYYY-MM-DD')`), in `analyticsMath.inPeriod`.
4. **Menu history card errors in local mode** (`listVersions` has no local-mode guard).

## Order of work (one PR per step)

| Phase | Step | Depends on |
|---|---|---|
| 0 | Review this document; decide on P1 drift and P5 legacy paths | you |
| 1a | **P1** check migrations against install.js; tag each feature/fix; you review the list | Phase 0 |
| 1b | **P1** baseline + comparison test (incl. diff vs a deployed tenant), `schema_migrations` runner (still writes `schema_version`), rewrite the schema-copy test, remove the SQL copies (SetupScreen drops to ~1,050 lines) | 1a |
| 2 | Smoke tests (sale + sync, public order, CFDI request): done, `src/tests/smoke.test.js` on PGlite | — |
| 3 | Split `Admin.jsx`. This is the reference for the pattern, so you review the style here | 2 |
| 3 | Shared helpers: `useFlash`; apply P2/P3 fixes in each file as it is split, so lines are touched once | Admin split |
| 3 | Split `CanvasEditor.jsx` (toolbar, node renderers, panels, `useCanvasHistory`, `useSelection`) | 3 |
| 3 | Split what's left of `SetupScreen.jsx` (one component per setup step + `useProvisioning`) | 1 |
| 3 | The 1,100–1,600-line tabs, `Register.jsx`, `PublicOrder`, `PublicMenu`, P4, P6, P7 | 3 |
| 4 | Data files: `translations.js` split per area (`translations/<area>.js`). Only how it's organized changes, not its contents (`_schemaDeltas.js` goes away in Phase 1) | — |
| 5 | P5: review each path, remove the ones you approve | 0 |
| 6 | P6: designed-menu page | end |

Every PR: `npm run lint`, `npm test`, `npm run build` pass. Before a split, add tests for the code being pulled out (hooks and helpers) if it has none.

## Open questions for you

1. **P1:** squash into a baseline (recommended) or only tag migrations as feature/fix? Without a baseline, new installs replay 68 files plus the missing 1.9–3.1 versions, and the fix chains stay tangled.
