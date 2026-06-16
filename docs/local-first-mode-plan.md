# Plan: Local-First "Guest Mode" Sign-Up

**Status:** Proposed — ready for implementation planning
**Author:** Architecture pass (Aldair + Claude)
**Goal:** Add a parallel, zero-infrastructure sign-up path so a café owner can start
using tinypos on their device in seconds — no Supabase account, organization, or
project required — while the existing cloud flow keeps working unchanged.

---

## 1. Motivation

Today every new user must: create a Supabase account → organization → project →
connect it to tinypos. This is the right path when Aldair personally onboards an
owner, but it is a hard activation barrier for self-serve users who just want to
try the app.

This plan adds a **second sign-up path** that runs the entire POS locally on the
device (IndexedDB / Dexie), with email + password credentials stored **locally and
hashed**. Periodically the app nudges the user to upgrade to a free Supabase
project for cross-device backup, linking to a tutorial page (later a video).

### Hard constraints (non-negotiable)

1. **Do not alter behavior for tinypos installs already in use.** Existing
   cloud-connected devices must behave exactly as they do today.
2. **After a user upgrades to Supabase, the app works exactly as the cloud flow
   does now.** Upgrade is additive: local data migrates up, then it's a normal
   cloud install.
3. **Free forever, zero liability.** No central Supabase project we must keep
   un-paused (this rules out a shared central auth backend). Credentials live only
   on the device — see §4.

---

## 2. The core idea: a single `tinypos_mode` flag

Introduce one localStorage key set at the landing page:

```
tinypos_mode = 'cloud' | 'local'
```

Everything branches off this. "Local mode" is **not a new app** — it is the same
app with: cloud gates bypassed, the sync layer turned into a no-op, cloud-only
data domains hidden, and the data-access layer pointed at a local backend instead
of Supabase.

`cloud` mode = today's behavior, byte-for-byte. The flag is absent on existing
installs, so they default to cloud — constraint #1 satisfied by construction.

---

## 3. Current architecture (what local mode must neutralize)

Findings from the code, with the files that matter:

| Concern | Today (cloud) | File |
|---|---|---|
| Install gate | `isInstalled` = both Supabase keys present in localStorage | [`src/App.jsx:28`](../src/App.jsx) |
| Client | `supabase` is `null` without keys | [`src/supabaseClient.js`](../src/supabaseClient.js) |
| Device auth gate | Forces `supabase.auth.signInWithPassword` session before main app | [`src/App.jsx:299`](../src/App.jsx) |
| Allowlist | `claim_or_bootstrap_app_user` RPC after sign-in | [`src/App.jsx:126`](../src/App.jsx) |
| Menu **reads** | `loadMenu()` reads 6 Supabase tables; **localStorage cache** (`tinypos_cached_menu`) hydrates instantly on boot | [`src/api/menu.js:33`](../src/api/menu.js), [`src/store/useMenuStore.js:21`](../src/store/useMenuStore.js) |
| Menu **writes** | All writers are Supabase-only (`addItem`, `updateItem`, …) | [`src/api/menu.js`](../src/api/menu.js) |
| PIN verify | `verify_pin` RPC — **requires `navigator.onLine`** | [`src/store/useMenuStore.js:65`](../src/store/useMenuStore.js) |
| Sales / inventory / expenses / tips | Written to Dexie first, drained to cloud via sync | [`src/db.js`](../src/db.js), [`src/services/syncService.js`](../src/services/syncService.js) |
| Devices, Team, Update Schema | Supabase Management API / service-role provisioning | [`src/components/admin/DevicesTab.jsx`](../src/components/admin/DevicesTab.jsx) |

**Key insight #1 — writes are already local-first.** Sales, inventory logs,
expenses, tips, and ticket updates already write to Dexie first and are *drained*
to the cloud by `syncService.js`. For those domains, local mode = "stop draining."

**Key insight #2 — menu is the real work.** Menu/PIN are the exception: the
source of truth is Supabase tables, with localStorage only as a read cache, and
PIN verification is an **online-only RPC**. Local mode needs a local backend for
menu CRUD and a local PIN check. This is the largest piece of the refactor.

**Surface area:** 32 files import `supabaseClient`. We do **not** rewrite all 32.
We hide the UI for cloud-only domains in local mode and introduce an adapter only
for the domains the local MVP actually needs (menu, sales, inventory, tickets,
expenses, PIN, settings).

---

## 4. Credentials (decision: Option 1 — local only)

Chosen over a shared central Supabase auth project because that project could be
paused/rate-limited and break new sign-ups — unacceptable for a free app.

- On local sign-up, store `{ email, passwordHash, salt }` in Dexie (new store,
  see §5.1). Hash with the Web Crypto API (PBKDF2 + SHA-256 + random salt).
  **Never store the plaintext password**, even locally.
- This replaces App.jsx Gate 2's Supabase login with a local credential check.
  The lock-screen plumbing (`useAuthStore` `isLocked` / `activeCashier`) already
  exists and is reused.
