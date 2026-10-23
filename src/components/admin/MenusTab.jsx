// MenusTab — manage multiple menus + their schedules. The resolver in
// get_active_menu() picks one server-side based on priority + matching
// schedules (in shop-local time). The implicit kind='live' row represents
// the catalog; it can be renamed and re-prioritized but not deleted.
//
// P1 scope: list / create (placeholder kinds) / rename / toggle active /
// priority bump / per-menu schedule editor. PDF upload (P2), TV (P3), and
// the designer (P4) plug in by adding kind-specific creation flows and
// renderers; the data model and resolver don't change.


import { useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import { MAX_PDF_BYTES, MAX_IMAGE_BYTES } from '../../api/menuUploads';
import MenuShareCard from './MenuShareCard';
import PublicPageTraffic from './PublicPageTraffic';
import { findScheduleConflicts } from '../../utils/scheduleConflicts';
import { openInBrowser } from '../../utils/openInBrowser';
import { menuBaseUrl } from '../../utils/customDomainSync';
import CanvasEditor from '../menuCanvas/CanvasEditor';
import InfoTip from '../shared/InfoTip';
import { useTranslation } from '../../hooks/useTranslation';
import { useMenusList } from './menus/useMenusList';
import { MenuCard, ConflictBanner } from './menus/MenuCard';
import { PublicMenuContent } from './menus/PublicMenuContent';
import { btnPrimary, btnSecondary, progressLabel } from './menus/menuShared';

function MenusTab({ showAlert, showConfirm, menuData, onSetItemPublicFields }) {
  const { t } = useTranslation();
  const { menus, loading, uploadProgress, reload, create, rename, toggleActive, bumpPriority, remove, upload } = useMenusList({ showAlert, showConfirm, t });
  const [newName, setNewName] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [editingCanvasFor, setEditingCanvasFor] = useState(null); // menu id
  const fileInputRef = useRef(null);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    const created = await create(name);
    if (!created) return;
    setNewName('');
    setExpandedId(created.id); // open the editor so the user can pick template + categories
  }

  // Open /menu/tv in a new tab with the same base64 creds the share card
  // uses, so any device that opens the link gets a full-screen rotating menu
  // without needing to log in.
  function openTvView() {
    if (typeof window === 'undefined') return;
    const url = localStorage.getItem('tinypos_supabase_url');
    const key = localStorage.getItem('tinypos_supabase_anon_key');
    if (!url || !key) {
      showAlert?.(t('menusTab.missingConfigTitle'), t('menusTab.missingConfigDesc'));
      return;
    }
    const tvUrl = `${menuBaseUrl()}/menu/tv?u=${btoa(url)}&k=${btoa(key)}`;
    openInBrowser(tvUrl);
  }

  if (loading) return <div className="admin-section fade-in"><p>{t('menusTab.loading')}</p></div>;

  return (
    <div className="admin-section fade-in">
      <div className="admin-section-header" style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, color: 'var(--text-main)', fontSize: '2rem', fontWeight: 800 }}>{t('menusTab.title')}{' '}<InfoTip text={t('pageInfo.menus')} section="menus" /></h1>
          <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: '1.05rem' }}>
            {t('menusTab.subtitle')}
          </p>
        </div>
        <button onClick={openTvView} style={btnSecondary} title={t('menusTab.tvTitle')}>
          <Icon icon="lucide:tv" /> {t('menusTab.tvButton')}
        </button>
      </div>

      <div style={{ background: 'var(--bg-surface)', padding: 20, borderRadius: 'var(--admin-card-radius)', border: '1px solid var(--border)', marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder={t('menusTab.newNamePlaceholder')}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            style={{ flex: 1, padding: 14, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontWeight: 700, outline: 'none' }}
          />
          <button onClick={handleCreate} style={btnPrimary}>
            <Icon icon="lucide:plus" /> {t('menusTab.btnCreate')}
          </button>
          <button onClick={() => fileInputRef.current?.click()} style={btnSecondary} disabled={!!uploadProgress}>
            <Icon icon="lucide:upload" /> {t('menusTab.btnUpload')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0];
              e.target.value = ''; // allow re-uploading the same file later
              upload(f);
            }}
          />
        </div>
        {uploadProgress && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            <Icon icon="lucide:loader" style={{ animation: 'spin 1s linear infinite' }} />
            {progressLabel(uploadProgress, t)}
          </div>
        )}
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          {t('menusTab.uploadHint').replace('{pdf}', Math.round(MAX_PDF_BYTES / 1024 / 1024)).replace('{img}', Math.round(MAX_IMAGE_BYTES / 1024 / 1024))}
        </p>
      </div>

      <MenuShareCard menuData={menuData} />

      <PublicPageTraffic page="menu" />

      <ConflictBanner conflicts={findScheduleConflicts(menus)} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 24 }}>
        {menus.map(menu => (
          <MenuCard
            key={menu.id}
            menu={menu}
            expanded={expandedId === menu.id}
            onExpand={() => setExpandedId(expandedId === menu.id ? null : menu.id)}
            onRename={name => rename(menu, name)}
            onToggleActive={() => toggleActive(menu)}
            onPriority={delta => bumpPriority(menu, delta)}
            onDelete={() => remove(menu)}
            onScheduleChange={reload}
            showAlert={showAlert}
            categoryNames={menuData?.categoryOrder || []}
            menuCategories={menuData?.categories || {}}
            onOpenCanvas={() => setEditingCanvasFor(menu.id)}
          />
        ))}
      </div>

      <PublicMenuContent menuData={menuData} onSet={onSetItemPublicFields} />

      {editingCanvasFor && (() => {
        const menu = menus.find(m => m.id === editingCanvasFor);
        if (!menu) return null;
        return (
          <CanvasEditor
            menu={menu}
            menuData={menuData}
            showAlert={showAlert}
            onClose={async (saved) => {
              setEditingCanvasFor(null);
              if (saved) await reload();
            }}
          />
        );
      })()}
    </div>
  );
}

export default MenusTab;
