// UI strings, one file per area of the app. Keys are "<prefix>.<name>"; each
// prefix lives in exactly one area file. t() in hooks/useTranslation reads the merged object.
import common from './common.js';
import admin from './admin.js';
import register from './register.js';
import catalog from './catalog.js';
import publicMenus from './publicMenus.js';
import inventory from './inventory.js';
import orders from './orders.js';
import analytics from './analytics.js';
import loyalty from './loyalty.js';
import cfdi from './cfdi.js';

const areas = [common, admin, register, catalog, publicMenus, inventory, orders, analytics, loyalty, cfdi];

export const translations = {
  en: Object.assign({}, ...areas.map((a) => a.en)),
  es: Object.assign({}, ...areas.map((a) => a.es)),
};
