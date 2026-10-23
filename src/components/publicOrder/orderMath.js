// Cart money math for /order, in cents. The server reprices on submit; this is the preview.

export const findOption = (groups, id) => {
  for (const g of groups.values()) { const o = g.options.find((x) => x.id === id); if (o) return o; }
  return null;
};

// Same item + same options = one line.
export const lineKey = (id, mods) => `${id}|${[...mods].sort().join(',')}`;

export const lineUnitCents = (line, itemsById, groups) =>
  (itemsById.get(line.id)?.price_cents || 0) + line.mods.reduce((a, id) => a + (findOption(groups, id)?.price_delta_cents || 0), 0);

// Exact + the next few round bills above the total.
export const cashChips = (grand) =>
  [grand, ...[...new Set([50, 100, 200, 500].map((b) => Math.ceil(grand / (b * 100)) * b * 100))].filter((c) => c > grand).slice(0, 3)];

// "Pays with" must cover the total and be at most $1,000 over it.
export const cashOk = (cashCents, grand) => cashCents >= grand && cashCents <= grand + 100000;
