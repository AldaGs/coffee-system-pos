# Tasks: ordering from hand-edited menus

Plan: [plan.md](plan.md). All tasks are initially pending. Executor: Sol; reviewer: parent agent.

## Task 1: Establish the baseline and selection contract

Dependencies: none. Scope: small, read-only plus evidence in this file.
Likely files: this checklist; inspect `PublicOrder.jsx`, `OnlineOrdersTab.jsx`, current RPC definitions, and existing tests.

- [x] Record `git status`, baseline tests/build/lint, and any existing failures. Read applicable repository/skill instructions without modifying unrelated work.
- [x] Verify selected menu, active-menu fallback, category/public filters, and legacy RPC compatibility. Confirm current persistence of arbitrary node JSON fields.
- [x] Report any resolver error-fallback gap to the supervisor with a concrete case; if repair is required, record a separate small task and tests before proceeding.

Verification: `npm test -- --run`, `npm run build`, `npm run lint`; read-only selection fixture inspection.

## Task 1a: Preserve selected-menu errors (approved scope repair)

Dependencies: 1. Scope: extracted resolver + regression tests + existing callers.

- [x] Restrict legacy fallback to missing `get_order_menu` errors (`PGRST202`/`42883` identifying that function). Preserve permission, network, server, and unrelated missing-function errors.
- [x] Reproduce original broad fallback with behavior tests, then verify the narrowed resolver.

Verification: original resolver produced 4 failed regression tests; repaired resolver passes all 10 resolver tests. No SQL or server selection changes.

## Task 2: Define and test eligibility for design actions

Dependencies: 1. Scope: medium, at most 4 files.
Likely files: new `src/utils/canvasOrdering.js`, new `src/tests/canvasOrdering.test.js`, `src/components/PublicOrder.jsx`, `src/utils/canvasDocument.js` (contract comments only if useful).

- [x] Write behavior tests for item-binding targets, explicit `order_item_id`, unsupported node types, visibility-only links, hidden/unavailable/filtered/deleted/non-fixed targets, and ordering gates.
- [x] Implement a small helper resolving IDs against the filtered public catalog; never extract a product or price from artwork text.
- [x] Apply eligibility at existing add/confirmation/restoration/repeat entry points where needed so the new renderer cannot bypass catalog rules; preserve cart payload shape.

Verification: `npm test -- --run src/tests/canvasOrdering.test.js` plus existing order/slot tests. Demonstrate failing test before implementation and passing result afterward.

## Task 3: Isolate the existing catalog presentation

Dependencies: 2. Scope: medium, at most 3 files.
Likely files: `src/components/PublicOrder.jsx`, new `src/components/ordering/OrderCatalog.jsx`, new `src/tests/orderMenuPresentation.test.js`.

- [x] Extract only presentation needed to switch Design/Catalog; keep state, RPC calls, cart, modifier selector, and checkout in their current owner.
- [x] Keep header, repeat-order controls, gate banner, category navigation, and desktop/mobile checkout behavior intact.
- [x] Add structural/presentation coverage without introducing a second ordering flow or test dependency merely for extraction.

Verification: focused presentation tests, build, browser catalog add/modifiers/cart checks on phone and desktop widths.

## Checkpoint A: parent review

- [x] Review tasks 1-3 diff and test evidence; settle callback, eligibility, and selection contracts. Parent authorizes next task group.

## Task 4a: Validate design documents (approved small slice)

Dependencies: checkpoint A. Scope: existing `canvasOrdering` helper and behavior tests.

- [x] Validate supported version, finite positive dimensions, page/node arrays and visible supported content; preserve unknown-node compatibility.
- [x] Resolve supported order-action IDs independently from live eligibility and gate state.

Verification: 11 failing behavior tests before implementation, then all 29 helper tests pass. JSON/geometry-clone preservation tested for independent `order_item_id` and visibility link fields.

## Task 4: Order from existing canvas product bindings

Dependencies: checkpoint A. Scope: medium, at most 4 files.
Likely files: `src/components/PublicOrder.jsx`, `src/components/menuCanvas/CanvasRenderer.jsx`, new `src/components/ordering/OrderDesignBoundary.jsx`, `src/tests/orderMenuPresentation.test.js`. Reuse the eligibility helper from task 2; split another task if its contract needs substantial changes.

