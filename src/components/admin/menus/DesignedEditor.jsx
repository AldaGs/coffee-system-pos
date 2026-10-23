import { useState } from 'react';
import { Icon } from '@iconify/react';
import { updateMenu } from '../../../api/menus';
import { sampleDocument, templateDoc } from '../../../utils/canvasDocument';
import CanvasEditor from '../../menuCanvas/CanvasEditor';
import { useTranslation } from '../../../hooks/useTranslation';
import { ThemeEditor } from './ThemeEditor';
import { buildTemplateCatalog, btnPrimary, btnSecondary, dangerBtn } from './menuShared';

// Options for the implicit kind='live' catalog menu — the one shared as the
// default public menu / QR. Writes onto the live menu row's data jsonb, read
// by PublicMenu's live branch. Out-of-stock defaults to SHOWN (badge) so a
// coffee lineup can advertise the full list; ticking the box hides sold-out
// items instead (based on inventory stock).
export function LiveMenuOptions({ menu, onChange, showAlert }) {
  const { t } = useTranslation();
  const data = menu.data || {};
  async function patch(next) {
    try {
      await updateMenu(menu.id, { data: { ...data, ...next } });
      onChange();
    } catch (err) { showAlert?.('Error', err.message); }
  }
  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: 18, background: 'var(--bg-main)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <input
          type="checkbox" className="switch"
          checked={data.hide_out_of_stock === true}
          onChange={e => patch({ hide_out_of_stock: e.target.checked })}
        />
        <span style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
          {t('menusTab.hideOos')}
          <span style={{ color: 'var(--text-muted)', fontWeight: 500, marginLeft: 4 }}>
            {t('menusTab.hideOosLiveHint')}
          </span>
        </span>
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <input
          type="checkbox" className="switch"
          checked={data.show_modifiers !== false}
          onChange={e => patch({ show_modifiers: e.target.checked })}
        />
        <span style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
          Mostrar modificadores
          <span style={{ color: 'var(--text-muted)', fontWeight: 500, marginLeft: 4 }}>
            (opciones bajo cada producto)
          </span>
        </span>
      </label>
    </div>
  );
}

