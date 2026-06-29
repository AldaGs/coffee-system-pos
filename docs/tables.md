# Tables / Floor-plan system — design & plan

Status: **in progress** on branch `feat/tables-system` (started June 2026).
Phase 1 (data layer) ✅ and Phase 2 (builder) ✅ complete; Phase 3 next.

## 1. Goal

Introduce a third register layout — **tables** — alongside the existing `cafe`
and `orders` layouts. It tracks ticket orders against a visual **floor plan**
of the venue, the way full-service POS systems do. Admins build the floor in a
drag-and-drop editor (table name/number, expected seats, shape, position); the
register renders that floor live with per-table status, and each table can hold
**multiple open tickets** (split checks / multiple parties).

## 2. Decisions locked for v1

| Question | Decision |
|----------|----------|
| Builder type | **Visual floor map** (drag tables on a canvas) |
| Tickets per table | **Multiple** concurrent tickets per table |
| Per-seat item tracking | **Deferred** to a later phase |
| Where table defs live | **Cloud-shared** (Supabase + Dexie mirror), NOT localStorage |
| Layout selection | Stays **device-local** (`tinypos_layout_mode`) |

## 3. How it fits the existing architecture

- **Layout mode** is device-local in `localStorage` key `tinypos_layout_mode`
  (`cafe` | `orders` → add `tables`). Set in
  [`GeneralSettingsTab.jsx`](../src/components/admin/GeneralSettingsTab.jsx)
  (~line 904), consumed in [`Register.jsx`](../src/Register.jsx) (~line 74 /
  897) to choose `CafeLayout` vs `OrderFlowLayout` → add `FloorLayout`.
- **Tickets** are the order unit: Dexie `active_tickets` mirrored to Supabase
  `active_tickets`, with offline queueing via `pushActiveTicketUpdate`
  ([`useTickets.js`](../src/hooks/useTickets.js)). One shared cart driven by
  `activeTicketId`. Tables mode **reuses this whole pipeline** — a table is just
  configuration the ticket points at.
- **Canvas engine**: the floor editor reuses the `react-konva` stack already
  powering [`CanvasEditor.jsx`](../src/components/menuCanvas/CanvasEditor.jsx)
  (Stage/Layer/shapes, transformer, drag/resize/rotate, snap-to-guide,
  undo/redo). Node type is a fixed "table" instead of text/image/binding.

## 4. Data model

- **`active_tickets`** gains two additive fields (no migration of existing rows
  needed — Dexie rows are schemaless; null `table_id` = existing cafe/orders
  tickets, untouched):
  - `table_id` — nullable FK to a table (indexed in Dexie v14).
  - `seats` — per-ticket cover count, defaults from the table's
    `expectedSeats`, overridable on open (extra chair).
- **`floor_plan`** (Dexie v14 store `floor_plan: 'id, zone, sort_order'`): one
  row per saved floor/zone, holds `data.document` (canvas doc of table nodes) +
  metadata. Cloud is source of truth for cloud installs; local mode uses Dexie.
- **`tables`** (Dexie v14 store `tables: 'id, floor_id, zone, number'`):
  normalized per-table rows derived from the floor doc, for fast runtime status
  queries: `{ id, floor_id, number, name, zone, expectedSeats, shape, x, y, w,
  h, rotation }`. Client-generated UUID ids (collision-safe on migration).

## 5. Table status lifecycle (runtime, derived)

`available → occupied → ordered → bill-requested → paying → needs-cleaning →
available`. Status is **derived** from the table's open tickets where possible
(0 tickets = available; ≥1 with items = ordered, etc.); explicit states
(needs-cleaning, bill-requested) stored on the ticket/table as needed. Floor
view is color-coded by status. Surface time-seated and open total per table.

## 6. Phased plan

1. **Data layer** — Dexie v14 (`floor_plan`, `tables`, `active_tickets.table_id`
   index); `api/tables` module mirroring `api/menus`; Supabase tables. ← current
2. **Builder** ✅ — `TablesTab.jsx` (sibling of `MenusTab`, registered in Admin
   nav under `admin.tables`, advancedOnly) lists floors (create/rename/delete);
   `floor/FloorEditor.jsx` is a dedicated react-konva editor with one node type
   (table): add round/square/rect, drag/resize/rotate, edit number/name/seats/
   shape, undo/redo, duplicate-number guard, saves to `floor_plan.data.document`.
   Floor doc schema in `utils/floorDocument.js` (`{ version, size, tables[] }`).
3. **Layout plumbing** — `tables` radio in GeneralSettings; `FloorLayout` branch
   in Register.
4. **Runtime floor** — `FloorLayout.jsx`: live status map; tap table → its
   ticket list → reuse OrderFlow ticket→content→menu flow; `handleNewTicket`
   accepts `table_id` + seats override; free table on last ticket close
   (`onAfterCheckout`).
5. **Concurrency** — Supabase realtime on `active_tickets`; soft occupied lock.

## 7. Deferred (post-v1)

Per-seat item assignment, table transfer/merge, reservations, time-seated
alerts, multi-room navigation polish.

## 8. Permissions

Admin edits the floor. Cashier opens/closes tickets; transfer/merge and freeing
an occupied table may require a manager override (existing
`consumePendingAuthorizer` void-gate pattern).
