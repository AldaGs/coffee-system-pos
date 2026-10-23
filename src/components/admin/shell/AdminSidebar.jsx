import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import { useTranslation } from '../../../hooks/useTranslation';
import { CommandPalette } from '../../ui/arc';

export default function AdminSidebar({
  tabs, activeTab, isAdvanced, shopName, isOpen, onClose, onOpenTab, onGoToSettings, onLogout, onBackToRegister,
}) {
  const { t } = useTranslation();
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);

  // Ctrl/⌘+K opens the section search from anywhere in the dashboard.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsPaletteOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const isLocked = (tab) => tab.advancedOnly && !isAdvanced;

  return (
    <>
      {isPaletteOpen && (
        <div className="arc-palette-overlay" onClick={(e) => { if (e.target === e.currentTarget) setIsPaletteOpen(false); }}>
          <div className="arc">
            <CommandPalette
              autoFocus
              label={t('admin.paletteSearch')}
              placeholder={t('admin.paletteSearch')}
              emptyTitle={t('admin.paletteEmpty')}
              emptyHint={t('admin.paletteEmptyHint')}
              items={tabs.map((tab) => ({
                id: tab.id,
                label: tab.label,
                group: t('admin.paletteGroup'),
                // Also match without accents, so "analiticas" finds "Analíticas".
                keywords: [tab.id, tab.label.normalize('NFD').replace(/\p{Diacritic}/gu, '')],
                description: isLocked(tab) ? t('admin.paletteLocked') : undefined,
                icon: <Icon icon={tab.icon} />,
              }))}
              onSelect={(item) => { setIsPaletteOpen(false); onOpenTab(tabs.find((tab) => tab.id === item.id)); }}
              onClose={() => setIsPaletteOpen(false)}
            />
          </div>
        </div>
      )}
      <div className={`admin-overlay ${isOpen ? 'open' : ''}`} onClick={onClose}></div>

      <aside className={`admin-aside ${isOpen ? 'open' : ''}`}>
        <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon icon="lucide:store" style={{ color: 'var(--brand-color)' }} />
            <span>{shopName} | admin</span>
          </h2>
          <button className="desktop-hidden" onClick={onClose} aria-label={t('common.close')} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer', display: 'flex' }}>
            <Icon icon="lucide:x" />
          </button>
        </div>
        <button
          onClick={() => setIsPaletteOpen(true)}
          style={{ margin: '12px 16px 0', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.08)', color: 'inherit', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.95rem', flexShrink: 0 }}
        >
          <Icon icon="lucide:search" />
          <span>{t('admin.paletteOpen')}</span>
        </button>
        <nav className="admin-aside-nav" style={{ display: 'flex', flexDirection: 'column', padding: '16px 0', flex: 1, gap: '4px', overflowY: 'auto', minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onOpenTab(tab)}
                style={{
                  padding: '12px 24px', textAlign: 'left',
                  background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
                  border: 'none', color: 'white', cursor: 'pointer', fontSize: '1rem',
                  display: 'flex', alignItems: 'center', gap: '12px',
                  opacity: isLocked(tab) ? 0.45 : 1,
                  borderLeft: active ? '4px solid var(--brand-color)' : '4px solid transparent',
                  transition: 'all 0.2s',
                }}
              >
                <Icon icon={tab.icon} style={{ fontSize: '1.2rem', opacity: active ? 1 : 0.7 }} />
                <span style={{ flex: 1 }}>{tab.label}</span>
                {isLocked(tab) && (
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Icon icon="lucide:lock" style={{ fontSize: '0.7rem' }} />
                    {t('settings.advancedBadge')}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
          {!isAdvanced && (
            <div
              onClick={onGoToSettings}
              style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.08)', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', border: '1px dashed rgba(255,255,255,0.2)' }}
              title={t('settings.advancedMode')}
            >
              <Icon icon="lucide:lock" style={{ fontSize: '1rem' }} />
              <span>{t('settings.liteMode')}{t('settings.advancedMode')}</span>
            </div>
          )}
          <button onClick={onLogout} style={{ width: '100%', padding: '12px', background: 'transparent', color: '#ccc', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Icon icon="lucide:log-out" />
            <span>{t('admin.signOut')}</span>
          </button>
          <button onClick={onBackToRegister} style={{ width: '100%', padding: '12px', background: '#bd301e', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 10px rgba(41, 128, 185, 0.3)' }}>
            <Icon icon="lucide:layout-dashboard" />
            <span>{t('admin.backToReg')}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
