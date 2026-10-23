
// Editor for kind='designed' menus — picks a template, optionally restricts
// which catalog categories appear, and lets the owner override the accent
// color. Bindings are by category name (matches how the rest of the app
// stores category references in JSONB); renaming a category will silently
// drop it from the selection.
// Resolve the catalog into the [{ name, items: [{ id }] }] shape the canvas
// template factories expect, honoring the same category selection the
// template/list renderer uses (empty selection = all categories, in order).
export function buildTemplateCatalog(menuCategories, selectedNames, allNames) {
  const names = (selectedNames && selectedNames.length > 0)
    ? allNames.filter(n => selectedNames.includes(n))   // keep catalog order
    : allNames;
  return names.map(name => ({ name, items: menuCategories?.[name] || [] }));
}

export function kindIcon(kind) {
  return ({
    live:     'lucide:coffee',
    pdf:      'lucide:file-text',
    image:    'lucide:image',
    designed: 'lucide:palette'
  })[kind] || 'lucide:menu';
}
export function kindLabel(kind, t) {
  return ({
    live:     t('menusTab.kindLive'),
    pdf:      'PDF',
    image:    t('menusTab.kindImage'),
    designed: t('menusTab.kindDesigned')
  })[kind] || kind;
}
export function dayLabel(d, t) {
  const key = { mon: 'dayMon', tue: 'dayTue', wed: 'dayWed', thu: 'dayThu', fri: 'dayFri', sat: 'daySat', sun: 'daySun' }[d];
  return key ? t(`menusTab.${key}`) : d;
}

export function progressLabel(p, t) {
  if (!p) return '';
  const page = (key) => t(key).replace('{current}', p.current).replace('{total}', p.total);
  if (p.phase === 'starting') return t('menusTab.progStarting');
  if (p.phase === 'loading-pdf') return t('menusTab.progLoadingPdf');
  if (p.phase === 'rendering') return page('menusTab.progRendering');
  if (p.phase === 'uploading') return page('menusTab.progUploading');
  if (p.phase === 'uploading-original') return t('menusTab.progOriginal');
  return t('menusTab.progProcessing');
}

export const inputStyle = { padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontWeight: 700, outline: 'none' };
export const btnPrimary = { padding: '12px 18px', borderRadius: 12, border: 'none', background: 'var(--brand-color)', color: 'white', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 };
export const btnSecondary = { padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 };
export const iconBtn = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' };
export const dangerBtn = { padding: '8px 12px', borderRadius: 8, border: '1px solid #d9534f', background: 'transparent', color: '#d9534f', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 };
export const activeBtn = { padding: '8px 12px', borderRadius: 8, border: '1px solid #27ae60', background: 'rgba(39,174,96,0.1)', color: '#27ae60', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 };
export const inactiveBtn = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 };
export const kindBadge = { padding: '4px 10px', borderRadius: 999, background: 'var(--bg-main)', color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' };
export const priBtn = { background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', display: 'flex', padding: 4 };
