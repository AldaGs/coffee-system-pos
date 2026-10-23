import { describe, expect, it } from 'vitest';
import {
  patchNode, swapZ, reorderByIds, expandGroups, groupIds, ungroupIds, alignNodes, distributeNodes,
  snapRect, nearestBindingItemId, linkNodes, placeClones, setGuide,
} from '../components/menuCanvas/editor/docOps';

const box = (id, x, y, extra = {}) => ({ id, type: 'shape', x, y, w: 10, h: 10, z: 0, ...extra });
const ids = (page) => page.nodes.map((n) => n.id);
const zOf = (page, id) => page.nodes.find((n) => n.id === id).z;

describe('canvas docOps', () => {
  it('patches style by merging', () => {
    const page = { nodes: [box('a', 0, 0, { style: { fill: 'red', stroke: 'blue' } })] };
    expect(patchNode(page, 'a', { x: 5, style: { fill: 'green' } }).nodes[0]).toMatchObject({ x: 5, style: { fill: 'green', stroke: 'blue' } });
  });

  it('reorders layers', () => {
    const page = { nodes: [box('a', 0, 0, { z: 0 }), box('b', 0, 0, { z: 1 })] };
    const up = swapZ(page, 'a', 1);
    expect([zOf(up, 'a'), zOf(up, 'b')]).toEqual([1, 0]);
    expect(swapZ(page, 'b', 1)).toBe(page);
    const re = reorderByIds(page, ['a', 'b']);
    expect(zOf(re, 'a')).toBeGreaterThan(zOf(re, 'b'));
  });

  it('groups and ungroups', () => {
    const page = { nodes: [box('a', 0, 0, { z: 2 }), box('b', 0, 0, { z: 0 }), box('c', 0, 0, { z: 1 })] };
    const { page: g, selection } = groupIds(page, ['a', 'b'], 'g1');
    expect(selection.sort()).toEqual(['a', 'b']);
    expect(g.groups.g1.name).toBe('Grupo 1');
    expect(expandGroups(g, ['a']).sort()).toEqual(['a', 'b']);
    // Members end up adjacent in z order, with c outside the group.
    const order = [...g.nodes].sort((x, y) => y.z - x.z).map((n) => n.id);
    expect(Math.abs(order.indexOf('a') - order.indexOf('b'))).toBe(1);
    const u = ungroupIds(g, ['a']);
    expect(u.nodes.every((n) => !n.groupId)).toBe(true);
    expect(u.groups).toEqual({});
    expect(ungroupIds(page, ['a'])).toBeNull();
  });

  it('aligns and distributes', () => {
    const page = { nodes: [box('a', 0, 0), box('b', 40, 20), box('c', 100, 5)] };
    expect(alignNodes(page, ['a', 'b', 'c'], 'top', 'selection', 200, 200).nodes.map((n) => n.y)).toEqual([0, 0, 0]);
    expect(alignNodes(page, ['b', 'a'], 'left', 'key', 200, 200).nodes.map((n) => n.x)).toEqual([40, 40, 100]);
    expect(distributeNodes({ nodes: [box('a', 0, 0), box('b', 10, 0), box('c', 100, 0)] }, ['a', 'b', 'c'], 'h').nodes.map((n) => n.x)).toEqual([0, 50, 100]);
  });

  it('snaps to page center and guides', () => {
    const page = { nodes: [], guides: { v: [], h: [33] } };
    const { nx, ny, lines } = snapRect(page, 'x', { x: 47, y: 31, w: 10, h: 10 }, 100, 100, 5);
    expect([nx, ny]).toEqual([45, 33]);
    expect(lines).toHaveLength(2);
  });

  it('suggests and links the nearest product', () => {
    const page = { nodes: [
      box('t', 0, 0, { type: 'text' }),
      box('far', 500, 500, { type: 'item-binding', item_id: 'mocha' }),
      box('near', 20, 0, { type: 'item-binding', item_id: 'latte' }),
    ] };
    expect(nearestBindingItemId(page, ['t'])).toBe('latte');
    const linked = linkNodes(page, ['t', 'near'], 'latte');
    expect(linked.nodes[0].link).toEqual({ itemId: 'latte', hideWhenOOS: true });
    expect(linked.nodes[2].link).toBeUndefined();
  });

  it('pastes copies with fresh ids and fresh groups', () => {
    const page = { nodes: [box('a', 0, 0, { groupId: 'g', z: 3 })], groups: { g: { name: 'Logo' } } };
    const { page: next, ids: added } = placeClones(page, page.nodes, 24, 24, (n) => `${n} copy`);
    const copy = next.nodes.find((n) => n.id === added[0]);
    expect(copy).toMatchObject({ x: 24, y: 24, z: 4 });
    expect(copy.groupId).not.toBe('g');
    expect(next.groups[copy.groupId].name).toBe('Logo copy');
    expect(ids(next)).toHaveLength(2);
  });

  it('adds, moves and removes ruler guides', () => {
    let page = { nodes: [] };
    page = setGuide(page, 'v', null, 10);
    page = setGuide(page, 'v', null, 20);
    page = setGuide(page, 'v', 0, 15);
    expect(page.guides.v).toEqual([15, 20]);
    expect(setGuide(page, 'v', 1, null).guides.v).toEqual([15]);
  });
});
