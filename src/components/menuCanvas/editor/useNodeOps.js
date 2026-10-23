import { useRef } from 'react';
import { nanoid } from 'nanoid';
import { cloneNodeGeometry } from '../../../utils/canvasDocument';
import { useTranslation } from '../../../hooks/useTranslation';
import { nextZ } from './geometry';
import {
  withPage, patchNode, patchNodes, swapZ, reorderByIds, groupPeers, groupIds, ungroupIds,
  alignNodes, distributeNodes, nearestBindingItemId, linkNodes, placeClones,
} from './docOps';

// Edits to the nodes of the current page. Each is one undo step except updateNodeSilent.
export function useNodeOps({ doc, commit, setDoc, page, pageIndex, selectedIds, setSelectedIds, setItemPickerCb, pageW, pageH }) {
  const { t } = useTranslation();
  const nodes = page?.nodes || [];
  const selectOne = (id) => setSelectedIds(id ? [id] : []);
  // Session-only clipboard of id-less clones; never touches the OS clipboard.
  const clipboardRef = useRef([]);

  const mutatePage = (fn) => commit(withPage(doc, pageIndex, fn));

  function addNode(node) {
    const withId = { id: nanoid(8), z: nextZ(page), ...node };
    mutatePage((p) => ({ ...p, nodes: [...(p.nodes || []), withId] }));
    selectOne(withId.id);
  }

  const updateNode = (id, patch) => mutatePage((p) => patchNode(p, id, patch));

  // No undo step: auto-width text re-measures on every keystroke.
  const updateNodeSilent = (id, patch) => setDoc((d) => withPage(d, pageIndex, (p) => patchNodes(p, [id], patch)));

  function removeNodes(ids) {
    const set = new Set(ids);
    mutatePage((p) => ({ ...p, nodes: (p.nodes || []).filter((n) => !set.has(n.id)) }));
    setSelectedIds([]);
  }

  const copySelection = () => {
    const set = new Set(selectedIds);
    clipboardRef.current = nodes.filter((n) => set.has(n.id)).map((n) => cloneNodeGeometry(n, 0, 0));
  };

  // Offset copies in one commit (one undo step), then selects them.
  function addClones(clones) {
    if (!clones || clones.length === 0) return;
    const copyName = (name) => t('canvas.groupCopy').replace('{name}', name || t('canvas.group'));
    const { page: next, ids } = placeClones(page, clones, 24, 24, copyName);
    mutatePage(() => next);
    setSelectedIds(ids);
  }
  const pasteClipboard = () => addClones(clipboardRef.current);
  // Duplicate leaves the clipboard alone.
  const duplicateSelection = () => addClones(nodes.filter((n) => selectedIds.includes(n.id)));

  // Links the selection to the nearest product binding, or asks which product when there is none.
  function linkSelectionToProduct() {
    const ids = selectedIds.filter((id) => nodes.find((x) => x.id === id && x.type !== 'item-binding'));
    if (!ids.length) return;
    const near = nearestBindingItemId(page, ids);
    if (near) { mutatePage((p) => linkNodes(p, ids, near)); return; }
    setItemPickerCb(() => (picked) => { if (picked?.[0]) mutatePage((p) => linkNodes(p, ids, picked[0])); setItemPickerCb(null); });
  }

  // Font and its web-font URL in one commit, so two back-to-back commits can't clobber each other.
  function setNodeFont(id, stack, url) {
    const withFont = url && !(doc.fonts || []).includes(url) ? { ...doc, fonts: [...(doc.fonts || []), url] } : doc;
    commit(withPage(withFont, pageIndex, (p) => patchNode(p, id, { style: { fontFamily: stack } })));
  }

  const bringForward = (id) => mutatePage((p) => swapZ(p, id, 1));
  const sendBack = (id) => mutatePage((p) => swapZ(p, id, -1));

  // A click selects the node's whole group; shift-click toggles that group.
  function selectFromCanvas(id, additive) {
    const peers = groupPeers(page, id);
    if (!additive) { setSelectedIds(peers); return; }
    setSelectedIds((prev) => (peers.every((p) => prev.includes(p))
      ? prev.filter((p) => !peers.includes(p))
      : Array.from(new Set([...prev, ...peers]))));
  }

  const reorderNodesByIds = (ids) => mutatePage((p) => reorderByIds(p, ids));
  const bulkUpdateNodes = (ids, patch) => mutatePage((p) => patchNodes(p, ids, patch));
  const renameGroup = (gid, name) => mutatePage((p) => ({ ...p, groups: { ...(p.groups || {}), [gid]: { ...(p.groups?.[gid] || {}), name } } }));
  const alignSelected = (dir, target = 'selection') => mutatePage((p) => alignNodes(p, selectedIds, dir, target, pageW, pageH));
  const distributeSelected = (axis) => mutatePage((p) => distributeNodes(p, selectedIds, axis));

  function groupSelected() {
    if (new Set(selectedIds).size < 2) return;
    const { page: next, selection } = groupIds(page, selectedIds, 'grp_' + nanoid(6));
    mutatePage(() => next);
    setSelectedIds(selection);
  }
  function ungroupSelected() {
    const next = ungroupIds(page, selectedIds);
    if (next) mutatePage(() => next);
  }

  return {
    mutatePage, addNode, updateNode, updateNodeSilent, removeNodes, copySelection, pasteClipboard, duplicateSelection,
    linkSelectionToProduct, setNodeFont, bringForward, sendBack, selectFromCanvas, reorderNodesByIds, bulkUpdateNodes,
    renameGroup, alignSelected, distributeSelected, groupSelected, ungroupSelected, clipboardRef,
  };
}