export function DesignedEditor({ menu, onChange, showAlert, categoryNames, menuCategories, onOpenCanvas }) {
  const { t } = useTranslation();
  const data = menu.data || {};
  const [template, setTemplate] = useState(data.template || 'list');
  const [selected, setSelected] = useState(data.category_names || []);
  const [accent, setAccent] = useState(data.accent_color || '');
  const all = selected.length === 0;

  async function patch(next) {
    try {
      await updateMenu(menu.id, { data: { ...data, ...next } });
      onChange();
    } catch (err) { showAlert?.('Error', err.message); }
  }

  function applyTemplate(id) { setTemplate(id); patch({ template: id }); }
  function applyAccent(c)    { setAccent(c); patch({ accent_color: c || null }); }
  function toggleAll()       { setSelected([]); patch({ category_names: [] }); }
  function toggleCategory(name) {
    const base = all ? categoryNames : selected;
    const next = base.includes(name) ? base.filter(n => n !== name) : [...base, name];
    setSelected(next);
    patch({ category_names: next });
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: 18, background: 'var(--bg-main)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <p style={{ margin: '0 0 8px', fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('menusTab.template')}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { id: 'list',       label: t('menusTab.tplList'),       icon: 'lucide:align-justify' },
            { id: 'cards',      label: t('menusTab.tplCards'),      icon: 'lucide:layout-grid' },
            { id: 'chalkboard', label: t('menusTab.tplChalkboard'), icon: 'lucide:square-pen' }
          ].map(tpl => (
            <button key={tpl.id} onClick={() => applyTemplate(tpl.id)} style={{
              padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)',
              background: template === tpl.id ? 'var(--brand-color)' : 'var(--bg-surface)',
              color: template === tpl.id ? 'white' : 'var(--text-main)',
              cursor: 'pointer', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6
            }}>
              <Icon icon={tpl.icon} />{tpl.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p style={{ margin: '0 0 8px', fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('menusTab.categories')}</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={toggleAll} style={{
            padding: '6px 12px', borderRadius: 999, border: '1px solid var(--border)',
            background: all ? 'var(--brand-color)' : 'var(--bg-surface)',
            color: all ? 'white' : 'var(--text-main)',
            cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem'
          }}>{t('menusTab.allCategories')}</button>
          {categoryNames.map(name => {
            const on = !all && selected.includes(name);
            return (
              <button key={name} onClick={() => toggleCategory(name)} style={{
                padding: '6px 12px', borderRadius: 999, border: '1px solid var(--border)',
                background: on ? 'var(--brand-color)' : 'var(--bg-surface)',
                color: on ? 'white' : 'var(--text-main)',
                cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem'
              }}>{name}</button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('menusTab.accentColor')}</p>
        <input type="color" value={accent || '#f28b05'} onChange={e => setAccent(e.target.value)} onBlur={() => applyAccent(accent)} style={{ width: 40, height: 32, border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', cursor: 'pointer' }} />
        {accent && (
          <button onClick={() => applyAccent('')} style={{ ...btnSecondary, padding: '6px 12px', fontSize: '0.8rem' }}>
            {t('menusTab.useBrandDefault')}
          </button>
        )}
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <input
          type="checkbox" className="switch"
          checked={data.hide_out_of_stock !== false}
          onChange={e => patch({ hide_out_of_stock: e.target.checked })}
        />
        <span style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
          {t('menusTab.hideOos')}
          <span style={{ color: 'var(--text-muted)', fontWeight: 500, marginLeft: 4 }}>
            {t('menusTab.hideOosHint')}
          </span>
        </span>
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <input
          type="checkbox" className="switch"
          checked={data.show_modifiers !== false}
          onChange={e => patch({ show_modifiers: e.target.checked })}
        />
        <span style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
          Mostrar modificadores
          <span style={{ color: 'var(--text-muted)', fontWeight: 500, marginLeft: 4 }}>
            (opciones bajo cada producto)
          </span>
        </span>
      </label>

      {template === 'list' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox" className="switch"
            checked={data.list_show_images === true}
            onChange={e => patch({ list_show_images: e.target.checked })}
          />
          <span style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
            {t('menusTab.showImages')}
            <span style={{ color: 'var(--text-muted)', fontWeight: 500, marginLeft: 4 }}>
              {t('menusTab.showImagesHint')}
            </span>
          </span>
        </label>
      )}

      <ThemeEditor menu={menu} data={data} onChange={onChange} showAlert={showAlert} />

      <CanvasBetaToggle
        menu={menu}
        data={data}
        onChange={onChange}
        showAlert={showAlert}
        onOpenCanvas={onOpenCanvas}
        template={template}
        catalog={buildTemplateCatalog(menuCategories, all ? categoryNames : selected, categoryNames)}
      />
    </div>
  );
}

// 4c.6 — beta seed/clear. Flips a designed menu into canvas mode by
// materializing the selected template (Lista / Tarjetas / Pizarra) into a
// real document the owner can fork-and-edit, seeding menu.data.theme too so
// the visual identity carries over. Removing the document drops the menu
// back to template mode without losing the rest of menu.data.
function CanvasBetaToggle({ menu, data, onChange, showAlert, onOpenCanvas, template, catalog }) {
  const { t } = useTranslation();
  const hasDoc = !!data.document;
  const shopName = menu.name || t('menusTab.defaultName');

  // Seed from a starter template, or blank when the user wants a clean slate.
  async function seed({ kind = template, open = false } = {}) {
    try {
      let doc, theme;
      if (kind === 'blank') {
        doc = sampleDocument({ shopName });
      } else {
        const built = templateDoc(kind, { shopName, categories: catalog });
        doc = built.document;
        theme = built.theme;
      }
      const nextData = { ...data, document: doc };
      // Only seed a theme if the menu doesn't already carry one, so re-seeding
      // never clobbers tweaks the owner made in the Estilo editor.
      if (theme && !data.theme) nextData.theme = theme;
      await updateMenu(menu.id, { data: nextData });
      // Await the reload so the menus list carries the freshly-seeded
      // document before the editor mounts — CanvasEditor snapshots
      // menu.data.document once, so opening against a stale menu shows blank.
      await onChange?.();
      if (open) onOpenCanvas?.();
    } catch (err) { showAlert?.('Error', err.message); }
  }

  async function clear() {
    try {
      const { document: _doc, ...rest } = data;
      await updateMenu(menu.id, { data: rest });
      onChange();
    } catch (err) { showAlert?.('Error', err.message); }
  }

  const TEMPLATE_LABEL = { list: t('menusTab.tplList'), cards: t('menusTab.tplCards'), chalkboard: t('menusTab.tplChalkboard') };
  const templateLabel = TEMPLATE_LABEL[template] || TEMPLATE_LABEL.list;

  return (
    <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('menusTab.canvasTitle')}</p>
        <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          {hasDoc
            ? t('menusTab.canvasActiveDesc')
            : t('menusTab.canvasSeedDesc').replace('{template}', templateLabel)}
        </p>
      </div>
      {hasDoc ? (
        <>
          <button onClick={onOpenCanvas} style={btnPrimary}>
            <Icon icon="lucide:pen-tool" /> {t('menusTab.openEditor')}
          </button>
          <button onClick={clear} style={dangerBtn}>
            <Icon icon="lucide:x" /> {t('menusTab.removeCanvas')}
          </button>
        </>
      ) : (
        <>
          <button onClick={() => seed({ open: true })} style={btnPrimary}>
            <Icon icon="lucide:layout-template" /> {t('menusTab.createCanvasFrom').replace('{template}', templateLabel)}
          </button>
          <button onClick={() => seed({ kind: 'blank', open: true })} style={btnSecondary}>
            <Icon icon="lucide:square" /> {t('menusTab.blankCanvas')}
          </button>
        </>
      )}
    </div>
  );
}
