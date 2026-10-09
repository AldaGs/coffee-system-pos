# Online ordering (shareable order menu)

Customers order from a shared link, track the order live, and the shop receives it in the Register ticket area. Opt-in feature, off by default.

## Decisions

- **Two links**: `/menu` stays display-only (unchanged). `/order` uses the menu selected in Online Orders, with the existing cart and checkout.
- **Activation**: `advancedOnly` admin tab (same lock as other advanced features, `Admin.jsx` `isAdvancedMode`) + cloud mode required + its own `enabled` toggle. Off → `/order` shows "not accepting orders" and the RPC rejects.
- **Manual accept**: every order waits for staff Accept/Reject; the customer sees it.
- **Pickup** (phase 1) and **delivery** via tinylogistics (phase 2, opt-in under `onlineOrders.delivery`).
- **No customer accounts**: customer data is remembered in the customer's browser (localStorage). Shop side links orders to existing customers by phone.
- **Payment**: cash, card at pickup/delivery, and bank transfer remain available when configured. Shops configured for Clip can also offer online card payment after staff acceptance; canvas ordering reuses these existing choices.

## Selected menus and canvas ordering

In **Online Orders**, choose an active catalog or designed menu. This stores `onlineOrders.menuId`; it does not edit the menu document or the public display schedule. `/order` loads `get_order_menu()`. A `?m=` on an ordering link does not override the shop selection. `/menu` continues using the scheduled active menu or its explicit display pin.

An empty selection follows the currently active menu. If a selected menu is inactive or deleted, the existing server resolver also falls back to the active menu; deleting a selection does not close ordering. Older schemas missing `get_order_menu` retain the legacy active-menu fallback. Permission, network, and internal RPC failures display an error instead of silently changing the selection.

For a valid saved canvas document, customers start in **Design / Diseño**. Existing product fields (`item-binding.item_id`) become order buttons without resaving. They show current catalog values. Text, images, rectangles, and circles can receive an explicit **Acción de pedido** from the editor's existing product picker. Link, replace, or clear the product; only `order_item_id` is stored. Paths, lines, dates, and WhatsApp buttons do not receive this action. WhatsApp retains its external link.

An ordering action is separate from the stock visibility link (`link.itemId`). A visibility-only element stays decorative. The editor offers an explicit shortcut to use the visibility-linked product for ordering, and never converts an old visibility link automatically. Hidden nodes and stock-hidden nodes stay hidden. Visible actions for unavailable, deleted, filtered, or non-fixed-price products cannot activate.

Handwritten names and prices remain artwork: linking an action does not synchronize their content. The existing cart and modifier selector resolve the live product, price, and public modifiers. A plain product adds one unit; modifier-bearing products open the same option picker. Add, confirmation, restored drafts, and repeat-order paths enforce current catalog eligibility; confirmation also rechecks the current ordering gate.

**Catalog / Catálogo** offers larger controls and the same eligible products. Switching presentations preserves the cart and checkout. The selected public category whitelist is the ordering boundary, not the set of products painted on the canvas: leaving an eligible product off the artwork does not prohibit ordering it. Owners narrow eligibility with existing category selection.

Template-only designed menus keep the catalog presentation. Empty, unsupported-version, or structurally invalid documents use the catalog with an explanation. A valid design with no visible eligible actions starts in Catalog and offers Design for viewing. A render failure affects only artwork; the catalog and cart remain available. Closed/paused/disabled shops keep artwork visible with actions disabled. Public display, editor preview, TV, and print remain read-only. PDF/image menus are excluded from the Online Orders selector; clickable PDF regions are outside this implementation.

Submission still uses `public_place_order`: no artwork text, copied price, or new cart payload fields are submitted. The server validates availability, public/category filters and modifiers and computes prices. A schedule, selection, or catalog change may make an open session stale; submission rejection keeps the cart editable and tells the customer to refresh/review. This feature adds no background selection switch, schema migration, document version bump, or second checkout flow.

## Customer status timeline

| Status | Set by |
|---|---|
| `requested` | customer submits |
| `accepted` / `rejected` (+reason) | staff in Register |
| `preparing` | sent to KDS, or manual button |
| `ready` | KDS ready, or manual button |
| `on_delivery` | delivery orders only; derived server-side by `get_order_status` when the linked `order_fulfillment.status` is `in_transit` |
| `completed` | ticket charged/closed |

## Phase 1 steps

