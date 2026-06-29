// Floor-plan data-access dispatcher. Mirrors api/vendors.js: dispatches each
// call between the cloud backend (floorCloud.js) and the local Dexie backend
// (floorLocal.js) based on install mode. Dispatch is per-call (not resolved
// once at import) so the local->cloud upgrade flow picks the right backend
// without a reload. See docs/tables.md.

import * as cloud from './floorCloud';
import * as local from './floorLocal';
import { isLocalMode } from '../utils/appMode';

const impl = () => (isLocalMode() ? local : cloud);

export const loadFloors = (...a) => impl().loadFloors(...a);
export const addFloor = (...a) => impl().addFloor(...a);
export const updateFloor = (...a) => impl().updateFloor(...a);
export const deleteFloor = (...a) => impl().deleteFloor(...a);

// Flatten every floor's canvas document into a single list of table nodes,
// each tagged with its parent floor. The floor editor (Phase 2) defines the
// node shape; this reader only assumes `document.tables` is an array of nodes
// carrying their own id. Used by the runtime floor view and seat lookups.
export async function loadTables() {
  const floors = await impl().loadFloors();
  const out = [];
  for (const floor of floors) {
    const nodes = floor.document?.tables || [];
    for (const n of nodes) {
      out.push({ ...n, floorId: floor.id, zone: n.zone ?? floor.zone });
    }
  }
  return out;
}
