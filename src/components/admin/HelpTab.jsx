import { useMemo, useState } from 'react';
import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';
import { helpContent, helpGroupLabels } from '../../utils/helpContent';

// In-app help / user guide. Renders the bilingual articles from helpContent.js
// for whichever language the shop has selected (settings.language). Used both as
// an Admin tab and, wrapped in HelpModal, from the Register.
//
// Layout: intro → search box → collapsible sections grouped Register then Admin.
// Mode badges (Advanced / Cloud) explain why a tab may be hidden in Lite/Local.

const BADGE_STYLES = {
  advanced: { icon: 'lucide:zap', bg: 'rgba(234,179,8,0.15)', color: '#b45309' },
  cloud: { icon: 'lucide:cloud', bg: 'rgba(59,130,246,0.15)', color: '#2563eb' },
};

function Badge({ kind, label }) {
  const s = BADGE_STYLES[kind] || BADGE_STYLES.advanced;
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.04em', padding: '2px 8px', borderRadius: '999px',
        background: s.bg, color: s.color,
      }}
    >
      <Icon icon={s.icon} style={{ fontSize: '0.75rem' }} />
      {label}
    </span>
  );
}

function HelpSection({ section, badgeLabels, doLabel, fieldsLabel, isOpen, onToggle }) {
  return (
    <div
      style={{
        border: '1px solid var(--border)', borderRadius: '12px',
        background: 'var(--bg-surface)', overflow: 'hidden',
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
          padding: '14px 16px', background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left', color: 'var(--text-main)',
        }}
      >
        <Icon icon={section.icon} style={{ fontSize: '1.25rem', color: 'var(--brand-color)', flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: '1rem', flex: 1 }}>{section.title}</span>
        {(section.badges || []).map((b) => (
          <Badge key={b} kind={b} label={badgeLabels[b]} />
        ))}
        <Icon
          icon="lucide:chevron-down"
          style={{ fontSize: '1.1rem', color: 'var(--text-muted)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}
        />
      </button>

      {isOpen && (
        <div style={{ padding: '0 16px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ margin: 0, color: 'var(--text-main)', lineHeight: 1.55 }}>{section.what}</p>
          <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.55, fontSize: '0.92rem' }}>{section.how}</p>

          {section.fields && section.fields.length > 0 && (
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: '8px' }}>
                {fieldsLabel}
              </div>
              <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {section.fields.map((f, i) => (
                  <div key={i} style={{ borderLeft: '3px solid var(--brand-color)', paddingLeft: '12px' }}>
                    <dt style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.95rem' }}>{f.name}</dt>
                    <dd style={{ margin: '2px 0 0', color: 'var(--text-muted)', lineHeight: 1.5, fontSize: '0.9rem' }}>{f.desc}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <div>
            <div style={{ fontWeight: 700, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: '8px' }}>
              {doLabel}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {section.do.map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <Icon icon="lucide:check-circle-2" style={{ fontSize: '1rem', color: 'var(--brand-color)', marginTop: '3px', flexShrink: 0 }} />
                  <div style={{ lineHeight: 1.5 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{step.action}. </span>
                    <span style={{ color: 'var(--text-muted)' }}>{step.steps}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HelpTab() {
  const { t, lang } = useTranslation();
  const sections = helpContent[lang] || helpContent.en;
  const groupLabels = helpGroupLabels[lang] || helpGroupLabels.en;
  const badgeLabels = { advanced: t('help.badgeAdvanced'), cloud: t('help.badgeCloud') };

  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections.filter((s) => {
      const hay = [
        s.title, s.what, s.how,
        ...(s.do || []).flatMap((d) => [d.action, d.steps]),
        ...(s.fields || []).flatMap((f) => [f.name, f.desc]),
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [sections, query]);

  const groups = useMemo(() => {
    const order = ['register', 'admin'];
    return order
      .map((g) => ({ group: g, items: filtered.filter((s) => s.group === g) }))
      .filter((g) => g.items.length > 0);
  }, [filtered]);

  const toggle = (id) => setOpenId((cur) => (cur === id ? null : id));

  return (
    <div style={{ maxWidth: '860px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
        <Icon icon="lucide:life-buoy" style={{ fontSize: '1.8rem', color: 'var(--brand-color)' }} />
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)' }}>{t('help.title')}</h2>
      </div>
      <p style={{ marginTop: 0, marginBottom: '18px', color: 'var(--text-muted)', lineHeight: 1.55 }}>{t('help.intro')}</p>

      <div style={{ position: 'relative', marginBottom: '20px' }}>
        <Icon
          icon="lucide:search"
          style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '1.1rem', color: 'var(--text-muted)' }}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('help.searchPlaceholder')}
          style={{
            width: '100%', padding: '12px 14px 12px 42px', borderRadius: '10px',
            border: '1px solid var(--border)', background: 'var(--bg-surface)',
            color: 'var(--text-main)', fontSize: '1rem', boxSizing: 'border-box',
          }}
        />
      </div>

      {groups.length === 0 && (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '32px 0' }}>{t('help.noResults')}</p>
      )}

      {groups.map(({ group, items }) => (
        <div key={group} style={{ marginBottom: '26px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
            {groupLabels[group]}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {items.map((section) => (
              <HelpSection
                key={section.id}
                section={section}
                badgeLabels={badgeLabels}
                doLabel={t('help.doLabel')}
                fieldsLabel={t('help.fieldsLabel')}
                isOpen={openId === section.id}
                onToggle={() => toggle(section.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default HelpTab;
