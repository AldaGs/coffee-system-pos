// MenusTab — manage multiple menus + their schedules. The resolver in
// get_active_menu() picks one server-side based on priority + matching
// schedules (in shop-local time). The implicit kind='live' row represents
// the catalog; it can be renamed and re-prioritized but not deleted.
//
// P1 scope: list / create (placeholder kinds) / rename / toggle active /
// priority bump / per-menu schedule editor. PDF upload (P2), TV (P3), and
// the designer (P4) plug in by adding kind-specific creation flows and
// renderers; the data model and resolver don't change.

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import {
  loadMenus, addMenu, updateMenu, deleteMenu,
  addSchedule, updateSchedule, deleteSchedule,
  DAY_ORDER, DAY_BITS, daysToBitmask, bitmaskToDays
} from '../../api/menus';
import { uploadMenuFile, deleteMenuUploads, MAX_PDF_BYTES, MAX_IMAGE_BYTES } from '../../api/menuUploads';
import MenuShareCard from './MenuShareCard';
import { findScheduleConflicts } from '../../utils/scheduleConflicts';
import { FONT_PRESETS } from '../../utils/menuTheme';
import { sampleDocument, templateDoc } from '../../utils/canvasDocument';
import CanvasEditor from '../menuCanvas/CanvasEditor';
import QRCode from 'qrcode';

