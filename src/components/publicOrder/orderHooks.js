import { useEffect, useRef, useState } from 'react';
import { parseAddParam } from '../../utils/orderDeepLink';
import { errCode, orderMenu, trackerFor, visibleCategories } from './shared';

// Menu + order gate. The probe answers 'open' or 'open:delivery' (address service offered).
// One parser for the first load and the 60s re-check (the re-check once had a broken regex
// that hid delivery a minute in).
export function useOrderMenu(client, setLang) {
  const [data, setData] = useState(null);
  const [gate, setGate] = useState(null); // null = open, else an error code
  const [loadErr, setLoadErr] = useState(null);
  const [activeCat, setActiveCat] = useState(null);
  const [feeCents, setFeeCents] = useState(null); // null = address service not offered

  const applyProbe = (probe) => {
    setFeeCents(probe.data === 'open:delivery' ? 0 : null);
    setGate(probe.error ? (errCode(probe.error) || 'online_orders_disabled') : null);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [menu, probe] = await Promise.all([
        orderMenu(client),
        client.rpc('public_place_order', { payload: { check: true } }),
      ]);
      if (cancelled) return;
      if (menu.error) { setLoadErr(menu.error.message); return; }
      const filtered = { ...menu.data, categories: visibleCategories(menu.data) };
      setData(filtered);
      setActiveCat(filtered.categories[0]?.id ?? null);
      trackerFor(client).track('page_view', { detail: probe.error ? 'closed' : 'open' });
      if (menu.data?.shop?.language) setLang(menu.data.shop.language === 'en' ? 'en' : 'es');
      applyProbe(probe);
    })();
    return () => { cancelled = true; };
  }, [client, setLang]);

  // Re-check the gate every minute so the page unlocks (or locks) without a reload.
  // The tick re-renders even when nothing changed, so the "opens at" banner stays current.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!data) return undefined;
    const id = setInterval(async () => {
      const probe = await client.rpc('public_place_order', { payload: { check: true } });
      // A network blip (no known error code) keeps the current state instead of locking the page.
      if (probe.error && !errCode(probe.error)) return;
      applyProbe(probe);
      setTick((n) => n + 1);
    }, 60000);
    return () => clearInterval(id);
  }, [client, data]);

  return { data, gate, loadErr, activeCat, setActiveCat, feeCents };
}

// ?add=ID[:QTY],... (e.g. an "Ordena aquí" button on the shop's site) pre-fills the
// basket once the menu loads. Items with options open the picker instead of guessing.
// The param is stripped so a reload doesn't add it again; closed shops add nothing.
// Returns a counter that bumps when the basket should open.
export function useDeepLinkAdd({ data, gate, cartApi, track }) {
  const { itemsById, hasMods, setPicking, setCart } = cartApi;
  const deepLinked = useRef(false);
  // Basket opens after a deep-link add; for an item with options, once the customer confirms it.
  const openAfterPick = useRef(false);
  const [deepOpen, setDeepOpen] = useState(0);
  useEffect(() => {
    if (!data || deepLinked.current) return;
    deepLinked.current = true;
    const params = new URLSearchParams(window.location.search);
    const wanted = parseAddParam(params.get('add'));
    if (!wanted.length) return;
    params.delete('add');
    const qs = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
    if (gate) return;
    const plain = [];
    let picker = false;
    wanted.forEach(({ id, qty }) => {
      const item = itemsById.get(id);
      if (!item || item.available === false) return;
      if (hasMods(item)) { picker = true; setPicking((p) => p || { item, mods: [] }); }
      else plain.push({ id, qty });
    });
    openAfterPick.current = picker;
    if (!plain.length) return;
    if (!picker) setDeepOpen((n) => n + 1);
    plain.forEach(({ id }) => track('add_to_cart', { itemId: id, detail: 'deep_link' }));
    setCart((prev) => plain.reduce((acc, { id, qty }) => {
      const key = `${id}|`;
      return acc.some((l) => l.key === key)
        ? acc.map((l) => (l.key === key ? { ...l, qty: Math.max(l.qty, qty) } : l))
        : [...acc, { key, id, qty, mods: [] }];
    }, prev));
  }, [data, gate, itemsById]); // eslint-disable-line react-hooks/exhaustive-deps

  // Picker closed: confirmed opens the basket if a deep link asked for it; cancelled never does.
  const pickerClosed = (confirmed) => {
    if (confirmed && openAfterPick.current) setDeepOpen((n) => n + 1);
    openAfterPick.current = false;
  };
  return { deepOpen, pickerClosed };
}
