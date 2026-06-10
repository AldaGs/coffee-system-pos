# Public menus — feature documentation

Status as of branch `tinymenu` (last verified commit `eaddcf0`, June 2026).

The "Menús Públicos" feature lets a shop publish one or more customer-facing
menus that are reachable by QR code. The shop can mix sources (its live
catalog, uploaded PDFs/images, or a freeform canvas design), schedule which
menu shows when, and operate a tablet in TV/kiosk mode — all without the
customer ever signing in.

This document tracks what has shipped, the data model, the URL contract,
the conventions to maintain, and what's still on the roadmap.

---

## 1. User-facing surface

### URLs

| URL                                          | Renders                                                    | Auth         |
|----------------------------------------------|------------------------------------------------------------|--------------|
| `/menu?u=<base64-url>&k=<base64-key>`        | Auto-resolves which menu is active *now* and renders it    | Anon only    |
| `/menu?u=…&k=…&m=<id>`                       | Pins a specific menu id regardless of schedule             | Anon only    |
| `/menu/tv?u=…&k=…`                           | Same auto-resolve, but full-screen kiosk with rotation     | Anon only    |
| `/menu/tv?u=…&k=…&m=<id>`                    | Pinned kiosk mode for a specific menu                      | Anon only    |

`u` is the shop's Supabase project URL (base64); `k` is its publishable
anon key (base64). Both are read from `localStorage` (`tinypos_supabase_*`)
when generating shareable links from the admin. The central deploy at
`tinypos.app` serves every shop's menu without build-time config; see
`memory/project_tinymenu_multitenant.md` for the security model.

### Admin entry

Sidebar tab labeled **Menús Públicos / Public Menus** (i18n key
`admin.publicMenus`), positioned directly above **Configuración de
Ticket**. Built from [`src/components/admin/MenusTab.jsx`](../src/components/admin/MenusTab.jsx)
and gated to authenticated cashiers.

---

## 2. Architecture

### Server-side resolution

Customer requests go through `get_active_menu(p_now timestamptz)` which:
1. Reads shop timezone from `posSettings.timezone` (default `UTC`).
2. Converts `p_now` into shop-local time.
3. Picks the highest-priority active menu whose schedules match
   (or the catalog `kind='live'` fallback if none does).
4. Returns a uniform envelope shape so the JS renderer is the same
   for every menu kind.

The override route uses `get_menu_by_id(p_id bigint)` which has the
same envelope and falls back to the catalog when the requested id is
inactive or missing — so a stale printed QR never 404s.

Resolution decisions are server-side on purpose: TV mode and the
customer's phone always see the same menu at the same wall-clock time
because both ask Postgres for it, eliminating client-clock drift.

### Envelope shape

```jsonc
{
  "menu": {
    "id":   42,
    "kind": "live" | "pdf" | "image" | "designed",
    "name": "Brunch",
    "data": { /* kind-specific payload */ }
  },
  "shop": {
    "name":        "...",
    "brand_color": "#f28b05",
    "language":    "es",
    "timezone":    "America/Mexico_City"
  },
  "categories": [ /* same shape as the catalog editor */ ],
  "modifier_groups": [ /* same shape as the catalog editor */ ]
}
```

`categories` and `modifier_groups` are populated for `kind in ('live',
'designed')` and empty arrays for `pdf` / `image` (those render entirely
from `menu.data`).

### Render branches

The single [`src/components/PublicMenu.jsx`](../src/components/PublicMenu.jsx)
entry point branches on `menu.kind` plus `menu.data.document`:

| Kind        | menu.data.document  | Renderer                                              |
|-------------|---------------------|-------------------------------------------------------|
| `live`      | n/a                 | List view from `data.categories`                      |
| `pdf`       | n/a                 | Swipeable page carousel + "Descargar PDF"             |
| `image`     | n/a                 | Single-page render                                    |
| `designed`  | absent              | Phase 4a template (list / cards / chalkboard)         |
| `designed`  | present             | Phase 4c canvas renderer (DOM walk over node tree)    |

`/menu/tv` adds Wake Lock + auto-rotation + crossfade on top of the same
data and branches the slide source the same way.

---

## 3. Database schema

Migrations 010–017 collectively define this surface. Every menu schema
change must be mirrored in three places (sync invariant):
1. `db/migrations/NNN_*.sql`
2. `api/install.js`
3. `src/components/SetupScreen.jsx`

### Tables introduced for public menus

