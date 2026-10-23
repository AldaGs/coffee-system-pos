# Refactor plan: big files, comments and patches

Status: **draft for review**. Nothing in this document has been changed in code yet.

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
| `src/components/PublicOrder.jsx` | 1,154 | |
| `src/components/admin/CfdiTab.jsx` | 1,134 | |
| `src/components/PublicMenu.jsx` | 1,132 | |
| `src/components/admin/MenusTab.jsx` | 1,115 | |
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
- Many `setTimeout(() => setX(false), N)` resets for copied/error flags (about 15 places). The fix is one small `useFlash()` hook that also clears its timer on unmount.

### P5: Legacy paths that may be dead

Each one needs a yes/no from you: are there still installs that need it?

- `GeneralSettingsTab` "Scan / Repair Legacy Prices" tool (the code itself says "rarely, if ever, hit").
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

## Order of work (one PR per step)

| Phase | Step | Depends on |
|---|---|---|
| 0 | Review this document; decide on P1 drift and P5 legacy paths | you |
| 1a | **P1** check migrations against install.js; tag each feature/fix; you review the list | Phase 0 |
| 1b | **P1** baseline + comparison test, `schema_migrations` runner, remove the SQL copies (SetupScreen drops to ~1,050 lines) | 1a |
| 2 | Shared helpers: `useFlash`, P2 fixes, P3 review (small, touches many files) | — |
| 3 | Split `Admin.jsx`. This is the reference for the pattern, so you review the style here | 2 |
| 3 | Split `CanvasEditor.jsx` (toolbar, node renderers, panels, `useCanvasHistory`, `useSelection`) | 3 |
| 3 | Split what's left of `SetupScreen.jsx` (one component per setup step + `useProvisioning`) | 1 |
| 3 | The 1,100–1,600-line tabs, `Register.jsx`, `PublicOrder`, `PublicMenu`, P4, P6, P7 | 3 |
| 4 | Data files: `translations.js` split per area (`translations/<area>.js`). Only how it's organized changes, not its contents (`_schemaDeltas.js` goes away in Phase 1) | — |
| 5 | P5: review each path, remove the ones you approve | 0 |
| 6 | P6: designed-menu page | end |

Every PR: `npm run lint`, `npm test`, `npm run build` pass. Before a split, add tests for the code being pulled out (hooks and helpers) if it has none.

## Open questions for you

1. **P1:** squash into a baseline (recommended) or only tag migrations as feature/fix?
