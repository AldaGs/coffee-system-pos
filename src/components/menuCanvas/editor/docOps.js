// Pure document edits for the canvas editor. Each takes a page (or doc) and
// returns a new one; nothing here touches React or Konva.
import { nanoid } from 'nanoid';
import { pathBBox, translatePath, cloneNodeGeometry, clusterByGroup } from '../../../utils/canvasDocument';
import { nextZ } from './geometry';

export const withPage = (doc, index, fn) => ({ ...doc, pages: doc.pages.map((p, i) => (i === index ? fn(p) : p)) });
const mapNodes = (page, fn) => ({ ...page, nodes: (page.nodes || []).map(fn) });
const nodesOf = (page) => page?.nodes || [];

export const patchNode = (page, id, patch) => mapNodes(page, (n) => (n.id === id
  ? { ...n, ...patch, style: patch.style ? { ...n.style, ...patch.style } : n.style }
  : n));

export const patchNodes = (page, ids, patch) => {
  const set = new Set(ids);
  return mapNodes(page, (n) => (set.has(n.id) ? { ...n, ...patch } : n));
};

// Swaps z with the next node up (step 1) or down (step -1).
export function swapZ(page, id, step) {
  const sorted = [...nodesOf(page)].sort((a, b) => (a.z || 0) - (b.z || 0));
  const idx = sorted.findIndex((n) => n.id === id);
  const other = sorted[idx + step];
  if (idx < 0 || !other) return page;
  const a = sorted[idx];
  const az = a.z || 0, bz = other.z || 0;
  return mapNodes(page, (n) => (n.id === a.id ? { ...n, z: bz } : n.id === other.id ? { ...n, z: az } : n));
}

// Gives every listed node a unique z from a top-first order, keeping groups contiguous.
export function reorderByIds(page, orderedTopFirst) {
  const ordered = clusterByGroup(orderedTopFirst, (id) => nodesOf(page).find((n) => n.id === id)?.groupId);
  const zById = new Map(ordered.map((id, i) => [id, ordered.length - i]));
  return mapNodes(page, (n) => (zById.has(n.id) ? { ...n, z: zById.get(n.id) } : n));
}

// A group is a shared groupId (plus an optional name in page.groups). The public
// renderer ignores groups: every node keeps its own geometry and z.
export function expandGroups(page, ids) {
  const gids = new Set(ids.map((id) => nodesOf(page).find((n) => n.id === id)?.groupId).filter(Boolean));
  if (gids.size === 0) return ids;
  const out = new Set(ids);
  for (const n of nodesOf(page)) if (n.groupId && gids.has(n.groupId)) out.add(n.id);
  return Array.from(out);
}

export function groupPeers(page, id) {
  const g = nodesOf(page).find((n) => n.id === id)?.groupId;
  return g ? nodesOf(page).filter((n) => n.groupId === g).map((n) => n.id) : [id];
}

// Members are clustered at their frontmost position, keeping relative order.
export function groupIds(page, ids, gid) {
  const set = new Set(ids);
  const nodes = nodesOf(page);
  const topFirst = [...nodes].sort((a, b) => (b.z || 0) - (a.z || 0)).map((n) => n.id);
  const clustered = clusterByGroup(topFirst, (id) => (set.has(id) ? gid : nodes.find((n) => n.id === id)?.groupId));
  const zById = new Map(clustered.map((id, i) => [id, clustered.length - i]));
  const groupNum = Object.keys(page?.groups || {}).length + 1;
  return {
    page: {
      ...page,
      groups: { ...(page.groups || {}), [gid]: { name: `Grupo ${groupNum}` } },
      nodes: nodes.map((n) => ({
        ...n,
        ...(set.has(n.id) ? { groupId: gid } : {}),
        ...(zById.has(n.id) ? { z: zById.get(n.id) } : {}),
      })),
    },
    selection: clustered.filter((id) => set.has(id)),
  };
}

