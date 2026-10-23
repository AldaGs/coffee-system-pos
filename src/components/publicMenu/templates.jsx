import { useEffect } from 'react';
import { formatForDisplay } from '../../utils/moneyUtils';
import { applyTheme, syncGoogleFontLink } from '../../utils/menuTheme';
import { RoastLine, WhatsAppButton } from './items';
import { mapGroups } from './shared';

export function TemplatedMenu({ data, brand, lang }) {
  const menu = data.menu || {};
  const opts = menu.data || {};
  const wanted = opts.category_names && opts.category_names.length > 0
    ? new Set(opts.category_names)
    : null;
  const hideOos = opts.hide_out_of_stock !== false; // default ON for templates
  const showModifiers = opts.show_modifiers !== false; // default ON
  const listShowImages = opts.list_show_images === true; // list template only, default OFF (emoji)
  const categories = (data.categories || [])
    .filter(c => !wanted || wanted.has(c.name))
    .map(c => hideOos ? { ...c, items: c.items.filter(it => it.available !== false) } : c)
    // Hide a category entirely once it has no items left to show, so its
    // title doesn't render as a heading over an empty section.
    .filter(c => c.items.length > 0);
  const groupsById = mapGroups(data.modifier_groups);

  const template = opts.template || 'list';
  const defaults =
    template === 'chalkboard' ? { background: '#1d2e25', text: '#f5f0e1' } :
    template === 'cards'      ? { background: '#f3f1ee', text: '#1a1a1a' } :
                                { background: '#fafafa', text: '#222'    };
  // accent_color from Phase 4a still wins if user set it before themes existed.
  const themeIn = { ...(opts.theme || {}), accent: (opts.theme?.accent || opts.accent_color) };
  const theme = applyTheme(themeIn, brand, defaults);

  useEffect(() => { syncGoogleFontLink(theme.googleFontUrl); }, [theme.googleFontUrl]);

  const TemplateCmp =
    template === 'cards'      ? CardsTemplate :
    template === 'chalkboard' ? ChalkboardTemplate :
                                ListTemplate;

  // Own scroll container: the global `body { overflow: hidden }` (POS
  // anti-bounce in index.css) would otherwise clip a template taller than the
  // viewport. The template paints its own full-height background inside.
  return (
    <div className="tinymenu-scroll" style={templateScrollStyle}>
      <TemplateCmp
        shopName={data.shop?.name || 'Menu'}
        menuName={menu.name || ''}
        categories={categories}
        groupsById={groupsById}
        theme={theme}
        lang={lang}
        showModifiers={showModifiers}
        showImages={listShowImages}
      />
    </div>
  );
}

const templateScrollStyle = {
  height: '100dvh',
  overflowY: 'auto',
  overflowX: 'hidden',
  WebkitOverflowScrolling: 'touch'
};