function MenusTab({ showAlert, showConfirm, menuData }) {
  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [editingCanvasFor, setEditingCanvasFor] = useState(null); // menu id
  const fileInputRef = useRef(null);

  async function reload() {
    try {
      setMenus(await loadMenus());
    } catch (err) {
      showAlert?.('Error', err.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { reload(); }, []);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    try {
      const created = await addMenu({ name, kind: 'designed', priority: 1 });
      setNewName('');
      setExpandedId(created.id);    // open the editor so the user can pick template + categories
      await reload();
    } catch (err) { showAlert?.('Error', err.message); }
  }

  async function handleRename(menu, name) {
    try { await updateMenu(menu.id, { name }); await reload(); }
    catch (err) { showAlert?.('Error', err.message); }
  }

  async function handleToggleActive(menu) {
    try { await updateMenu(menu.id, { is_active: !menu.is_active }); await reload(); }
    catch (err) { showAlert?.('Error', err.message); }
  }

  async function handlePriority(menu, delta) {
    try { await updateMenu(menu.id, { priority: Math.max(0, menu.priority + delta) }); await reload(); }
    catch (err) { showAlert?.('Error', err.message); }
  }

  async function handleDelete(menu) {
    if (menu.kind === 'live') return;
    showConfirm?.('Eliminar menú', `¿Eliminar "${menu.name}"?`, async () => {
      try {
        // Best-effort storage cleanup before the row goes; FK cascade handles schedules.
        if (menu.kind === 'pdf' || menu.kind === 'image') {
          await deleteMenuUploads(menu.id);
        }
        await deleteMenu(menu.id);
        await reload();
      } catch (err) { showAlert?.('Error', err.message); }
    });
  }

  // Upload flow: create the menu row first so we have a stable id for the
  // storage folder, then convert + upload, then write the data envelope.
  // If conversion fails after the row is created we still leave the row
  // (kind defaults to 'designed' empty), so the user can see and retry/delete.
  async function handleUpload(file) {
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    const stem = file.name.replace(/\.[^.]+$/, '') || 'Menú';
    let menu;
    try {
      menu = await addMenu({ name: stem, kind: 'designed', priority: 1 });
    } catch (err) {
      showAlert?.('Error', err.message);
      return;
    }
    try {
      setUploadProgress({ phase: 'starting' });
      const { kind, data } = await uploadMenuFile(menu.id, file, p => setUploadProgress(p));
      await updateMenu(menu.id, { kind, data });
      await reload();
    } catch (err) {
      // Leave the empty row behind so the user can choose what to do; don't
      // silently delete their work.
      showAlert?.('Error subiendo menú', err.message);
    } finally {
      setUploadProgress(null);
    }
  }

  function triggerUpload() {
    fileInputRef.current?.click();
  }

  // Open /menu/tv in a new tab with the same base64 creds the share card
  // uses, so any device that opens the link gets a full-screen rotating menu
  // without needing to log in.
  function openTvView() {
    if (typeof window === 'undefined') return;
    const url = localStorage.getItem('tinypos_supabase_url');
    const key = localStorage.getItem('tinypos_supabase_anon_key');
    if (!url || !key) {
      showAlert?.('Configuración faltante', 'No se encontraron credenciales locales para construir el enlace.');
      return;
    }
    const tvUrl = `${window.location.origin}/menu/tv?u=${btoa(url)}&k=${btoa(key)}`;
    window.open(tvUrl, '_blank', 'noopener,noreferrer');
  }

  if (loading) return <div className="admin-section fade-in"><p>Cargando…</p></div>;

  return (
    <div className="admin-section fade-in">
      <div className="admin-section-header" style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, color: 'var(--text-main)', fontSize: '2rem', fontWeight: 800 }}>Menús</h1>
          <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: '1.05rem' }}>
            Múltiples menús con horarios. El de mayor prioridad cuyo horario coincida con la hora actual del negocio se muestra al cliente.
          </p>
        </div>
        <button onClick={openTvView} style={btnSecondary} title="Abre /menu/tv en otra pestaña — para una tablet o pantalla">
          <Icon icon="lucide:tv" /> Vista TV / kiosko
        </button>
      </div>

      <div style={{ background: 'var(--bg-surface)', padding: 20, borderRadius: 'var(--admin-card-radius)', border: '1px solid var(--border)', marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <input
            type="text"
            placeholder="Nombre del nuevo menú (ej. Brunch, Verano)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            style={{ flex: 1, padding: 14, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontWeight: 700, outline: 'none' }}
          />
          <button onClick={handleCreate} style={btnPrimary}>
            <Icon icon="lucide:plus" /> Crear
          </button>
          <button onClick={triggerUpload} style={btnSecondary} disabled={!!uploadProgress}>
            <Icon icon="lucide:upload" /> Subir PDF o imagen
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0];
              e.target.value = ''; // allow re-uploading the same file later
              handleUpload(f);
            }}
          />
        </div>
        {uploadProgress && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            <Icon icon="lucide:loader" style={{ animation: 'spin 1s linear infinite' }} />
            {progressLabel(uploadProgress)}
          </div>
        )}
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          Sube un PDF (máx {Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB) o imagen (máx {Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB). El PDF se convierte a páginas WebP para mostrar y se guarda el original para descarga.
        </p>
      </div>

      <MenuShareCard menuData={menuData} />

      <ConflictBanner conflicts={findScheduleConflicts(menus)} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 24 }}>
        {menus.map(menu => (
          <MenuCard
            key={menu.id}
            menu={menu}
            expanded={expandedId === menu.id}
            onExpand={() => setExpandedId(expandedId === menu.id ? null : menu.id)}
            onRename={name => handleRename(menu, name)}
            onToggleActive={() => handleToggleActive(menu)}
            onPriority={delta => handlePriority(menu, delta)}
            onDelete={() => handleDelete(menu)}
            onScheduleChange={reload}
            showAlert={showAlert}
            categoryNames={menuData?.categoryOrder || []}
            menuCategories={menuData?.categories || {}}
            onOpenCanvas={() => setEditingCanvasFor(menu.id)}
          />
        ))}
      </div>

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

