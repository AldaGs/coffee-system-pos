# ☕ TinyPOS: Frontend Application

This directory contains the primary React application for TinyPOS, including the **Register (POS)** and the **Admin Dashboard**.

## 📖 Complete Documentation
For a full breakdown of the entire system (including architecture, inventory math, and print bridge), please see the **[Main README](../README.md)** in the project root.

---

## ✨ Frontend Key Features

### 🛒 The Register (Point of Sale)
*   **Offline-First:** Powered by **Dexie.js** for zero-latency transactions.
*   **Smart Modifiers:** Support for nested options and add-on pricing.
*   **WhatsApp Receipts:** Digital ticket delivery via deep-linking.
*   **Loyalty Integration:** Real-time customer milestone tracking.
*   **Expense Entry:** Log out-of-pocket expenses directly from the terminal.

### 📊 Admin Dashboard
*   **Advanced Analytics:** Revenue, Profit, Refunds, and top-item tracking.
*   **Inventory Engine:** Real-time stock levels with transformation (roasting) logic.
*   **Recipe Builder (COGS):** Live food-cost calculation and target margin sliders.
*   **Branding Engine:** Custom theme colors, logos, and dark mode toggles.

## 🛠️ Tech Stack
*   **Framework:** React 19 + Vite 8
*   **State Management:** Zustand
*   **Database:** Dexie.js (Local) + Supabase (Cloud Sync)
*   **Styling:** Modern CSS Variables + Glassmorphism

## 🚀 Local Development

1.  **Install Dependencies:**
    ```bash
    npm install
    ```
2.  **Configure Environment:**
    Create `.env.local` with your Supabase credentials:
    ```env
    VITE_SUPABASE_URL=...
    VITE_SUPABASE_ANON_KEY=...
    ```
3.  **Run Server:**
    ```bash
    npm run dev
    ```

## 📦 Deployment
Optimized for zero-config deployment on **Vercel**. Ensure Environment Variables are configured in the Vercel dashboard.

---

*Part of the TinyPOS Coffee System.*