function ListTemplate({ shopName, menuName, categories, groupsById, theme, lang, showModifiers = true, showImages = false }) {
  const { fontFamily, background, text, accent, density } = theme;
  // When images are on, size the thumbnail off the row density so denser
  // menus stay compact. Falls back to the emoji in a tinted box when an item
  // has no image, keeping every row aligned.
  const thumb = Math.max(44, density.gap * 5);
  return (
    <div style={{ minHeight: '100vh', background, fontFamily, color: text, paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <header style={{ padding: `${density.pad + 12}px 20px ${density.pad}px`, textAlign: 'center', background: accent, color: 'white' }}>
        <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 900, letterSpacing: '-0.01em' }}>{shopName}</h1>
        {menuName && <p style={{ margin: '6px 0 0', opacity: 0.85, fontWeight: 600 }}>{menuName}</p>}
      </header>
      <main style={{ padding: `${density.pad}px 16px 40px`, maxWidth: 720, margin: '0 auto' }}>
        {categories.map(c => (
          <section key={c.id} style={{ marginBottom: density.sectionGap }}>
            <h2 style={{ margin: `0 0 ${density.gap}px`, fontSize: '1.4rem', color: accent, fontWeight: 800, borderBottom: `2px solid ${accent}`, paddingBottom: 6 }}>{c.name}</h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {c.items.map(it => (
                <li key={it.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: `${density.gap}px 4px`, borderBottom: '1px solid rgba(0,0,0,0.08)', alignItems: 'center' }}>
                  {showImages && (
                    it.image_url ? (
                      <img src={it.image_url} alt="" loading="lazy" style={{ width: thumb, height: thumb, flexShrink: 0, borderRadius: 10, objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <div style={{ width: thumb, height: thumb, flexShrink: 0, borderRadius: 10, background: `${accent}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: thumb * 0.5 }}>{it.emoji || '•'}</div>
                    )
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{!showImages && it.emoji ? `${it.emoji} ` : ''}{it.name}</div>
                    {showModifiers && it.modifier_group_ids?.length > 0 && (
                      <div style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: 2 }}>
                        {it.modifier_group_ids.map(id => groupsById.get(id)?.name).filter(Boolean).join(' · ')}
                      </div>
                    )}
                    <RoastLine roastDate={it.roast_date} lang={lang} />
                    {it.whatsapp_url && <WhatsAppButton url={it.whatsapp_url} lang={lang} itemId={it.id} />}
                  </div>
                  <div style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
                    {it.price_type === 'open' ? '—' : formatForDisplay(it.price_cents, lang)}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}

function CardsTemplate({ shopName, menuName, categories, groupsById, theme, lang, showModifiers = true }) {
  const { fontFamily, background, text, accent, density } = theme;
  return (
    <div style={{ minHeight: '100vh', background, fontFamily, color: text, paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <header style={{ padding: `${density.pad + 20}px 20px ${density.pad + 8}px`, textAlign: 'center' }}>
        <div style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 999, background: accent, color: 'white', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {menuName || 'Menú'}
        </div>
        <h1 style={{ margin: '14px 0 0', fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.02em' }}>{shopName}</h1>
      </header>
      <main style={{ padding: '0 16px 40px', maxWidth: 980, margin: '0 auto' }}>
        {categories.map(c => (
          <section key={c.id} style={{ marginBottom: density.sectionGap }}>
            <h2 style={{ margin: `0 0 ${density.gap + 4}px`, fontSize: '1.5rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.name}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: density.gap + 4 }}>
              {c.items.map(it => (
                <article key={it.id} style={{ background: 'white', borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column' }}>
                  {it.image_url ? (
                    <img src={it.image_url} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <div style={{ aspectRatio: '4/3', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem' }}>{it.emoji || '•'}</div>
                  )}
                  <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, lineHeight: 1.2 }}>{it.name}</h3>
                      <span style={{ fontWeight: 900, color: accent, whiteSpace: 'nowrap' }}>
                        {it.price_type === 'open' ? '—' : formatForDisplay(it.price_cents, lang)}
                      </span>
                    </div>
                    {showModifiers && it.modifier_group_ids?.length > 0 && (
                      <div style={{ fontSize: '0.78rem', opacity: 0.55 }}>
                        {it.modifier_group_ids.map(id => groupsById.get(id)?.name).filter(Boolean).join(' · ')}
                      </div>
                    )}
                    <RoastLine roastDate={it.roast_date} lang={lang} />
                    {it.whatsapp_url && <WhatsAppButton url={it.whatsapp_url} lang={lang} itemId={it.id} />}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}

function ChalkboardTemplate({ shopName, menuName, categories, groupsById, theme, lang, showModifiers = true }) {
  // Defaults give the original chalkboard look without a theme; user
  // overrides flow in via applyTheme — pick a lighter background + serif
  // font and you've got a wedding-menu vibe instead.
  const { fontFamily, background, text, accent, density } = theme;
  return (
    <div style={{ minHeight: '100vh', background, color: text, fontFamily, paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <header style={{ padding: `${density.pad + 20}px 20px ${density.pad + 4}px`, textAlign: 'center', borderBottom: `1px dashed ${text}55` }}>
        <h1 style={{ margin: 0, fontSize: '2.4rem', fontWeight: 700, letterSpacing: '0.02em', color: accent }}>{shopName}</h1>
        {menuName && <p style={{ margin: '6px 0 0', opacity: 0.8 }}>~ {menuName} ~</p>}
      </header>
      <main style={{ padding: `${density.pad + 4}px 20px 40px`, maxWidth: 780, margin: '0 auto' }}>
        {categories.map(c => (
          <section key={c.id} style={{ marginBottom: density.sectionGap }}>
            <h2 style={{ margin: `0 0 ${density.gap + 2}px`, fontSize: '1.8rem', color: accent, textAlign: 'center' }}>· {c.name} ·</h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: density.gap - 2 }}>
              {c.items.map(it => (
                <li key={it.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '8px 0', borderBottom: `1px dotted ${text}33` }}>
                  <div style={{ minWidth: 0, fontSize: '1.15rem' }}>
                    {it.emoji ? `${it.emoji} ` : ''}{it.name}
                    {showModifiers && it.modifier_group_ids?.length > 0 && (
                      <div style={{ fontSize: '0.85rem', opacity: 0.6, marginTop: 2 }}>
                        {it.modifier_group_ids.map(id => groupsById.get(id)?.name).filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '1.25rem', whiteSpace: 'nowrap' }}>
                    {it.price_type === 'open' ? '—' : formatForDisplay(it.price_cents, lang)}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}

// Full-screen kiosk mode at /menu/tv. Requests Wake Lock so tablet screens
// stay on, auto-rotates slides every `rotation_ms` (configurable on the menu
// row's data, default 12s), and crossfades between slides. Re-fetch is
// handled by the parent's 5-min interval, so a scheduled menu swap shows up
// automatically without restart.
//
// Slide set depends on menu kind:
//   live           — one slide per category
//   pdf / image    — one slide per page
//   designed       — placeholder slide (renderer ships in Phase 4)