- [x] Mount the selected valid canvas in `/order`, passing optional order callbacks. Activate existing item bindings through the existing add/modifier flow; default display callers stay read-only.
- [x] Provide keyboard-operable targets with live names, eligibility checks, and disabled states while preserving geometry and external links.
- [x] Add Design/Catalog switching with shared cart state, document validation, and empty/malformed/no-action fallback. Isolate rendering errors so cart/catalog survive. Explicitly suppress interaction in TV/print.

Verification: focused helper/presentation tests; real-browser old-document binding -> modifiers -> cart flow; `/menu`, TV, and print preview comparisons.

## Task 5: Link manually authored artwork to products

Dependencies: 4. Scope: medium, at most 4 files.
Likely files: `src/components/menuCanvas/CanvasEditor.jsx`, `src/components/menuCanvas/CanvasRenderer.jsx`, `src/utils/canvasOrdering.js`, `src/tests/canvasOrdering.test.js`.

- [x] Add a clearly labeled ordering-action section for text/image/rectangle/circle using existing ItemPicker; link, replace, and clear `order_item_id`.
- [x] Explain the distinction from stock visibility and unsynchronized handwritten prices; deleted targets are identifiable and repairable.
- [x] Verify field persistence, duplicate, clipboard copy/paste, undo/redo, reload, and actual ordering from each supported node type. Do not alter visibility-only documents.

Verification: focused tests and local browser editor round trip -> `/order` for each supported node kind; inspect persisted JSON in fixtures.

## Checkpoint B: parent review

- [x] Review a working canvas-to-checkout path, old/new document compatibility, and editor save/reload evidence. Confirm no schema changes or duplicated cart logic. Parent authorizes next group.

## Task 6: Make designed ordering usable on phones and keyboards

Dependencies: checkpoint B. Scope: medium, at most 4 files.
Likely files: `PublicOrder.jsx`, `menuCanvas/CanvasRenderer.jsx`, `ordering/OrderCatalog.jsx`, `src/tests/orderMenuPresentation.test.js`.

- [x] Finish ES/EN controls and fallback messages, visible focus, accessible names, usable catalog touch targets, and view switching without state loss.
- [x] Verify scaled/rotated/auto-width/multipage art and overlapping elements; no double-add, decoration blocking, or cart/checkout covering controls.
- [x] Verify closed/paused/disabled states and correct recovery from stale-item rejection; use live eligibility at confirmation.

Verification: focused tests and actual browser at approximately 390px and 1280px widths, keyboard-only path, portrait/landscape designs, and print/TV snapshots.

## Task 7: Prove selection and checkout regressions

Dependencies: 6. Scope: medium, at most 4 files.
Likely files: the two new behavior-test files, one focused local fixture/test file if needed, this checklist for evidence.

- [x] Exercise two independently saved menus with public menu A and online menu B; verify `?m=` cannot redirect ordering selection, and active/inactive/deleted fallback matches the server.
- [ ] Complete the plan regression matrix using controlled fixtures; cover restoration/repeat, modifiers, pickup, delivery/shipping, payment, tracking, and all no-action cases.
- [x] Run full tests/build/lint; distinguish baseline issues from regressions. Report unavailable integration/browser checks as limitations, never successful checks.

Verification: all commands in plan.md; local browser recordings/screenshots and mocked RPC requests; isolated test-shop server checks only when available. Never submit a production order to test.

## Task 8: Document owner behavior and hand off

Dependencies: 7. Scope: medium, at most 4 files.
Likely files: `docs/online-ordering.md`, `docs/menus.md`, `tasks/plan.md`, this checklist.

- [x] Document selected-menu rendering, automatic bindings, explicit artwork actions, catalog alternative, visibility distinction, live prices, category-based eligibility, and selection fallbacks.
- [x] Correct stale descriptions of `get_active_menu` versus `get_order_menu` where relevant; document PDF/image and template-only limits accurately.
- [x] Record completed tasks, test/browser evidence, and actual deviations for parent review. Do not mark supervisor checkpoints complete on the supervisor's behalf.