| Migration | Table                | Purpose                                                |
|-----------|----------------------|--------------------------------------------------------|
| 010       | `menu_categories`    | Catalog categories (moved out of JSONB)                |
| 010       | `menu_items`         | Catalog items                                          |
| 010       | `menu_modifier_groups` | Modifier groups                                      |
| 010       | `menu_modifier_options`| Modifier options                                     |
| 010       | `menu_item_modifier_groups` | Item ↔ group join                               |
| 010       | `menu_discount_rules`| Discount rules                                         |
| 013       | (column `image_url`) | Item photo URL — self-healed at install in later mig.  |
| 014       | `menu_versions`      | Catalog snapshot history + restore                     |
| 015       | `menus`              | Multi-menu rows (Brunch, Vegano, etc.)                 |
| 015       | `menu_schedules`     | Time windows per menu (many-to-one)                    |

`menus` columns:

| Column       | Type        | Notes                                              |
|--------------|-------------|----------------------------------------------------|
| `id`         | bigserial   |                                                    |
| `name`       | text        |                                                    |
| `kind`       | text        | check `in ('live','pdf','image','designed')`       |
| `priority`   | int         | higher wins; ties broken by `created_at DESC`      |
| `is_active`  | bool        | inactive menus skipped by resolver                 |
| `data`       | jsonb       | kind-specific payload (see § 5)                    |
| `created_at` | timestamptz |                                                    |

A unique partial index `uniq_menus_live` enforces exactly one
`kind='live'` row — the implicit catalog. It's seeded at install with
priority 0 and no schedules so it's the always-on fallback.

`menu_schedules` columns:

| Column         | Type | Semantics                                                  |
|----------------|------|------------------------------------------------------------|
| `menu_id`      | fk   | cascade delete                                             |
| `days_of_week` | int  | bitmask Mon=1, Tue=2, …, Sun=64. 0 or NULL = every day.    |
| `start_time`   | time | NULL = open-ended on that side                             |
| `end_time`     | time | when `start > end`, the window wraps midnight              |
| `start_date`   | date | NULL = open-ended                                          |
| `end_date`     | date | NULL = open-ended                                          |

### RPCs

| Function                          | Migration | Grants                | Purpose                                     |
|-----------------------------------|-----------|-----------------------|---------------------------------------------|
| `shop_timezone()`                 | 015       | anon, authenticated   | Reads `posSettings.timezone`, default UTC   |
| `schedule_matches(...)`           | 015       | (immutable, called inline) | Pure predicate used by resolver        |
| `get_active_menu(now)`            | 015/016   | anon, authenticated   | Auto-pick menu by schedule + priority       |
| `get_public_menu()`               | 011/015   | anon, authenticated   | Backwards-compat alias for `get_active_menu`|
| `get_menu_by_id(p_id)`            | 017       | anon, authenticated   | Pin a specific menu by id (ignores schedule)|

All RPCs are `SECURITY DEFINER STABLE` with `search_path = public`.
Anon's access surface to the catalog is *only* these RPCs — no anon
RLS policies on the underlying tables.

### Storage

Bucket `menu-assets`, public read, authenticated write:

| Prefix                              | Source phase | Used by                                  |
|-------------------------------------|--------------|------------------------------------------|
| `items/<item_id>.webp`              | v0.2         | Catalog item photos                      |
| `uploads/<menu_id>/page-N.webp`     | 4c-prep / 2  | Uploaded PDF page images                 |
| `uploads/<menu_id>/original.pdf`    | 2            | PDF originals kept for download          |
| `canvas-assets/<menu_id>/<id>.webp` | 4c.2         | Designer-uploaded canvas images          |

---

## 4. Phases shipped

### Phase 1 — multi-menu + scheduling (foundation)
- `menus` + `menu_schedules` tables, `get_active_menu()` resolver.
- The catalog becomes the implicit `kind='live'` fallback at priority 0.
- `MenusTab` admin surface: list/create/rename, priority spinner, toggle
  active, per-menu schedule editor (day chips, time window, date range).
- `PublicMenu` switched to `get_active_menu` with 5-min re-fetch.
- Schedule overlap warning ([`src/utils/scheduleConflicts.js`](../src/utils/scheduleConflicts.js))
  flags active non-live menus whose windows can fire simultaneously.

### Phase 2 — PDF/PNG upload
- [`src/api/menuUploads.js`](../src/api/menuUploads.js) — client-side
  pdf.js → WebP page conversion, original PDF kept for download.
  Lazy-loaded so non-uploaders don't pay the bundle cost.
