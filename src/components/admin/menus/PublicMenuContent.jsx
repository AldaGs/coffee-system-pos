import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import InfoTip from '../../shared/InfoTip';
import { useTranslation } from '../../../hooks/useTranslation';

// Per-item public-menu metadata (roast date + WhatsApp link), edited here in
// the Menús Públicos tab rather than the catalog/register item form — these
// fields only affect the customer-facing menu. Values persist onto the item's
// menu_items.data jsonb via onSet (Admin.handleSetItemPublicFields), so the
// public-menu RPCs pick them up without any catalog-form changes.
export function PublicMenuContent({ menuData, onSet }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  if (!onSet) return null;

  const categories = menuData?.categories || {};
  const categoryOrder = (menuData?.categoryOrder && menuData.categoryOrder.length)
    ? menuData.categoryOrder
    : Object.keys(categories);
  const hasItems = categoryOrder.some(c => (categories[c] || []).length > 0);

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--admin-card-radius)', marginTop: 24, overflow: 'hidden' }}>
      <button onClick={() => setExpanded(e => !e)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 20, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-main)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 800, fontSize: '1.05rem' }}>
          <Icon icon="lucide:calendar-clock" style={{ color: 'var(--brand-color)' }} />
          {t('menusTab.contentTitle')}
        </span>
        <Icon icon={expanded ? 'lucide:chevron-up' : 'lucide:chevron-down'} />
      </button>
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {t('menusTab.contentDesc')}{' '}
            <InfoTip text={t('menusTab.contentInfo')} section="menus" />
          </p>
          {!hasItems && <p style={{ margin: 0, color: 'var(--text-muted)' }}>{t('menusTab.noItems')}</p>}
          {categoryOrder.map(cat => {
            const items = categories[cat] || [];
            if (items.length === 0) return null;
            return (
              <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{cat}</div>
                {items.map(item => <PublicItemRow key={item.id} item={item} onSet={onSet} />)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// One item's roast date + WhatsApp inputs. Local draft for the URL so typing is
// smooth and only commits on blur (each commit is a cloud write); the date is a
// discrete value so it commits on change.
function PublicItemRow({ item, onSet }) {
  const { t } = useTranslation();
  const [wa, setWa] = useState(item.whatsappUrl || '');
  useEffect(() => { setWa(item.whatsappUrl || ''); }, [item.whatsappUrl]);

  const commitWa = () => {
    const next = wa.trim();
    if (next !== (item.whatsappUrl || '')) onSet(item.id, { whatsappUrl: next });
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', background: 'var(--bg-main)', borderRadius: 12, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 160, flex: '1 1 160px' }}>
        <span style={{ fontSize: '1.2rem' }} aria-hidden>{item.emoji || '•'}</span>
        <span style={{ fontWeight: 700, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
      </div>
      <input
        type="date"
        value={item.roastDate || ''}
        onChange={(e) => onSet(item.id, { roastDate: e.target.value })}
        title={t('menusTab.dateTitle')}
        style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-main)', fontWeight: 700, outline: 'none' }}
      />
      <input
        type="url"
        inputMode="url"
        value={wa}
        onChange={(e) => setWa(e.target.value)}
        onBlur={commitWa}
        placeholder="https://wa.me/52..."
        title={t('menusTab.waTitle')}
        style={{ flex: '2 1 220px', minWidth: 180, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-main)', fontWeight: 600, outline: 'none' }}
      />
    </div>
  );
}