- **PIN verification in local mode** cannot call the `verify_pin` RPC. Add a local
  verifier (PINs hashed in Dexie the same way) and branch `useMenuStore.verifyPin`
  on mode.

**Risk to surface in UX copy:** a local-only credential is unrecoverable. If the
user clears browser data, it's gone. This is the strongest argument for the
upgrade nudge — lead with "create a backup," not "create an account."

---

## 5. Implementation plan (file by file)

### 5.1 Dexie schema — new `version(11)`
Add stores **without touching existing ones** (append only; never edit a shipped
`db.version(n)` — constraint #1):
```js
db.version(11).stores({
  // ...all v10 stores repeated unchanged...
  app_local: 'key',     // { key:'credentials', email, passwordHash, salt }
                        // { key:'pins', ... } hashed cashier/admin PINs
  menu_local: 'id',     // local menu entities (categories, items, modifiers,
                        // discount rules) — mirrors the Supabase table shapes
  customers: 'phone',   // local loyalty visit counts; migrates to cloud
                        // `customers` table (keyed by phone) on upgrade
  nag_state: 'key'      // engagement counters + snooze (or reuse shift_state)
});
```

### 5.2 `mode` helper — `src/utils/appMode.js` (new)
Single source of truth: `getMode()`, `isLocalMode()`, `setMode()`. Every branch
below reads from here rather than poking localStorage directly.

### 5.3 Landing page — third (primary) CTA
[`src/components/LandingPage.jsx`](../src/components/LandingPage.jsx): add
**"Empezar ahora — en este dispositivo"** as the primary green CTA. Demote
"Crear tu tienda" / "Conectar dispositivo existente" to a secondary "advanced /
con respaldo en la nube" group. Selecting local mode routes to a lightweight
local sign-up screen (email + password) instead of `SetupScreen`.

### 5.4 `App.jsx` gating
- `isInstalled` becomes `isLocalMode() || (hasUrl && hasAnonKey)`.
- When `isLocalMode()`: **skip Gate 2 entirely** (no cloud session); the
  `verifyAllowlist` effect early-returns (it already early-returns when
  `!supabase`); replace the device-login form with the **local credential check**.
- Cloud mode path is untouched.

### 5.5 Data-access adapter (the core refactor)
Introduce a thin **menu repository** that dispatches on mode so consumers don't
change their imports:
- Keep `src/api/menu.js` as the **cloud** implementation, untouched.
- Add `src/api/menuLocal.js` — same exported function signatures
  (`loadMenu`, `addItem`, `updateItem`, `deleteItem`, category/modifier/discount
  writers) backed by Dexie `menu_local`.
- Add `src/api/menuRepo.js` (or convert `menu.js`'s exports into a dispatcher)
  that picks cloud vs local per `isLocalMode()`. Consumers
  (`Admin.jsx`, `Register.jsx`, `MenusTab`, etc.) import from the dispatcher.
- IDs: local mode must use **client-generated stable IDs** (UUID) for items,
  categories, modifier groups/options so they survive the later push to Supabase
  with `onConflict` and don't collide.

### 5.6 Sync layer = no-op in local mode
Early-return when `isLocalMode()` in:
- `attemptBackgroundSync` ([`src/services/syncService.js:4`](../src/services/syncService.js))
- the `useSyncQueue` hook, `salesSync`, `expenseSync`, `tipsService`, `ticketSync`,
  `usePresence`/`realtime`.
Data still lands in Dexie exactly as today; it simply never flushes.

### 5.7 PIN verification in local mode
Branch `useMenuStore.verifyPin` / `verifyAuthorizerPin`
([`src/store/useMenuStore.js:65`](../src/store/useMenuStore.js)) on mode: local
mode verifies against hashed PINs in `app_local`, with **no `navigator.onLine`
requirement**.

### 5.8 Feature matrix — keep / upsell / hide

**Guiding principle (per Aldair):** local mode must be a *full, functional POS*.
Hide only what is genuinely meaningless on a single local device. Turn
cloud-**storage**-backed extras into upsells (this also gives us leverage to push
the Supabase upgrade). Keep everything that is about taking orders and running one
register, backing any cloud-persistence with Dexie where it's cheap.

| Feature | Local mode | Rationale |
|---|---|---|
| Orders, cart, checkout, corte, inventory, expenses, tips, basic analytics | **Keep** | Already Dexie-first; the heart of the app |
| Receipt customization + brand logo (Base64) | **Keep** | Client-side; stored locally already (Base64 is only used for receipt + brand logo, **not** menu photos) |
| Shareable ticket | **Keep** | `html2canvas` → Blob → `navigator.share()` is fully client-side; works offline untouched |
| **Loyalty / customers** | **Keep**, backed by a new Dexie `customers` store | The engine is already local (`computeStarsForTicket`, [`useLoyalty.js:4`](../src/hooks/useLoyalty.js)); only the **visit-count persistence** lives in the cloud `customers` table (lookup already degrades to "projection only" offline). Add a Dexie `customers` store keyed by `phone`; it migrates cleanly to the cloud table on upgrade. Hiding it would gut a core café feature. |
| **Menu item photos** & **PDF/image menu uploads** | **Upsell** | [`menuUploads.js`](../src/api/menuUploads.js) writes to the Supabase Storage bucket `menu-assets` — there is no bucket in local mode. An honest cloud dependency, not a hack we're avoiding. Render emoji/initial placeholders; the "Add Image" button opens an upsell modal: *"Las fotos de productos requieren almacenamiento en la nube. Actualiza gratis a Supabase para habilitarlas."* |
| **TinyMenu public `/menu` page** | **Upsell** | Multi-tenant publishing needs the Supabase project + anon key by design ([[project-tinymenu-multitenant]]) |
| Devices, Team/app_users, Update Schema, PendingSync, Presence/realtime, server-side Activity feed | **Hide** | Pure multi-device / cloud-infra — meaningless on one local device |

Hide (don't disable) the infra tabs — no doors that lead nowhere. Replace that
screen real estate with an **"Upgrade to cloud backup"** card.

> ⚠️ **Base64 caveat (still applies, narrowly):** do NOT store *menu item photos*
> as Base64 data-URLs in Dexie — it bloats IndexedDB and slows boot. That's why
> menu photos are an upsell, not a local feature. The existing Base64 usage
> (receipt + brand logo only) is small and stays as-is.

> **Scope decision for Aldair:** Loyalty can either ship in Phase 1 with the local
> `customers` store (recommended — small lift, keeps the app feeling complete) or
> be hidden in Phase 1 and added later. Recommendation: keep it.

### 5.9 The upgrade nudge (nag) system
- New module `src/utils/upgradeNag.js` backed by `nag_state` (or `shift_state`).
- Count events: `items_added`, `sales_completed`, `inventory_logged`,
  `ticket_shared`. Thresholds e.g. 3 items / 3 sales / first inventory entry /
  first shared ticket.
- On crossing a threshold, show a dialog via the existing `DialogContext` /
  `useDialog`. Record `lastNagAt` + `nagLevel` so it escalates politely and never
  spams (snooze ~48h or until next milestone).
- Copy angle: "Estos datos viven solo en este dispositivo. Crea una cuenta
  gratuita de Supabase para respaldarlos y verlos en otros dispositivos." + link.

### 5.10 Tutorial page
Add a static route like the existing `/calculator` short-circuit in `App.jsx`
(e.g. `/upgrade-guide`) rendering an `UpgradeGuide` component — a web page now,
swapped for a video later.

### 5.11 Upgrade path: local → cloud
When a local user chooses to back up:
1. Run the **existing** "Crear tu tienda" `SetupScreen` flow to create + connect a
   Supabase project. From here on the install is a normal cloud install
   (constraint #2).
2. One-time migration reads every Dexie table + `menu_local` and upserts to the
   new project. Because sales/inventory/tips already carry `local_id` and the sync
   already upserts `onConflict: 'local_id'`, the data migration is largely **"run
   `attemptBackgroundSync` once after connecting"** + a menu push.
3. Flip `tinypos_mode` to `cloud`, set the Supabase keys, reload. Local credential
   is retired in favor of the cloud device login.

---

## 6. Suggested phasing for the PM agent

- **Phase 0 — Plumbing:** `appMode.js`, Dexie v11, landing-page CTA, local sign-up
  + credential storage, App.jsx gating. (No data features yet — boots into an
  empty local POS and locks/unlocks.)
- **Phase 1 — Local data:** menu repository (`menuLocal.js` + dispatcher), local
  PIN verify, sync no-op, hide cloud-only tabs. (Fully usable offline POS.)
- **Phase 2 — Growth loop:** nag system + tutorial page.
- **Phase 3 — Upgrade:** local → cloud migration.

## 7. Resolved during architecture review

- **Loyalty** — engine is already local; keep it with a Dexie `customers` store
  (§5.8). Not an online-RPC dependency.
- **Image uploads** — menu photos use the Supabase Storage bucket `menu-assets`,
  **not** Base64. Make them an upsell; do NOT fall back to Base64-in-Dexie (boot
  bloat). Existing Base64 use is receipt + brand logo only and stays as-is.
- **Receipt/ticket sharing** — confirmed fully client-side (`html2canvas` → Blob →
  Web Share API); works in local mode untouched.
- **UUIDs (critical)** — `menuLocal.js` must use `crypto.randomUUID()` for all new
  categories/items/modifiers. Auto-increment integers would collide with existing
  Supabase IDs on upgrade migration. (Reinforces §5.5.)

### Still to verify during implementation
- `whatsapp_queue` and `tipsService` RPC paths — confirm the client-side action
  works and only the *sync/queue* is no-op'd in local mode.
- `menuCanvasAssets` (TinyMenu canvas editor) — part of the TinyMenu upsell, but
  confirm it's fully gated when `isLocalMode()`.
