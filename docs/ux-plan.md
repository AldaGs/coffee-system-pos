# UX plan: first run and the product → inventory → recipe → menu flow

Source: UX review of 2026-09-18. One step = one small commit on `main`.
Tick a step when it lands. Every UI string goes in `translations.js` (EN + ES),
and Help (`helpContent.js`) is updated in the same commit when behavior changes.

## Phase 1: Labels only (no behavior change)

- [x] **1. Rename "Publish to Menu" in Recipes Builder** → "Create product from recipe" /
  "Crear producto con esta receta" (button, modal title, success alert).
  Files: `translations.js` (`recipe.btnPublishToMenu`, `recipe.publishModalTitle`,
  `recipe.alertPublishedDesc`), Help `calculator` section.
- [x] **2. Plain-language inventory strategy** in the product form:
  "How is this deducted from inventory?" with options "Not tracked",
  "It's a product I stock (e.g. a bag of coffee)", "It's made from a recipe (e.g. a latte)".
  Files: `translations.js` (`menu.invStrategy`, `menu.invNone/Standard/Recipe`).

## Phase 2: Product form (Menu Editor)

- [x] **3. Respect Advanced Mode in the inventory strategy.** Without Advanced Mode,
  hide the Standard/Recipe options and show a one-line hint:
  "Turn on Advanced Mode to track stock". Keep existing links working (read-only
  label if an item already has one). Files: `MenuEditorTab.jsx` (~L303).
- [x] **4. Empty-state links.** When the inventory or recipe dropdown is empty, show
  "+ Create inventory item" / "+ Create recipe" that jumps to that Admin tab.
  Files: `MenuEditorTab.jsx`, `Admin.jsx` (tab switch callback).
- [x] **5. "Show on public menu" switch in the product form**, bound to the existing
  item `publicHidden` flag (inverted), default on. Keep the list's hide control.
  Files: `MenuEditorTab.jsx`, `EditDrinkModal.jsx` if the edit path is separate.
- [ ] **6. "Sold out: hidden from public menu" badge** in the Menu Editor list, computed
  client-side with the same rules as `menu_item_available` (standard: linked stock ≤ 0;
  recipe: any non-manual ingredient short). Pure helper + small test.
  Files: new helper in `utils/inventoryMath.js`, `MenuEditorTab.jsx`, test.

## Phase 3: Guided next steps

- [ ] **7. After saving a recipe**, if it has no product yet, show a "Next: create the
  product" prompt that opens the renamed modal from step 1. Files: `RecipeBuilderTab.jsx`.
- [ ] **8. After creating a product**, success alert says where it now shows:
  "Added to the register. It is visible on your public menu." (cloud, not hidden) or
  "...Upgrade to cloud backup to publish a menu." (local). Files: `RecipeBuilderTab.jsx`,
  `MenuEditorTab.jsx`.
- [ ] **9. Create a recipe from the product form.** In "made from a recipe", add
  "+ New recipe" that opens Recipes Builder with the name prefilled and returns the link.
  Largest step; can split into 9a (navigate + prefill) and 9b (auto-link on save).

## Phase 4: Local mode and Public Menus

- [ ] **10. Show Public Menus locked in local mode** instead of hiding it: the tab opens a
  card "You need cloud backup to publish your menu" with the existing upgrade action
  ("Crear respaldo gratis"). Files: `Admin.jsx` (cloudOnly filter), small locked-state
  component reusing the Settings upgrade handler.

## Phase 5: Landing page

- [ ] **11. Move landing strings to `translations.js`** (EN + ES), no layout change.
- [ ] **12. Restructure the landing page:**
  - main button "Start free" → local mode (unchanged behavior);
  - text link "Already have a cloud-backed store? Sign in" → `connect`;
  - note "Stores created only on this device can't be opened from another one";
  - small link "Create with cloud backup" → `new` (kept, demoted).
  Files: `LandingPage.jsx`.
- [ ] **13. Help + scripts update** for the new first-run wording
  (`helpContent.js` settings/overview, `scripts/01-primera-configuracion.md`).

## Verification per step

- `npx vitest run` and `npx eslint <changed files>` pass.
- For UI steps, check the screen in the browser preview (EN and ES, local and cloud
  mode where it matters) before committing.
