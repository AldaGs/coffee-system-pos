import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { createPageTracker } from '../../utils/pageTracker';
import { applyTheme } from '../../utils/menuTheme';

// The menu chosen for online orders (schema 3.1+); older schemas lack the RPC, so fall back to the active menu.
export const orderMenu = async (client) => {
  const r = await client.rpc('get_order_menu');
  return r.error ? client.rpc('get_active_menu') : r;
};

export const CUSTOMER_KEY = 'tinypos_order_customer';
export const HISTORY_KEY = 'tinypos_order_history';
// In-progress order (cart + checkout form), so a reload doesn't lose it. Cleared on submit.
export const DRAFT_KEY = 'tinypos_order_draft';
export const MAX_HISTORY = 10;

// Same whitelist the public menu applies: menu.data.category_names (empty = all).
export const visibleCategories = (d) => {
  const names = d?.menu?.data?.category_names;
  return (d?.categories || []).filter((c) => !names?.length || names.includes(c.name));
};

// Colors from the menu's design (menu.data.theme, as on /menu). Only values the owner
// set explicitly are used, so an unstyled menu keeps the default order page look.
export const menuColors = (d) => {
  const t = d?.menu?.data?.theme || {};
  return {
    accent: t.accent || d?.menu?.data?.accent_color || d?.shop?.brand_color || '#f28b05',
    background: t.background || '#fafafa',
    text: t.text || '#222',
    // Typography + optional storefront overrides, so a shop's order page can match its own site.
    fontFamily: t.font_preset || t.google_font_url ? applyTheme(t).fontFamily : undefined,
    fontUrl: /^https:\/\/fonts\.googleapis\.com\//.test(t.google_font_url || '') ? t.google_font_url : '',
    customCss: t.custom_css || '',
    homeUrl: /^https?:\/\//.test(t.home_url || '') ? t.home_url : '',
    hideTitle: !!t.hide_title,
    logoUrl: /^https:\/\//.test(t.logo_url || '') ? t.logo_url : '',
  };
};

export const readJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
export const writeJson = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
};
export const removeKey = (key) => { try { localStorage.removeItem(key); } catch { /* ignore */ } };

// Resolve an anon Supabase client from the page URL (same schemes as /menu).
async function connect() {
  const params = new URLSearchParams(window.location.search);
  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  let ref = params.get('p');
  if (!ref) {
    const host = window.location.hostname;
    const custom = host && !host.includes('localhost') && !host.includes('127.0.0.1')
      && !host.endsWith('.vercel.app') && host !== 'tinypos.app' && host !== 'www.tinypos.app';
    if (custom) {
      const r = await (await fetch(`/api/resolve-domain?domain=${host}`)).json();
      ref = r.projectRef;
    }
  }
  if (ref) {
    const url = `https://${ref}.supabase.co`;
    const res = await fetch(`${url}/storage/v1/object/public/menu/config.json`);
    if (!res.ok) throw new Error('config');
    const { k } = await res.json();
    if (!k) throw new Error('config');
    return createClient(url, k, opts);
  }
  const dec = (v) => { try { return atob(v.replace(/-/g, '+').replace(/_/g, '/')); } catch { return ''; } };
  const u = dec(params.get('u') || ''); const k = dec(params.get('k') || '');
  if (!u || !k) throw new Error('config');
  return createClient(u, k, opts);
}

export function useClient() {
  const [state, setState] = useState({ client: null, error: null });
  useEffect(() => {
    let cancelled = false;
    connect().then(
      (client) => !cancelled && setState({ client, error: null }),
      (err) => !cancelled && setState({ client: null, error: err.message || 'config' })
    );
    return () => { cancelled = true; };
  }, []);
  return state;
}

// tinylogistics' public tracking host (it proxies to this shop's `track` edge function).
export const TRACKING_BASE = import.meta.env.VITE_TRACKING_BASE || 'https://tinylogistics.online';

// One tracker per anon client (i.e. per page load), created on first use.
const trackers = new WeakMap();
export const trackerFor = (client) => {
  if (!trackers.has(client)) trackers.set(client, { tracker: createPageTracker(client, 'order'), once: new Set() });
  return trackers.get(client).tracker;
};
export const onceFor = (client) => { trackerFor(client); return trackers.get(client).once; };
export const releaseTracker = (client) => { trackers.get(client)?.tracker.stop(); trackers.delete(client); };

export const errCode = (error) => {
  const m = String(error?.message || '');
  return ['online_orders_disabled', 'online_orders_paused', 'online_orders_closed', 'invalid_name', 'invalid_phone',
    'invalid_pickup', 'invalid_items', 'item_unavailable', 'rate_limited', 'invalid_address', 'delivery_disabled', 'delivery_outside', 'pin_required', 'quote_changed', 'invalid_type', 'invalid_payment', 'invalid_cash', 'pickup_required', 'slot_taken'].find((c) => m.includes(c)) || null;
};

// Desktop gets a two-column layout with the cart as a side panel.
const WIDE_QUERY = '(min-width: 900px)';
export function useWide() {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(WIDE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

export const pageStyle = {
  height: '100dvh', overflowY: 'auto', background: '#fafafa', color: '#222', WebkitOverflowScrolling: 'touch',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};
// Shared motion: slide-up for the bottom bar and sheets, fade for wizard steps, spinner for waits.
// Rendered once at the page root; reduced-motion users get none of it.
export const MOTION_CSS = '@keyframes tp-spin{to{transform:rotate(360deg)}}@keyframes tp-up{from{transform:translateY(100%);opacity:0}}@keyframes tp-fade{from{opacity:0;transform:translateY(6px)}}@keyframes tp-dim{from{opacity:0}}'
  + '.tp-spin{animation:tp-spin .9s linear infinite}.tp-up{animation:tp-up .32s cubic-bezier(.2,.8,.2,1)}.tp-fade{animation:tp-fade .25s ease-out}.tp-dim{animation:tp-dim .2s ease-out}'
  + '@media (prefers-reduced-motion:reduce){.tp-spin,.tp-up,.tp-fade,.tp-dim{animation:none!important}}';
export const centerStyle = { minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: '#444', fontFamily: 'system-ui, sans-serif' };
export const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 10, border: '1px solid #ddd', fontSize: '1rem', background: 'white' };
export const qtyBtn = { width: 32, height: 32, borderRadius: 8, border: '1px solid #ddd', background: 'white', fontSize: '1.1rem', cursor: 'pointer' };
export const srOnly = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };
