// Vendor registry data-access dispatcher. Mirrors api/menu.js: dispatches each
// call between the cloud backend (vendorCloud.js) and the local Dexie backend
// (vendorLocal.js) based on install mode. Dispatch is per-call (not resolved
// once at import) so the local→cloud upgrade flow picks the right backend
// without a reload.

import * as cloud from './vendorCloud';
import * as local from './vendorLocal';
import { isLocalMode } from '../utils/appMode';

const impl = () => (isLocalMode() ? local : cloud);

export const loadVendors = (...a) => impl().loadVendors(...a);
export const addVendor = (...a) => impl().addVendor(...a);
export const updateVendor = (...a) => impl().updateVendor(...a);
export const deleteVendor = (...a) => impl().deleteVendor(...a);
