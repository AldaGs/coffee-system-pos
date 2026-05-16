# ☕ TinyPOS: The Ultimate Artisanal Coffee Ecosystem

> A professional, offline-first Point of Sale & ERP system designed for artisanal coffee bars and roasters.

[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-Build-646cff.svg)](https://vitejs.dev/)
[![Dexie](https://img.shields.io/badge/Dexie.js-IndexedDB-orange.svg)](https://dexie.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Cloud_Sync-3ecf8e.svg)](https://supabase.com/)
[![Vitest](https://img.shields.io/badge/Tested-Vitest-yellow.svg)](https://vitest.dev/)

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
New tenants connect their own Supabase project via **OAuth** ([`api/auth/callback.js`](api/auth/callback.js), [`api/install.js`](api/install.js)) and TinyPOS provisions the entire database — schema, RPCs, triggers, RLS policies, and seed data — in seconds. No SQL editor, no copy-pasted keys.

### 🔒 Zero-Trust Security
- The `service_role` key is **burned-after-reading**: held in memory only long enough to run provisioning, then discarded.
- Daily operations run exclusively under scoped **`anon` keys** behind RLS policies (`TO authenticated`).
- Cashier PINs are bcrypt-hashed via `pgcrypto` and verified server-side through the `verify_pin` RPC — never compared in the browser.
- Inventory deductions go through the atomic `deduct_inventory` RPC to prevent race conditions across terminals.

---

## 🌐 The Ecosystem

| Component | Role | Stack |
|---|---|---|
| **TinyPOS Frontend** *(this repo)* | The barista-facing register + admin dashboard | React 19, Vite, Dexie, Zustand |
| **TinyLogistics Sidecar** | Kanban fulfillment board for roasters / shipping, fed by Postgres triggers | React + Supabase Realtime |
| **Local Print Bridge** | Node.js daemon bridging the browser to USB/Network thermal printers (80mm/58mm) | Node.js |

All three share a single Supabase project per tenant.

---

## ✨ Functional Surface

### 🛒 High-Velocity Register ([`src/Register.jsx`](src/Register.jsx))
- Long-line-optimized touch flow; nested modifier groups with **deductions** (extra shots pull extra grams from inventory) and **substitutions** (oat milk swap recalculates COGS).
- Split payments, N-way splits, partial paid items, tip capture.
- PIN-protected discounts (percentage or flat) via `discountRules`.
- Expense logging from the POS surface.
- Live sync status indicator; full i18n (EN/ES).

### 📈 Admin Dashboard ([`src/Admin.jsx`](src/Admin.jsx))
- Revenue / refunds / **payment-method reconciliation** (card / cash / transfer split).
- **Inventory + The Roaster:** raw stock, multi-warehouse linking, BOM recipes, green-to-finished transformation with shrinkage + cost-per-gram.
- **COGS / Profit Engine:** target margin → recommended price, computed from live ingredient cost.
- **Activity audit log** ([`src/services/activityLog.js`](src/services/activityLog.js)): every sale, **refund** (commit `5e7baf0`), **settings save**, menu edit, **inventory deletion** (with reason + category metadata), and corte.
- **P&L / Analytics engine** ([`src/components/admin/AnalyticsTab.jsx`](src/components/admin/AnalyticsTab.jsx)): per-product COGS matched by `ticket_id` (not sale PK — see `8700dbc`), wastage reconciled against `inventory_logs` audit trail, fee allocation, opex de-duplication, and **tips treated as a custodial liability** with its own ledger (commit `7c26096`). Excel export reconciles 1:1 with on-screen totals.
- **Device Provisioning** ([`api/add-device.js`](api/add-device.js)): add new POS terminals from the admin panel without touching the Supabase dashboard.
- **Pending Sync Inspector** ([`src/components/admin/PendingSyncCard.jsx`](src/components/admin/PendingSyncCard.jsx)): admin-only tool to inspect and surgically discard queued offline data (sales, expenses, inventory, menu updates, WhatsApp receipts) in case of sync errors — accessed via the Devices tab with PIN re-entry required.

### 🧾 Tickets & Register Internals
- Active tickets persisted in Dexie via [`useTickets`](src/hooks/useTickets.js) hook (Phase 3 refactor — commits `8a8e20b`, `e266280`); `created_at` is set on creation to avoid Invalid Date in the sidebar (`908fd50`).
- Sync queue isolated in [`useSyncQueue`](src/hooks/useSyncQueue.js).
- PIN challenges centralized via `usePinChallenge` + `PinChallengeModal` (commit `4fde287` locks UI during verification).
- Cash discrepancy warning on corte close (`06eed65`).
- Cross-device expense merge using cloud `local_id` (`dfb432b`).

### 📱 Loyalty + Receipts
- Phone-number loyalty with both **recurring** and **single-use** programs (see migrations `006`–`008`). Accrual is bound to `sales` inserts via a Postgres trigger, so receipt resends never double-count.
- WhatsApp digital receipts + PNG export for sharing/archiving.
- SAT-compliant IVA tax extraction.

---

## 🧰 Technical Stack

- **Frontend:** React 19, Vite, Zustand (immer), Iconify
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

The full canonical schema lives in [`db/install.sql`](db/install.sql) and is what `/api/install` executes during the OAuth onboarding flow. It creates:

**Tables**
`shop_settings`, `active_tickets`, `customers`, `expenses`, `inventory`, `inventory_logs`, `activity_logs`, `recipes`, `sales`, `cashier_pins`.

**RPCs**
- `verify_pin(cashier_id, pin)` — bcrypt check via `pgcrypto`, `SECURITY DEFINER`.
- `deduct_inventory(item_id, qty)` — atomic stock decrement that returns the new row only if `current_stock >= qty`.
- `award_loyalty_visits()` — `AFTER INSERT ON sales` trigger applying the net of `loyalty_stars_awarded − loyalty_stars_redeemed`, with one-time-program freeze semantics.

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

> Migration `003` is **mandatory** — without it the Admin lock screen cannot verify PINs and you will be locked out.

---

## 🔌 Serverless API ([`api/`](api))

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/callback` | Supabase OAuth callback — exchanges code for a short-lived management token |
| `GET  /api/get-projects` | Lists the user's Supabase projects during onboarding |
| `POST /api/get-keys` | Fetches the project's `anon` + `service_role` keys (burned after install) |
| `POST /api/install` | Runs the full schema/RPC/RLS provisioning |
| `POST /api/run-sql` | Authenticated arbitrary SQL runner used by migrations |
| `POST /api/add-device` | Creates a new hardware Auth user for an additional terminal |

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
- **Google OAuth login for cafe owners.** Replace the email/password step on the TinyPOS login screen with `supabase.auth.signInWithOAuth({ provider: 'google' })`. Setup is dashboard-only (Google Cloud Console client + Supabase provider config); no schema changes. **Note:** this only replaces the *identity* step — the existing Supabase Management OAuth flow in [`api/auth/callback.js`](api/auth/callback.js) still has to run during onboarding, because Google identity does not grant access to the owner's Supabase project. The two consents are independent: Google = "who are you," Supabase OAuth = "can TinyPOS provision your database."
- Optional Google Workspace `hd` domain restriction for multi-staff cafes.
- Auto-link existing email/password accounts to the matching Google identity on first OAuth sign-in.

### Analytics
- Time-of-day heatmap on top of the existing payment-method reconciliation card.
- Per-cashier sales attribution surfaced in the audit log view.

### Hardware
- Cash drawer kick signal piped through the Local Print Bridge.

---

*Built for baristas, by engineers who drink too much coffee.* ☕
