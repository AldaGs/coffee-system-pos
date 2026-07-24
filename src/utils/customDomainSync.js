// Custom-domain persistence that survives across devices.
//
// The custom domain used to live ONLY in this browser's localStorage, so a
// domain linked on one device (e.g. a PC) was invisible to every other device
// (e.g. a phone) — the phone's share links silently fell back to
// window.location.origin (the old Vercel URL). This module mirrors the domain
// into the store-wide synced settings (shop_settings.menu_data.posSettings) so
// all devices read the same value, while keeping the localStorage copy for
// instant local reads and backward compatibility.
//
// `kind` is 'cfdi' (invoice portal) or 'menu' (public menu). Only CFDI is wired
// up today; 'menu' is here so the menu URL builders can adopt the same channel.

import { supabase } from '../supabaseClient';
import { isLocalMode } from './appMode';

const POS_KEY = { cfdi: 'cfdiCustomDomain', menu: 'menuCustomDomain' };
const LS_KEY = { cfdi: 'tinypos_cfdi_custom_domain', menu: 'tinypos_custom_domain' };

function cachedPosSettings() {
  try {
    return JSON.parse(localStorage.getItem('tinypos_cached_menu') || '{}').posSettings || {};
  } catch {
    return {};
  }
}

/**
 * Current custom domain for `kind`. Prefers this device's localStorage copy,
 * then the store-wide synced settings, else '' (callers fall back to origin).
 */
export function readCustomDomain(kind) {
  return (
    localStorage.getItem(LS_KEY[kind]) ||
    cachedPosSettings()[POS_KEY[kind]] ||
    ''
  );
}

/**
 * Base URL for public-menu links: the custom menu domain (this device's copy or
 * the store-wide synced one) as https, else the current origin. Centralizes the
 * choice so every menu-link builder applies the domain consistently.
 */
export function menuBaseUrl() {
  const domain = readCustomDomain('menu');
  if (domain) return `https://${domain}`;
  return typeof window !== 'undefined' ? window.location.origin : '';
}

/**
 * Persist (or clear, when `domain` is falsy) the custom domain for `kind` to:
 *   1. this device's localStorage (immediate local reads),
 *   2. the synced shop_settings.menu_data.posSettings (other devices),
 *   3. the local cached-menu blob (so buildCfdiUrl sees it without a reload).
 *
 * The Supabase mirror is skipped in local mode (no shop_settings table there;
 * custom domains are a cloud-only feature anyway).
 */
export async function persistCustomDomain(kind, domain) {
  const posKey = POS_KEY[kind];
  const lsKey = LS_KEY[kind];

  if (domain) localStorage.setItem(lsKey, domain);
  else localStorage.removeItem(lsKey);

  // Reflect into the local cache blob immediately so share-link builders that
  // read tinypos_cached_menu.posSettings pick up the change without a reload.
  try {
    const cache = JSON.parse(localStorage.getItem('tinypos_cached_menu') || '{}');
    cache.posSettings = { ...(cache.posSettings || {}) };
    if (domain) cache.posSettings[posKey] = domain;
    else delete cache.posSettings[posKey];
    localStorage.setItem('tinypos_cached_menu', JSON.stringify(cache));
  } catch {
    /* cache unavailable/corrupt — the localStorage + cloud copies still apply */
  }

  if (isLocalMode()) return;

  // Merge into the store-wide synced settings without clobbering sibling keys
  // (cashiers, receiptSettings, loyaltySettings, the rest of posSettings).
  const { data, error } = await supabase
    .from('shop_settings')
    .select('menu_data')
    .eq('id', 1)
    .single();
  if (error) throw error;

  const menuData = data?.menu_data || {};
  const posSettings = { ...(menuData.posSettings || {}) };
  if (domain) posSettings[posKey] = domain;
  else delete posSettings[posKey];

  const { error: upErr } = await supabase
    .from('shop_settings')
    .update({ menu_data: { ...menuData, posSettings } })
    .eq('id', 1);
  if (upErr) throw upErr;
}
