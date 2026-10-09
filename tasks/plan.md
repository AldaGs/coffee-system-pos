# Implementation plan: ordering from hand-edited menus

Date: 2026-10-08. Status: implementation source complete through tasks 1–8; final parent browser/regression review pending. Evidence and remaining verification are recorded in todo.md.
Executor: one Sol subagent (`gpt-6.1-sol`), supervised by the parent agent.
Checklist: [todo.md](todo.md).

## Outcome

An owner can keep several public menus and select one in Online Orders. When that selection is a canvas design, `/order` displays the saved artwork and customers can tap linked products, choose their existing modifiers, and use the existing cart and checkout. Changing the online-order selection does not edit any menu document or change the public display schedule.

This first implementation covers canvas designs, including product bindings and manually authored text, images, and rectangular/circular shapes. The current catalog presentation remains available as an accessible alternative. Template-only designs retain the existing ordering catalog presentation. PDF/image menu ordering and arbitrary clickable PDF regions are outside this implementation; those menu kinds are currently excluded from the Online Orders selector.

## Confirmed starting point (before implementation)

- `src/components/admin/OnlineOrdersTab.jsx` stores `onlineOrders.menuId`; the selector lists active `live` and `designed` menus. Empty selection means the currently active menu.
- `get_order_menu()` already resolves this setting, combines the selected menu with current shop ordering settings, and falls back to the active menu when the selection is absent/inactive/deleted. See `api/install.js` and migration `050_public_delivery_coverage.sql`.
- `src/components/PublicOrder.jsx` fetches that RPC, applies `menu.data.category_names`, and stores the filtered categories in `data`. Its item index therefore already respects the selected category whitelist. It currently renders its own catalog, ignoring the design document.
- `public_place_order` validates categories against `get_order_menu()`, validates product availability/modifiers, and calculates prices on the server. The latest definition must be checked when work starts; current reference is migration `054_cashier_only_modifiers.sql`.
- `src/components/menuCanvas/CanvasRenderer.jsx` renders authored coordinates, rotation, stacking, fonts, availability, and print/TV layouts. It has no ordering callback.
- `item-binding.item_id` already identifies a live catalog product. Other nodes may have `link: { itemId, hideWhenOOS }`, which controls visibility only. `date-field.item_id` is also not an ordering action.
- Cart, modifiers, repeat order, mobile checkout sheet, desktop checkout panel, pickup/delivery/shipping, and payment behavior already live in `PublicOrder.jsx`. Reuse them.

## Product and data decisions

1. **Selection stays authoritative.** `/order` obtains its menu exclusively through the existing shop selection. An arbitrary `?m=` must not override that selection. `/menu`, TV, print, and editor previews retain their existing behavior.
2. **Canvas is a presentation, not a new item whitelist.** The existing public catalog and selected category whitelist define eligible products. Merely leaving a product off the artwork does not ban it from ordering. The catalog alternative shows that same eligible catalog. Owners narrow the catalog using the existing category selection. A stricter item-by-item menu whitelist would require separate server work.
3. **Automatic actions for existing product bindings.** In `/order`, a visible `item-binding` resolves its existing `item_id` and uses the existing add flow. No document migration or resave is required.
4. **Explicit actions for hand-authored nodes.** Add optional `order_item_id` to text, image, and rectangle/circle shape nodes. Missing/null means decorative. Reuse ItemPicker to link, replace, and unlink. Do not infer from names, prices, proximity, visibility links, or date fields. Existing WhatsApp links keep their own action; paths, lines, dates, and WhatsApp buttons are excluded from this first action editor.
5. **Visibility remains independent.** `node.hidden`, stock visibility links, and `hide_when_out_of_stock` continue to apply. A visibility link can refer to a different product than an order action; the UI must explain the distinction. Show a shortcut to explicitly use the visibility-linked product for ordering, if useful, without changing old documents automatically.
6. **Current catalog values win.** Store IDs only, never copied prices or modifiers in the action. Resolve the target against filtered public items, require availability and fixed pricing, and check the ordering gate at the action handler. Hand-typed artwork remains unchanged; the editor explains that hand-typed prices do not synchronize. Checkout always displays live values and the server remains authoritative.
7. **Backward-compatible storage.** The optional field fits the existing document JSON. Expect no SQL migration, new table, RPC, dependency, or document-version bump. Verify save/load, duplication, clipboard copy/paste, undo/redo, and any document normalization preserve it. Existing node patching and `cloneNodeGeometry` preserve arbitrary fields, and menu saves retain `document`; build on these paths. Escalate an unexpected need for schema changes to the supervisor before expanding scope.

## Rendering and interaction contract

- Keep ordering state owned by `PublicOrder`. First extract only its catalog presentation into a small component if needed; do not rewrite checkout or build a second cart/store.
- Add an optional ordering capability to `CanvasRenderer`, for example `ordering={{ onSelectItem, canOrder, labels }}`. Final names may follow local conventions. Normal display callers omit it, and TV/print explicitly suppress it even if supplied accidentally.
- Use a small pure helper for resolving a supported node's order target and eligibility. Keep catalog lookup for presentation separate from the set of items allowed to activate.
- Render valid actions as actual keyboard-operable buttons with a useful accessible name containing the live product name. Enter/Space and click/tap produce exactly one action. Show a visible focus state and a restrained ordering affordance without changing saved artwork.
- A linked item that is unavailable, non-fixed-price, deleted, or outside selected/public categories cannot activate. Present a meaningful disabled/unavailable state where the authored node remains visible; nodes intentionally hidden stay hidden.
- Preserve scaled coordinates, auto-width text, rotation, clipping, z-order, and existing external links. Decorative elements must not silently intercept intended actions; define and browser-test the hit-target strategy before adding wrappers across every node branch. Never put an order button over a WhatsApp anchor or nest interactive controls.
- Use the existing `onAdd` behavior: no modifiers adds one item; modifier-bearing items open the existing selector. Quantities remain editable in the existing cart. Recheck target/gate when confirming a modifier selection.
- For a valid selected canvas document, show Design/Catalog controls, defaulting to Design. Switching views preserves cart and checkout state. Controls use the existing language and brand settings. Catalog controls offer practical touch targets even when the authored art shrinks too small to tap comfortably.
- Preserve the surrounding ordering header, gate banner, repeat-order controls, cart access, legal links, and desktop/mobile checkout layout. Keep cart controls outside the scaled canvas.
- Missing/empty/structurally invalid documents fall back to the existing catalog. Check finite positive page dimensions, supported document version, page/node arrays, and renderable content. Unknown node types retain renderer forward compatibility within a supported version. Isolate canvas rendering with a small error boundary so a render exception cannot remove the cart/catalog; reset the boundary when the selected document changes. A canvas with no visible eligible action starts in Catalog with a brief explanation and an optional view-design action; avoid a dead-end ordering page.
- Recalculate scale when the actual canvas container changes size, including cart layout and view switching. The existing renderer listens to window resize only; use a narrowly scoped `ResizeObserver` if container-resize testing demonstrates the need, preserving print/TV sizing.
- RPC/network failure is not a malformed-design fallback. Do not silently switch to a different shop menu to recover an artwork error. Preserve current inactive/deleted selection fallback semantics on the server; flag their implications in documentation.
- A schedule/selection/catalog change during an open session can make the loaded page stale. Server submission continues to reject unavailable items or reprice authoritatively. Keep the cart editable and explain refresh/review on rejection; do not add background menu switching or lose a draft as part of this feature.

## Implementation sequence and supervision

Tasks are specified in `todo.md`; execute sequentially. Dependencies:

`baseline -> eligibility -> catalog extraction -> canvas order view -> editor links -> interaction polish -> regression proof -> documentation`

The parent launches one Sol implementer only when implementation is requested. Give it both plan files and the current repository state. The parent reviews each checkpoint's diff and verification evidence before dispatching the next task group; this is an agent review, not a repeated user approval loop. The subagent must report changed files, tests, browser evidence, deviations, and unresolved failures. Do not let it self-approve a checkpoint.

- **Checkpoint A (tasks 1-3):** review selection semantics, eligibility tests, and unchanged catalog/checkout behavior before canvas wiring.
- **Checkpoint B (tasks 4-5):** review one complete design-to-cart path plus editor save/reload before adding polish.
- **Checkpoint C (tasks 6-8):** parent inspects actual mobile/desktop behavior, final diff, tests, and docs. Only then call the implementation complete.

Unexpected failures return to Sol with a concrete reproduction and acceptance criterion. If a fix changes the architecture or scope, update the plan before continuing. No production orders, production menu edits, deploys, pushes, or merges are part of this planning request or the verification fixtures.

