import { useEffect, useMemo, useState } from 'react';
import { findOption, lineKey, lineUnitCents } from './orderMath';

// Cart lines are { key, id, qty, mods: [optionId] }; picking is the options sheet ({ item, mods }).
export function useCart({ data, draft, track }) {
  const [cart, setCart] = useState(() => draft.cart || []);
  const [picking, setPicking] = useState(null);

  const groups = useMemo(() => new Map((data?.modifier_groups || []).map((g) => [g.id, g])), [data]);
  const itemsById = useMemo(() => {
    const m = new Map();
    (data?.categories || []).forEach((c) => c.items.forEach((i) => m.set(i.id, i)));
    return m;
  }, [data]);
  // Drop restored lines whose item left the menu or sold out since the draft was saved.
  useEffect(() => {
    if (data) setCart((prev) => prev.filter((l) => itemsById.has(l.id) && itemsById.get(l.id).available !== false));
  }, [data, itemsById]);

  const unitCents = (line) => lineUnitCents(line, itemsById, groups);
  const optionName = (id) => findOption(groups, id)?.name || '';
  const total = cart.reduce((a, l) => a + unitCents(l) * l.qty, 0);
  const count = cart.reduce((a, l) => a + l.qty, 0);
  const hasMods = (item) => (item.modifier_group_ids || []).some((gid) => groups.get(gid));

  const addLine = (id, mods) => {
    track('add_to_cart', { itemId: id });
    const key = lineKey(id, mods);
    setCart((prev) => {
      const found = prev.find((l) => l.key === key);
      return found ? prev.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l)) : [...prev, { key, id, qty: 1, mods }];
    });
  };
  const onAdd = (item) => {
    if (hasMods(item)) { track('item_open', { itemId: item.id }); setPicking({ item, mods: [] }); }
    else addLine(item.id, []);
  };
  const toggleMod = (g, optId) => setPicking((p) => {
    const has = p.mods.includes(optId);
    const others = g.allow_multiple ? p.mods : p.mods.filter((m) => !g.options.some((o) => o.id === m));
    return { ...p, mods: has ? p.mods.filter((m) => m !== optId) : [...others, optId] };
  });
  const setQty = (key, qty) => {
    const line = cart.find((l) => l.key === key);
    if (line && qty > line.qty) track('add_to_cart', { itemId: line.id });
    if (line && qty < line.qty) track('remove_from_cart', { itemId: line.id });
    setCart((prev) => prev.flatMap((l) => (l.key !== key ? [l] : qty > 0 ? [{ ...l, qty }] : [])));
  };

  return { cart, setCart, picking, setPicking, groups, itemsById, unitCents, optionName, total, count, hasMods, addLine, onAdd, toggleMod, setQty };
}