Verification: documentation matches implemented UI and contracts; `git diff --check`; no unrelated file changes.

## Checkpoint C: final parent review

- [x] Inspect final diff, representative browser flow, and regression results. Resolve findings with Sol and recheck affected behavior.
- [ ] Confirm all acceptance criteria, compatibility, and documentation; deliver outcome and material limitations to the user. No deployment or merge implied.

## Evidence log

- Parent Checkpoint B: source/tests reviewed; actual browser verified old Latte binding works under decorative overlay, modifier add merges existing line, Enter on rotated auto-width handwritten action adds Coffee at live MX$45 rather than authored $1, Design/Catalog keeps cart. Actual editor unlink/undo/relink Coffee-to-Latte/save and opening saved design confirmed persisted ID and updated accessible action. Render-crash fixture preserved catalog, four-item cart, and MX$220 total. No schema/dependency changes or second cart. Approved tasks 6-8; remaining full node-kind/clipboard/read-only/mobile regression checks continue in task 7.

- Parent Checkpoint A: reviewed all changed implementation and focused tests. Required correction to missing-RPC detection so an internal missing SQL function mentioning `get_order_menu` in context cannot change the selected menu; regression added and fixed. Actual browser verified selected Drinks catalog (excluded category absent), sold-out/market items without Add, Coffee direct add, Latte modifier selection, MX$110 combined total, and cart persistence across desktop-to-390px layout with usable mobile sheet. Approved tasks 4-5.

- 2026-10-08: plan written from repository inspection. No implementation, tests, build, or browser verification performed for this planning request.
- 2026-10-08: Sol read-only review completed; parent incorporated action guards, visibility-link separation, malformed-document/error fallback, container sizing checks, and clipboard preservation into the plan.

- 2026-10-08, Checkpoint A implementer evidence: Initial tracked checkout clean, only pre-existing untracked `tasks/`; parent established branch `codex/designed-menu-ordering`. No AGENTS.md found in repository. Read TDD, git workflow, frontend, incremental implementation, and skill usage instructions. No commits/push/deploy/production changes.
- Baseline: `npm test -- --run`: 25 files / 240 tests pass. Build passes with existing large-chunk, ineffective dynamic-import, and outdated Browserslist-data warnings. Lint fails at existing `MenuShareCard.jsx:92` unnecessary `linkedDomain` hook dependency (0 errors / 1 warning under max-warnings=0); left untouched.
- Selection inspected in install SQL and migrations 050/054: selected active menu uses `get_menu_by_id` plus current shop settings; empty/inactive/deleted selection retains active-menu server fallback. RPC public catalog excludes public-hidden categories/items/modifiers; client applies selected category names. No client `?m=` resolution exists in PublicOrder. Editor saves complete document JSON and clone/clipboard use JSON deep-copy preserving arbitrary fields; no normalization/schema/version change needed.
- Eligibility RED: new helper tests fail when helper module absent. GREEN: 17 helper cases pass, including bindings, explicit supported nodes, visibility, fixed prices, hidden/deleted/filtered targets and gates. Existing add/confirmation/draft/repeat entry points use the same eligibility guard. Confirmation checks current gate via `addLine`; closed gates preserve eligible drafts.
- Catalog presentation: exact existing category-navigation/list JSX extracted into `OrderCatalog`; 6 server-rendered presentation cases cover phone/desktop, category selection, sold-out/market products and closed/paused/disabled gates. RPCs, cart, modifier picker, header, repeats and checkout remain in PublicOrder.
- Post-change full verification: 28 files / 273 tests pass (33 added = 17 eligibility, 10 resolver, 6 presentation). Focused order/slot regression run: 6 files / 43 tests pass before final resolver case addition. Build passes with baseline warnings. Lint has identical baseline warning only. `git diff --check` passes.
- Local actual-PublicOrder browser fixture prepared outside repository at `%TEMP%/tinypos-order-fixture/server.mjs`, served on 127.0.0.1:5179. It supplies selected shop B, category whitelist, normal/modifier/sold-out/market/filtered products; rejects submit/unknown RPCs and external fetch. Parent owns browser review evidence (phone/desktop catalog add/modifier/cart). Browser verification remains pending; Checkpoint A remains unchecked for parent review. No real shop/server submission tested.

