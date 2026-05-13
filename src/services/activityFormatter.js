import { formatForDisplay } from '../utils/moneyUtils';

// Maps canonical activity action codes -> presentation (icon, color, label, description).
// Descriptions are formatted from `metadata` at view time so they always follow the
// current locale, instead of being baked in at write time. Legacy logs that already
// store a pre-formatted `description` string still render via the fallback at the bottom.

const fmt = (n) => formatForDisplay(n);

const interp = (tpl, vars) =>
  String(tpl).replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined && vars[k] !== null ? vars[k] : ''));

const ACTIONS = {
  sale: {
    icon: 'lucide:shopping-cart',
    color: '#27ae60',
    labelKey: 'activity.action.sale',
    describe: (m, t) => interp(t('activity.desc.sale'), {
      amount: fmt(m.amount),
      method: m.method || '—',
      items: m.items_count || 0
    })
  },
  discount_applied: {
    icon: 'lucide:percent',
    color: '#e74c3c',
    labelKey: 'activity.action.discount',
    describe: (m, t) => interp(t('activity.desc.discount'), {
      value: m.type === 'percentage' ? `${m.value}%` : `$${fmt(m.value)}`,
      ticket: m.ticket_name || '—'
    })
  },
  expense_added: {
    icon: 'lucide:receipt',
    color: '#9b59b6',
    labelKey: 'activity.action.expense',
    describe: (m, t) => interp(t('activity.desc.expense'), {
      amount: fmt(m.amount),
      category: m.category || '—',
      reason: m.reason || ''
    })
  },
  cashier_added: {
    icon: 'lucide:user-plus',
    color: '#3498db',
    labelKey: 'activity.action.cashierAdded',
    describe: (m, t) => interp(t('activity.desc.cashierAdded'), { name: m.name || '—' })
  },
  cashier_removed: {
    icon: 'lucide:user-minus',
    color: '#e67e22',
    labelKey: 'activity.action.cashierRemoved',
    describe: (m, t) => interp(t('activity.desc.cashierRemoved'), { name: m.name || '—' })
  },
  menu_item_added: {
    icon: 'lucide:plus-circle',
    color: '#16a085',
    labelKey: 'activity.action.menuItemAdded',
    describe: (m, t) => interp(t('activity.desc.menuItemAdded'), {
      name: m.name || '—',
      category: m.category || '—',
      price: fmt(m.price)
    })
  },
  menu_item_updated: {
    icon: 'lucide:edit-3',
    color: '#f39c12',
    labelKey: 'activity.action.menuItemUpdated',
    describe: (m, t) => interp(t('activity.desc.menuItemUpdated'), { name: m.name || '—' })
  },
  menu_item_deleted: {
    icon: 'lucide:trash-2',
    color: '#c0392b',
    labelKey: 'activity.action.menuItemDeleted',
    describe: (m, t) => interp(t('activity.desc.menuItemDeleted'), { name: m.name || '—' })
  },
  inventory_created: {
    icon: 'lucide:package-plus',
    color: '#3498db',
    labelKey: 'activity.action.inventoryCreated',
    describe: (m, t) => interp(t('activity.desc.inventoryCreated'), {
      name: m.name || '—',
      stock: m.stock ?? 0,
      unit: m.unit || ''
    })
  },
  inventory_audit: {
    icon: 'lucide:clipboard-check',
    color: '#8e44ad',
    labelKey: 'activity.action.inventoryAudit',
    describe: (m, t) => {
      const variance = Number(m.variance || 0);
      const sign = variance > 0 ? '+' : '';
      return interp(t('activity.desc.inventoryAudit'), {
        name: m.name || '—',
        variance: `${sign}${variance}`,
        impact: fmt(m.financial_impact ?? m.financialImpact)
      });
    }
  },
  inventory_restock: {
    icon: 'lucide:package',
    color: '#2ecc71',
    labelKey: 'activity.action.inventoryRestock',
    describe: (m, t) => interp(t('activity.desc.inventoryRestock'), {
      name: m.name || '—',
      qty: m.qty ?? 0,
      unit: m.unit || '',
      cost: fmt(m.cost)
    })
  },
  inventory_deleted: {
    icon: 'lucide:package-x',
    color: '#c0392b',
    labelKey: 'activity.action.inventoryDeleted',
    describe: (m, t) => interp(t('activity.desc.inventoryDeleted'), {
      name: m.name || '—',
      stock: m.stock_at_delete ?? 0,
      unit: m.unit || '',
      cost: fmt(m.unit_cost_at_delete)
    })
  },
  refund_issued: {
    icon: 'lucide:rotate-ccw',
    color: '#e74c3c',
    labelKey: 'activity.action.refundIssued',
    describe: (m, t) => interp(t(m.full ? 'activity.desc.refundFull' : 'activity.desc.refundPartial'), {
      amount: fmt(m.refund_amount),
      ticket: m.ticket_label || '—',
      tip: fmt(m.tip_refunded || 0)
    })
  },
  settings_updated: {
    icon: 'lucide:settings',
    color: '#7f8c8d',
    labelKey: 'activity.action.settingsUpdated',
    describe: (m, t) => interp(t('activity.desc.settingsUpdated'), {
      section: t(`activity.settingsSection.${m.section}`) || m.section || '—'
    })
  },
  corte: {
    icon: 'lucide:clipboard-list',
    color: '#34495e',
    labelKey: 'activity.action.corte',
    describe: (m, t) => {
      const diff = Number(m.difference || 0);
      const key = Math.abs(diff) < 0.01
        ? 'activity.desc.corteExact'
        : diff > 0
          ? 'activity.desc.corteOver'
          : 'activity.desc.corteShort';
      return interp(t(key), {
        expected: fmt(m.expected_cash),
        actual: fmt(m.actual_cash),
        diff: fmt(Math.abs(diff))
      });
    }
  }
};

// Best-effort mapping for old/legacy action_type strings that exist in the cloud.
const LEGACY_MAP = {
  'team management': null, // ambiguous (added/removed) — fall through to legacy display
  'menu management': null,
  'inventory item created': 'inventory_created',
  'inventory audit': 'inventory_audit',
  'inventory restock': 'inventory_restock',
  'discount applied': 'discount_applied',
  'gasto (expense)': 'expense_added'
};

export const formatActivity = (log, t) => {
  const rawType = String(log.action_type || '').trim();
  const code = ACTIONS[rawType] ? rawType : LEGACY_MAP[rawType.toLowerCase()];
  const action = code ? ACTIONS[code] : null;

  // Normalise the description: if it was stored as JSON (the old broken sale/corte logs),
  // we re-render from metadata. Otherwise, use the stored string.
  const storedDesc = typeof log.description === 'string'
    ? log.description
    : (log.description ? JSON.stringify(log.description) : '');

  if (action) {
    let description = '';
    try {
      // Some legacy `corte`/`sale` rows have the metadata stored in `description`
      // because the buggy call passed the object as the 2nd arg.
      const meta = log.metadata
        || (typeof log.description === 'object' && log.description !== null ? log.description : null)
        || {};
      description = action.describe(meta, t) || storedDesc;
    } catch {
      description = storedDesc;
    }
    return {
      icon: action.icon,
      color: action.color,
      label: t(action.labelKey),
      description
    };
  }

  // Unknown action: fall back to whatever was written.
  return {
    icon: 'lucide:scroll-text',
    color: 'var(--text-muted)',
    label: rawType || t('activity.action.unknown'),
    description: storedDesc
  };
};
