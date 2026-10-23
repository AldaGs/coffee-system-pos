// Customer-facing menu. Read-only. No auth, no settings, no admin.
//
// Hits the Supabase get_active_menu() RPC (migration 015) with the
// publishable key. The resolver picks the right menu server-side based on
// priority + scheduled time windows (shop-local), with the catalog 'live'
// menu as always-on fallback. We re-fetch every 5 minutes so a scheduled
// menu swap (e.g. brunch → lunch at 11am) appears without restart.
//
// Response envelope (sanitized — internal fields never reach the client):
//   { menu: {id, kind, name, data}, shop, categories, modifier_groups }
// kind='live' renders categories/modifier_groups (catalog view); 'pdf'/'image'
// render menu.data.pages; 'designed' renders its canvas document, or a template.
//
// Routed at /menu and bypasses every App.jsx gate. URL: /menu?p=PROJECT_REF
// (or a linked custom domain). The Supabase URL is derived from the ref and the
// anon key comes from the public menu bucket's config.json.


import CanvasRenderer from './menuCanvas/CanvasRenderer';
import { useMenuData } from './publicMenu/useMenuData';
import { trackMenu, pageStyle, headerStyle, headerTitleStyle, navStyle, navButtonStyle, mainStyle } from './publicMenu/shared';
import { ItemList } from './publicMenu/items';
import { UploadedMenu, PrintWrapper } from './publicMenu/UploadedMenu';
import { TemplatedMenu } from './publicMenu/templates';
import { TvMode } from './publicMenu/TvMode';
import { LoadingState, EmptyState, ErrorState, ConfigMissing } from './publicMenu/states';

function PublicMenu() {
  const isTvMode = typeof window !== 'undefined' && window.location.pathname === '/menu/tv';
  const isPrintMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('print') === '1';
  const { data, error, activeCategoryId, setActiveCategoryId, groupsById } = useMenuData({ isTvMode, isPrintMode });

  if (error === 'missing-config') return <ConfigMissing />;
  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState />;

  const shop = data.shop || {};
  const brand = shop.brand_color || '#f28b05';
  const lang = shop.language || 'es';
  const menuKind = data.menu?.kind || 'live';
  // Live mode shows out-of-stock items with an "Agotado" badge (rather than
  // hiding them) so a coffee list can advertise the whole lineup and its
  // freshness. Owners who prefer the old hide-when-sold-out behavior can set
  // menu.data.hide_out_of_stock = true on the menu row.
  const hideOos = data.menu?.data?.hide_out_of_stock === true;
  // Drop categories that end up with nothing to show so an empty category's
  // title (and its nav tab) never renders — a heading over a bare "—" reads
  // like a mistake to a customer.
  const categories = (data.categories || [])
    .map(c => ({ ...c, items: hideOos ? c.items.filter(it => it.available !== false) : c.items }))
    .filter(c => c.items.length > 0);
  const activeCategory = categories.find(c => c.id === activeCategoryId) || categories[0];
  // Modifier groups show under each item by default; owners can hide them per
  // menu via menu.data.show_modifiers (set in the menu editor).
  const showModifiers = data.menu?.data?.show_modifiers !== false;

  if (isTvMode) {
    return <TvMode data={data} brand={brand} lang={lang} />;
  }

  // Designed kind:
  //   - menu.data.document present → the freeform canvas renders it.
  //   - otherwise → the chosen template + theme render the categories.
  if (menuKind === 'designed') {
    if (data.menu?.data?.document) {
      if (isPrintMode) {
        return <PrintWrapper enabled>
          <CanvasRenderer document={data.menu.data.document} data={data} lang={lang} isPrint />
        </PrintWrapper>;
      }
      // The global `body { overflow: hidden }` (POS anti-bounce in index.css)
      // would otherwise trap the page stack, so the canvas renderer needs its
      // own scroll container for multi-page / tall (9:16) documents.
      return (
        <div className="tinymenu-scroll" style={{ height: '100dvh', overflowY: 'auto', overflowX: 'hidden', background: '#0a0a0a', WebkitOverflowScrolling: 'touch' }}>
          <CanvasRenderer document={data.menu.data.document} data={data} lang={lang} />
        </div>
      );
    }
    return <TemplatedMenu data={data} brand={brand} lang={lang} />;
  }

  // Uploaded PDF/image kinds render as a page carousel from menu.data.pages.
  if (menuKind === 'pdf' || menuKind === 'image') {
    return (
      <div className="tinymenu-scroll" style={pageStyle}>
        <header style={{ ...headerStyle, background: brand }}>
          <h1 style={headerTitleStyle}>{shop.name || 'Menu'}</h1>
        </header>
        <UploadedMenu menu={data.menu} brand={brand} />
      </div>
    );
  }

  // kind='live': the catalog view. menus.kind only allows these four kinds.
  return (
    <div className="tinymenu-scroll" style={pageStyle}>
      <header style={{ ...headerStyle, background: brand }}>
        <h1 style={headerTitleStyle}>{shop.name || 'Menu'}</h1>
      </header>

      {categories.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <nav style={navStyle} aria-label="Categorías">
            {categories.map(c => {
              const isActive = c.id === activeCategory?.id;
              return (
                <button
                  key={c.id}
                  onClick={() => { setActiveCategoryId(c.id); trackMenu('category_view', { categoryId: c.id }); }}
                  style={{
                    ...navButtonStyle,
                    color: isActive ? brand : '#555',
                    borderBottomColor: isActive ? brand : 'transparent'
                  }}
                >
                  {c.name}
                </button>
              );
            })}
          </nav>

          <main style={mainStyle}>
            {activeCategory && (
              <ItemList
                items={activeCategory.items}
                groupsById={groupsById}
                lang={lang}
                brand={brand}
                showModifiers={showModifiers}
              />
            )}
          </main>
        </>
      )}
    </div>
  );
}

export default PublicMenu;
