# ☕ TinyPOS: The Ultimate Coffee System (Frontend)

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/aldair/tinypos)
[![React](https://img.shields.io/badge/frontend-React_19-61dafb.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/build-Vite_8-646cff.svg)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/cloud-Supabase-3ecf8e.svg)](https://supabase.com/)
[![Dexie](https://img.shields.io/badge/local--db-Dexie.js-3498db.svg)](https://dexie.org/)

**TinyPOS** is a professional, offline-first Point of Sale system specifically engineered for artisanal coffee shops and high-volume cafes. This directory contains the primary React-based frontend application and the administrative dashboard.

---

## 🚀 Architectural Philosophy

TinyPOS is built on a **Dual-Database Resilience Engine**:
1.  **Local (Dexie.js):** Every transaction, inventory change, and setting is stored in the browser's IndexedDB. This ensures zero latency during rush hour and 100% uptime during internet outages.
2.  **Cloud (Supabase):** Automatic background synchronization keeps your data safe, enables multi-terminal support, and powers the administrative dashboard from anywhere in the world.

---

## ✨ Core Functionalities

### 🛒 High-Velocity Register
*   **Fast-Paced Workflow:** Optimized for baristas to handle long lines with minimal taps.
*   **Complex Modifiers:** Support for nested options, price add-ons (extra shots, milk swaps), and custom text inputs for customer names.
*   **Expense Tracking:** Log daily business expenses (milk runs, cleaning supplies) directly from the POS interface.
*   **Dynamic Discounts:** Apply pre-configured percentage or flat-rate rules to any order.
*   **Real-Time Sync Status:** A visual indicator ensures you always know if your data is safely backed up to the cloud.

### 📈 Intelligent Admin Dashboard
*   **Precision Analytics:** Monitor Gross Revenue, Net Profit (Revenue - Expenses), Refunds, and Payment Methods with flexible time filters.
*   **Inventory & "The Roaster":**
    *   Track raw materials (grams, milliliters, units).
    *   **Transformation Engine:** Convert raw stock (e.g., green beans) into finished goods (e.g., roasted coffee) with automatic shrinkage and operational cost calculation.
    *   **Audit Logs:** Track wastage and corrections with detailed financial impact reports.
*   **Recipe Builder (COGS Engine):**
    *   Link menu items to inventory recipes.
    *   Live cost calculation based on real-time inventory prices.
    *   **Profit Engine:** Set target margins and see recommended selling prices.
    *   **"What-If" Math:** Simulate profit margins for custom prices instantly.

### 📱 Loyalty & Engagement
*   **WhatsApp Digital Receipts:** Send tickets directly to customers via WhatsApp—no paper needed.
*   **Built-in Loyalty:** Track customer visits by phone number and automatically trigger rewards (e.g., "10th coffee is free").

### 🧾 Enterprise Printing & Compliance
*   **Print Bridge Integration:** Dedicated interface to communicate with local thermal printers (80mm/58mm).
*   **SAT/Tax Engine:** Configurable IVA (Tax) extraction for Mexican compliance (Standard 16% MXN).
*   **Custom Branding:** Inject Base64 logos into thermal receipts for a premium customer experience.

---

## 🛠️ Tech Stack
*   **Framework:** React 19 + Vite 8
*   **State Management:** Zustand
*   **Database:** Dexie.js (Local) + Supabase (Cloud Sync)
*   **Styling:** Modern CSS Variables + Glassmorphism

---

## 🗄️ Supabase Database Schema

To set up the backend, run the following SQL in your Supabase SQL Editor. This script creates the necessary tables, enables **Row Level Security (RLS)**, and sets up authentication policies.

```sql
-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. TABLES

-- Shop Settings & Menu Configuration
CREATE TABLE IF NOT EXISTS public.shop_settings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  menu_data jsonb
);

-- Active Tickets (Real-time synchronization)
CREATE TABLE IF NOT EXISTS public.active_tickets (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
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

-- Customer Loyalty Data
CREATE TABLE IF NOT EXISTS public.customers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  phone character varying NOT NULL UNIQUE,
  visits bigint NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- Business Expenses
CREATE TABLE IF NOT EXISTS public.expenses (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  amount numeric NOT NULL, -- Changed to numeric for currency precision
  reason text,
  cashier_name text,
  created_at timestamp with time zone DEFAULT now()
);

-- Inventory Stock
CREATE TABLE IF NOT EXISTS public.inventory (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL UNIQUE,
  current_stock numeric DEFAULT 0,
  unit text,
  unit_cost numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- Inventory Logs (Audit & Wastage)
CREATE TABLE IF NOT EXISTS public.inventory_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_name text NOT NULL,
  qty_deducted numeric NOT NULL,
  deduction_type text NOT NULL,
  ticket_id text,
  created_at timestamp with time zone DEFAULT now()
);

-- Recipes & COGS Calculation
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
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  total_amount numeric,
  payment_method text,
  items_sold jsonb,
  cashier_name text,
  status text DEFAULT 'paid',
  order_name text
);

-- 3. ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

-- 4. POLICIES (Allow Authenticated Terminals)
CREATE POLICY "Authenticated users can access shop_settings" ON public.shop_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can access active_tickets" ON public.active_tickets FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can access customers" ON public.customers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can access expenses" ON public.expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can access inventory" ON public.inventory FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can access inventory_logs" ON public.inventory_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can access recipes" ON public.recipes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can access sales" ON public.sales FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. SEED INITIAL SETTINGS
INSERT INTO public.shop_settings (id, menu_data)
VALUES (1, '{"categories": {"Café": []}, "cashiers": [{"id": 1, "name": "Admin", "pin": "1234", "isAdmin": true}], "posSettings": {"name": "TinyPOS", "language": "en", "brandColor": "#f28b05", "isDarkMode": false, "autoLockMinutes": 5, "enableCorte": true, "ticketVisibility": "open"}, "receiptSettings": {"header": "TINY COFFEE BAR", "subheader": "Puebla, Mexico", "footer": "Thank you for your visit!", "logo": null, "enableTaxBreakdown": false, "taxRate": 16}, "loyaltySettings": {"isActive": false, "visitsRequired": 10, "rewardDescription": "tu próxima bebida GRATIS"}, "modifierGroups": {}, "discountRules": []}')
ON CONFLICT (id) DO NOTHING;
```

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

---

*Developed with ❤️ for the artisanal coffee community.*