import React, { useState } from 'react';
import { Icon } from '@iconify/react';
import { translations } from '../utils/translations';

// The landing page only shows on a device with no store yet, so there is no
// saved language setting: use the visitor's pick from the toggle if they made
// one, else the browser language (Spanish or English).
const LANG_KEY = 'tinypos_landing_lang';
function initialLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'es' || saved === 'en') return saved;
  } catch { /* storage blocked: fall through to the browser language */ }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export default function LandingPage({ onSelectMode, onShowGuide }) {
  const [lang, setLang] = useState(initialLang);
  const t = (key) => translations[lang]?.[key] || translations.en?.[key] || key;
  const toggleLang = () => {
    const next = lang === 'es' ? 'en' : 'es';
    setLang(next);
    try { localStorage.setItem(LANG_KEY, next); } catch { /* not persisted */ }
  };

  return (
    <div style={{
      height: '100dvh',
      backgroundColor: '#fdfdfd',
      fontFamily: 'var(--font-main, system-ui)',
      display: 'flex',
      flexDirection: 'column',
      color: '#0d3a66',
      overflowY: 'auto',
      WebkitOverflowScrolling: 'touch'
    }}>

      {/* NAVIGATION BAR */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', padding: '20px 5%', alignItems: 'center', backgroundColor: 'white', borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '46px', height: '46px', background: 'linear-gradient(210deg, #0d3a66, #4770d6)', color: 'white', borderRadius: '999px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
            <img
              src="/icon.svg"
              alt="tinypos"
              style={{ width: '50px', height: '50px', borderRadius: '10px', top: "-5px" }}
            />
          </div>
          <h1 style={{ fontSize: '1.4rem', margin: 0, color: '#0d3a66', fontWeight: '900', letterSpacing: '-0.5px' }}>tinypos</h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <button
          onClick={toggleLang}
          aria-label={t('landing.switchLangAria')}
          style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '999px', padding: '6px 14px', color: '#546e7a', fontWeight: '700', fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Icon icon="lucide:globe" />
          {lang === 'es' ? 'English' : 'Español'}
        </button>
        <a
          href="https://github.com/AldaGs/coffee-system-pos"
          aria-label={t('landing.viewSource')}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#546e7a', textDecoration: 'none', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}
        >
          <Icon icon="mdi:github" fontSize="1.4rem" aria-hidden />
          <span className="landing-hide-narrow">{t('landing.viewSource')}</span>
        </a>
        </div>
      </nav>

      {/* HERO SECTION */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 'clamp(40px, 8vw, 80px) 5%', textAlign: 'center' }}>
        <div className="fade-in" style={{ maxWidth: '900px' }}>
          <h2 style={{ fontSize: 'clamp(2.4rem, 8vw, 4rem)', color: '#0d3a66', marginBottom: '24px', lineHeight: '1.05', fontWeight: '900', letterSpacing: '-1px' }}>
            {t('landing.heroTitle')} <span style={{ color: 'var(--brand-color, #f28b05)' }}>{t('landing.heroHighlight')}</span>
          </h2>
          <p style={{ fontSize: 'clamp(1rem, 3vw, 1.35rem)', color: '#546e7a', marginBottom: '48px', maxWidth: '700px', margin: '0 auto 48px', lineHeight: '1.5' }}>
            {t('landing.heroSubtitle')}
          </p>

          {/* PRIMARY CTA: zero-infrastructure local start. */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
            <button
              onClick={() => onSelectMode('local')}
              style={{ padding: '20px 48px', backgroundColor: '#099b46', color: 'white', border: 'none', borderRadius: '14px', fontSize: '1.25rem', fontWeight: '900', cursor: 'pointer', boxShadow: '0 6px 18px rgba(5, 78, 35, 0.3)', transition: 'transform 0.2s ease', display: 'inline-flex', alignItems: 'center', gap: '12px' }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <Icon icon="lucide:rocket" />
              {t('landing.startLocal')}
            </button>
            <span style={{ fontSize: '0.95rem', color: '#94a3b8', fontWeight: '500' }}>
              {t('landing.startLocalHint')}
            </span>
          </div>

          {/* RETURNING USERS: sign in to a cloud-backed store. Local stores can't be
              opened from another device, so say so right here. */}
          <p style={{ marginTop: '28px', marginBottom: '6px', fontSize: '1.05rem', color: '#0d3a66' }}>
            {t('landing.signInPrompt')}{' '}
            <button onClick={() => onSelectMode('connect')} style={linkButton}>{t('landing.signIn')}</button>
          </p>
          <p style={{ margin: '0 auto', maxWidth: '520px', fontSize: '0.9rem', color: '#94a3b8', lineHeight: '1.4' }}>
            {t('landing.deviceNote')}
          </p>

          {/* NEW STORE ON THE CLOUD FROM DAY ONE (the original setup flow), demoted:
              local stores can upgrade later from General Settings. */}
          <p style={{ marginTop: '18px', fontSize: '0.95rem', color: '#546e7a' }}>
            <button onClick={() => onSelectMode('new')} style={{ ...linkButton, fontWeight: 600, color: '#546e7a' }}>{t('landing.createCloud')}</button>
          </p>

          {/* --- ADD THIS SECONDARY LINK --- */}
          <button
            onClick={onShowGuide}
            style={{
              background: 'none', border: 'none', color: '#546e7a',
              fontSize: '1.05rem', fontWeight: '600', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              textDecoration: 'underline', textUnderlineOffset: '4px',
              paddingTop: "20px", flexDirection: 'column'
            }}
          >
            <div style={{ display: 'flex', flexDirection: "row", alignItems: 'center', gap: '8px', fontSize: '1.05rem', fontWeight: '600' }}>
              <Icon icon="lucide:book-open" />
              <span style={{ textDecoration: 'underline', textUnderlineOffset: '4px' }}>
                {t('landing.guideLink')}
              </span>
            </div>
            <span style={{ fontSize: '0.95rem', color: '#94a3b8', fontWeight: '500' }}>
              {t('landing.guideHint')}
            </span>
          </button>
        </div>

        {/* FEATURE HIGHLIGHTS */}
        <div style={{ display: 'flex', gap: '30px', marginTop: '100px', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '1100px' }}>
          <FeatureCard
            icon="lucide:printer"
            color="#3498db"
            title={t('landing.featHardwareTitle')}
            desc={t('landing.featHardwareDesc')}
          />
          <FeatureCard
            icon="lucide:database"
            color="#9b59b6"
            title={t('landing.featDataTitle')}
            desc={
              <>
                {t('landing.featDataDescPre')} <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" style={{ color: '#f28b05', fontWeight: 'bold', textDecoration: 'none' }}>Supabase</a> {t('landing.featDataDescPost')}
              </>
            }
          />
          <FeatureCard
            icon="lucide:zap"
            color="#f1c40f"
            title={t('landing.featOfflineTitle')}
            desc={t('landing.featOfflineDesc')}
          />
          <FeatureCard
            icon="lucide:calculator"
            color="#099b46"
            title={t('landing.featCalcTitle')}
            desc={t('landing.featCalcDesc')}
            href="/calculator"
            linkLabel={t('landing.featCalcCta')}
          />
        </div>
      </main>

      <footer style={{ padding: '30px', textAlign: 'center', borderTop: '1px solid #f0f0f0', color: '#94a3b8', fontSize: '0.9rem' }}>
        &copy; {new Date().getFullYear()} tinypos. {t('landing.footer')}
      </footer>
    </div>
  );
}

const linkButton = { background: 'none', border: 'none', padding: 0, color: '#0d3a66', fontWeight: 800, fontSize: 'inherit', textDecoration: 'underline', textUnderlineOffset: '4px', cursor: 'pointer' };

function FeatureCard({ icon, title, desc, color, href, linkLabel }) {
  return (
    <div style={{ flex: '1 1 300px', textAlign: 'center', padding: '32px', background: 'white', borderRadius: '24px', border: '1px solid #f0f0f0', transition: 'all 0.3s ease', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{
        width: '64px',
        height: '64px',
        background: `${color}15`,
        color: color,
        borderRadius: '18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '2rem',
        margin: '0 auto 20px'
      }}>
        <Icon icon={icon} />
      </div>
      <h3 style={{ fontSize: '1.25rem', color: '#0d3a66', marginBottom: '12px', fontWeight: '800' }}>{title}</h3>
      <p style={{ color: '#546e7a', fontSize: '1rem', lineHeight: '1.6', margin: 0, flex: 1 }}>{desc}</p>
      {href && (
        <a
          href={href}
          style={{ marginTop: '20px', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 22px', background: color, color: 'white', borderRadius: '10px', textDecoration: 'none', fontWeight: '800', fontSize: '0.95rem' }}
        >
          {linkLabel}
        </a>
      )}
    </div>
  );
}