- Checkpoint A resolver review repair: an internal `42883` missing another function with `get_order_menu` in PL/pgSQL details reproduced incorrect fallback (1 failing test). Missing-function identity now matches message only, preserving internal failures. Added real PostgREST parameterless function wording test. 10 resolver cases pass; full suite rerun: 28 files / 273 tests pass. Fixture uses isolated temp Vite cache, React dependency includes, transformed HTML preamble and a pre-resolution mock plugin.

- Checkpoint B implementation evidence: added optional renderer ordering and a shared root `NodeBox` div/button substitution, preserving per-node geometry, autoWidth, rotation, fill, shadow, labels and live values without adding wrappers. Native buttons use type=button, live names and disabled states; global button transforms are suppressed. Only ordering decorations pass pointer events so linked artwork beneath remains reachable; WhatsApp retains its own anchor action. Public/TV/print callers remain read-only, tested structurally. Width-fitting pages observe container resize; TV/print sizing unchanged.
- `OrderDesignView` owns only presentation choice and a small render boundary. Invalid docs default to catalog with an explanation; no-action docs default to catalog with optional Design. Gate does not influence default view. Changing document resets view and error state; all cart/checkout remain in PublicOrder. Empty categories retain surrounding header/cart structure and an empty catalog message.
- Task 5 editor UI uses existing ItemPicker; optional `order_item_id` can be assigned/replaced/cleared only for text/image/rect/circle. Independent visibility shortcut is explicit; copy explains price/modifier freshness and category/public eligibility. Existing JSON save, node spread updates, undo snapshots and clipboard clones carry field without schema changes. Actual editor/browser roundtrip verification remains with parent before the final task 5 verification box can be checked.
- Verification at B source completion: full 28 files / 293 tests pass (20 new tests since A); build passes with baseline warnings; changed-file lint passes and diff whitespace check passes. Native-action presentation tests initially failed 2 cases before renderer wiring and now pass. Design/no-action/invalid/gated/read-only presentation covered without a DOM dependency. No production submission or SQL mutation.
- B fixture: `%TEMP%/tinypos-order-fixture/server.mjs`, localhost:5179. Actual PublicOrder scenarios: `design-b`, `design-c` (distinct blue multipage artwork), `invalid`, `no-action`, `crash`, `saved`; gate paused/closed/disabled. `/display` renders actual CanvasRenderer read-only, including TV/print; `/editor` renders actual CanvasEditor with mocked updateMenu storing full menu JSON to local fixture storage. Parent owns mobile/desktop/keyboard/editor runtime verification; no checkpoint B box marked by implementer.

- Tasks 6–8 source completion: Design adds brief ES/EN tap guidance with Catalog for larger controls. Eligible artwork has a subtle dotted brand-color affordance and visible keyboard focus; unavailable visible manual actions dim while preserving authored content and existing sold-binding appearance. Shared renderer explicitly resets global hover/press transforms. ItemPicker footer now distinguishes live product fields from manual artwork order/visibility links.
- Final automated checks: `npm test -- --run` passes 28 files / 295 tests (55 added from the 240-test baseline). Build passes with unchanged baseline warnings. Full lint retains only baseline MenuShareCard.jsx:92 hook-dependency warning (0 errors / 1 warning); ESLint on every changed source/test file passes. Diff whitespace check passes. No suppression, skipped test, new dependency, SQL migration, or cart payload changes.
- Docs updated in `docs/online-ordering.md` and `docs/menus.md`; current selected-menu resolver, owner link behavior, category eligibility, live versus handwritten pricing, fallback behavior, and read-only/PDF/template limits match the implementation. Existing configured payment choices are reused and described accurately.
- Final controlled fixtures: real PublicMenu `/menu`/`/menu/tv` uses active artwork A; real PublicOrder uses selected B unless the mock resolver explicitly models empty/inactive/deleted selection fallback. `?m=` pin remains display-only. Resolver modes `error`/`internal` preserve true errors, `legacy` models old-schema fallback. Draft/repeat fixture seeds include eligible, unavailable, non-fixed, filtered and deleted IDs. `/capture` displays local RPC/payload evidence. Opt-in `submit=mock` simulates submission/tracking entirely locally, `submit=stale` returns `item_unavailable` for recovery. Payment choices and delivery/shipping checkout can be exercised with the mock map pin/quote; real map/service/payment/server behavior is not implied.
- Integration limit: no isolated real test shop was available or used; no production RPC submission, menu mutation, payment, deployment, commit, push or merge occurred. Browser interaction matrix beyond recorded parent evidence remains pending parent final review; task 6/7 verification boxes and Checkpoint C deliberately remain unchecked until that evidence is reviewed.

