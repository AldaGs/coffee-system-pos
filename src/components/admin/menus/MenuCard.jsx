import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import { useTranslation } from '../../../hooks/useTranslation';
import { LiveMenuOptions, DesignedEditor } from './DesignedEditor';
import { ScheduleEditor } from './ScheduleEditor';
import { MenuShareBlock } from './MenuShareBlock';
import { kindIcon, kindLabel, iconBtn, dangerBtn, activeBtn, inactiveBtn, kindBadge, priBtn } from './menuShared';

export function MenuCard({ menu, expanded, onExpand, onRename, onToggleActive, onPriority, onDelete, onScheduleChange, showAlert, categoryNames, menuCategories, onOpenCanvas }) {
  const { t } = useTranslation();
  const [name, setName] = useState(menu.name);
  useEffect(() => { setName(menu.name); }, [menu.name]);

  const isLive = menu.kind === 'live';

  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--admin-card-radius)', border: '1px solid var(--border)', overflow: 'hidden', opacity: menu.is_active ? 1 : 0.55 }}>
      {/* Header reflows on narrow screens: the name group keeps a full row and
          the control cluster wraps beneath it instead of overflowing. */}
      <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 200px', minWidth: 0 }}>
          <Icon icon={kindIcon(menu.kind)} style={{ fontSize: '1.4rem', color: 'var(--brand-color)', flexShrink: 0 }} />
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={() => { if (name !== menu.name && name.trim()) onRename(name.trim()); }}
            style={{ flex: 1, minWidth: 0, padding: '8px 12px', borderRadius: 8, border: '1px solid transparent', background: 'transparent', color: 'var(--text-main)', fontWeight: 800, fontSize: '1.05rem', outline: 'none' }}
          />
          <span style={{ ...kindBadge, flexShrink: 0 }}>{kindLabel(menu.kind, t)}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginLeft: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 8, background: 'var(--bg-main)' }}>
            <button onClick={() => onPriority(-1)} disabled={isLive || menu.priority <= 0} style={priBtn} title={t('menusTab.priorityDown')}>
              <Icon icon="lucide:chevron-down" />
            </button>
            <span style={{ fontWeight: 800, minWidth: 18, textAlign: 'center', color: 'var(--text-main)' }}>{menu.priority}</span>
            <button onClick={() => onPriority(+1)} disabled={isLive} style={priBtn} title={t('menusTab.priorityUp')}>
              <Icon icon="lucide:chevron-up" />
            </button>
          </div>

          <button onClick={onToggleActive} style={menu.is_active ? activeBtn : inactiveBtn}>
            <Icon icon={menu.is_active ? 'lucide:eye' : 'lucide:eye-off'} />
            {menu.is_active ? t('menusTab.active') : t('menusTab.paused')}
          </button>

          <button onClick={onExpand} style={iconBtn} title={t('menusTab.schedules')}>
            <Icon icon="lucide:calendar-clock" />
            <span style={{ fontWeight: 700 }}>{t(menu.schedules.length === 1 ? 'menusTab.scheduleCountOne' : 'menusTab.scheduleCountMany').replace('{n}', menu.schedules.length)}</span>
          </button>

          <button onClick={onExpand} style={iconBtn} title={expanded ? t('menusTab.close') : (menu.kind === 'designed' ? t('menusTab.designAndSchedules') : t('menusTab.schedules'))}>
            <Icon icon={expanded ? 'lucide:chevron-up' : 'lucide:chevron-down'} />
          </button>

          {!isLive && (
            <button onClick={onDelete} style={dangerBtn} title={t('menusTab.deleteTitle')}>
              <Icon icon="lucide:trash-2" />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <>
          {menu.kind === 'designed' && (
            <DesignedEditor menu={menu} onChange={onScheduleChange} showAlert={showAlert} categoryNames={categoryNames} menuCategories={menuCategories} onOpenCanvas={onOpenCanvas} />
          )}
          {isLive && (
            <LiveMenuOptions menu={menu} onChange={onScheduleChange} showAlert={showAlert} />
          )}
          <ScheduleEditor
            menu={menu}
            onChange={onScheduleChange}
            showAlert={showAlert}
          />
          {!isLive && <MenuShareBlock menu={menu} />}
        </>
      )}
    </div>
  );
}

export function ConflictBanner({ conflicts }) {
  const { t } = useTranslation();
  if (!conflicts || conflicts.length === 0) return null;
  return (
    <div style={{ marginTop: 16, padding: 16, borderRadius: 12, border: '1px solid #e0a800', background: 'rgba(224, 168, 0, 0.08)', color: 'var(--text-main)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Icon icon="lucide:triangle-alert" style={{ color: '#e0a800', fontSize: '1.2rem' }} />
        <strong>{t('menusTab.conflictTitle')}</strong>
      </div>
      <p style={{ margin: '0 0 10px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
        {t('menusTab.conflictDesc')}
      </p>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {conflicts.map((c, i) => (
          <li key={i}>
            <strong>{c.a.name}</strong> (prio {c.a.priority}) ↔ <strong>{c.b.name}</strong> (prio {c.b.priority})
            {' — '}
            {c.sharedPriority
              ? <span style={{ color: '#d9534f', fontWeight: 700 }}>{t('menusTab.samePriority').replace('{name}', c.winner?.name || '')}</span>
              : <span>{t('menusTab.wins')} <strong>{c.winner?.name}</strong></span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
