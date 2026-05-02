# ☕ tinypos: BYOS Coffee System

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](https://github.com/aldair/tinypos)
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

### 📱 Loyalty & Engagement
*   **Loyalty 2.0:** Track customer visits by phone number. Automatically trigger rewards for specific items or entire orders based on visit counts.
*   **WhatsApp Digital Receipts:** Send tickets directly to customers via WhatsApp—no paper needed.

### 🧾 Enterprise Printing & Compliance
*   **Print Bridge Integration:** Dedicated interface for local thermal printers (80mm/58mm).
*   **SAT/Tax Engine:** Configurable IVA extraction for Mexican compliance.
*   **Custom Branding:** Inject Base64 logos and custom header/footer messages into thermal receipts.

---

## 🛠️ Tech Stack
*   **Framework:** React 19 + Vite 8
*   **State Management:** Zustand
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
3.  **Action:** This will automatically create all tables, seed initial settings, and enable **Row Level Security (RLS)** policies scoped to `authenticated`.
4.  **Prerequisite:** Before the device can sync, create at least one Supabase Auth user (**Authentication → Users → Add user** in the Supabase dashboard). The Device Authorization screen will sign in with these credentials on first boot.

---

## 🗄️ Supabase Database Schema (Manual Setup)

If you prefer manual setup:

1.  **Create a hardware Auth user.** In your Supabase project, go to **Authentication → Users → Add user** and create one (e.g. `register@yourshop.com`). The Device Authorization screen on first boot will sign in with these credentials. RLS policies below are scoped to `authenticated`, so the device cannot read or write any data until this sign-in completes — the public anon key alone is not sufficient.
2.  **Run the SQL below** in your Supabase SQL Editor. Note the use of `BY DEFAULT AS IDENTITY` for easier terminal synchronization.
3.  **Existing installs:** if you ran an earlier version of this schema or `/api/install` before this change, your policies were created as `TO public` and are world-readable via the anon key. Apply [`db/migrations/001_lock_down_rls.sql`](db/migrations/001_lock_down_rls.sql) once to drop and recreate them as `TO authenticated`.

```sql
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
  sentToBarista boolean,
  discount jsonb,
  savedSplitPayments jsonb,
  savedPaidProductIds jsonb,
  savedSplitMode text,
  savedNWays bigint,
  last_modified_by text
);

-- Customer Loyalty
CREATE TABLE IF NOT EXISTS public.customers (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  phone character varying NOT NULL,
  visits bigint NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- Expenses
CREATE TABLE IF NOT EXISTS public.expenses (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  amount numeric NOT NULL, 
  reason text,
  cashier_name text,
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
  created_at timestamp with time zone DEFAULT now()
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
  order_name text
);

-- 2. ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

-- 3. POLICIES (Hardware-Level Access)
CREATE POLICY "Hardware can access shop_settings" ON public.shop_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Hardware can access active_tickets" ON public.active_tickets FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Hardware can access customers" ON public.customers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Hardware can access expenses" ON public.expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Hardware can access inventory" ON public.inventory FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Hardware can access inventory_logs" ON public.inventory_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Hardware can access recipes" ON public.recipes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Hardware can access sales" ON public.sales FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. SEED INITIAL SETTINGS
INSERT INTO public.shop_settings (id, menu_data)
VALUES (1, '{"categories": {"Café": []}, "cashiers": [{"id": 1, "name": "Admin", "pin": "1234", "isAdmin": true}], "posSettings": {"name": "TinyPOS", "language": "en", "brandColor": "#f28b05", "isDarkMode": false, "autoLockMinutes": 5, "enableCorte": true, "ticketVisibility": "open"}, "receiptSettings": {"header": "TINY COFFEE BAR", "subheader": "Puebla, Mexico", "footer": "Thank you for your visit!", "logo": null, "enableTaxBreakdown": false, "taxRate": 16}, "loyaltySettings": {"isActive": false, "visitsRequired": 10, "rewardDescription": "tu próxima bebida GRATIS"}, "modifierGroups": {}, "discountRules": []}')
ON CONFLICT (id) DO NOTHING;
```

---

## 🧪 Testing

TinyPOS maintains a high-integrity mathematical engine. To run the test suite:

```bash
npm test
```

Tests cover:
*   Tax calculations (IVA).
*   Inventory deductions & stock math.
*   Loyalty reward triggers.
*   Discount application logic.

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
