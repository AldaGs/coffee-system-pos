import { isLocalMode } from '../../../utils/appMode';

// advancedOnly tabs need Advanced mode; cloudOnly tabs need a Supabase project.
export const getAdminTabs = (t) => [
  { id: 'analytics', icon: 'lucide:bar-chart-3', label: t('admin.analytics') },
  { id: 'orders', icon: 'lucide:receipt', label: t('admin.orders') },
  { id: 'menu', icon: 'lucide:coffee', label: t('admin.menu') },
  { id: 'modifiers', icon: 'lucide:sparkles', label: t('admin.modifiers') },
  { id: 'calculator', icon: 'lucide:flask-conical', label: t('admin.recipe'), advancedOnly: true },
  { id: 'onlineOrders', icon: 'lucide:shopping-bag', label: t('admin.onlineOrders'), advancedOnly: true, cloudOnly: true },
  { id: 'inventory', icon: 'lucide:database', label: t('admin.inventory'), advancedOnly: true },
  { id: 'vendors', icon: 'lucide:store', label: t('admin.vendors'), advancedOnly: true },
  { id: 'tables', icon: 'lucide:armchair', label: t('admin.tables'), advancedOnly: true },
  { id: 'menus', icon: 'lucide:layout-list', label: t('admin.publicMenus'), cloudOnly: true },
  { id: 'receipt', icon: 'lucide:printer', label: t('admin.receipt') },
  { id: 'cfdi', icon: 'lucide:file-text', label: t('admin.cfdi'), cloudOnly: true },
  { id: 'discounts', icon: 'lucide:percent', label: t('admin.promotions'), advancedOnly: true },
  { id: 'loyalty', icon: 'lucide:star', label: t('admin.loyalty'), advancedOnly: true },
  { id: 'team', icon: 'lucide:users', label: t('admin.team'), cloudOnly: true },
  { id: 'devices', icon: 'lucide:tablet-smartphone', label: t('admin.devices'), cloudOnly: true },
  { id: 'tips', icon: 'lucide:wallet', label: t('admin.tips'), advancedOnly: true },
  { id: 'activity', icon: 'lucide:history', label: t('admin.activity'), advancedOnly: true, cloudOnly: true },
  { id: 'settings', icon: 'lucide:settings', label: t('admin.settings') },
  { id: 'help', icon: 'lucide:life-buoy', label: t('admin.help') },
// Public Menus stays in local mode, locked with the upgrade offer, because owners look for it there.
].filter((tab) => !(tab.cloudOnly && isLocalMode() && tab.id !== 'menus'));
