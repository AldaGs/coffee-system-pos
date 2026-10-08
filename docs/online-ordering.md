# Online ordering (shareable order menu)

Customers order from a shared link, track the order live, and the shop receives it in the Register ticket area. Opt-in feature, off by default.

## Decisions

- **Two links**: `/menu` stays display-only (unchanged). `/order` is the same menu + cart.
- **Activation**: `advancedOnly` admin tab (same lock as other advanced features, `Admin.jsx` `isAdvancedMode`) + cloud mode required + its own `enabled` toggle. Off → `/order` shows "not accepting orders" and the RPC rejects.
- **Manual accept**: every order waits for staff Accept/Reject; the customer sees it.
- **Pickup** (phase 1) and **delivery** via tinylogistics (phase 2, opt-in under `onlineOrders.delivery`).
- **No customer accounts**: customer data is remembered in the customer's browser (localStorage). Shop side links orders to existing customers by phone.
- **No online payment**: pay at pickup.

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
- `/order`: menu from `get_public_menu`, cart, checkout (name, phone, notes, optional pickup time).
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
- **Not done**: Register inbox does not mirror `in_transit` into `online_orders.status` (customer view is derived server-side); online payment and customer accounts remain out of scope.

## Delivery map pin (schema 2.2)

- **Schema 2.2**: `online_orders` and `order_fulfillment` + `delivery_lat`, `delivery_lng` (double precision, IF NOT EXISTS). `public_place_order` reads optional `payload.lat/lng` for delivery orders; non-numeric, out-of-range (-90..90, -180..180) or half-present values are stored as NULL (never an error).
- **/order**: for delivery only, `PinMap.jsx` (Leaflet + OpenStreetMap tiles, no API keys) is lazy-loaded (`React.lazy`, so Leaflet and its CSS stay out of the menu bundle). "Use my location" (geolocation, on button press), tap map / drag marker, and "Search address" (Nominatim, button press only, one request). Default view: saved pin, else Mexico City zoomed out. The pin is optional; the address text is still required. Saved in the same localStorage entry as the address (cleared by "forget my data").
- **Register**: `sendOrderToLogistics` copies `delivery_lat/lng`; the inbox shows a "Map" link (`google.com/maps?q=lat,lng`).
- **tinylogistics**: Navigate buttons (Google Maps / Waze) from the coords, or Google Maps by address text when no pin; hidden behind the same PIN gate as the address.

## Fixes and showcase (schema 2.3)

- **Pin icon**: `PinMap` builds an explicit `L.icon` (bundled PNGs, inlined as data URIs by Vite) instead of `L.Icon.Default`, whose auto-detected imagePath broke bundled URLs.
- **Address search**: Nominatim with `countrycodes=mx`, a `bounded=1` viewbox of about 0.15 degrees around the map center, abbreviations expanded (Nte./Pte./Ote./Av., "37B" to "37 B"). No hit retries without the trailing house number and shows "Street found, drag the pin to your exact door". "Use my location" says HTTPS is required when `!isSecureContext` and distinguishes permission denied.
- **Delivery to logistics is automatic**: accepting a delivery order calls `sendOrderToLogistics` (inserts the `order_fulfillment` row with address, notes + phone, lat/lng). The ticket is created with `kds_sent: true` so KDS immediate mode cannot add a second row; the manual "Send to logistics" button is gone. Remaining race: a failed logistics insert rolls `kds_sent` back locally only; the cloud ticket flag stays true until the next KDS send/edit.
- **Voids**: `clearCurrentTicket` (useTickets) is the single non-checkout removal path and calls `cancelTicketEverywhere`; checkout passes `{ sold: true }` and completes the order itself. Fully refunding a sale in Orders marks the linked online order (via `sales.ticket_id`) rejected, reason "refunded" (`rejectOnlineOrderForRefund`). Remote DELETE events from other stations do not cancel (the originating station already did).
- **Public menu whitelist**: `/order` applies `menu.data.category_names` like `/menu`; `public_place_order` rejects (`item_unavailable`) items whose category is outside a non-empty whitelist, reading it from `get_active_menu(now())`.
- **Tracking showcase**: Online Orders tab, "Show products on the tracking screen": `posSettings.onlineOrders.trackShowcase = { mode: off|all|categories|items, categories:[names], items:[ids] }`. Exposed as `shop.showcase` in `get_active_menu`, not `get_order_status`: Track already fetches the menu once, while the status RPC is polled every 8 s. Track shows "You might also like" (available, fixed-price, public, whitelist-respecting items, max 12); tapping one adds it to the `tinypos_order_draft` cart and opens `/order`.