## Verification contract

Repository stack: React/JSX, Vite, Vitest; tests live in `src/tests`. Preserve existing code style and use current dependencies. Pure helper tests and React server-rendered structural tests can use existing packages; interactive correctness still requires a real browser. Do not substitute source-string assertions for behavior tests. A DOM testing dependency is not currently established; agree with the supervisor before adding one.

Commands from the repository root:

```powershell
npm test -- --run
npm run build
npm run lint
npm test -- --run src/tests/canvasOrdering.test.js src/tests/orderMenuPresentation.test.js
npm test -- --run src/tests/onlineOrderShipping.test.js src/tests/onlineOrderItemSync.test.js src/tests/onlineSchemaMirrors.test.js src/tests/pickupSlots.test.js
npm run dev -- --host 127.0.0.1
```

The two presentation test files above are planned additions. Record pre-existing failures before changing code; do not weaken checks, suppress errors, or claim unrelated failures are fixed. Use the available browser-control tooling and a local fixture/mock RPC environment for interaction checks. Actual database submission checks require an isolated test shop; if unavailable, report the integration limit precisely rather than placing a real customer order.

Minimum regression matrix:

| Scenario | Required result |
| --- | --- |
| Public menu A active, online menu B selected | `/menu` shows A; `/order` displays B and validates B's allowed categories |
| Empty selection; inactive/deleted selection | Existing active-menu fallback, with no new client selection rules |
| Catalog or template-only design selected | Existing catalog ordering remains usable |
| Two different saved canvas menus | Selecting each displays its own artwork; no mutation to either document |
| Old item binding with no new field | Orders its existing product without resaving |
| Text/image/shape explicitly linked | Correct item reaches existing cart/modifier flow; handwritten price is never submitted |
| Visibility-only link/date field/decoration | Does not become an order action |
| Hidden/sold-out/deleted/non-fixed/filtered target | Cannot add through canvas, catalog, repeat order, or restored draft |
| Modifier confirmation after gate change | Cannot add while closed/paused/disabled |
| Same product linked twice; rotated/overlapping art | One activation adds one item; correct target under pointer; keyboard works |
| Multiple pages; landscape and portrait; auto-width text | Artwork remains aligned; controls and cart accessible |
| Narrow phone and desktop | Design/Catalog toggle preserves draft; checkout usable with no overlapping controls |
| Blank/malformed/no-action design | Catalog fallback explains state and remains orderable if catalog has eligible items |
| Public/TV/print/editor preview | Existing visual behavior; no order controls or incidental ordering callbacks |
| Pickup, local delivery, shipping quote, payment | Existing checkout and tracking behavior remain intact |
| Stale selection/product at submit | Existing server validation remains authoritative; recoverable error, no false success |

## Risks and limits

- Fixed-size artwork is often too small on phones: accessible Catalog alternative is required, not deferred.
- Global CSS for buttons can distort artwork: reset only order-action styles and compare rendering with ordering disabled.
- Existing shared renderer has many node branches: keep geometry changes small and validate print/TV too.
- Visibility links look similar to ordering links: distinct labels/fields prevent unintended conversion of decorative art.
- Server resolver supports fallbacks, so a deleted selection does not mean ordering closes: preserve and document this existing behavior.
- Baseline `orderMenu` fell back to `get_active_menu` on any RPC error. Resolved in separately tested Task 1a: `fetchOrderMenu` falls back only when the error identifies a missing `get_order_menu` function; internal/permission/network failures retain the error. SQL context in error details does not identify the missing function.
- Catalog whitelist is category-based, not inferred from canvas nodes: make that explicit in the owner UI and docs.

## Definition of completion

All checklist tasks and supervisor checkpoints have recorded evidence. Saved menus remain compatible, selected canvas designs support ordering through the existing checkout, disallowed targets cannot activate, and read-only renderers remain unchanged. Deliver a concise summary of changes, verification, and any actual limitations. No implementation or verification result is implied by this plan document.

## Planning review

Sol performed a read-only review on 2026-10-08. Its findings were incorporated: filtered item data must reach the canvas, action handlers need independent guards, visibility/date links must not be inferred as order links, document validation and render-error recovery are required, scaling needs container-resize checks, and clipboard operations must preserve the optional field. This review evaluated the plan against source code; it did not implement or test the feature.
