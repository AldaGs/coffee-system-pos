// Curated font catalog for the canvas editor's font picker.
//
// Each entry has a CSS `stack` (what lands in node.style.fontFamily) and,
// for web fonts, a `google` family token. Picking a Google font adds its
// stylesheet URL to document.fonts so both renderers load it (see
// syncDocFonts in canvasDocument.js). System fonts need no loading.

export const CANVAS_FONTS = [
  // System / web-safe — no network, render everywhere.
  { id: 'system',    label: 'Sistema (sans)',  stack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { id: 'georgia',   label: 'Georgia (serif)', stack: 'Georgia, "Times New Roman", serif' },
  { id: 'times',     label: 'Times',           stack: '"Times New Roman", Times, serif' },
  { id: 'helvetica', label: 'Helvetica / Arial', stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { id: 'courier',   label: 'Courier (mono)',  stack: '"Courier New", Courier, monospace' },

  // Google fonts — loaded on demand. Weight axes kept small to limit payload.
  { id: 'playfair',   label: 'Playfair Display', stack: '"Playfair Display", Georgia, serif',   google: 'Playfair+Display:wght@400;700;900' },
  { id: 'montserrat', label: 'Montserrat',       stack: '"Montserrat", system-ui, sans-serif',  google: 'Montserrat:wght@400;600;800' },
  { id: 'oswald',     label: 'Oswald',           stack: '"Oswald", system-ui, sans-serif',      google: 'Oswald:wght@400;600;700' },
  { id: 'bebas',      label: 'Bebas Neue',       stack: '"Bebas Neue", system-ui, sans-serif',  google: 'Bebas+Neue' },
  { id: 'lora',       label: 'Lora',             stack: '"Lora", Georgia, serif',               google: 'Lora:wght@400;600;700' },
  { id: 'lobster',    label: 'Lobster',          stack: '"Lobster", cursive',                   google: 'Lobster' },
  { id: 'pacifico',   label: 'Pacifico',         stack: '"Pacifico", cursive',                  google: 'Pacifico' },
  { id: 'caveat',     label: 'Caveat',           stack: '"Caveat", cursive',                    google: 'Caveat:wght@400;700' },
  { id: 'marker',     label: 'Permanent Marker', stack: '"Permanent Marker", cursive',          google: 'Permanent+Marker' }
];

// Build the css2 stylesheet URL for a catalog entry's google token.
export function googleUrlForToken(token) {
  return `https://fonts.googleapis.com/css2?family=${token}&display=swap`;
}

// Match a node's current fontFamily string back to a catalog id, so the
// dropdown can show the active selection. Returns 'custom' when unknown.
export function fontIdForStack(stack) {
  if (!stack) return 'system';
  const hit = CANVAS_FONTS.find(f => f.stack === stack);
  return hit ? hit.id : 'custom';
}

// Validate + normalize a user-pasted Google Fonts URL. Returns
// { url, family, stack } or null if it isn't a usable fonts.googleapis URL.
export function parseGoogleFontUrl(input) {
  if (!input) return null;
  try {
    const u = new URL(input.trim());
    if (!/fonts\.googleapis\.com/.test(u.hostname)) return null;
    const raw = u.searchParams.get('family');
    if (!raw) return null;
    // first family only; strip axis spec and split on css(v1) '|'
    const first = raw.split('|')[0];
    const name = first.split(':')[0].replace(/\+/g, ' ').trim();
    if (!name) return null;
    return {
      url: input.trim(),
      family: name,
      stack: `"${name}", sans-serif`
    };
  } catch {
    return null;
  }
}
