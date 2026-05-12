# ☕ tinypos: BYOS Coffee System

[![Version](https://img.shields.io/badge/version-1.2.0-blue.svg)](https://github.com/aldair/tinypos)
[![React](https://img.shields.io/badge/frontend-React_19-61dafb.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/build-Vite_8-646cff.svg)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/cloud-Supabase-3ecf8e.svg)](https://supabase.com/)
[![Vitest](https://img.shields.io/badge/testing-Vitest-yellow.svg)](https://vitest.dev/)
[![PWA](https://img.shields.io/badge/mobile-PWA_Ready-orange.svg)](https://web.dev/progressive-web-apps/)

**TinyPOS** is a professional, offline-first Point of Sale system specifically engineered for artisanal coffee shops and high-volume cafes. This directory contains the primary React-based frontend application and the administrative dashboard.

---

## 🚀 Architectural Philosophy

TinyPOS is built on a **Resilient Reactive Architecture**:
1.  **Local (Dexie.js):** Every transaction, inventory change, and setting is stored in the browser's IndexedDB. This ensures zero latency during rush hour and 100% uptime during internet outages.
2.  **Global State (Zustand):** High-performance, atomic state management for menu data, authentication, and the shopping cart.
3.  **Cloud (Supabase Realtime):** Automatic background synchronization via a dedicated `syncService`. Multi-terminal support and remote administration are handled with low-latency WebSocket channels.

---

## ✨ Core Functionalities

### 🛒 High-Velocity Register
*   **Fast-Paced Workflow:** Optimized for baristas to handle long lines with minimal taps.
*   **Complex Modifiers:** Support for nested options, price add-ons (extra shots, milk swaps), and custom text inputs.
*   **Expense Tracking:** Log daily business expenses (milk runs, cleaning supplies) directly from the POS interface.
*   **Dynamic Discounts:** Apply pre-configured percentage or flat-rate rules with PIN-protected authorization.
*   **Real-Time Sync Status:** A visual indicator ensures you always know if your data is safely backed up to the cloud.
*   **Localization:** Native support for **English** and **Spanish** across all interfaces.

### 📈 Intelligent Admin Dashboard
*   **Precision Analytics:** Monitor Gross Revenue, Net Profit, Refunds, and Payment Methods.
*   **Inventory & "The Roaster":**
    *   Track raw materials with precise unit management.
    *   **Transformation Engine:** Convert green stock into finished goods with shrinkage and cost-per-gram calculation.
*   **Recipe Builder (COGS Engine):**
    *   Link menu items to complex inventory recipes.
    *   **Profit Engine:** Set target margins and see recommended selling prices based on live inventory costs.
*   **Activity Audit Trail:** Full audit log of all cashier actions (sales, refunds, menu changes, cortes).

### 📱 Loyalty & Engagement
*   **Loyalty 2.0:** Track customer visits by phone number. Automatically trigger rewards for specific items or entire orders based on visit counts.
*   **WhatsApp Digital Receipts:** Send tickets directly to customers via WhatsApp—no paper needed.
*   **PNG Export:** Save ticket images for sharing or archiving.

### 🧾 Enterprise Printing & Compliance
*   **Print Bridge Integration:** Dedicated interface for local thermal printers (80mm/58mm).
*   **SAT/Tax Engine:** Configurable IVA extraction for Mexican compliance.
*   **Custom Branding:** Inject Base64 logos and custom header/footer messages into thermal receipts.

### 🔐 Security
*   **Hashed PIN Storage:** Cashier PINs are stored as bcrypt hashes via `pgcrypto` — never in plaintext.
*   **Server-Side Verification:** PIN checks run through a Supabase RPC (`verify_pin`), keeping secrets off the client.
*   **Row Level Security:** All tables enforce RLS policies scoped to `authenticated` users only.

---

## 🛠️ Tech Stack
*   **Framework:** React 19 + Vite 8
*   **State Management:** Zustand (with immer middleware)
*   **Database:** Dexie.js (Local) + Supabase (Cloud Sync)
*   **Testing:** Vitest (Core math & POS logic)
*   **Deployment:** Vercel (Serverless Functions + SPA)

---

## ⚙️ Automated Database Installation

TinyPOS features a **One-Click Installation** API for Supabase. 

1.  **Endpoint:** `/api/install` (POST)
2.  **Payload:**
    ```json
    {
      "connectionString": "postgresql://postgres:[PASSWORD]@db.[PROJECT-ID].supabase.co:5432/postgres"
    }
    ```
3.  **Action:** This will automatically:
    *   Create all tables (including `cashier_pins` for secure PIN storage)
    *   Create RPC functions (`verify_pin`, `deduct_inventory`)
    *   Seed initial settings and default Admin PIN (`1234`)
    *   Enable **Row Level Security (RLS)** policies scoped to `authenticated`
4.  **Prerequisite:** Before the device can sync, create at least one Supabase Auth user (**Authentication → Users → Add user** in the Supabase dashboard). The Device Authorization screen will sign in with these credentials on first boot.

---

## 🗄️ Supabase Database Schema (Manual Setup)

If you prefer manual setup:

1.  **Create a hardware Auth user.** In your Supabase project, go to **Authentication → Users → Add user** and create one (e.g. `register@yourshop.com`). The Device Authorization screen on first boot will sign in with these credentials. RLS policies below are scoped to `authenticated`, so the device cannot read or write any data until this sign-in completes — the public anon key alone is not sufficient.
2.  **Run the SQL below** in your Supabase SQL Editor. Note the use of `BY DEFAULT AS IDENTITY` for easier terminal synchronization.
3.  **Existing installs:** Apply the migrations in `db/migrations/` in order to upgrade your schema.

```sql
-- 0. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. TABLES

-- Shop Settings
CREATE TABLE IF NOT EXISTS public.shop_settings (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  menu_data jsonb
);

-- Active Tickets (Real-time synchronization)
CREATE TABLE IF NOT EXISTS public.active_tickets (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name text,
  items jsonb,
  cashier_id bigint,
  created_at timestamp with time zone DEFAULT now(),
  discount jsonb,
  savedSplitPayments jsonb,
  savedPaidProductIds jsonb,
  savedSplitMode text,
  savedNWays bigint,
  last_modified_by text,
  loyalty_phone text,
  loyalty_stars_pending integer DEFAULT 0
);

-- Customer Loyalty
CREATE TABLE IF NOT EXISTS public.customers (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  phone character varying NOT NULL UNIQUE,
  visits bigint NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone
);

-- Expenses
CREATE TABLE IF NOT EXISTS public.expenses (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  amount numeric NOT NULL, 
  reason text,
  category text DEFAULT 'General',
  cashier_name text,
  local_id uuid UNIQUE,
  created_at timestamp with time zone DEFAULT now()
);

-- Inventory
CREATE TABLE IF NOT EXISTS public.inventory (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name text NOT NULL UNIQUE,
  current_stock numeric DEFAULT 0,
  unit text,
  unit_cost numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- Inventory Logs
CREATE TABLE IF NOT EXISTS public.inventory_logs (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  item_name text NOT NULL,
  qty_deducted numeric NOT NULL,
  deduction_type text NOT NULL,
  ticket_id text,
  unit_cost numeric DEFAULT 0,
  local_id uuid UNIQUE,
  created_at timestamp with time zone DEFAULT now()
);

-- Activity Logs (Audit Trail)
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT now(),
  cashier_name text,
  action_type text,
  description text,
  metadata jsonb
);

-- Recipes & COGS
CREATE TABLE IF NOT EXISTS public.recipes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  linked_menu_item text,
  target_margin numeric DEFAULT 25.0,
  custom_price numeric,
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Sales History
CREATE TABLE IF NOT EXISTS public.sales (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  total_amount numeric,
  payment_method text,
  items_sold jsonb,
  cashier_name text,
  status text DEFAULT 'paid',
  order_name text,
  refund_amount numeric DEFAULT 0,
  tip_amount numeric DEFAULT 0,
  splits jsonb,
  items jsonb,
  discount jsonb,
  local_id uuid UNIQUE,
  ticket_id text,
  loyalty_phone text,
  loyalty_stars_awarded integer DEFAULT 0,
  loyalty_stars_redeemed integer DEFAULT 0,
  loyalty_program_type text
);

-- Secure PIN Storage
CREATE TABLE IF NOT EXISTS public.cashier_pins (
  cashier_id bigint PRIMARY KEY,
  pin_hash text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- 2. REFUND SAFETY
ALTER TABLE public.sales ADD CONSTRAINT refund_limit_check CHECK (refund_amount <= total_amount);

-- 3. RPC FUNCTIONS

-- Secure PIN verification
CREATE OR REPLACE FUNCTION verify_pin(p_cashier_id BIGINT, p_pin TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_hash TEXT;
BEGIN
    SELECT pin_hash INTO v_hash FROM public.cashier_pins WHERE cashier_id = p_cashier_id;
    IF v_hash IS NULL THEN RETURN FALSE; END IF;
    RETURN v_hash = crypt(p_pin, v_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Loyalty trigger: fires AFTER INSERT on sales (exactly once per sale).
-- Idempotent: sales upserts use onConflict: local_id, so retries don't re-fire triggers.
-- Behavior:
--   1. Accrues  customers.visits += loyalty_stars_awarded.
--   2. Redeems  customers.visits -= loyalty_stars_redeemed (net = awarded - redeemed, floor 0).
--   3. Lockout: if customers.completed_at IS NOT NULL, accrual is suppressed.
--   4. Freeze:  if loyalty_program_type = 'single' AND a redemption fires,
--               sets customers.completed_at = now() (one-time program semantics).
-- The "Reset stars" admin action clears both visits and completed_at.
CREATE OR REPLACE FUNCTION public.award_loyalty_visits()
RETURNS TRIGGER AS $$
DECLARE
  v_awarded integer := COALESCE(NEW.loyalty_stars_awarded, 0);
  v_redeemed integer := COALESCE(NEW.loyalty_stars_redeemed, 0);
  v_completed timestamp with time zone;
  v_net integer;
BEGIN
  IF NEW.loyalty_phone IS NULL OR (v_awarded = 0 AND v_redeemed = 0) THEN
    RETURN NEW;
  END IF;

  SELECT completed_at INTO v_completed FROM public.customers WHERE phone = NEW.loyalty_phone;

  IF v_completed IS NOT NULL AND v_awarded > 0 THEN
    v_awarded := 0;
  END IF;

  v_net := v_awarded - v_redeemed;

  INSERT INTO public.customers (phone, visits)
  VALUES (NEW.loyalty_phone, GREATEST(0, v_net))
  ON CONFLICT (phone) DO UPDATE
    SET visits = GREATEST(0, public.customers.visits + v_net);

  IF NEW.loyalty_program_type = 'single' AND v_redeemed > 0 THEN
    UPDATE public.customers SET completed_at = now() WHERE phone = NEW.loyalty_phone;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_award_loyalty ON public.sales;
CREATE TRIGGER trg_award_loyalty
  AFTER INSERT ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.award_loyalty_visits();

-- Atomic inventory deduction
DROP FUNCTION IF EXISTS deduct_inventory(BIGINT, NUMERIC);
CREATE OR REPLACE FUNCTION deduct_inventory(item_id BIGINT, qty NUMERIC)
RETURNS TABLE (out_id BIGINT, out_name TEXT, out_current_stock NUMERIC) AS $$
BEGIN
  RETURN QUERY
  UPDATE public.inventory AS inv
  SET current_stock = inv.current_stock - qty
  WHERE inv.id = item_id AND inv.current_stock >= qty
  RETURNING inv.id, inv.name, inv.current_stock;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashier_pins ENABLE ROW LEVEL SECURITY;

-- 5. POLICIES (Hardware-Level Access)
DROP POLICY IF EXISTS "Hardware can access shop_settings" ON public.shop_settings;
DROP POLICY IF EXISTS "Hardware can access active_tickets" ON public.active_tickets;
DROP POLICY IF EXISTS "Hardware can access customers" ON public.customers;
DROP POLICY IF EXISTS "Hardware can access expenses" ON public.expenses;
DROP POLICY IF EXISTS "Hardware can access inventory" ON public.inventory;
DROP POLICY IF EXISTS "Hardware can access inventory_logs" ON public.inventory_logs;
DROP POLICY IF EXISTS "Hardware can access activity_logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Hardware can access recipes" ON public.recipes;
DROP POLICY IF EXISTS "Hardware can access sales" ON public.sales;
DROP POLICY IF EXISTS "Hardware can access cashier_pins" ON public.cashier_pins;

CREATE POLICY "Hardware can access shop_settings" ON public.shop_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Hardware can access active_tickets" ON public.active_tickets FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Hardware can access customers" ON public.customers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Hardware can access expenses" ON public.expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Hardware can access inventory" ON public.inventory FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Hardware can access inventory_logs" ON public.inventory_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Hardware can access activity_logs" ON public.activity_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Hardware can access recipes" ON public.recipes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Hardware can access sales" ON public.sales FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Hardware can access cashier_pins" ON public.cashier_pins FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. SEED INITIAL SETTINGS
INSERT INTO public.shop_settings (id, menu_data)
VALUES (1, '{"categories": {"Café": []}, "cashiers": [{"id": 1, "name": "Admin", "pin": "1234", "isAdmin": true}], "posSettings": {"name": "TinyPOS", "language": "en", "brandColor": "#f28b05", "isDarkMode": false, "autoLockMinutes": 5, "enableCorte": true, "ticketVisibility": "open", "pinCode": "1234"}, "receiptSettings": {"header": "", "subheader": "", "footer": "", "logo": null, "enableTaxBreakdown": false, "taxRate": 16}, "loyaltySettings": {"isActive": false, "visitsRequired": 10, "rewardDescription": "tu próxima bebida GRATIS"}, "modifierGroups": {}, "discountRules": []}')
ON CONFLICT (id) DO NOTHING;

-- Seed default PINs (hashed)
INSERT INTO public.cashier_pins (cashier_id, pin_hash)
VALUES (0, crypt('1234', gen_salt('bf'))),
       (1, crypt('1234', gen_salt('bf')))
ON CONFLICT (cashier_id) DO NOTHING;
```

---

## 🔄 Migrations (Existing Installs)

If you installed TinyPOS before v1.2.0, apply these migrations **in order** via the Supabase SQL Editor:

| Migration | Purpose |
|---|---|
| [`001_lock_down_rls.sql`](db/migrations/001_lock_down_rls.sql) | Drops `TO public` RLS policies and re-creates them as `TO authenticated` |
| [`002_inventory_rpc.sql`](db/migrations/002_inventory_rpc.sql) | Adds atomic `deduct_inventory` RPC to prevent race conditions |
| [`003_secure_pins.sql`](db/migrations/003_secure_pins.sql) | Creates `cashier_pins` table, migrates existing plaintext PINs to bcrypt hashes, adds `verify_pin` RPC |
| [`004_idempotent_sync_and_refunds.sql`](db/migrations/004_idempotent_sync_and_refunds.sql) | Adds `local_id` columns for idempotent sync, adds `refund_limit_check` constraint |
| [`005_drop_sent_to_barista.sql`](db/migrations/005_drop_sent_to_barista.sql) | Drops the unused `sentToBarista` column from `active_tickets` |
| [`006_loyalty_idempotency.sql`](db/migrations/006_loyalty_idempotency.sql) | Binds loyalty visit accrual to `sales` inserts via trigger; prevents duplicate visits on receipt resend |
| [`007_loyalty_redemption.sql`](db/migrations/007_loyalty_redemption.sql) | Adds explicit reward redemption (`loyalty_stars_redeemed`); trigger now applies net change (awarded − redeemed), closing the modulo loop |
| [`008_loyalty_program_type.sql`](db/migrations/008_loyalty_program_type.sql) | Adds `customers.completed_at` + `sales.loyalty_program_type`; trigger now supports recurring vs one-time programs (freezes customer after Single-mode redemption) |

> **Note:** Migration `003` is **critical** for v1.2.0. The Admin panel and Lock Screen now verify PINs via the `verify_pin` RPC instead of comparing plaintext. If you skip this migration, you will be locked out of the Admin dashboard.

---

## 🧪 Testing

TinyPOS maintains a high-integrity mathematical engine. To run the test suite:

```bash
npm test
```

Tests cover:
*   Floating-point money rounding (positive & negative values).
*   Tax calculations (IVA extraction).
*   Inventory deductions & stock math.
*   Discount stacking & capping logic.

---

## 🚀 Local Development

1.  **Install Dependencies:**
    ```bash
    npm install
    ```
2.  **Configure Environment:**
    Create a `.env.local` file with your Supabase credentials:
    ```env
    VITE_SUPABASE_URL=your-project-url
    VITE_SUPABASE_ANON_KEY=your-anon-key
    ```
3.  **Run Server:**
    ```bash
    npm run dev
    ```
