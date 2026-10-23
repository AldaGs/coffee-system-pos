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

**Fix:** keep one source of truth, `db/schema.sql` (or one module under `api/`). `install.js` reads it, and SetupScreen calls `/api/install` (or a shared endpoint) instead of sending its own SQL to `/api/run-sql`. Delete the copies. That removes about 8,000 duplicated lines and the manual sync rule.
*Needs a decision:* we have to reconcile the ~580 lines of drift first, picking the correct version of each difference. That needs your review.

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

If a path is no longer needed, delete it. If it is, keep it isolated in a `legacy/` helper with a one-line reason.

### P6: Unfinished placeholder

`PublicMenu.jsx:244` still shows a "Phase 4" placeholder for `kind='designed'` menus. The designed renderer (`CanvasRenderer`) exists now. Either wire it up or remove the branch.

### P7: Translations embedded in components

`OnlineOrdersTab.jsx:52–58` and `PublicOrder.jsx:111` have their own EN/ES dictionaries next to `translations.js`. Move them into the shared translations.

## Comment rules (applied to every file we touch)

- Delete comments that repeat the code (`// set loading to true`), section banners on tiny blocks, and stale history ("added in v2.3…").
- Keep business rules, tax/CFDI and Clip quirks, and non-obvious constraints, each as one short sentence.
- Use one JSDoc line on exported helpers when the name isn't enough.
- Change history belongs in git and `schemaVersion.js`, not in code comments.

## Split pattern

```
src/features/<area>/
  <Area>Tab.jsx         // layout + composition only
  components/…          // one section/step per file
  use<Area>Data.js      // fetching, saving, derived state
  <area>Math.js         // pure logic, unit-tested
```

## Order of work (one PR per step)

| Phase | Step | Depends on |
|---|---|---|
| 0 | Review this document; decide on P1 drift and P5 legacy paths | you |
| 1 | **P1** single schema source: reconcile drift, remove the SQL copies from SetupScreen and install.js (SetupScreen drops to ~1,050 lines) | Phase 0 |
| 2 | Shared helpers: `useFlash`, P2 fixes, P3 review (small, touches many files) | — |
| 3 | Split `Admin.jsx`. This is the reference for the pattern, so you review the style here | 2 |
| 3 | Split `CanvasEditor.jsx` (toolbar, node renderers, panels, `useCanvasHistory`, `useSelection`) | 3 |
| 3 | Split what's left of `SetupScreen.jsx` (one component per setup step + `useProvisioning`) | 1 |
| 3 | The 1,100–1,600-line tabs, `Register.jsx`, `PublicOrder`, `PublicMenu`, P4, P6, P7 | 3 |
| 4 | Data files: `translations.js` split per area (`translations/<area>.js`); `_schemaDeltas.js` split into one file per version under `db/deltas/`. Only how they're organized changes, not their contents | — |
| 5 | P5 removals you approved | 0 |

Every PR: `npm run lint`, `npm test`, `npm run build` pass. Before a split, add tests for the code being pulled out (hooks and helpers) if it has none.

## Open questions for you

1. **P1:** OK to make one schema file the only source? Do you want to review the ~580-line drift list item by item, or should I propose a resolution for each item?
2. **P5:** which legacy paths can be removed?
3. **P6:** wire up the designed-menu renderer, or remove the placeholder?
4. Folder layout: is `src/features/<area>/` OK, or would you rather keep `src/components/admin/<area>/`?
