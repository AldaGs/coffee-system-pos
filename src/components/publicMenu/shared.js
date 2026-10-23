// Shared by every public menu view: the visit tracker, modifier lookup, and styles.

// One public menu per page load, so the tracker can live at module scope and
// deep buttons (WhatsApp) reach it without prop drilling. Null on TV/print.
let menuTracker = null;
export const trackMenu = (event, extra) => menuTracker?.track(event, extra);
export const hasMenuTracker = () => !!menuTracker;
export const setMenuTracker = (t) => { menuTracker?.stop(); menuTracker = t; };

export function mapGroups(groups) {
  const m = new Map();
  (groups || []).forEach(g => m.set(g.id, g));
  return m;
}

export const pageStyle = {
  // Own scroll container: the global `body { overflow: hidden }` (POS
  // anti-bounce in index.css) would otherwise trap a menu taller than the
  // viewport, so the public page scrolls itself instead of the body.
  height: '100dvh',
  overflowY: 'auto',
  overflowX: 'hidden',
  WebkitOverflowScrolling: 'touch',
  background: '#fafafa',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  color: '#222',
  paddingBottom: 'env(safe-area-inset-bottom)'
};

export const headerStyle = {
  padding: '28px 20px 24px',
  color: 'white',
  textAlign: 'center'
};

export const headerTitleStyle = {
  margin: 0,
  fontSize: '1.6rem',
  fontWeight: 800,
  letterSpacing: '-0.01em'
};

export const navStyle = {
  display: 'flex',
  overflowX: 'auto',
  gap: 8,
  padding: '12px 16px',
  background: 'white',
  borderBottom: '1px solid #eee',
  position: 'sticky',
  top: 0,
  zIndex: 10,
  WebkitOverflowScrolling: 'touch'
};

export const navButtonStyle = {
  background: 'transparent',
  border: 'none',
  borderBottom: '2px solid transparent',
  padding: '8px 4px',
  fontSize: '0.95rem',
  fontWeight: 700,
  cursor: 'pointer',
  whiteSpace: 'nowrap'
};

export const mainStyle = { padding: '8px 16px 32px' };

export const listStyle = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 4
};

export const itemStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
  padding: '16px 4px',
  borderBottom: '1px solid #eee'
};

export const itemLeftStyle = { display: 'flex', gap: 12, alignItems: 'flex-start', flex: 1, minWidth: 0 };
export const emojiStyle = { fontSize: '1.5rem', lineHeight: 1, marginTop: 2 };
export const imageStyle = {
  width: 72,
  maxHeight: 96,
  objectFit: 'cover',
  borderRadius: 10,
  flexShrink: 0,
  background: '#eee'
};
export const itemNameStyle = { fontWeight: 700, fontSize: '1rem' };
export const soldOutBadgeStyle = {
  marginLeft: 8,
  fontSize: '0.65rem',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#c0392b',
  background: 'rgba(192,57,43,0.1)',
  padding: '2px 7px',
  borderRadius: 999,
  verticalAlign: 'middle',
  whiteSpace: 'nowrap'
};
export const modifiersWrapStyle = { marginTop: 4 };
export const priceStyle = { fontWeight: 800, fontSize: '1rem', whiteSpace: 'nowrap' };

export const centerStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  textAlign: 'center',
  color: '#444',
  fontFamily: 'system-ui, -apple-system, sans-serif'
};