- Upload UI in MenusTab. New menu rows are created with `kind` set
  after the file's converted; deleting wipes the storage folder.
- PublicMenu renders swipeable page carousel for `kind in (pdf, image)`
  with keyboard arrows, dot indicators, "Descargar PDF" link.

### Phase 3 — TV/kiosk
- `/menu/tv` full-screen branch in PublicMenu (`TvMode`): black
  canvas, large type, slide rotation with crossfade.
- Slide source adapts to menu kind (categories for live/designed,
  pages for pdf/image, placeholder otherwise).
- Wake Lock API requested on mount and re-acquired on `visibilitychange`.
  Silent best-effort.
- Auto-rotate default 12 s, overridable per menu via `menu.data.rotation_ms`.
- MenusTab "Vista TV / kiosko" button opens the URL with the same
  base64 creds the share card uses.

### Phase 4a — designer templates
- `get_active_menu` extended (migration 016) so `kind='designed'` returns
  the catalog payload too — templates bind to live items.
- `DesignedEditor` panel in MenusTab: template picker (Lista, Tarjetas,
  Pizarra), category subset by name, accent color override.
- Three template components in PublicMenu:
  - **Lista** — refined list with accent bars.
  - **Tarjetas** — image-led grid using `item.image_url`.
  - **Pizarra** — dark chalkboard with cursive system font (no network
    fonts → loads on kiosks without internet).

### Phase 4b — theme tokens
- [`src/utils/menuTheme.js`](../src/utils/menuTheme.js) — sparse
  `menu.data.theme` → flat CSS tokens via `applyTheme()`. Defaults are
  template-aware so an empty theme keeps each template's signature look.
- 5 system font presets: System / Serif clásica / Sans display / Mono /
  Manuscrita.
- Optional Google Fonts URL — parses the family name, injects a `<link>`
  idempotently into `<head>` on PublicMenu only.
- 3-step density scale (Compacto / Cómodo / Amplio).
- `ThemeEditor` panel under DesignedEditor: font preset, density chips,
  three color pickers with per-token clear-to-default.

### Phase 4c.0 — canvas renderer foundation
- [`src/utils/canvasDocument.js`](../src/utils/canvasDocument.js) —
  schema, `PAGE_PRESETS` (16:9 + 9:16), helpers.
- [`src/components/menuCanvas/CanvasRenderer.jsx`](../src/components/menuCanvas/CanvasRenderer.jsx) —
  DOM walk. Each page renders at native authored size and shrinks with
  one CSS `transform: scale()` so author coords are resolution-independent.
- Four node types: `text`, `image`, `shape (rect/circle/line)`,
  `item-binding`. Unknown types render as empty boxes (forward-compat).
- Item bindings resolve live from the RPC payload — a price edit in the
  catalog propagates without re-saving the document.

### Phase 4c.1 — react-konva editor MVP
- [`src/components/menuCanvas/CanvasEditor.jsx`](../src/components/menuCanvas/CanvasEditor.jsx) —
  full-screen overlay editor.
- Toolbar adds: text, rect, circle, image, item-binding.
- Click-to-select with Konva `Transformer` for move/resize/rotate.
  `Delete`/`Backspace` removes node.
- Properties panel per node type, plus per-page background.
- Layer ordering (bring forward / send back).
- Multi-page tabs at top: add page, delete page, switch.
- Undo/redo via 50-step in-memory ring buffer, `Ctrl+Z` / `Ctrl+Shift+Z`.
- Dirty flag with confirm-before-close.

### Phase 4c.2 — assets + color picker
- [`src/api/menuCanvasAssets.js`](../src/api/menuCanvasAssets.js):
  upload, list, delete. Client-side WebP conversion ≤ 2000 px wide.
- [`src/components/menuCanvas/AssetPicker.jsx`](../src/components/menuCanvas/AssetPicker.jsx):
  modal with drag-drop + click-to-upload + grid of prior uploads.
  Replaces the URL `prompt()` for image nodes.
- [`src/components/menuCanvas/ColorPicker.jsx`](../src/components/menuCanvas/ColorPicker.jsx):
  react-colorful popover. Real saturation/hue plane, hex paste field,
  outside-click close. Replaces every native `<input type="color">` in
  the editor (Windows native picker was unusable).

### Phase 4c.3 — catalog item picker
- [`src/components/menuCanvas/ItemPicker.jsx`](../src/components/menuCanvas/ItemPicker.jsx):
  modal browser. Search bar with case + accent-insensitive matching.
  Categories collapse by default; search auto-expands matching sections.