- 2026-10-08, verification pass (tasks 5/6/7 remaining boxes), local fixture only (127.0.0.1:5179, mocked RPCs; no production, no real submit, no commit). Automated: `npm test -- --run` 28 files / 295 tests pass; build passes (baseline warnings); lint only baseline MenuShareCard.jsx:92 warning. No code changes were needed; no bugs found.
  - Task 5: editor at 1280px: selected linked text node, Ctrl+C/Ctrl+V and Ctrl+D produced two clones, Save wrote 11 nodes with `order_item_id` (clones keep "coffee"); Ctrl+Z x2 / Ctrl+Shift+Z x2 then Save again -> still 11 linked/15 nodes. Reload `/order?scenario=saved` (fixture flipped saved kind live->designed in localStorage; fixture artifact since fixture editor mounts a catalog-kind menu) rendered all linked nodes as buttons; real clicks: rect +1 and circle +1 Coffee (qty 2, MX$90), text +1 (qty 3, MX$135, not the handwritten $1), image Latte -> modifier sheet -> Oat milk -> MX$65; total MX$200. Visibility-only link (stock-hidden, link.itemId only) stays hidden/not an action; editor writes order_item_id only on explicit link.
  - Task 6 (390px and 1280px): design-c multipage: no horizontal overflow (scrollWidth 390), page 2 binding reachable in inner scroller, fixed cart bar 774-828px clear of last control (290-332 at max scroll). Keyboard: focused page-2 binding, Enter -> +1 (4->5 items), Space -> +1 (6); focus ring dotted 1px. Rotated auto-width text tapped at 390px -> exactly +1. Transparent z=10 decoration overlay does not block the binding (elementFromPoint inside binding button). gate=closed/paused/disabled (iframes): 0 enabled Add buttons, cart bar hidden, banner shown. submit=stale: "An item is no longer available. Refresh the menu." shown, cart (8 items) kept, no success; reload kept the draft. seed=draft and seed=repeat ("Repeat last order") reduce 5 seeded IDs to only eligible Coffee. TV/print/display: 0 buttons.
  - Task 7 box 1 (resolver modes mocked in fixture): /menu = public artwork A (get_active_menu); /order = selected B (get_order_menu); `/order?m=1` still B; `/menu?m=2` pins B for display only; resolver none/inactive/deleted -> A (server fallback modelled by mock); error/internal -> no menu, no get_active_menu call; legacy (PGRST202 missing function) -> falls back to get_active_menu. design-b vs design-c show their own artwork (earlier).
  - Task 7 box 2 left UNCHECKED: covered in browser = catalog/design add, modifiers, restore draft, repeat, pickup, bank-transfer payment (payload has only id/qty/modifiers, no prices), tracking page, stale rejection, gates, no-action/invalid/crash (earlier). NOT exercised in browser: local delivery, shipping quote, other payments (card/clip), mid-session gate flip while modifier sheet open (only code-guarded: `addLine` rechecks `canOrderItem(...gate)`, sheet unmounts when gate set), landscape design, real server/SQL fallback (mock only).

- 2026-10-08, Parent Checkpoint C: reviewed the full diff (PublicOrder eligibility guards, OrderDesignView/OrderCatalog wiring, NodeBox button substitution, editor OrderActionLink, ResizeObserver scoped to fit=width) and accepted it. Fixed a bug that already existed on main: the editor's fit scale went negative when the stage was smaller than its padding (crashed Konva at 800x450); it is now clamped to at least 0.01. Still open: delivery, shipping, and card/Clip payment (needs an isolated test shop), landscape fixture, gate change while modifier sheet is open (covered by code reading only). Task 7 box 2 and final acceptance stay open until then.