// Returns null when nothing selected is grouped.
export function ungroupIds(page, ids) {
  const set = new Set(ids);
  const gids = new Set(nodesOf(page).filter((n) => set.has(n.id) && n.groupId).map((n) => n.groupId));
  if (gids.size === 0) return null;
  return {
    ...page,
    groups: Object.fromEntries(Object.entries(page.groups || {}).filter(([g]) => !gids.has(g))),
    nodes: nodesOf(page).map((n) => {
      if (!gids.has(n.groupId)) return n;
      const { groupId: _groupId, ...rest } = n;
      return rest;
    }),
  };
}

// Paths translate their absolute points instead of taking a raw x/y.
export function moveNodeTo(n, x, y) {
  if (n.type !== 'path') return { ...n, x, y };
  const pts = translatePath(n.points, x - n.x, y - n.y);
  const bb = pathBBox(pts);
  return { ...n, points: pts, x: bb.x, y: bb.y, w: bb.w, h: bb.h };
}

// target: the selection's own bounds, the page ('canvas'), or the first
// selected node ('key', which stays put).
export function alignNodes(page, ids, dir, target, pageW, pageH) {
  const set = new Set(ids);
  const sel = nodesOf(page).filter((n) => set.has(n.id));
  if (sel.length === 0) return page;
  let minX, maxX, minY, maxY;
  if (target === 'canvas') {
    minX = 0; maxX = pageW; minY = 0; maxY = pageH;
  } else if (target === 'key') {
    const key = sel.find((n) => n.id === ids[0]) || sel[0];
    minX = key.x; maxX = key.x + key.w; minY = key.y; maxY = key.y + key.h;
  } else {
    minX = Math.min(...sel.map((n) => n.x)); maxX = Math.max(...sel.map((n) => n.x + n.w));
    minY = Math.min(...sel.map((n) => n.y)); maxY = Math.max(...sel.map((n) => n.y + n.h));
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return mapNodes(page, (n) => {
    if (!set.has(n.id) || (target === 'key' && n.id === ids[0])) return n;
    let { x, y } = n;
    if (dir === 'left') x = minX; else if (dir === 'right') x = maxX - n.w; else if (dir === 'hcenter') x = cx - n.w / 2;
    else if (dir === 'top') y = minY; else if (dir === 'bottom') y = maxY - n.h; else if (dir === 'vcenter') y = cy - n.h / 2;
    return moveNodeTo(n, Math.round(x), Math.round(y));
  });
}

// Equal gaps between 3+ nodes, outermost two fixed. axis: 'h' or 'v'.
export function distributeNodes(page, ids, axis) {
  const set = new Set(ids);
  const sel = nodesOf(page).filter((n) => set.has(n.id));
  if (sel.length < 3) return page;
  const pos = axis === 'h' ? 'x' : 'y';
  const size = axis === 'h' ? 'w' : 'h';
  const sorted = [...sel].sort((a, b) => a[pos] - b[pos]);
  const spanStart = sorted[0][pos];
  const last = sorted[sorted.length - 1];
  const gap = (last[pos] + last[size] - spanStart - sorted.reduce((s, n) => s + n[size], 0)) / (sorted.length - 1);
  const placed = {};
  let cur = spanStart;
  for (const n of sorted) { placed[n.id] = cur; cur += n[size] + gap; }
  return mapNodes(page, (n) => {
    if (!(n.id in placed)) return n;
    return moveNodeTo(n, Math.round(axis === 'h' ? placed[n.id] : n.x), Math.round(axis === 'v' ? placed[n.id] : n.y));
  });
}

// Snaps a dragged box's edges/centers to the page, other nodes and ruler guides
// within `thresh` page px. Returns the snapped top-left and the guide lines to draw.
export function snapRect(page, activeId, { x, y, w, h }, pageW, pageH, thresh) {
  const vT = [0, pageW / 2, pageW];
  const hT = [0, pageH / 2, pageH];
  for (const n of nodesOf(page)) {
    if (n.id === activeId) continue;
    vT.push(n.x, n.x + n.w / 2, n.x + n.w);
    hT.push(n.y, n.y + n.h / 2, n.y + n.h);
  }
  vT.push(...(page?.guides?.v || []));
  hT.push(...(page?.guides?.h || []));
  const best = (cands, targets) => {
    let b = null;
    for (const c of cands) for (const t of targets) {
      const d = Math.abs(c.val - t);
      if (d <= thresh && (!b || d < b.d)) b = { d, target: t, off: c.off };
    }
    return b;
  };
  const bV = best([{ val: x, off: 0 }, { val: x + w / 2, off: w / 2 }, { val: x + w, off: w }], vT);
  const bH = best([{ val: y, off: 0 }, { val: y + h / 2, off: h / 2 }, { val: y + h, off: h }], hT);
  const lines = [];
  let nx = x, ny = y;
  if (bV) { nx = bV.target - bV.off; lines.push({ key: 'v' + bV.target, points: [bV.target, 0, bV.target, pageH] }); }
  if (bH) { ny = bH.target - bH.off; lines.push({ key: 'h' + bH.target, points: [0, bH.target, pageW, bH.target] }); }
  return { nx, ny, lines };
}

// The product of the item binding closest to the selection's center, so
// "link to product" can suggest it in one click.
export function nearestBindingItemId(page, ids) {
  const set = new Set(ids);
  const sel = nodesOf(page).filter((n) => set.has(n.id));
  if (!sel.length) return null;
  const cx = sel.reduce((s, n) => s + (n.x + n.w / 2), 0) / sel.length;
  const cy = sel.reduce((s, n) => s + (n.y + n.h / 2), 0) / sel.length;
  let best = null, bestD = Infinity;
  for (const n of nodesOf(page)) {
    if (n.type !== 'item-binding' || !n.item_id || set.has(n.id)) continue;
    const d = Math.hypot(n.x + n.w / 2 - cx, n.y + n.h / 2 - cy);
    if (d < bestD) { bestD = d; best = n.item_id; }
  }
  return best;
}

// Item bindings are skipped: they already belong to a product. Keeps each node's hide toggle.
export const linkNodes = (page, ids, itemId) => {
  const set = new Set(ids);
  return mapNodes(page, (n) => (set.has(n.id) && n.type !== 'item-binding'
    ? { ...n, link: { itemId, hideWhenOOS: n.link?.hideWhenOOS ?? true } }
    : n));
};
export const unlinkNodes = (page, ids) => patchNodes(page, ids, { link: null });

// Adds offset copies with fresh ids; copied groups become new, independent groups.
export function placeClones(page, clones, dx, dy, copyName) {
  const z0 = nextZ(page);
  const gidMap = new Map();
  const added = clones.map((c, i) => {
    const g = cloneNodeGeometry(c, dx, dy);
    if (g.groupId) {
      if (!gidMap.has(g.groupId)) gidMap.set(g.groupId, 'grp_' + nanoid(6));
      g.groupId = gidMap.get(g.groupId);
    }
    return { ...g, id: nanoid(8), z: z0 + i };
  });
  const groups = { ...(page.groups || {}) };
  for (const [oldG, newG] of gidMap) groups[newG] = { name: copyName(page.groups?.[oldG]?.name) };
  return { page: { ...page, nodes: [...nodesOf(page), ...added], groups }, ids: added.map((n) => n.id) };
}

// index null adds a guide; pos null removes it.
export function setGuide(page, axis, index, pos) {
  const g = page.guides || { v: [], h: [] };
  const list = [...(g[axis] || [])];
  if (index == null) list.push(pos);
  else if (pos == null) list.splice(index, 1);
  else list[index] = pos;
  return { ...page, guides: { ...g, [axis]: list } };
}
