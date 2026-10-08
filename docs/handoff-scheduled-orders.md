# Handoff (tinypos): pass scheduled time to the kitchen/logistics record

## Problem
Online orders can be scheduled (`online_orders.pickup_at`, timestamptz — used for both pickup and delivery time).
When staff accept, a row is written to the shared `order_fulfillment` table (read by tinykds + tinylogistics),
but `pickup_at` is never copied. So KDS/logistics see a Thursday order as "now".

## Do
1. Every place tinypos writes `order_fulfillment` for a ticket linked to an online order, set
   `delivery_date = online_orders.pickup_at` (column already exists, from tinylogistics `0001_logistics_core.sql`;
   tinylogistics' tracking RPC already exposes it).
   - `src/services/onlineOrders.js` → `sendOrderToLogistics` (`patch` object): add `delivery_date: order.pickup_at ?? null`.
   - `src/Register.jsx` → `handleSendToKds` insert: if the ticket has a linked online order, include its `pickup_at`.
     (Find the link via `online_orders.active_ticket_id = ticket.id`.)
   - Check whether a DB trigger in tinylogistics migrations (`0005_fulfillment_tracking_statuses.sql`) inserts
     rows on `active_tickets` insert; if so, the update path in `sendOrderToLogistics` covers it, but verify pickup orders too.
2. `delivery_date` must exist on installs without tinylogistics: add
   `ALTER TABLE public.order_fulfillment ADD COLUMN IF NOT EXISTS delivery_date timestamptz;`
   as a new schema delta (next version after 2.9) in BOTH `api/install.js` and `src/components/SetupScreen.jsx`,
   plus `api/_schemaDeltas.js` (`VERSION_ORDER`) and `src/utils/schemaVersion.js`.
3. ASAP orders: leave `delivery_date` null (null = "now").

## Verify
Place a scheduled order on `/order`, accept in Register, then
`select delivery_date from order_fulfillment where active_ticket_id = <id>` equals `online_orders.pickup_at`.
Commit straight to main.
