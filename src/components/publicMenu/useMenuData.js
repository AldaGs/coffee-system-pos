import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { createPageTracker } from '../../utils/pageTracker';
import { hasMenuTracker, mapGroups, setMenuTracker, trackMenu } from './shared';

// Standard base64 → string. Tolerates URL-safe variants in case the link was
// rewritten by a QR scanner or messaging app.
function decodeParam(value) {
  if (!value) return '';
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    return atob(normalized);
  } catch {
    return '';
  }
}

const clientOpts = { auth: { persistSession: false, autoRefreshToken: false } };

// Resolves the shop's anon client from the URL (?p= ref, custom domain, or
// legacy ?u=&k=), then loads the menu (?m= pins one) and refreshes it every 5 minutes.
export function useMenuData({ isTvMode, isPrintMode }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [activeCategoryId, setActiveCategoryId] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pinnedId = params.get('m');
    const hostname = window.location.hostname;
    const isCustomDomain =
      hostname &&
      !hostname.includes('localhost') &&
      !hostname.includes('127.0.0.1') &&
      !hostname.endsWith('.vercel.app') &&
      hostname !== 'tinypos.app' &&
      hostname !== 'www.tinypos.app';

    let cancelled = false;
    let interval = null;

    // Kiosk (TV) and print renders aren't visitors, so they never count.
    const startTracking = (client) => {
      if (isTvMode || isPrintMode || hasMenuTracker()) return;
      setMenuTracker(createPageTracker(client, 'menu'));
      trackMenu('page_view', { detail: isCustomDomain ? 'custom_domain' : undefined });
    };

    const start = (client) => {
      startTracking(client);
      const fetchMenu = async () => {
        const { data, error } = pinnedId
          ? await client.rpc('get_menu_by_id', { p_id: Number(pinnedId) })
          : await client.rpc('get_active_menu');
        if (cancelled) return;
        if (error) { setError(error.message); return; }
        setData(data);
        setActiveCategoryId(prev => {
          if (prev && data?.categories?.some(c => c.id === prev)) return prev;
          return data?.categories?.[0]?.id ?? null;
        });
      };
      fetchMenu();
      interval = setInterval(fetchMenu, 5 * 60 * 1000);
    };

    const loadMenuFromRef = async (projectRef) => {
      const supabaseUrl = `https://${projectRef}.supabase.co`;
      try {
        const res = await fetch(`${supabaseUrl}/storage/v1/object/public/menu/config.json`);
        if (!res.ok) throw new Error('Config not found');
        const config = await res.json();
        if (!config.k) throw new Error('Missing key in config');
        if (cancelled) return;
        start(createClient(supabaseUrl, config.k, clientOpts));
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load menu config');
      }
    };

    const projectRefParam = params.get('p');
    if (projectRefParam) {
      loadMenuFromRef(projectRefParam);
    } else if (isCustomDomain) {
      fetch(`/api/resolve-domain?domain=${hostname}`)
        .then(res => res.json())
        .then(data => {
          if (cancelled) return;
          if (data.projectRef) loadMenuFromRef(data.projectRef);
          else setError('Dominio no configurado correctamente. Falta el registro TXT.');
        })
        .catch(() => {
          if (!cancelled) setError('Error resolviendo el dominio.');
        });
    } else {
      // Legacy long-URL path: ?u=BASE64_URL&k=BASE64_KEY (backwards compat).
      const supabaseUrl = decodeParam(params.get('u'));
      const publishableKey = decodeParam(params.get('k'));
      if (!supabaseUrl || !publishableKey) {
        setTimeout(() => setError('missing-config'), 0);
        return;
      }
      start(createClient(supabaseUrl, publishableKey, clientOpts));
    }

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      setMenuTracker(null);
    };
  }, [isTvMode, isPrintMode]);

  const groupsById = useMemo(() => mapGroups(data?.modifier_groups), [data]);

  return { data, error, activeCategoryId, setActiveCategoryId, groupsById };
}
