import { Icon } from '@iconify/react';
import LegalLinks from '../LegalLinks';
import { centerStyle, pageStyle, srOnly } from './shared';

// Page wrapper: the content column fills at least the viewport so the legal links
// always sit at the very bottom (below short pages, after everything on long ones).
export function Page({ client, lang, colors, bottomPad = 16, children }) {
  return (
    <div className="tp-order" style={colors ? { ...pageStyle, background: colors.background, color: colors.text, ...(colors.fontFamily && { fontFamily: colors.fontFamily }) } : pageStyle}>
      {colors?.fontUrl && <link rel="stylesheet" href={colors.fontUrl} />}
      {colors?.customCss && <style>{colors.customCss}</style>}
      <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        {children}
        <footer style={{ marginTop: 'auto', textAlign: 'center', color: '#888', fontSize: '0.8rem', padding: `24px 16px ${bottomPad}px` }}>
          <LegalLinks client={client} lang={lang} />
        </footer>
      </div>
    </div>
  );
}

export const Spinner = ({ size = '1.1em' }) => <Icon icon="lucide:loader-2" className="tp-spin" style={{ fontSize: size, verticalAlign: '-0.15em' }} />;
export const Loading = ({ text }) => <div style={centerStyle}><div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}><Spinner size="2rem" />{text}</div></div>;

export function Sheet({ children, onClose }) {
  return (
    <div onClick={onClose} className="tp-dim" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 20, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} className="tp-up" style={{ background: 'white', color: '#222', width: '100%', maxWidth: 520, maxHeight: '90dvh', overflowY: 'auto', borderRadius: '18px 18px 0 0', padding: 20, boxSizing: 'border-box' }}>
        {children}
      </div>
    </div>
  );
}

// Brand-colored top bar (logo + name + language toggle), shared by /order and the tracker.
export function ShopHeader({ shop, lang, setLang, cartCount, onCart, cartLabel }) {
  return (
    <header className="tp-header" style={{ background: shop?.brand_color || '#f28b05', color: 'white', padding: '20px 20px', textAlign: 'center', position: 'relative' }}>
      {shop?.logo && (() => {
        const img = <img src={shop.logo} alt={shop.home_url ? (shop.name || 'Inicio') : ''} style={{ display: 'block', margin: '0 auto 8px', maxHeight: 56, maxWidth: 160, objectFit: 'contain' }} />;
        return shop.home_url ? <a href={shop.home_url} style={{ display: 'block' }}>{img}</a> : img;
      })()}
      <h1 style={shop?.hide_title ? srOnly : { margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>
        {shop?.home_url ? <a href={shop.home_url} style={{ color: 'inherit', textDecoration: 'none' }}>{shop?.name || 'Menu'}</a> : (shop?.name || 'Menu')}
      </h1>
      <button type="button" onClick={() => setLang(lang === 'es' ? 'en' : 'es')}
        style={{ position: 'absolute', right: 12, top: 12, background: 'rgba(255,255,255,0.25)', border: 'none', color: 'white', borderRadius: 8, padding: '4px 10px', fontWeight: 700, cursor: 'pointer' }}>
        {lang === 'es' ? 'EN' : 'ES'}
      </button>
      {onCart && (
        <button type="button" onClick={onCart} aria-label={cartLabel}
          style={{ position: 'absolute', left: 12, top: 10, background: 'rgba(255,255,255,0.25)', border: 'none', color: 'white', borderRadius: 10, width: 42, height: 42, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon icon="lucide:shopping-basket" style={{ fontSize: '1.4rem' }} />
          {cartCount > 0 && (
            <span style={{ position: 'absolute', top: -4, right: -4, background: 'white', color: shop?.brand_color || '#f28b05', borderRadius: 999, minWidth: 20, height: 20, fontSize: '0.75rem', fontWeight: 800, lineHeight: '20px', textAlign: 'center', padding: '0 4px', boxSizing: 'border-box' }}>{cartCount}</span>
          )}
        </button>
      )}
    </header>
  );
}
