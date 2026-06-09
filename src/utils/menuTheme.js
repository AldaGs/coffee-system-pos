// Phase 4b — theme tokens for designer-kind menus. Resolves a sparse
// menu.data.theme object into a flat set of CSS values so templates can
// just spread them into inline styles. Sensible defaults make a brand-new
// designed menu look identical to the current hardcoded templates.
//
// menu.data.theme shape:
//   {
//     font_preset: 'system' | 'serif' | 'display' | 'mono' | 'handwritten',
//     google_font_url?: string,           // optional <link> to load + use as primary stack
//     background: string,                 // page bg (hex)
//     text:       string,                 // body text color (hex)
//     accent:     string,                 // category headings, prices, dividers (hex)
//     density:    'compact' | 'cozy' | 'roomy'
//   }

export const FONT_PRESETS = {
  system:      { label: 'Sistema',       stack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  serif:       { label: 'Serif clásica', stack: 'Georgia, "Times New Roman", "Iowan Old Style", serif' },
  display:     { label: 'Sans display',  stack: '"Helvetica Neue", "Inter", system-ui, sans-serif' },
  mono:        { label: 'Mono',          stack: '"SF Mono", "JetBrains Mono", Menlo, Monaco, Consolas, monospace' },
  handwritten: { label: 'Manuscrita',    stack: '"Marker Felt", "Brush Script MT", "Comic Sans MS", cursive' }
};

const DENSITY = {
  compact: { gap: 8,  pad: 16, sectionGap: 20 },
  cozy:    { gap: 12, pad: 20, sectionGap: 32 },
  roomy:   { gap: 18, pad: 28, sectionGap: 48 }
};

// Extract the first `family=Name+Here` from a Google Fonts URL and convert
// it to a quoted CSS family. Returns null on anything weird so the template
// can fall back to the preset stack.
function googleFontFamily(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!/fonts\.googleapis\.com/.test(u.hostname)) return null;
    const fam = u.searchParams.get('family');
    if (!fam) return null;
    const name = fam.split(':')[0].split('&')[0].replace(/\+/g, ' ').trim();
    return name ? `"${name}"` : null;
  } catch {
    return null;
  }
}

// Resolve theme + brand fallback into a flat object of CSS-ready tokens.
export function applyTheme(theme, brand, defaults = {}) {
  const t = theme || {};
  const preset = FONT_PRESETS[t.font_preset] || FONT_PRESETS.system;
  const googleFam = googleFontFamily(t.google_font_url);
  const fontStack = googleFam ? `${googleFam}, ${preset.stack}` : preset.stack;
  const density = DENSITY[t.density] || DENSITY.cozy;

  return {
    fontFamily: fontStack,
    background: t.background || defaults.background || '#fafafa',
    text:       t.text       || defaults.text       || '#222',
    accent:     t.accent     || brand || '#f28b05',
    density,
    googleFontUrl: t.google_font_url || null
  };
}

// Ensure a Google Fonts <link> is present in <head>. Multiple calls with
// the same URL are idempotent — a data attribute marks the injected node.
// Removing a URL also removes the link.
export function syncGoogleFontLink(url) {
  if (typeof document === 'undefined') return;
  const existing = document.querySelector('link[data-tinypos-menu-font]');
  if (!url) {
    if (existing) existing.remove();
    return;
  }
  if (existing && existing.href === url) return;
  if (existing) existing.remove();
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  link.setAttribute('data-tinypos-menu-font', '1');
  document.head.appendChild(link);
}
