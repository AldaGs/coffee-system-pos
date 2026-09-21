# ☕ TinyPOS: The Ultimate Artisanal Coffee Ecosystem



> A professional, offline-first Point of Sale & ERP system designed for artisanal coffee bars and roasters.



[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://reactjs.org/)

[![Vite](https://img.shields.io/badge/Vite-Build-646cff.svg)](https://vitejs.dev/)

[![Dexie](https://img.shields.io/badge/Dexie.js-IndexedDB-orange.svg)](https://dexie.org/)

[![Supabase](https://img.shields.io/badge/Supabase-Cloud_Sync-3ecf8e.svg)](https://supabase.com/)

[![Vitest](https://img.shields.io/badge/Tested-Vitest-yellow.svg)](https://vitest.dev/)

[![Schema](https://img.shields.io/badge/Schema-v1.6-blue.svg)](db/MIGRATIONS.md)



TinyPOS is a purpose-built operating system for specialty coffee businesses — engineered for financial precision, zero-downtime service, and frictionless deployment. This repo contains the React frontend, the admin dashboard, and the Vercel serverless functions that drive zero-touch onboarding.



---



## 🏛️ Core Architectural Pillars



### ⚡ True Offline-First

**Dexie.js (IndexedDB)** is the primary source of truth. A background `syncService` reconciles with Supabase over WebSockets. Sales, inventory deductions, and modifiers all commit locally first — the store **never stops**, even when the WiFi does. When the connection returns, the queue drains transparently.



Idempotency is enforced through `local_id` UUIDs on every mutable record (`sales`, `expenses`, `inventory_logs`), so re-sync after a crash never produces duplicates.



### 🧮 The "Centavos" Math Engine

Every monetary value is stored and computed as an **integer in centavos** ([`src/utils/posMath.js`](src/utils/posMath.js), [`src/utils/moneyUtils.js`](src/utils/moneyUtils.js)). Totals, taxes, discounts, and modifier deltas never touch a `float`. Zero floating-point drift, perfectly auditable totals, and tax reports that always reconcile.



Covered by a dedicated Vitest suite in [`src/tests/`](src/tests).



### 🪄 "Holy Grail" Onboarding

New tenants connect their own Supabase project via **OAuth** ([`api/auth/callback.js`](api/auth/callback.js), [`api/install.js`](api/install.js)) and TinyPOS provisions the entire database — schema, RPCs, triggers, RLS policies, and seed data — in seconds. No SQL editor, no copy-pasted keys. A **guided "create project for me"** flow goes one step further: it lists the user's orgs ([`api/get-orgs.js`](api/get-orgs.js)), provisions a brand-new project for them ([`api/create-project.js`](api/create-project.js)), and polls until it's healthy ([`api/get-project-status.js`](api/get-project-status.js)) before running the install.

### 💻 Local Mode (zero-infrastructure)

A second sign-up path (design in [`docs/local-first-mode-plan.md`](docs/local-first-mode-plan.md)) runs the entire POS on-device against IndexedDB with locally-hashed credentials — no Supabase account, org, or project required, so a café owner can start in seconds. The cloud-only admin tabs (Team, Devices, Public Menus, Activity) are hidden in this mode via `isLocalMode()`. Upgrading to a Supabase project later is **additive**: local data migrates up and the install becomes an ordinary cloud tenant.



### 🔒 Zero-Trust Security

- The `service_role` key is **burned-after-reading**: held in memory only long enough to run provisioning, then discarded.

- Daily operations run exclusively under scoped **`anon` keys** behind RLS policies (`TO authenticated`).

- Cashier PINs are bcrypt-hashed via `pgcrypto` and verified server-side through the `verify_pin` RPC — never compared in the browser.

- Inventory deductions go through the atomic `deduct_inventory` RPC to prevent race conditions across terminals — and are **idempotent per originating log** (migrations `034`/`038`), so a timed-out retry on a slow link never double-decrements.

- **Schema 1.6 lockdown** (full write-up in [`docs/SECURITY-1.6.md`](docs/SECURITY-1.6.md)): the public CFDI portal talks only to `SECURITY DEFINER` RPCs (`039`) and the blanket `anon` policies it used to need are gone (`040`); `EXECUTE` is revoked from the roles Supabase grants by default and re-granted per function (`041`); `authenticated` policies check the `app_users` allowlist instead of `USING (true)` (`042`); `cashier_pins` is unreadable by any client role (`043`); `verify_pin` and the CFDI lookup are rate-limited with a countdown the UI shows (`044`/`045`); every `SECURITY DEFINER` function pins `search_path` (`046`).

- The Supabase **Management token lives in an HttpOnly cookie**, never in the URL, and the OAuth round-trip uses PKCE with a verified `state`.



---



## 🌐 The Ecosystem



| Component | Role | Stack |

|---|---|---|

| **TinyPOS Frontend** *(this repo)* | The barista-facing register + admin dashboard | React 19, Vite, Dexie, Zustand |

| **TinyLogistics Sidecar** | Kanban fulfillment board for roasters / shipping, fed by Postgres triggers | React + Supabase Realtime |

| **Local Print Bridge** | Node.js daemon bridging the browser to USB/Network thermal printers (80mm/58mm) | Node.js |

| **TinyBooks** *(not in this repo)* | Planned accounting app that consumes the per-sale IVA (schema `022`) and owns purchase orders / reorder fulfillment | Supabase-shared |



All of these share a single Supabase project per tenant.

> **On TinyBooks:** it lives in a separate codebase that is **not in this repo and not public yet**. TinyPOS only *produces* the data it will consume (the IVA columns from migration `022`, the reorder signal from `026`) — none of the TinyPOS register or admin workflows depend on TinyBooks, so the POS runs fully standalone whether or not TinyBooks is ever connected.



---



## ✨ Functional Surface



### 🛒 High-Velocity Register ([`src/Register.jsx`](src/Register.jsx))

- Long-line-optimized touch flow; nested modifier groups with **deductions** (extra shots pull extra grams from inventory) and **substitutions** (oat milk swap recalculates COGS).

- Split payments, N-way splits, partial paid items, tip capture.

- PIN-protected discounts (percentage or flat) via `discountRules`.

- Expense logging from the POS surface, tagged by **payment source** — caja chica / banco / dueño (migration `028`) — so bank- and owner-paid costs stay out of the cash-drawer corte.

- Live sync status indicator; full i18n (EN/ES).

- **Item image cards** — menu items show their uploaded photo in the register product grid.

- **Dual-layout / OrderFlow mode** — per-device toggle switches between the classic grid layout and a drill-down order flow (ticket → categories → items). OrderFlow hides the tab strip and renders a full-screen cart on mobile; the action bar is shared between both layouts. Enabled from General Settings per device.

- **Per-item IVA treatment** — each menu item carries an `ivaTreatment` (`iva16` / `tasa0` / `exento`) set in the menu editor, so MX food rules (prepared/served vs. unprepared retail) are honored. Checkout carves the real IVA out of the tax-inclusive total and writes `tax_amount` + `taxable_amount` per sale (migration `022`) instead of assuming a flat 16% on every ticket.

- **Line-aware refunds** — a refund records exactly which lines were returned (`sales.refunded_items`, keyed by line index, migration `027`), so multi-vendor settlement charges each refund to the precise line/vendor instead of spreading it across the whole ticket by gross share. Custom-amount and legacy refunds fall back to the proportional split.



### 📈 Admin Dashboard ([`src/Admin.jsx`](src/Admin.jsx))

- Revenue / refunds / **payment-method reconciliation** (card / cash / transfer split).

- **Inventory + The Roaster:** raw stock, multi-warehouse linking, BOM recipes, green-to-finished transformation. The roaster now takes a **final yield weight** instead of a shrinkage percentage — enter what you actually got out of the drum, not a loss estimate. **Per-item reorder points** (migration `026`) surface "needs reordering" alerts when stock hits the operator-set threshold; unset items fall back to the legacy heuristic (2000 for grams, 10 otherwise). It's an operational signal only — the purchase order itself lives in TinyBooks.

- **Tables / floor-plan system** ([`src/components/admin/TablesTab.jsx`](src/components/admin/TablesTab.jsx), design in [`docs/tables.md`](docs/tables.md)): a `floor_plan` registry (migration `025`) lets a full-service venue lay tables out on a visual canvas (number, name, seats, shape, geometry stored as a canvas document on `data` jsonb, like designed menus). Tickets link to a table via additive nullable `active_tickets.table_id` + `seats` — `table_id` is a client-generated table-node id resolved by scanning, intentionally **not** a foreign key. An Advanced-Mode admin tab; the third register layout tracks tickets on the map.

- **Modifier-group hide/show** (migration `021`): an `is_hidden` flag on modifier groups, mirroring category hiding — hidden groups drop out of the public menu RPCs and are filtered client-side in the Register, while item↔group links are preserved so un-hiding restores them without re-attaching per item.

- **COGS / Profit Engine:** target margin → recommended price, computed from live ingredient cost.

- **Activity audit log** ([`src/services/activityLog.js`](src/services/activityLog.js)): every sale, **refund** (commit `5e7baf0`), **settings save**, menu edit, **inventory deletion** (with reason + category metadata), and corte.

- **P&L / Analytics engine** ([`src/components/admin/AnalyticsTab.jsx`](src/components/admin/AnalyticsTab.jsx)): per-product COGS matched by `ticket_id` (not sale PK — see `8700dbc`), wastage reconciled against `inventory_logs` audit trail, fee allocation, opex de-duplication, and **tips treated as a custodial liability** with its own ledger (commit `7c26096`). Excel export reconciles 1:1 with on-screen totals.

- **Multi-vendor / consignment** ([`src/components/admin/VendorsTab.jsx`](src/components/admin/VendorsTab.jsx), [`src/utils/vendorUtils.js`](src/utils/vendorUtils.js)): tag products with the vendor that owns them and run a per-vendor **settlement report** with two split models — **commission %** (gross or pre-IVA base) or **cost-recovery** (house keeps each item's production cost, vendor takes the profit). Vendor attribution is **snapshotted onto each sale line at checkout** so historic settlements survive renames/retagging; a menu-fallback toggle retro-attributes pre-tagging tickets. A **payout ledger** (`vendor_payouts`, migration `024`) records money actually paid and freezes the statement it was paid against, so the report shows **owed − paid = balance** and payments can post to the expense/cash-out ledger. A **Books Summary** separates *commission income* (yours) from *vendor payable* (a liability) and itemizes IVA, for consignment (agent) accounting.
  - **Limitation:** the Books Summary is a **reporting-layer** reconciliation. Each sale still posts the full ticket as revenue at checkout — the vendor-payable liability is derived in the report, not split in real time on the sales pipeline. That's the right altitude for a small shop; a true real-time liability split at point of sale would be a larger checkout change.

- **Device Provisioning** ([`api/add-device.js`](api/add-device.js)): add new POS terminals from the admin panel without touching the Supabase dashboard.

- **Pending Sync Inspector** ([`src/components/admin/PendingSyncCard.jsx`](src/components/admin/PendingSyncCard.jsx)): admin-only tool to inspect and surgically discard queued offline data (sales, expenses, inventory, menu updates, WhatsApp receipts) in case of sync errors — accessed via the Devices tab with PIN re-entry required.



### 🧾 Tickets & Register Internals

- Active tickets persisted in Dexie via [`useTickets`](src/hooks/useTickets.js) hook (Phase 3 refactor — commits `8a8e20b`, `e266280`); `created_at` is set on creation to avoid Invalid Date in the sidebar (`908fd50`).

- Sync queue isolated in [`useSyncQueue`](src/hooks/useSyncQueue.js).

- PIN challenges centralized via `usePinChallenge` + `PinChallengeModal` (commit `4fde287` locks UI during verification).

- Cash discrepancy warning on corte close (`06eed65`).

- Cross-device expense merge using cloud `local_id` (`dfb432b`).



### 🍽️ TinyMenu — Digital Menu System

A full multi-menu platform layered on top of TinyPOS, served from the same deploy. Menus are built in the Admin → Menus tab and published at `/menu`.

**Public URL** — menus are served via base64-encoded `u`/`k` query params (`/menu?u=…&k=…`) so a single Vercel deploy serves every shop tenant. Short aliases can be registered in `config.json`. All routes are offline-capable via the service worker.

**Multi-menu + Scheduling** — a shop can have multiple named menus (breakfast, lunch, seasonal) and a weekly + time-of-day schedule picks the active one automatically. Timezone is configurable from General Settings.

**Per-item photos** — every catalog item can have a photo. Upload goes through an interactive crop modal → WebP conversion → Supabase Storage. The same image shows in the register grid and the public menu.

**Phase 2 — PDF/PNG menus** — upload a static PDF or PNG and the public page renders it as a full-bleed carousel. Good for shops that already have a designed menu.

**Phase 3 — TV / Kiosk mode** (`/menu/tv`) — a full-screen, auto-rotating display designed for a wall-mounted screen. Font size, transitions, and layout are optimized for distance reading.

**Phase 4a — Designer templates** — pre-built HTML/CSS layouts (card, grid, list, hero) applied to live catalog data. Template tokens use CSS custom properties so brand colours propagate automatically.

**Phase 4b — Theme tokens** — per-menu colour, font, and spacing tokens are stored alongside the menu record and injected at render time.

**Phase 4c — react-konva Canvas Editor** — a full drag-and-drop canvas builder inside the Admin panel:

- Free-form shapes (rect, circle, text, image, path), all draggable and resizable with a Konva Transformer
- **Smart guides, rulers, and snap** — alignment guides appear between objects; a pixel ruler borders the canvas; objects snap to guides and to each other
- **Bézier pen tool** — click/drag to place anchor points and control handles; double-click to close a path
- **Align & distribute panel** — align selected objects left/center/right/top/middle/bottom; distribute evenly with one click
- **Double-click editing** — text layers, shape labels, and path anchors are all editable in place
- **Font picker** — system and Google Fonts selectable per text layer, cached to avoid repeated network loads
- **Asset library** — upload images once, reuse across canvas layers; deduped across menus
- **react-colorful colour pickers** — for fill, stroke, and text colour
- **Catalog item binding** — drop a menu item onto the canvas; its name, price, and photo sync live from the catalog
- **Out-of-stock control** — items marked out-of-stock hide their price or show an "agotado" badge; an availability toggle is on each item
- **Page size presets** — A4, A5, letter, custom; canvas scales to match
- **PNG export** — renders the canvas at 2× via `canvas.toDataURL` and downloads a print-ready PNG
- **Print** — sends the canvas to the browser print dialog with the correct page dimensions
- **SVG download** — alternative vector export for high-res menus
- **Templates** — start from a blank or from a gallery of pre-built canvas layouts; template fonts are auto-registered with Konva

**Snapshots & restore** (`menu_versions`) — every save writes a point-in-time snapshot. Admin can browse and restore any prior version from the Menus tab.

**Emergency recovery** — a static `recover.html` page exports IndexedDB state directly to JSON, bypassing the React app, for disaster recovery when the main app fails to load.

**Per-menu deep links + share UI** — each menu has a shareable card with a QR code and a copy-link button. The Settings tab shows a "Tu menú público" panel with the same share UI.

### 🧾 CFDI Portal (Mexico)

Receipts can carry a **CFDI QR** (Receipt Settings). The customer scans it and lands on a public portal ([`src/components/PublicCFDI.jsx`](src/components/PublicCFDI.jsx)) that collects their fiscal data — RFC, razón social, régimen, CP, uso CFDI — or extracts most of it from an uploaded **Constancia de Situación Fiscal PDF** ([`src/utils/constanciaFiscal.js`](src/utils/constanciaFiscal.js)). The request lands in Admin → CFDI as *Pending*; the operator issues the actual invoice in the SAT/PAC (the POS does **not** stamp CFDIs) and records the folio to mark it *Issued*. **Factura Global** periods (migration `033`) close a month so its tickets can no longer be requested individually, with a reconciliation summary before closing. The portal reaches the database only through `cfdi_lookup_ticket` / `cfdi_request_invoice` RPCs (`039`), rate-limited per ticket reference.

### 🏷️ Discounts & Promotions Engine ([`src/utils/discountEngine.js`](src/utils/discountEngine.js))

Rules, not a flat toggle: percentage / fixed amount, **Buy X Get Y**, and fixed **combo pricing**; automatic or cashier-applied (with optional **coupon codes**); conditions on items, minimum subtotal, customer/loyalty targeting, weekday and **happy-hour time windows**; guardrails for max redemptions, per-day uses, **budget caps**, max discount cap, priority and stacking; optional **manager approval**. Single-use rules are consumed at checkout and a promo performance report shows what each rule actually cost. Covered by [`src/tests/discountEngine.test.js`](src/tests/discountEngine.test.js).

### 🔥 Roast / Production Lot Traceability

Lot-tracked inventory items (roasted coffee, in-house syrups, prepped food) get a **lot per received or produced batch** (migration `035`) carrying both a `made_date` (roasted) and a `received_date` — they differ when roasting is outsourced. Checkout draws **FIFO by roast date** and writes one `lot_consumptions` row per lot touched (`036`), so any sold bag traces back to the roast it came from, and the inventory audit reconciles lots against stock.

### 🌐 Custom Domains & Suite SSO

- **Custom domains** for the public menu and the CFDI portal, linked from the admin panel through the Vercel Domains API ([`api/domains.js`](api/domains.js)) with guided DNS instructions, verified via a `_tinypos` TXT record and routed by [`middleware.js`](middleware.js). The link is stored in `posSettings` ([`src/utils/customDomainSync.js`](src/utils/customDomainSync.js)) so it follows the tenant across devices instead of living in one browser's localStorage.

- **Suite SSO hub** at `/authorize` — TinyPOS hands the Supabase connection + session to the sibling apps (TinyLogistics, TinyKDS, TinyBooks) so a tenant configures its project once; consumers fall back to standalone when TinyPOS isn't present.

### 🆘 In-app Help ([`src/utils/helpContent.js`](src/utils/helpContent.js))

A bilingual (ES/EN) Help tab covering every register flow and admin tab — what it is, how it works, and step-by-step *do this* recipes, with per-field glossaries for Analytics and Inventory. The same content drives the contextual help modals. Spanish tutorial scripts for recording walkthroughs live in [`scripts/`](scripts).

### 📱 Loyalty + Receipts

- Phone-number loyalty with both **recurring** and **single-use** programs (see migrations `006`–`008`). Accrual is bound to `sales` inserts via a Postgres trigger, so receipt resends never double-count.

- WhatsApp digital receipts + PNG export for sharing/archiving.

- SAT-compliant IVA tax extraction.



---



## 🔐 Role-Based Access & Maintenance (schema `1.6`)

Opt-in privilege gating for shops that need it; transparent for shops that don't.

### Cashier roles ([`src/utils/cashierRoles.js`](src/utils/cashierRoles.js))

Every cashier carries a `role` field — `employee` / `manager` / `admin`. Legacy `isAdmin` is kept in sync on every write so old reads still work, and unmigrated rows fall back through `getRole()`. TeamTab now exposes a 3-way role select instead of an isAdmin checkbox.

### Staff Restrictions — General Settings → "Seguridad y Accesos"

Two independent toggles, both **off by default** so shops sharing a single PIN keep working unchanged:

- **Restrict Admin Panel** (`strictAdminAccess`) — hides the Admin button in MenuArea and the LockScreen shortcut for non-admin cashiers; the `/admin` route auto-redirects on mount if the active PIN isn't an admin.
- **Require Manager for Sensitive Actions** (`strictRegisterOverrides`) — when an Employee tries to **refund / void / add expense / apply manual discount**, a lock icon appears on the button and the PIN modal asks for a Manager or Admin PIN. Managers and admins skip the prompt entirely (coffee-rush friendly). Every override is written to `activity_logs.metadata` as `{ override: true, authorized_by, actor_cashier_id }`. See [`src/utils/actionGate.js`](src/utils/actionGate.js) and [`src/utils/overrideAuthorizer.js`](src/utils/overrideAuthorizer.js).

### Unified allowlist (`public.app_users`)

Single source of truth for who may sign in. Devices added through the Devices tab are auto-seeded with `role='device'` by a Postgres trigger; the first human user on a freshly provisioned tenant is auto-promoted to `admin`. RLS lets a user claim their own pending row on first sign-in and only admins can manage the table. **Gracefully degrades** when the table is missing (older installs), so pre-0.1 tenants can still sign in and run the Update Schema button.

### Database Maintenance — Update Schema button

[`src/utils/schemaVersion.js`](src/utils/schemaVersion.js) exports the version the build expects. The install SQL stamps `public.schema_meta` with the matching value. The Settings tab compares them and surfaces `Up to date`, `Update available`, or `Unknown` (pre-`schema_meta` installs). Clicking **Actualizar esquema** runs the same OAuth round-trip the device-provisioning flow uses (`database_read database_write` scope), POSTs the burn-after-reading PAT to `/api/install`, and refreshes the version. The SQL is fully idempotent — safe to re-run.

> **Bumping the version** is a three-place edit in one commit: `APP_SCHEMA_VERSION` in [`src/utils/schemaVersion.js`](src/utils/schemaVersion.js), the literal in [`api/install.js`](api/install.js)'s `schemaQuery`, and the mirror in [`src/components/SetupScreen.jsx`](src/components/SetupScreen.jsx). The cleanup task to merge those two SQL copies is tracked separately.

### Cashier PIN persistence

Adding a cashier now writes a bcrypt hash to `cashier_pins` via the `set_cashier_pin` RPC; deleting one wipes it via `delete_cashier_pin`. Prior to this, only seeded cashiers (ids 0 and 1) could log in — new employees silently couldn't authenticate. The schema's one-shot backfill hashes any plaintext pins already in `menu_data.cashiers` so existing installs heal on first Update Schema run.

### Devices: optional custom email

The device form now has a toggle to skip the auto-generated `slug@device.tinypos.com` and use any email — useful when hardware should sign in as a known account.

### Currently in test

These shipped to production but haven't seen enough real-world hours yet:

- **Manager-override audit trail.** Verify the `activity_logs.metadata.authorized_by` field actually reads correctly in the Activity Log viewer for refunds, voids, expenses, and manual discounts when triggered by an Employee under `strictRegisterOverrides`.
- **PIN re-prompt UX after schema OAuth round-trip.** Admin remounts after the redirect, so the PIN gate fires once more before the resume effect lands. Cosmetic; consider persisting `isAdminUnlocked` in sessionStorage if it becomes annoying.
- **`strictAdminAccess` + `/admin` direct URL.** Confirm the redirect fires reliably on every navigation path (bookmarked URL, browser back, deep link) — currently only checks `menuData?.posSettings?.strictAdminAccess` on mount and on `menuData` change.
- **Allowlist permissive fallback.** Intentionally lenient right now: any error reading `app_users` lets the user through. Once every tenant has run Update Schema once, consider tightening to fail-closed.
- **Schema version comparison on language switch.** Spanish/English keys for the maintenance block are in place but haven't been visually proofed in dark mode.



---



## 🧰 Technical Stack



- **Frontend:** React 19, Vite, Zustand (immer), Iconify, react-konva (canvas editor)

- **Local DB:** Dexie.js (IndexedDB) — see [`src/db.js`](src/db.js)

- **Cloud:** Supabase (Postgres + RLS + Realtime + Auth)

- **Serverless:** Vercel Functions ([`api/`](api))

- **Sync layer:** [`src/services/syncService.js`](src/services/syncService.js) and per-domain syncers (`salesSync`, `ticketSync`, `expenseSync`)

- **Testing:** Vitest



---



## 🚀 Local Development



```bash

npm install

cp .env.example .env.local   # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY

npm run dev

```



```bash

npm test         # math engine + POS logic

npm run build    # production bundle

```



The serverless functions in `api/` run under `vercel dev` for the OAuth + provisioning flow.



---



## 🗄️ Database



The canonical DDL is **not** a single `install.sql` — it is kept in **three synced places** (see [`db/MIGRATIONS.md`](db/MIGRATIONS.md)): the `schemaQuery` in [`src/components/SetupScreen.jsx`](src/components/SetupScreen.jsx) (fresh installs), the `schemaQuery` in [`api/install.js`](api/install.js) (the "Update Schema" path), and the per-diff files in [`db/migrations/`](db/migrations) (contributor reference / manual apply). A schema change must edit all three. Between them the schema creates:



**Tables**

`shop_settings`, `active_tickets`, `customers`, `expenses`, `inventory`, `inventory_logs`, `activity_logs`, `recipes`, `sales`, `cashier_pins`, `tip_payouts`, `tip_events`, `app_users`, `schema_meta`, `menu_categories`, `menu_items`, `menu_modifier_groups`, `menu_modifier_options`, `menus`, `menu_schedules`, `menu_versions`, `vendors`, `vendor_payouts`, `floor_plan`, `fiscal_profiles`, `cfdi_global_periods`, `inventory_lots`, `lot_consumptions`, `inventory_deductions_applied`, `auth_attempts`.



**RPCs**

- `verify_pin(cashier_id, pin)` — bcrypt check via `pgcrypto`, `SECURITY DEFINER`.

- `set_cashier_pin(cashier_id, pin)` / `delete_cashier_pin(cashier_id)` — hash-and-upsert / delete for cashier pin management; called from TeamTab on add/remove. `SECURITY DEFINER` with `search_path = public, extensions` so `pgcrypto` resolves.

- `deduct_inventory(item_id, qty)` — atomic stock decrement that returns the new row only if `current_stock >= qty`.

- `award_loyalty_visits()` — `AFTER INSERT ON sales` trigger applying the net of `loyalty_stars_awarded − loyalty_stars_redeemed`, with one-time-program freeze semantics.

- `is_app_admin(user_id)` — `SECURITY DEFINER` helper used by `app_users` RLS to avoid policy recursion.

- `claim_or_bootstrap_app_user()` — `SECURITY DEFINER`, **called by the client on every successful sign-in** (it replaces the prior `AFTER INSERT ON auth.users` trigger — no trigger on `auth.users` anymore). Links a pending `app_users` row to the caller's JWT, seeds `role='device'` for `@device.tinypos.com` emails, and promotes the first user to `admin` when no admin exists. Returns the caller's effective row.

- `award_loyalty_visits()` — body of the `trg_award_loyalty` `AFTER INSERT ON sales` trigger; applies the net of `loyalty_stars_awarded − loyalty_stars_redeemed`, with one-time-program freeze semantics.

**Menu RPCs**

- `get_public_menu()` / `get_active_menu(p_now)` / `get_menu_by_id(id)` — anon-accessible, sanitized menu payloads for the customer-facing page. `get_active_menu` resolves the scheduled menu via `shop_timezone()` + `schedule_matches(...)` and emits per-item availability via `menu_item_available(item_id)`; all three exclude hidden categories/items and hidden modifier groups (migration `021`).

- `snapshot_menu()` / `build_menu_snapshot()` / `restore_menu_version()` / `prune_menu_versions()` — write a point-in-time `menu_versions` row on every meaningful save, restore any prior version, and enforce the retention cap.



**Security**

- `pgcrypto` extension for password hashing.

- RLS enabled on every table, scoped `TO authenticated`.

- `refund_limit_check` constraint: `refund_amount <= total_amount`.



### Migrations (`db/migrations/`)



If you installed before the latest schema version, apply these **in order**:



| Migration | Purpose |

|---|---|

| `001_lock_down_rls.sql` | Re-scope RLS from `public` to `authenticated` |

| `002_inventory_rpc.sql` | Atomic `deduct_inventory` RPC |

| `003_secure_pins.sql` | `cashier_pins` table + bcrypt + `verify_pin` RPC |

| `004_idempotent_sync_and_refunds.sql` | `local_id` UUIDs + refund constraint |

| `005_drop_sent_to_barista.sql` | Removes legacy `sentToBarista` column |

| `006_loyalty_idempotency.sql` | Loyalty accrual via `sales` trigger |

| `007_loyalty_redemption.sql` | Explicit redemption; trigger applies net delta |

| `008_loyalty_program_type.sql` | `completed_at` + recurring/single program modes |
| `009_backfill_inventory_logs_ticket_id.sql` | Backfill `ticket_id` on legacy `inventory_logs` rows so analytics can retire its timestamp-based COGS fallback |
| `010_split_menu_data.sql` | Splits `shop_settings.menu_data` JSONB into relational tables: `menu_categories`, `menu_items`, `menu_modifier_groups`, `menu_modifier_options` |
| `011_public_menu_rpc.sql` | Adds `get_public_menu()` `SECURITY DEFINER` RPC — anon-accessible, sanitized menu payload for the customer-facing live menu page |
| `012_normalize_menu_fks.sql` | Self-heals FK `ON UPDATE CASCADE` on modifier-group join tables so renaming a group no longer violates the constraint |
| `013_menu_item_images.sql` | Adds `menu_items.image_url`; creates the `menu-assets` public Storage bucket for item photos |
| `014_menu_versions.sql` | `menu_versions` snapshots table + retention trigger — every meaningful save writes a row; admins can browse and restore |
| `015_menus_and_schedules.sql` | `menus` and `menu_schedules` tables; multi-menu support with clock/date-based auto-switching |
| `016_designed_menu_payload.sql` | Extends `get_active_menu` so `kind='designed'` menus return the full catalog payload (categories + modifiers), enabling designer templates |
| `017_get_menu_by_id.sql` | Adds `get_menu_by_id(id)` RPC for permanent per-menu deep links that bypass the schedule resolver |
| `018_menu_item_availability.sql` | Exposes per-item availability in the public menu RPCs so renderers can hide or strike through out-of-stock items |
| `019_menu_item_available_safe_cast.sql` | Fixes `018`'s numeric cast on recipe ingredient `qty` — an empty-string qty from older catalog saves would crash `get_active_menu` with a 400 |
| `020_menu_redirect_bucket.sql` | Creates the `menu` Storage bucket for short-URL redirect HTML files (meta-refresh to the long `?u=…&k=…` URL) |
| `021_modifier_group_hidden.sql` | `is_hidden` flag on modifier groups; public-menu RPCs (`get_active_menu` / `get_menu_by_id`) re-emitted to exclude hidden groups |
| `022_sales_iva.sql` | Adds `sales.tax_amount` + `sales.taxable_amount` (centavos) so books post real per-item IVA (`iva16`/`tasa0`/`exento`) instead of a flat 16% |
| `023_vendors.sql` | `vendors` registry for multi-vendor / consignment; item→vendor link rides on `menu_items.data` jsonb (`{ vendorId, vendorName }`), snapshotted onto sale lines |
| `024_vendor_payouts.sql` | Vendor payout ledger (money-movement half of `023`); `local_id` idempotent upsert, freezes the settlement statement it paid against in `data` jsonb |
| `025_tables.sql` | `floor_plan` registry + additive `active_tickets.table_id` / `seats`; visual floor-plan / table-service support |
| `026_inventory_reorder_point.sql` | Per-item `inventory.reorder_point`; powers reorder alerts, falls back to the legacy hardcoded threshold when 0 |
| `027_sales_refunded_items.sql` | `sales.refunded_items` jsonb (per-line refund attribution) so settlement charges refunds to the exact line/vendor |
| `028_expense_payment_source.sql` | `expenses.payment_source` (caja / banco / dueño); only cash actually out of the drawer hits the corte |
| `029_menu_item_roast_and_whatsapp.sql` | Exposes per-item `roast_date` + `whatsapp_url` on the public-menu RPCs |
| `030_public_menu_hide_split.sql` | Splits "hidden in the Register" from "hidden on the public menu" for items and categories |
| `031_cfdi_support.sql` | `fiscal_profiles` + per-ticket CFDI status — the customer-facing factura request flow |
| `032_cfdi_indexes.sql` | Indexes on `cfdi_status` so the Admin CFDI tab doesn't time out on large tables |
| `033_cfdi_global_periods.sql` | `cfdi_global_periods` — records which months had their Factura Global issued and blocks individual requests for them |
| `034_idempotent_inventory_deduction.sql` | `deduct_inventory_log(...)` + an `inventory_deductions_applied` dedup claim, so a timed-out retry can't decrement twice |
| `035_inventory_lots.sql` | `inventory_lots` — roast/production lots with separate made vs. received dates |
| `036_lot_consumptions.sql` | `lot_consumptions` — FIFO sale→lot draw-down, the "which roast was this?" link |
| `037_inventory_restock_rpc_and_availability_fix.sql` | Stock-return RPC; fixes `menu_item_available()` testing an `inventoryMode` the app never writes |
| `038_deduct_release_claim_on_short_stock.sql` | Releases the dedup claim when stock is short, so the replay retries instead of silently dropping the movement |
| `039_cfdi_portal_rpcs.sql` | `cfdi_lookup_ticket` / `cfdi_request_invoice` `SECURITY DEFINER` RPCs — the portal stops touching tables |
| `040_drop_cfdi_anon_policies.sql` | Drops the blanket `anon` policies from `031`/`033` (the anon key is printed in every receipt QR) |
| `041_function_execute_grants.sql` | Revokes the `EXECUTE` Supabase grants to `anon`/`authenticated` by default; re-grants per function |
| `042_enforce_app_users_allowlist.sql` | Replaces `USING (true)` on every POS table with an `app_users` allowlist check |
| `043_hide_cashier_pins.sql` | Removes all client read access to `cashier_pins` (a 4-digit PIN behind a hash is nearly the PIN) |
| `044_rate_limit_pin_and_cfdi.sql` | `auth_attempts` — rate-limits `verify_pin` and the CFDI ticket lookup |
| `045_rate_limit_feedback.sql` | Returns *why* and *for how long* a call was refused, so a locked-out cashier sees a countdown |
| `046_function_search_path.sql` | Pins `search_path` on the remaining `SECURITY DEFINER` functions |



> Migration `003` is **mandatory** — without it the Admin lock screen cannot verify PINs and you will be locked out.



---



## 🔌 Serverless API ([`api/`](api))



| Endpoint | Purpose |

|---|---|

| `GET  /api/auth/start` | Starts the Supabase OAuth round-trip (PKCE + a verified `state`) |

| `POST /api/auth/callback` | OAuth callback — exchanges the code for a management token and stores it in an **HttpOnly cookie** |

| `POST /api/install` | Runs the full schema/RPC/RLS provisioning, or just the version delta ([`api/_schemaDeltas.js`](api/_schemaDeltas.js)); kept a separate function for its 60s `maxDuration` |

| `ALL  /api/supabase?op=…` | One proxy for every Management API call the setup flow makes: `get-orgs`, `get-projects`, `get-keys`, `create-project`, `get-project-status`, `run-sql`. The old `/api/<name>` paths are rewritten onto it in `vercel.json` |

| `POST /api/add-device` | Creates a new hardware Auth user for an additional terminal |

| `GET/POST /api/domains` | Resolves, links and unlinks custom domains (public menu + CFDI portal) via the Vercel Domains API |

| `POST /api/log-error` | Lightweight error-reporting sink (webhook) |



> Vercel's Hobby plan caps a deploy at **14 Serverless Functions**, which is why the six Management API proxies and the domain endpoints are each merged into one file dispatched on `?op=`.



---



## 🤝 Contributing



PRs welcome. Please:

1. Keep the money path on integers — never reintroduce `Number` arithmetic into totals/tax/discount code.

2. Add a Vitest case for any change to [`src/utils/posMath.js`](src/utils/posMath.js).

3. New mutable tables must carry a `local_id uuid UNIQUE` and be wired into the relevant syncer.

4. New tables must ship with RLS enabled in the same migration.



---



## 🗺️ Roadmap



Planned / under consideration. Not yet implemented — do not assume any of this exists in code.



### Auth & Onboarding

- **Personal sign-in identities (parked).** Google / Apple / Microsoft OAuth on the device-locked screen was prototyped and reverted in `7f8fff5`. In the current architecture only the device account does Supabase auth — humans are identified by cashier PINs — so the per-tenant Google Cloud + Supabase provider config friction wasn't worth the marginal benefit of skipping one password during setup. The `app_users` table that the prototype introduced was retained as the access-revocation source of truth. Revisit if real customers ask for personal sign-in, or if the app grows a flow where humans actually need their own Supabase session.

- Optional Google Workspace `hd` domain restriction for multi-staff cafes (depends on the above).



### Analytics

- Time-of-day heatmap on top of the existing payment-method reconciliation card.

- Per-cashier sales attribution surfaced in the audit log view.



### TinyMenu

- Video background support for canvas layers.

- Animated entrance transitions for TV/kiosk mode.

- QR code generation as a native canvas element (currently rendered in the share UI, not the canvas editor).



### Hardware

- Cash drawer kick signal piped through the Local Print Bridge.



---



*Built for baristas, by engineers who drink too much coffee.* ☕