- Single item → one binding node. Whole category → one binding per
  item, stacked vertically (materialize-on-drop). The batch commits as
  a single history step.
- Properties panel shows current item by emoji + name, click to rebind.

### Phase 4c.3 polish — binding fidelity
- Editor preview (`BindingPlaceholder`) now mirrors public render:
  inline/stacked layout, fields array honored, background/stroke/radius/
  padding applied — what you see is what the customer sees.
- Public `ItemBindingView` also applies background/stroke/radius/padding.
- `BindingProps` gained Fondo / Borde / Grosor / Radio / Padding
  controls (in addition to the existing text controls).

### Phase 5 — polish (cross-cutting)
- Sidebar renamed "Menús" → "Menús Públicos" / "Public Menus" via new
  `admin.publicMenus` i18n key.
- Tab repositioned directly above Receipt Settings.
- `MenuShareCard` relocated from General Settings into MenusTab top.
- Per-menu deep-link block: inline 140 px QR, copy URL, 1024 px PNG
  download for printing.
- Schedule overlap warning (`ConflictBanner`).
- `image_url` self-heal embedded in install + SetupScreen so older
  installs don't hit "column does not exist" after a partial migration.
- Timezone picker in General Settings — defaults to the browser's
  resolved zone so schedules fire in the right wall clock without
  manual config.

---

## 5. `menus.data` payload by kind

```jsonc
// kind='live' — implicit catalog row
{ }   // empty; renderer reads categories from the envelope

// kind='pdf'
{
  "format": "pdf",
  "page_count": 5,
  "pages": ["https://.../page-1.webp?v=...", ...],
  "original_url": "https://.../original.pdf?v=..."
}

// kind='image'
{
  "format": "image",
  "page_count": 1,
  "pages": ["https://.../page-1.webp?v=..."]
}

// kind='designed' — template mode (Phase 4a/4b)
{
  "template": "list" | "cards" | "chalkboard",
  "category_names": ["Bebidas", "Postres"],     // empty/missing = all
  "accent_color": "#abc123",                    // legacy, still honored
  "theme": {
    "font_preset": "system" | "serif" | "display" | "mono" | "handwritten",
    "google_font_url": "https://fonts.googleapis.com/...",
    "background": "#0e1620",
    "text": "#f5f0e1",
    "accent": "#f28b05",
    "density": "compact" | "cozy" | "roomy"
  }
}

// kind='designed' — canvas mode (Phase 4c) — adds `document`:
{
  "theme": { /* same shape; future use for fallback fonts in editor */ },
  "document": {
    "version": 1,
    "page_size": { "w": 1920, "h": 1080 },
    "pages": [
      {
        "background": "#0e1620",
        "nodes": [
          {
            "id": "n_abc", "type": "text",
            "x": 80, "y": 60, "w": 1760, "h": 140, "rotation": 0, "z": 1,
            "text": "Jardín Oculto",
            "style": {
              "fontFamily": "Georgia, serif",
              "fontSize": 96, "fontWeight": 800,
              "color": "#f5f0e1", "align": "center"
            }
          },
          {
            "id": "n_def", "type": "shape", "shape": "rect",
            "x": 0, "y": 0, "w": 1920, "h": 220, "rotation": 0, "z": 0,
            "style": { "fill": "#1c2a3a", "stroke": "transparent",
                       "strokeWidth": 0, "borderRadius": 0 }
          },
          {
            "id": "n_ghi", "type": "image",
            "x": 200, "y": 280, "w": 600, "h": 400, "rotation": 0, "z": 1,
            "src": "https://.../canvas-assets/<menu_id>/<asset_id>.webp",
            "fit": "cover"
          },
          {
            "id": "n_jkl", "type": "item-binding",
            "x": 200, "y": 420, "w": 1520, "h": 160, "rotation": 0, "z": 2,
            "item_id": "espresso-doble",
            "fields": ["emoji", "name", "price"],
            "layout": "inline",
            "style": {
              "fontFamily": "Georgia, serif", "fontSize": 64,
              "fontWeight": 600, "color": "#f5f0e1", "align": "left",
              "fill": "rgba(0,0,0,0.25)", "stroke": "#f28b05",
              "strokeWidth": 2, "borderRadius": 12, "padding": 16
            }
          }
        ]
      }
    ]
  }
}
```

---

## 6. Invariants — do not break