function MenuCard({ menu, expanded, onExpand, onRename, onToggleActive, onPriority, onDelete, onScheduleChange, showAlert, categoryNames, menuCategories, onOpenCanvas }) {
  const [name, setName] = useState(menu.name);
  useEffect(() => { setName(menu.name); }, [menu.name]);

  const isLive = menu.kind === 'live';

  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--admin-card-radius)', border: '1px solid var(--border)', overflow: 'hidden', opacity: menu.is_active ? 1 : 0.55 }}>
      <div style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Icon icon={kindIcon(menu.kind)} style={{ fontSize: '1.4rem', color: 'var(--brand-color)' }} />
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={() => { if (name !== menu.name && name.trim()) onRename(name.trim()); }}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid transparent', background: 'transparent', color: 'var(--text-main)', fontWeight: 800, fontSize: '1.05rem', outline: 'none' }}
        />

        <span style={kindBadge}>{kindLabel(menu.kind)}</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 8, background: 'var(--bg-main)' }}>
          <button onClick={() => onPriority(-1)} disabled={isLive || menu.priority <= 0} style={priBtn} title="Bajar prioridad">
            <Icon icon="lucide:chevron-down" />
          </button>
          <span style={{ fontWeight: 800, minWidth: 18, textAlign: 'center', color: 'var(--text-main)' }}>{menu.priority}</span>
          <button onClick={() => onPriority(+1)} disabled={isLive} style={priBtn} title="Subir prioridad">
            <Icon icon="lucide:chevron-up" />
          </button>
        </div>

        <button onClick={onToggleActive} style={menu.is_active ? activeBtn : inactiveBtn}>
          <Icon icon={menu.is_active ? 'lucide:eye' : 'lucide:eye-off'} />
          {menu.is_active ? 'Activo' : 'Pausado'}
        </button>

        <button onClick={onExpand} style={iconBtn} title="Horarios">
          <Icon icon="lucide:calendar-clock" />
          <span style={{ fontWeight: 700 }}>{menu.schedules.length} horario{menu.schedules.length === 1 ? '' : 's'}</span>
        </button>

        <button onClick={onExpand} style={iconBtn} title={expanded ? 'Cerrar' : (menu.kind === 'designed' ? 'Diseño + horarios' : 'Horarios')}>
          <Icon icon={expanded ? 'lucide:chevron-up' : 'lucide:chevron-down'} />
        </button>

        {!isLive && (
          <button onClick={onDelete} style={dangerBtn} title="Eliminar menú">
            <Icon icon="lucide:trash-2" />
          </button>
        )}
      </div>

      {expanded && (
        <>
          {menu.kind === 'designed' && (
            <DesignedEditor menu={menu} onChange={onScheduleChange} showAlert={showAlert} categoryNames={categoryNames} menuCategories={menuCategories} onOpenCanvas={onOpenCanvas} />
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

// Editor for kind='designed' menus — picks a template, optionally restricts
// which catalog categories appear, and lets the owner override the accent
// color. Bindings are by category name (matches how the rest of the app
// stores category references in JSONB); renaming a category will silently
// drop it from the selection.
// Resolve the catalog into the [{ name, items: [{ id }] }] shape the canvas
// template factories expect, honoring the same category selection the
// template/list renderer uses (empty selection = all categories, in order).
function buildTemplateCatalog(menuCategories, selectedNames, allNames) {
  const names = (selectedNames && selectedNames.length > 0)
    ? allNames.filter(n => selectedNames.includes(n))   // keep catalog order
    : allNames;
  return names.map(name => ({ name, items: menuCategories?.[name] || [] }));
}

function DesignedEditor({ menu, onChange, showAlert, categoryNames, menuCategories, onOpenCanvas }) {
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

  function applyTemplate(t) { setTemplate(t); patch({ template: t }); }
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
        <p style={{ margin: '0 0 8px', fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Plantilla</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { id: 'list',       label: 'Lista',           icon: 'lucide:align-justify' },
            { id: 'cards',      label: 'Tarjetas',        icon: 'lucide:layout-grid' },
            { id: 'chalkboard', label: 'Pizarra',         icon: 'lucide:square-pen' }
          ].map(t => (
            <button key={t.id} onClick={() => applyTemplate(t.id)} style={{
              padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)',
              background: template === t.id ? 'var(--brand-color)' : 'var(--bg-surface)',
              color: template === t.id ? 'white' : 'var(--text-main)',
              cursor: 'pointer', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6
            }}>
              <Icon icon={t.icon} />{t.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p style={{ margin: '0 0 8px', fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Categorías</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={toggleAll} style={{
            padding: '6px 12px', borderRadius: 999, border: '1px solid var(--border)',
            background: all ? 'var(--brand-color)' : 'var(--bg-surface)',
            color: all ? 'white' : 'var(--text-main)',
            cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem'
          }}>Todas</button>
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
        <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Color de acento</p>
        <input type="color" value={accent || '#f28b05'} onChange={e => setAccent(e.target.value)} onBlur={() => applyAccent(accent)} style={{ width: 40, height: 32, border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', cursor: 'pointer' }} />
        {accent && (
          <button onClick={() => applyAccent('')} style={{ ...btnSecondary, padding: '6px 12px', fontSize: '0.8rem' }}>
            Usar marca por defecto
          </button>
        )}
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={data.hide_out_of_stock !== false}
          onChange={e => patch({ hide_out_of_stock: e.target.checked })}
        />
        <span style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
          Ocultar productos agotados
          <span style={{ color: 'var(--text-muted)', fontWeight: 500, marginLeft: 4 }}>
            (basado en inventario)
          </span>
        </span>
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <input
          type="checkbox"
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
  const hasDoc = !!data.document;
  const shopName = menu.name || 'Menú';

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

  const TEMPLATE_LABEL = { list: 'Lista', cards: 'Tarjetas', chalkboard: 'Pizarra' };

  return (
    <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lienzo libre (beta)</p>
        <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          {hasDoc
            ? 'Este menú se renderiza desde un documento de lienzo. Plantilla y categorías arriba quedan ignoradas.'
            : `Convierte la plantilla “${TEMPLATE_LABEL[template] || 'Lista'}” y las categorías de arriba en un lienzo editable. Cada producto se coloca como un bloque que puedes mover y rediseñar.`}
        </p>
      </div>
      {hasDoc ? (
        <>
          <button onClick={onOpenCanvas} style={btnPrimary}>
            <Icon icon="lucide:pen-tool" /> Abrir editor
          </button>
          <button onClick={clear} style={dangerBtn}>
            <Icon icon="lucide:x" /> Quitar lienzo
          </button>
        </>
      ) : (
        <>
          <button onClick={() => seed({ open: true })} style={btnPrimary}>
            <Icon icon="lucide:layout-template" /> Crear lienzo desde “{TEMPLATE_LABEL[template] || 'Lista'}”
          </button>
          <button onClick={() => seed({ kind: 'blank', open: true })} style={btnSecondary}>
            <Icon icon="lucide:square" /> Lienzo en blanco
          </button>
        </>
      )}
    </div>
  );
}

// Phase 4b theme tokens. Writes onto menu.data.theme. Defaults (left empty)
// let the template fall back to its built-in look, so adopting themes is
// opt-in and reversible per token.
function ThemeEditor({ menu, data, onChange, showAlert }) {
  const theme = data.theme || {};

  async function patchTheme(patch) {
    try {
      const next = { ...theme, ...patch };
      // Strip empty strings so applyTheme() falls back cleanly.
      for (const k of Object.keys(patch)) {
        if (next[k] === '' || next[k] == null) delete next[k];
      }
      await updateMenu(menu.id, { data: { ...data, theme: next } });
      onChange();
    } catch (err) { showAlert?.('Error', err.message); }
  }

  return (
    <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estilo</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Tipografía">
          <select value={theme.font_preset || 'system'} onChange={e => patchTheme({ font_preset: e.target.value })} style={inputStyle}>
            {Object.entries(FONT_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="Densidad">
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { id: 'compact', label: 'Compacto' },
              { id: 'cozy',    label: 'Cómodo' },
              { id: 'roomy',   label: 'Amplio' }
            ].map(d => {
              const on = (theme.density || 'cozy') === d.id;
              return (
                <button key={d.id} onClick={() => patchTheme({ density: d.id })} style={{
                  flex: 1, padding: '10px 6px', borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: on ? 'var(--brand-color)' : 'var(--bg-surface)',
                  color: on ? 'white' : 'var(--text-main)',
                  fontWeight: 700, cursor: 'pointer', fontSize: '0.78rem'
                }}>{d.label}</button>
              );
            })}
          </div>
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <ColorField label="Fondo"  value={theme.background} onClear={() => patchTheme({ background: '' })} onChange={v => patchTheme({ background: v })} />
        <ColorField label="Texto"  value={theme.text}       onClear={() => patchTheme({ text: '' })}       onChange={v => patchTheme({ text: v })} />
        <ColorField label="Acento" value={theme.accent}     onClear={() => patchTheme({ accent: '' })}     onChange={v => patchTheme({ accent: v })} />
      </div>

      <Field label="URL de Google Fonts (opcional)">
        <input
          type="url"
          placeholder="https://fonts.googleapis.com/css2?family=Playfair+Display&display=swap"
          defaultValue={theme.google_font_url || ''}
          onBlur={e => patchTheme({ google_font_url: e.target.value.trim() })}
          style={inputStyle}
        />
      </Field>
    </div>
  );
}

function ColorField({ label, value, onChange, onClear }) {
  return (
    <Field label={label}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="color"
          value={value || '#000000'}
          onChange={e => onChange(e.target.value)}
          style={{ width: 36, height: 32, border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', cursor: 'pointer', padding: 0 }}
        />
        <code style={{ flex: 1, fontSize: '0.72rem', color: 'var(--text-muted)' }}>{value || 'auto'}</code>
        {value && (
          <button onClick={onClear} title="Limpiar" style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
            <Icon icon="lucide:x" />
          </button>
        )}
      </div>
    </Field>
  );
}

function ScheduleEditor({ menu, onChange, showAlert }) {
  async function add() {
    try { await addSchedule(menu.id, { days_of_week: 0 }); onChange(); }
    catch (err) { showAlert?.('Error', err.message); }
  }
  async function patch(id, next) {
    try { await updateSchedule(id, next); onChange(); }
    catch (err) { showAlert?.('Error', err.message); }
  }
  async function remove(id) {
    try { await deleteSchedule(id); onChange(); }
    catch (err) { showAlert?.('Error', err.message); }
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: 18, background: 'var(--bg-main)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          {menu.schedules.length === 0
            ? 'Sin horarios — el menú está activo en todo momento (cuando es el de mayor prioridad).'
            : 'El menú se mostrará si CUALQUIER horario coincide con la hora local del negocio.'}
        </p>
        <button onClick={add} style={btnSecondary}>
          <Icon icon="lucide:plus" /> Agregar horario
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {menu.schedules.map(s => (
          <ScheduleRow key={s.id} schedule={s} onPatch={p => patch(s.id, p)} onRemove={() => remove(s.id)} />
        ))}
      </div>
    </div>
  );
}

function ScheduleRow({ schedule, onPatch, onRemove }) {
  const [days, setDays] = useState(bitmaskToDays(schedule.days_of_week));
  const [startTime, setStartTime] = useState(schedule.start_time?.slice(0, 5) || '');
  const [endTime, setEndTime] = useState(schedule.end_time?.slice(0, 5) || '');
  const [startDate, setStartDate] = useState(schedule.start_date || '');
  const [endDate, setEndDate] = useState(schedule.end_date || '');

  function flush(next = {}) {
    onPatch({
      days_of_week: daysToBitmask(next.days ?? days),
      start_time: next.startTime ?? startTime,
      end_time: next.endTime ?? endTime,
      start_date: next.startDate ?? startDate,
      end_date: next.endDate ?? endDate
    });
  }

  function toggleDay(d) {
    const next = days.includes(d) ? days.filter(x => x !== d) : [...days, d];
    setDays(next);
    flush({ days: next });
  }

  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 14, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {DAY_ORDER.map(d => {
          const on = days.includes(d);
          return (
            <button
              key={d}
              onClick={() => toggleDay(d)}
              style={{
                padding: '8px 14px',
                borderRadius: 999,
                border: '1px solid var(--border)',
                background: on ? 'var(--brand-color)' : 'var(--bg-main)',
                color: on ? 'white' : 'var(--text-main)',
                fontWeight: 800,
                cursor: 'pointer',
                textTransform: 'uppercase',
                fontSize: '0.75rem',
                letterSpacing: '0.05em'
              }}
            >{dayLabel(d)}</button>
          );
        })}
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 8 }}>
          {days.length === 0 ? '(todos los días)' : ''}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        <Field label="Desde (hora)">
          <input type="time" value={startTime}
            onChange={e => setStartTime(e.target.value)}
            onBlur={() => flush({ startTime })}
            style={inputStyle} />
        </Field>
        <Field label="Hasta (hora)">
          <input type="time" value={endTime}
            onChange={e => setEndTime(e.target.value)}
            onBlur={() => flush({ endTime })}
            style={inputStyle} />
        </Field>
        <Field label="Desde (fecha)">
          <input type="date" value={startDate}
            onChange={e => setStartDate(e.target.value)}
            onBlur={() => flush({ startDate })}
            style={inputStyle} />
        </Field>
        <Field label="Hasta (fecha)">
          <input type="date" value={endDate}
            onChange={e => setEndDate(e.target.value)}
            onBlur={() => flush({ endDate })}
            style={inputStyle} />
        </Field>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={onRemove} style={dangerBtn}>
          <Icon icon="lucide:trash-2" /> Eliminar horario
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      {children}
    </label>
  );
}

function kindIcon(kind) {
  return ({
    live:     'lucide:coffee',
    pdf:      'lucide:file-text',
    image:    'lucide:image',
    designed: 'lucide:palette'
  })[kind] || 'lucide:menu';
}
function kindLabel(kind) {
  return ({
    live:     'Catálogo',
    pdf:      'PDF',
    image:    'Imagen',
    designed: 'Diseñado'
  })[kind] || kind;
}
function dayLabel(d) {
  return ({ mon:'Lun', tue:'Mar', wed:'Mié', thu:'Jue', fri:'Vie', sat:'Sáb', sun:'Dom' })[d];
}

// Per-menu deep link. Resolves a /menu?u=…&k=…&m=<id> URL using the same
// localStorage creds the central MenuShareCard uses. Each non-live menu
// gets its own block so a shop can print one QR per menu (Brunch QR
// always shows brunch regardless of time).
function MenuShareBlock({ menu }) {
  const canvasRef = useRef(null);
  const [copied, setCopied] = useState(false);

  const link = (() => {
    if (typeof window === 'undefined') return '';
    const supabaseUrl = localStorage.getItem('tinypos_supabase_url');
    const key = localStorage.getItem('tinypos_supabase_anon_key');
    if (!supabaseUrl || !key) return '';
    const projectRef = (() => {
      try { return new URL(supabaseUrl).hostname.split('.')[0]; }
      catch { return ''; }
    })();
    if (projectRef) {
      return `${window.location.origin}/menu?p=${projectRef}&m=${menu.id}`;
    }
    return `${window.location.origin}/menu?u=${btoa(supabaseUrl)}&k=${btoa(key)}&m=${menu.id}`;
  })();

  useEffect(() => {
    if (!canvasRef.current || !link) return;
    QRCode.toCanvas(canvasRef.current, link, {
      width: 140, margin: 1, errorCorrectionLevel: 'L',
      color: { dark: '#111', light: '#ffffff' }
    }).catch(() => {});
  }, [link]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  async function downloadQr() {
    const big = document.createElement('canvas');
    await QRCode.toCanvas(big, link, { width: 1024, margin: 2, errorCorrectionLevel: 'L', color: { dark: '#111', light: '#ffffff' } });
    const a = document.createElement('a');
    a.href = big.toDataURL('image/png');
    a.download = `menu-${menu.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || menu.id}.png`;
    a.click();
  }

  async function downloadQrSvg() {
    const svgString = await QRCode.toString(link, { type: 'svg', width: 1024, margin: 2, errorCorrectionLevel: 'L', color: { dark: '#111', light: '#ffffff' } });
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `menu-${menu.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || menu.id}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (!link) {
    return (
      <div style={{ borderTop: '1px solid var(--border)', padding: 18, background: 'var(--bg-main)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        Credenciales locales no disponibles para generar el enlace.
      </div>
    );
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: 18, background: 'var(--bg-main)', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <canvas ref={canvasRef} style={{ borderRadius: 8, background: 'white', padding: 4 }} />
      <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Enlace directo a este menú
        </p>
        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          Esta URL muestra <strong>{menu.name}</strong> sin importar el horario — útil para imprimir un QR distinto por menú.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--bg-surface)', borderRadius: 8, padding: '8px 10px', border: '1px solid var(--border)' }}>
          <code style={{ flex: 1, fontSize: '0.7rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link}</code>
          <button onClick={copy} style={{ ...btnSecondary, padding: '6px 10px', fontSize: '0.78rem' }}>
            <Icon icon={copied ? 'lucide:check' : 'lucide:copy'} /> {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={downloadQr} style={{ ...btnSecondary, alignSelf: 'flex-start' }}>
            <Icon icon="lucide:image" /> PNG
          </button>
          <button onClick={downloadQrSvg} style={{ ...btnSecondary, alignSelf: 'flex-start' }}>
            <Icon icon="lucide:move-diagonal" /> SVG
          </button>
        </div>
      </div>
    </div>
  );
}

function ConflictBanner({ conflicts }) {
  if (!conflicts || conflicts.length === 0) return null;
  return (
    <div style={{ marginTop: 16, padding: 16, borderRadius: 12, border: '1px solid #e0a800', background: 'rgba(224, 168, 0, 0.08)', color: 'var(--text-main)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Icon icon="lucide:triangle-alert" style={{ color: '#e0a800', fontSize: '1.2rem' }} />
        <strong>Horarios traslapados</strong>
      </div>
      <p style={{ margin: '0 0 10px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
        Estos menús podrían estar activos al mismo tiempo. El resolutor elige por prioridad — confirma que es lo que quieres:
      </p>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {conflicts.map((c, i) => (
          <li key={i}>
            <strong>{c.a.name}</strong> (prio {c.a.priority}) ↔ <strong>{c.b.name}</strong> (prio {c.b.priority})
            {' — '}
            {c.sharedPriority
              ? <span style={{ color: '#d9534f', fontWeight: 700 }}>misma prioridad: gana el más reciente ({c.winner?.name})</span>
              : <span>gana <strong>{c.winner?.name}</strong></span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function progressLabel(p) {
  if (!p) return '';
  if (p.phase === 'starting') return 'Preparando…';
  if (p.phase === 'loading-pdf') return 'Leyendo PDF…';
  if (p.phase === 'rendering') return `Convirtiendo página ${p.current} / ${p.total}…`;
  if (p.phase === 'uploading') return `Subiendo página ${p.current} / ${p.total}…`;
  if (p.phase === 'uploading-original') return 'Guardando PDF original…';
  return 'Procesando…';
}

const inputStyle = { padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontWeight: 700, outline: 'none' };
const btnPrimary = { padding: '12px 18px', borderRadius: 12, border: 'none', background: 'var(--brand-color)', color: 'white', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 };
const btnSecondary = { padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 };
const iconBtn = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' };
const dangerBtn = { padding: '8px 12px', borderRadius: 8, border: '1px solid #d9534f', background: 'transparent', color: '#d9534f', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 };
const activeBtn = { padding: '8px 12px', borderRadius: 8, border: '1px solid #27ae60', background: 'rgba(39,174,96,0.1)', color: '#27ae60', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 };
const inactiveBtn = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 };
const kindBadge = { padding: '4px 10px', borderRadius: 999, background: 'var(--bg-main)', color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' };
const priBtn = { background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', display: 'flex', padding: 4 };

export default MenusTab;
