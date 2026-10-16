import { useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';
import { HelpLinkContext } from '../../contexts/help-link-context';

// Small ⓘ button that opens a short explanation on click/tap (never hover, so it
// works on tablets). Closes on outside click, Esc, scroll or resize. Optional
// `section` (a helpContent id) adds a "Learn more →" link into the Help tab.
//
// The popover is position: fixed and clamped to the viewport, so it never
// overflows a card edge or causes horizontal scroll on phones. It is portaled to
// <body> so a tip placed inside a <label> never toggles that label's control.

const POPOVER_WIDTH = 260;
const GUTTER = 12;

function InfoTip({ text, section, label }) {
  const { t } = useTranslation();
  const openHelp = useContext(HelpLinkContext);
  const onLearnMore = openHelp && section ? () => openHelp(section) : null;
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const popId = useId();

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const width = Math.min(POPOVER_WIDTH, window.innerWidth - GUTTER * 2);
    const left = Math.max(GUTTER, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - GUTTER));
    setPos({ top: r.bottom + 8, left, width });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (popRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); }
    };
    const close = () => setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label || t('common.moreInfo')}
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
        style={{
          background: 'none', border: 'none', padding: '2px', margin: 0, cursor: 'pointer',
          color: open ? 'var(--brand-color)' : 'var(--text-muted)', display: 'inline-flex',
          alignItems: 'center', verticalAlign: 'middle', lineHeight: 1, flexShrink: 0,
        }}
      >
        <Icon icon="lucide:info" style={{ fontSize: '1rem' }} />
      </button>
      {open && pos && createPortal(
        <div
          ref={popRef}
          id={popId}
          role="dialog"
          style={{
            position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 1000,
            background: 'var(--bg-surface)', color: 'var(--text-main)', border: '1px solid var(--border)',
            borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.15)', padding: '12px 14px',
            fontSize: '0.88rem', fontWeight: 400, lineHeight: 1.5, textTransform: 'none', letterSpacing: 'normal',
            textAlign: 'left',
          }}
        >
          <p style={{ margin: 0 }}>{text}</p>
          {onLearnMore && (
            <button
              type="button"
              onClick={() => { setOpen(false); onLearnMore(); }}
              style={{
                background: 'none', border: 'none', padding: 0, marginTop: '8px', cursor: 'pointer',
                color: 'var(--brand-color)', fontWeight: 700, fontSize: '0.85rem',
              }}
            >
              {t('common.learnMore')} →
            </button>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

export default InfoTip;