### 1. Schema
- Table `online_orders`: `id`, `token` (random, unguessable), `status`, `reject_reason`, `customer_name`, `phone`, `notes`, `pickup_at`, `items jsonb` (server-priced), `total`, `active_ticket_id`, `created_at`, `updated_at`. RLS: authenticated (hardware) all; **no anon access**.
- `public_place_order(payload jsonb) → token`: SECURITY DEFINER; checks setting enabled/not paused/schedule; reprices from `menu_items` (ignores client prices, rejects hidden/unavailable items); `rate_limit_hit`.
- `get_order_status(token) → jsonb`: status, reason, items, total, created_at. Anon-callable, token only.
- Staff transitions via normal authenticated updates.
- Added in **both** `api/install.js` and `SetupScreen.jsx`, plus `api/_schemaDeltas.js` for existing installs.
- Settings stored where `public_place_order` can read them (server side), synced via `posSettings` for the UI.

### 2. Admin
- Online Orders section (advancedOnly): enable, pause, schedule (reuse `schedule_matches`).
- `MenuShareCard`: second QR/link for `/order` when enabled.

### 3. Customer page
- `/order`: menu from `get_order_menu`, cart, checkout (name, phone, notes, optional pickup time).
- Remember name/phone and past orders in localStorage; "Repeat last order"; "forget my data".
- `/order/track/<token>`: polls `get_order_status`, shows timeline.

### 4. Register inbox
- Realtime on `online_orders`; badge + sound for `requested`.
- Accept → creates `active_tickets` row, links `active_ticket_id`, status `accepted`. Reject with reason.
- Preparing/Ready: from KDS (`order_fulfillment.status`) or manual buttons. Ticket close → `completed`.
- Match phone to existing customer for loyalty.

## Phase 2: delivery (done, schema 2.0)

- **Settings**: `posSettings.onlineOrders.delivery = { enabled, feeCents }` (admin tab). `public_place_order({check:true})` returns `'open'`, or `'open:<feeCents>'` when delivery is offered; the page uses that to show the pickup/delivery toggle.
- **Schema 2.0**: `online_orders` + `order_type` ('pickup'|'delivery'), `delivery_address`, `delivery_fee_cents`, `order_num`; `order_fulfillment` + `delivery_address`, `delivery_notes` (IF NOT EXISTS, same columns tinylogistics uses). `public_place_order` accepts `order_type` + `address`, rejects delivery when disabled or address missing, adds the server-side fee to `total_cents`. `get_order_status` also returns `order_type`, `order_num`, `delivery_fee_cents`, and for delivery orders maps fulfillment `in_transit` -> `on_delivery` and `completed` -> `completed` (so it works with the Register closed). Anon lockdown unchanged.
- **/order**: pickup/delivery toggle (only when offered), address remembered in localStorage (cleared by "forget my data"), fee in totals, "Order #N" and the `on_delivery` step on the tracker for delivery orders.
- **Register**: accept stores `order_num`; the fee becomes a ticket line (`id: online-delivery-fee`, untaxed, no inventory link). Inbox shows type + address and a "Send to logistics" button for delivery orders: updates the existing `order_fulfillment` row (ticket already sent to KDS) with address + notes + phone, else inserts it (and marks the ticket `kds_sent`).
- **Not done**: Register inbox does not mirror `in_transit` into `online_orders.status` (customer view is derived server-side); customer accounts remain out of scope; the later Clip integration supplies configured online card payment.

## Delivery areas and optional shipping (schema 3.2)

- **Customer map (schema 3.3):** `get_order_menu().shop.deliveryAreas` publishes only enabled local area names, geometry, prices, and priority for the coverage overlay and legend. The map fits those areas on first load unless the customer already has a pin; later panning or pin selection is not reset. This is a visual guide: `get_delivery_quote` and `public_place_order` still calculate the authoritative price from the exact pin.
- `onlineOrders.delivery.areas` holds any number of enabled named areas. Each has its own fee and priority, with either a map center plus radius in kilometers or polygon vertices `[longitude, latitude]`. The highest priority matching area wins; saved order breaks ties. Edges count as inside. The server resolves the confirmed entrance pin and fee in `get_delivery_quote` and again in `public_place_order`; client prices are ignored. Checkout sends the quote the customer saw, and the server rejects a changed area, fee or shipping method so the customer can review it again.
- Existing `delivery.feeCents` is retained in settings for migration safety but does not authorize any address. Administrators must draw or set at least one area. Without a matching area, the address is unavailable unless the separate `shippingEnabled` switch is on (default off). Pickup remains available.
- When outside-area shipping is enabled, the order begins at `quote_pending` with a product subtotal and **no final shipping price**. Staff contact the customer, enter an agreed price (including zero if intentionally agreed), and confirm the agreement. `set_shipping_quote` records actor, time, old and new prices; it moves the order to `requested` so staff can accept it. The quote can be revised on an open order, updating the linked cloud ticket line and tracker total atomically. Shipping orders are never handed to local logistics automatically.
- The area name, kind, and fee are saved on the order as `delivery_area`, so later configuration changes do not reprice it. `shipping_quote_history` preserves every confirmed revision. The customer must place a map pin for any address order; editing the address clears its previous pin.