These rules are load-bearing. Comments in the code reference them.

1. **Catalog bindings store only `{item_id, fields_shown[]}`** — never copy
   item name, price, emoji, or image into the document. The whole point
   of "live menu" vs Canva is that price edits propagate without
   re-saving the design.
2. **Schedule resolution runs in SQL.** TV mode and customer phone agree
   on which menu is current because both ask Postgres, not their own
   clocks.
3. **Resolver tie-break is `priority DESC, created_at DESC`.** Same
   priority → newer menu wins. The conflict banner surfaces same-priority
   overlaps in red so this isn't accidental.
4. **Inactive menus disappear from override links too** (`get_menu_by_id`
   refuses `is_active = false`). Pausing a menu is a single lever.
5. **Migration SQL lives in three places** — `db/migrations/*.sql`,
   `api/install.js`, `src/components/SetupScreen.jsx`. Every schema
   change touches all three.
6. **Anon's only door is the RPCs.** No `anon` RLS policies on the
   underlying menu tables. `get_active_menu` / `get_menu_by_id` are the
   sanitization surface.
7. **Materialize-on-drop is the binding model.** The *set of nodes* is
   fixed at design time. Renames and new catalog items don't auto-appear
   in canvas docs; the owner re-syncs manually. The data each existing
   node displays stays live.

---

## 7. Pending tasks (roadmap)

Tracked in `memory/project_tinymenu.md` plus the session task list.
Ordering follows the staged plan we agreed.

### Active path

#### Phase 4c.4 — out-of-stock toggle  *(next up)*
- Resolver returns per-item availability — likely a join against the
  inventory table for items with `linkedWarehouseId` / `linkedRecipeId`.
- New binding option `hide_when_out_of_stock` (default off).
- Editor toggle in `BindingProps`; public `ItemBindingView` and the
  template renderers honor it. Templates default to "true" because they
  show everything in a category.

#### Phase 4c.5 — print + page polish
- Page-size switcher in editor (16:9 ↔ 9:16, future A4/letter).
- Multi-page TV mode for canvas docs: one slide per page with the
  existing rotation/crossfade.
- `window.print()` button using CSS `@page` rules.

#### Phase 4c.6 — canvas templates  *(shipped)*
- The three Phase 4a layouts are now canvas starter-document factories
  in `src/utils/canvasDocument.js`: `templateListDoc`,
  `templateCardsDoc`, `templateChalkboardDoc`, plus a `templateDoc(id,
  ctx)` dispatcher keyed by the same `'list' | 'cards' | 'chalkboard'`
  ids `DesignedEditor` uses. Each takes the catalog
  (`[{ name, items: [{ id }] }]`, already filtered to the selected
  categories) and materializes one `item-binding` node per item —
  honoring materialize-on-drop: the node set is fixed at design time,
  but price/name/availability still resolve live by `item_id`.
- Lista & Pizarra share a vertical-flow engine (9:16, one category per
  page, overflow → continuation pages); Tarjetas is a 3-col card grid
  on 16:9. Each factory returns `{ document, theme }` and the seed
  writes `menu.data.theme` too (only if absent, so re-seeding never
  clobbers Estilo tweaks) to carry the visual identity across the
  template→canvas bridge.
- `CanvasBetaToggle` in `MenusTab.jsx` now offers "Crear lienzo desde
  «<template>»" (uses the currently-selected template + categories) and
  a "Lienzo en blanco" escape hatch (the old `sampleDocument`). The
  catalog is resolved by `buildTemplateCatalog()` from
  `menuData.categories`, threaded MenusTab → MenuCard → DesignedEditor.

### Editor polish — smart guides, rulers, snap, grid  *(shipped)*
- `computeSnap()` in `CanvasEditor.jsx` snaps a dragging node's
  edges/centers to the page edges/center and to every other node's
  edges/centers (threshold = 7 on-screen px ÷ stage scale). The match is
  surfaced as a pink guide `<Line>` in a non-listening overlay Layer.
  `handleDragMove` adjusts the konva node position imperatively (circles
  convert via center↔bbox); `onDragSettled` clears the guides on drop.
  Works because the `x`/`y` props stay at the old doc value during the
  drag, so react-konva never re-applies them mid-drag.
- Rulers: SVG `<Ruler>` gutters (top/left, `RULER`=22px) labelled in page
  px with a "nice" tick step (~80px on screen). The stage sits in a CSS
  grid next to them; grid is dropped entirely when rulers are off so the
  stage doesn't collapse into a 0px track.
- `<GridOverlay>`: faint 120px page-grid Layer, toggleable.
- Topbar toggles (magnet/ruler/grid icons) drive `snapEnabled`,
  `showRulers`, `showGrid`. Snap defaults on, rulers on, grid off.
- **Draggable ruler guides** (Figma/Photoshop-style): press a ruler and
  drag onto the canvas to create a guide (top ruler → horizontal, left →
  vertical); drag an existing guide to move it, or off-canvas to delete.
  Stored per-page on `page.guides = { v:[x…], h:[y…] }` (persisted in the
  document; public renderer ignores it). Drawn as a DOM overlay above the
  Konva stage (`<GuidesOverlay>`, cyan) so screen-space hit math stays
  simple under the stage scale; only thin grab strips capture pointer
  events. `activeGuide` state + `activePosRef` drive create/move/delete
  via window mouse listeners; `computeSnap` adds guide positions as node
  snap targets.

### Font picker — curated dropdown + Google Fonts override  *(shipped)*
- `src/utils/canvasFonts.js` — `CANVAS_FONTS` catalog (system stacks +
  Google families with weight tokens), `googleUrlForToken`,
  `fontIdForStack`, `parseGoogleFontUrl`.
- `<FontPicker>` in `CanvasEditor.jsx` replaces the free-text family
  input on text **and** binding nodes: a grouped `<select>` (Sistema /
  Google Fonts) plus a "Personalizado (enlace)…" option that reveals a
  Google Fonts URL field with a third-party-resource warning.
- Picking a Google family (or applying a valid link) calls
  `onSetFont(stack, url)` → `setNodeFont()`, which writes the node's
  `style.fontFamily` **and** registers the URL on `document.fonts` in a
  single commit (avoids the stale-closure clobber of two back-to-back
  doc mutations). The font then loads via the 4c.6 `syncDocFonts`
  pipeline; the editor's `fontEpoch` remounts the Konva text once the
  face is ready.

### Deferred / nice-to-have
- **Per-shop color library** — `posSettings.colorPalette = [{name, hex},
  ...]` swatches rendered above the wheel in `ColorPicker`. Cross-menu
  reuse. Cleanly scopes to a small follow-up after 4c lands.
- **Hard manual override radio** — single "Forzar este menú" radio
  across menus that pins one regardless of schedule. (Already discussed;
  decided to wait and see if real use makes the case.)
- **Live category-list binding** (auto-flow new items) — explicitly
  *rejected* in favor of materialize-on-drop. Revisit only if shops
  report friction.
- **Custom font upload + variable-axis controls** — Google Fonts URLs
  cover most cases.
- **Animation / video nodes** — out of scope; static prints are the
  product.
- **Component / template marketplace** — out of scope.
- **Bulk paste / CSV import** — admin catalog editor covers this need
  for now.

### Known small gaps in shipped code

- TV mode for `kind='designed'` with a canvas document falls through to
  template/blank rather than rotating canvas pages. Cleared by 4c.5.
- The pdf.js bundle adds ~420 KB to the precache total. Only loaded on
  upload, but admins with metered connections will feel it.
- Editor bundle adds ~350 KB gzipped to admin chunk; public renderer
  unaffected. Code-splitting the editor behind a dynamic import is a
  small win when the polish dust settles.
- Category bindings in templates are by **name** — renaming a category
  silently drops it from any designed menu's `category_names`. Switching
  to id-based bindings is a small follow-up if it bites.
- 4c.0 sample doc embed in `CanvasBetaToggle` is still labeled "beta".
  Once the editor is the primary entry point, the toggle copy should
  shift from "Activar con ejemplo" to a plain "Crear lienzo" with a
  blank doc default.

---

## 8. Sync-invariant checklist for future schema changes

Before merging any change that touches menu schema or RPCs:

- [ ] New `.sql` file added to `db/migrations/` with a header explaining
      why.
- [ ] Equivalent block appended to `api/install.js` (used on Update
      Schema).
- [ ] Equivalent block appended to `src/components/SetupScreen.jsx`
      (used on first install).
- [ ] If RPC signature changed, all three places GRANT to the right
      roles (typically `anon, authenticated`).
- [ ] If a column was added that an existing RPC references, include a
      self-healing `ALTER TABLE … ADD COLUMN IF NOT EXISTS …` at the top
      of the new install block so partial-migration installs heal.

See migration 015's `image_url` self-heal as the reference pattern.
