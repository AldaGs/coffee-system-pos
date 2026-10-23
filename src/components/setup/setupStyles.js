// Shared look of the setup steps. SETUP_CSS holds what inline styles can't (focus, hover, keyframes).

export const REGIONS = [
  { value: 'us-east-1', label: 'Este de EE.UU. (Norte de Virginia)' },
  { value: 'us-west-1', label: 'Oeste de EE.UU. (Oregón)' },
];

export const styles = {
  page: {
    display: 'flex',
    minHeight: '100dvh',
    height: '100dvh',
    backgroundColor: 'var(--bg-app)',
    justifyContent: 'center',
    // flex-start + margin:auto on the card centers it when it fits and lets the
    // page scroll when it's taller than the viewport (centering alone clips the
    // top in flexbox). overflowY makes the whole page a scroll area.
    alignItems: 'flex-start',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
    fontFamily: 'var(--font-main, system-ui)',
    padding: '20px',
    boxSizing: 'border-box',
  },
  card: {
    background: 'var(--bg-surface)',
    padding: '40px',
    borderRadius: '24px',
    width: '100%',
    maxWidth: '440px',
    margin: 'auto',
    boxShadow: '0 20px 50px rgba(0,0,0,0.18)',
    border: '1px solid var(--border)',
    position: 'relative',
  },
  backBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    marginBottom: '24px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 10px',
    borderRadius: '8px',
    fontSize: '0.9rem',
    fontWeight: 600,
    transition: 'background 0.15s ease, color 0.15s ease',
  },
  iconBubble: {
    width: '72px',
    height: '72px',
    background: 'rgba(242, 139, 5, 0.12)',
    color: 'var(--brand-color)',
    borderRadius: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '2.2rem',
    margin: '0 auto 16px',
  },
  title: {
    margin: '0 0 8px 0',
    color: 'var(--text-main)',
    fontSize: '1.6rem',
    fontWeight: 800,
    textAlign: 'center',
    letterSpacing: '-0.01em',
  },
  subtitle: {
    color: 'var(--text-muted)',
    margin: 0,
    fontSize: '0.95rem',
    textAlign: 'center',
    lineHeight: 1.5,
  },
  label: {
    fontWeight: 700,
    color: 'var(--text-main)',
    fontSize: '0.85rem',
    display: 'block',
    marginBottom: '8px',
  },
  inputWrap: { position: 'relative' },
  inputIcon: {
    position: 'absolute',
    left: '14px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--text-muted)',
    fontSize: '1.1rem',
    pointerEvents: 'none',
  },
  input: {
    width: '100%',
    padding: '13px 14px 13px 42px',
    borderRadius: '12px',
    border: '1px solid var(--border)',
    background: 'var(--bg-main)',
    color: 'var(--text-main)',
    fontSize: '1rem',
    boxSizing: 'border-box',
    outline: 'none',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease',
  },
  select: {
    width: '100%',
    padding: '13px 14px 13px 42px',
    borderRadius: '12px',
    border: '1px solid var(--border)',
    background: 'var(--bg-main)',
    color: 'var(--text-main)',
    fontSize: '1rem',
    boxSizing: 'border-box',
    outline: 'none',
    appearance: 'none',
    cursor: 'pointer',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
  },
  stepCard: {
    background: 'var(--bg-main)',
    padding: '18px',
    borderRadius: '16px',
    border: '1px solid var(--border)',
  },
  stepHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '12px',
  },
  stepBadge: {
    width: '26px',
    height: '26px',
    borderRadius: '50%',
    background: 'var(--brand-color)',
    color: '#fff',
    fontSize: '0.8rem',
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  primaryBtn: {
    padding: '16px',
    background: 'var(--brand-color)',
    color: '#fff',
    border: 'none',
    borderRadius: '14px',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '1.05rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    boxShadow: '0 8px 24px rgba(242, 139, 5, 0.35)',
    transition: 'box-shadow 0.2s ease, transform 0.05s ease, opacity 0.2s ease',
  },
  warnBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 14px',
    background: 'rgba(231, 76, 60, 0.08)',
    border: '1px solid rgba(231, 76, 60, 0.25)',
    borderRadius: '10px',
    color: 'var(--color-danger)',
    fontSize: '0.85rem',
    lineHeight: 1.4,
  },
  successBtn: {
    padding: '16px',
    background: 'var(--brand-color)',
    color: '#fff',
    border: 'none',
    borderRadius: '14px',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '1.05rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    boxShadow: '0 8px 22px rgba(242, 139, 5, 0.3)',
    transition: 'box-shadow 0.2s ease, opacity 0.2s ease',
  },
  helperText: {
    fontSize: '0.8rem',
    color: 'var(--text-muted)',
    margin: '0 0 12px 0',
    lineHeight: 1.45,
  },
};

export const SETUP_CSS = `
.setup-input:focus,
.setup-select:focus {
  border-color: var(--brand-color) !important;
  box-shadow: 0 0 0 4px rgba(242, 139, 5, 0.15);
  background: var(--bg-surface) !important;
}
.setup-back:hover {
  background: var(--bg-main);
  color: var(--text-main);
}
.setup-cta-supabase {
  position: relative;
  overflow: hidden;
}
.setup-cta-supabase::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: 0 0 0 0 rgba(62, 179, 112, 0.55);
  animation: setup-pulse 2.2s ease-out infinite;
  pointer-events: none;
}
.setup-cta-supabase:hover {
  box-shadow: 0 14px 32px rgba(62, 179, 112, 0.45);
}
@keyframes setup-pulse {
  0%   { box-shadow: 0 0 0 0   rgba(62, 179, 112, 0.55); }
  70%  { box-shadow: 0 0 0 18px rgba(62, 179, 112, 0);   }
  100% { box-shadow: 0 0 0 0   rgba(62, 179, 112, 0);    }
}
@keyframes setup-text-pulse {
  0%, 100% { opacity: 0.55; }
  50%      { opacity: 1; }
}
.setup-loading-text {
  animation: setup-text-pulse 1.6s ease-in-out infinite;
}
@keyframes setup-toast-in {
  from { opacity: 0; transform: translate(-50%, -12px); }
  to   { opacity: 1; transform: translate(-50%, 0); }
}
.setup-toast {
  animation: setup-toast-in 0.25s ease-out both;
}
.setup-primary-cta:hover {
  box-shadow: 0 12px 30px rgba(242, 139, 5, 0.45);
}
.setup-success-cta:hover {
  box-shadow: 0 12px 30px rgba(242, 139, 5, 0.45);
}
.setup-primary-cta:disabled,
.setup-success-cta:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
`;