## Delivery map pin (schema 2.2)

- **Schema 2.2**: `online_orders` and `order_fulfillment` + `delivery_lat`, `delivery_lng` (double precision, IF NOT EXISTS). `public_place_order` reads optional `payload.lat/lng` for delivery orders; non-numeric, out-of-range (-90..90, -180..180) or half-present values are stored as NULL (never an error).
- **/order**: for delivery only, `PinMap.jsx` (MapLibre GL + OpenFreeMap vector tiles, no API keys; the `bright` style is fetched and its paint colors patched toward Google Maps' palette, attribution control shown) is lazy-loaded (`React.lazy`, so MapLibre and its CSS stay out of the menu bundle). "Use my location" (geolocation, on button press), tap map / drag marker, and "Search address" (Nominatim, button press only, one request). Default view: saved pin, else Puebla zoomed out. The pin is optional; the address text is still required. Saved in the same localStorage entry as the address (cleared by "forget my data").
- **Register**: `sendOrderToLogistics` copies `delivery_lat/lng`; the inbox shows a "Map" link (`google.com/maps?q=lat,lng`).
- **tinylogistics**: Navigate buttons (Google Maps / Waze) from the coords, or Google Maps by address text when no pin; hidden behind the same PIN gate as the address.

## Fixes and showcase (schema 2.3)

- **Pin icon**: `PinMap` builds an explicit `L.icon` (bundled PNGs, inlined as data URIs by Vite) instead of `L.Icon.Default`, whose auto-detected imagePath broke bundled URLs.
- **Address search**: Nominatim with `countrycodes=mx`, a `bounded=1` viewbox of about 0.15 degrees around the map center, abbreviations expanded (Nte./Pte./Ote./Av., "37B" to "37 B"). No hit retries without the trailing house number and shows "Street found, drag the pin to your exact door". "Use my location" says HTTPS is required when `!isSecureContext` and distinguishes permission denied.
- **Delivery to logistics is automatic**: accepting a delivery order calls `sendOrderToLogistics` (inserts the `order_fulfillment` row with address, notes + phone, lat/lng). The ticket is created with `kds_sent: true` so KDS immediate mode cannot add a second row; the manual "Send to logistics" button is gone. Remaining race: a failed logistics insert rolls `kds_sent` back locally only; the cloud ticket flag stays true until the next KDS send/edit.
- **Voids**: `clearCurrentTicket` (useTickets) is the single non-checkout removal path and calls `cancelTicketEverywhere`; checkout passes `{ sold: true }` and completes the order itself. Fully refunding a sale in Orders marks the linked online order (via `sales.ticket_id`) rejected, reason "refunded" (`rejectOnlineOrderForRefund`). Remote DELETE events from other stations do not cancel (the originating station already did).
- **Public menu whitelist**: `/order` applies `menu.data.category_names` like `/menu`; `public_place_order` rejects (`item_unavailable`) items whose category is outside a non-empty whitelist, reading it from `get_order_menu()`.
- **Tracking showcase**: Online Orders tab, "Show products on the tracking screen": `posSettings.onlineOrders.trackShowcase = { mode: off|all|categories|items, categories:[names], items:[ids] }`. Exposed as `shop.showcase` in `get_active_menu`, not `get_order_status`: Track already fetches the menu once, while the status RPC is polled every 8 s. Track shows "You might also like" (available, fixed-price, public, whitelist-respecting items, max 12); tapping one adds it to the `tinypos_order_draft` cart and opens `/order`.

## Time slots (schema 2.4, opt-in since 2.5)
- **Settings**: `posSettings.onlineOrders.slots = { enabled: false (default; rules apply only when true), interval: 15|30|60 (default 30), daysAhead: 0-14 (3), leadMinutes (30), hours: { days, start, end } | null }`. `hours: null` = same as the ordering `schedule`; with no hours anywhere slots run 09:00-21:00 every day (a schedule with days but no times keeps its days and uses 09:00-21:00). Admin: Online orders > "Delivery/pickup times".
- **Public page**: `get_active_menu` shop block carries `slots` and `schedule` (read once at load, not by the 8s poll). `SlotPicker` in `PublicOrder.jsx` opens a native `<input type="datetime-local">` (via `showPicker()`, input visually hidden). The value is wall-clock in `shop.timezone` and converted with `pickupSlots.js` (`toLocalInput`/`fromLocalInput`); `pickup_at` is still sent as an ISO instant. Always `min` = now (no past). With `slots.enabled`: `min` = now + lead, `max` = now + daysAhead, `step` = interval, and the pick is re-validated with `slotValid` (days/hours/interval); an invalid pick is rejected with a hint message. Optional: empty = as soon as possible.
- **Server**: `public_place_order` always rejects `pickup_at` (`invalid_pickup`) if it is < now - 5 min or > now + 14 days. Only when `slots.enabled` it also requires >= now + lead - 5 min, <= now + daysAhead days, matching configured days/hours (`schedule_matches`, shop tz) and interval alignment.

## Payment method (schema 2.6)
- **Settings**: `posSettings.onlineOrders.payments = { methods: ['cash','card','transfer'], transferInfo: '' }` (default all three; at least one). Admin: Online orders > "Payment methods" (transfer details textarea appears when transfer is offered).
- **Server**: `online_orders.payment_method` (CHECK cash/card/transfer, NULL on old rows). `public_place_order` requires `payload.payment_method` to be one of the offered methods (no config = all three) else `invalid_payment`. `get_order_status` returns `payment_method`; `get_active_menu` shop block carries `payments` (read once at load; the tracker takes `transferInfo` from `get_order_menu`, not the 8s poll).
- **Page**: required segmented choice (banknote / credit-card / landmark icons) saved in the draft; transfer shows `transferInfo`; the pay-at-pickup line is method-aware; tracker shows the method (+ transfer details).
- **Shop**: inbox card shows the method; the accepted ticket name gets ` · Efectivo|Tarjeta|Transferencia`; `sendOrderToLogistics` adds `Pago: <método>` to `delivery_notes`. The Register checkout modal is not pre-selected (its buttons are one-shot actions with no method state).

## Cash "pays with" + ASAP outside delivery hours (schema 2.7)
- **Cash amount**: with cash selected the checkout shows an optional "¿Con cuánto pagas?" input (chips: exact + up to 3 round bills above the total) and live "Cambio". Must be >= grand total (<= total + $1,000), else inline error; kept in the draft. `online_orders.cash_amount_cents` (int NULL); `public_place_order` takes `cash_amount_cents` only for `payment_method='cash'`, validates against the server-computed total incl. delivery fee, else `invalid_cash`. `get_order_status` returns it. Shown in the inbox card, the tracker, the ticket name (` · Efectivo $500`) and logistics `delivery_notes` (`Pago: Efectivo, paga con $500, cambio $X`).
- **Store hours vs delivery/pickup hours** (schema 2.9) are separate: `onlineOrders.openHours` gates ordering; `onlineOrders.schedule` and `slots.hours` only drive delivery/pickup times (precedence slots.hours, schedule, 09:00-21:00). With `slots.enabled`, "Lo antes posible" is offered only if a slot opens within lead+interval minutes (`asapOk` in `pickupSlots.js`); otherwise the picker preselects `firstSlot` (scans `daysAhead` days) with a "no more deliveries/pickups today: scheduled for ..." note, and the clear button is hidden. Server: `slots.enabled` + no `pickup_at` while now is outside the slot hours/days raises `pickup_required`. Admin shows a help line in the Delivery/pickup times section.


## Privacy notice + terms (schema 2.8)
- **Settings**: `posSettings.legal = { businessName, address, contact, privacy, terms }`, edited in Online orders > "Aviso de privacidad y términos" (`admin/LegalSection.jsx`); "Usar plantilla" fills Spanish starter text from `utils/legalTemplates.js` (reference only, not legal advice).
- **Public**: `get_legal()` (SECURITY DEFINER, anon+authenticated) returns only those five fields. `LegalLinks.jsx` fetches it lazily on first click and shows the text in a modal; links appear in the /order menu footer, under the checkout send button, the Track footer and /cfdi (privacy only).

## Store hours (schema 2.9)

- `posSettings.onlineOrders.openHours = { always, rules: [{ days: bitmask (mon = bit 0, 0 = every day), start, end }] }`. Open = `always` or any rule matches now in the shop timezone (overnight windows wrap, via `schedule_matches`). Absent = always open. Several rules give different hours per day.
- The 2.9 delta copies an existing `schedule` object into `openHours = { always: false, rules: [schedule] }` (only when openHours is absent; idempotent), so nobody's ordering hours change.
- `public_place_order` raises `online_orders_closed` outside openHours; `get_active_menu` shop block adds `open_hours`.
- `/order` when the probe says closed/paused/disabled: the menu renders read-only (no Add/cart/checkout) under a banner; closed shows the next opening (`nextOpening`) and the hours by day (`formatHours`), computed in the shop timezone (`pickupSlots.js`). The probe is re-run every 60 s, so the page unlocks without a reload.
