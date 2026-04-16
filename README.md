readme_content = """# ☕ TinyPOS (Coffee System POS)

> A lightweight, offline-first Point of Sale system tailored for independent coffee shops, artisanal cafes, and small hospitality businesses.

TinyPOS is a robust, React-based web application designed to handle rapid transactions, complex menu modifiers, automated discounts, and business analytics. Built with Vite and powered by a dual-database architecture (Dexie.js for offline resilience and Supabase for cloud synchronization), it ensures your cafe keeps running even if the internet goes down.

## ✨ Key Features

### 🛒 Core Register & Transactions
* **Rapid Checkout:** Optimized interface for fast-paced barista environments.
* **Complex Modifiers:** Deep modifier library supporting nested options, add-ons (with price adjustments), and custom text inputs (e.g., customer names).
* **Offline-First Resilience:** Transactions are securely stored locally via IndexedDB (Dexie.js) and automatically synced to Supabase when the connection is restored.
* **Automated Discount Engine:** Create rules for percentage-based or flat-rate discounts that automatically trigger based on cart contents or specific items.

### 📊 Admin Dashboard & Analytics
* **Real-Time Analytics:** Track gross revenue, net profit, refunds, and payment method breakdowns across custom timeframes.
* **Menu Editor:** Add, edit, or remove categories, drinks, and modifiers on the fly. Emojis and dynamic pricing supported.
* **Team Performance:** Monitor cashier leaderboard and shift metrics.
* **CSV Exports:** Download detailed sales history directly from the dashboard.

### 📱 Customer Engagement & Loyalty
* **WhatsApp Digital Receipts:** Send beautifully formatted digital tickets directly to customers via WhatsApp deep-linking.
* **Built-in Loyalty Program:** Track customer visits and automatically trigger WhatsApp reward messages when milestones are reached (e.g., \"10th visit unlocks a free drink\").

### 🧾 Enterprise-Grade Receipt Printing
* **Thermal Printer Support:** Base64 logo injection and structured thermal printing.
* **SAT / Tax Compliance:** Toggleable IVA (Tax) extraction engine to automatically calculate and display Subtotal and Tax splits for compliance (Standard 16% MXN IVA).

### 🧮 Back-Office Tools
* **Recipe Builder:** Calculate profitable selling prices based on raw ingredient COGS (Cost of Goods Sold) and target profit margins.
* **Shift Management:** Pin-based team authentication and \"Corte de Caja\" capabilities for secure drawer reconciliation.
* **Custom Branding:** Inject custom brand colors and logos to match your cafe's aesthetic.

---

## 🚀 Tech Stack

* **Frontend:** React 18, Vite
* **Routing:** React Router v6
* **Local Database:** Dexie.js (IndexedDB wrapper)
* **Cloud Backend:** Supabase (PostgreSQL, Auth)
* **Deployment:** Vercel

---

## 🛠️ Local Development Setup

### Prerequisites
* Node.js (v18+ recommended)
* A Supabase Account
* A Vercel Account (for deployment)

### 1. Clone & Install
```bash
    git clone [https://github.com/YOUR-USERNAME/coffee-system-pos.git](https://github.com/YOUR-USERNAME/coffee-system-pos.git)
    cd coffee-system-pos
    npm install
```

### 2. Environment Variables
* Create a .env file in the root directory and add your Supabase credentials:
```bash
VITE_SUPABASE_URL=[https://your-project-id.supabase.co](https://your-project-id.supabase.co)
VITE_SUPABASE_ANON_KEY=your-long-anon-key-here
```

### 3. Run the Development Server
```bash
npm run dev
```

The application will be available at http://localhost:5173.


### ☁️ Deployment (Vercel)
TinyPOS is optimized for zero-config deployments on Vercel.

Push your code to a private GitHub repository.

Log into Vercel and click Import Project.

Select your coffee-system-pos repository.

In the Vercel Environment Variables section, add your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.

Click Deploy.

### 🔒 Security Notes
Row Level Security (RLS): Ensure your Supabase database has RLS properly configured to prevent unauthorized data manipulation.

Vite Env Variables: The VITE_ prefix exposes the Supabase Anon Key to the frontend. This is safe as long as Supabase RLS is enforced.

### License
Private use. Not licensed for public distribution.