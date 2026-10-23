import { Icon } from '@iconify/react';
import { useTranslation } from '../../../hooks/useTranslation';

// Right-click menu. Positioned at the cursor in screen space; the parent closes
// it on any outside click (window listener). Items collapse to just Paste when
// nothing is selected.
export function ContextMenu({ pos, hasSelection, selectionCount, canPaste, canGroup, canUngroup, canLink, isLinked, linkSuggestion, onGroup, onUngroup, onLinkProduct, onUnlink, onDuplicate, onCopy, onPaste, onForward, onBack, onDelete }) {
  const { t } = useTranslation();
  const item = (icon, label, onClick, opts = {}) => (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={opts.disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        background: 'transparent', border: 'none', color: opts.danger ? '#ff7e7e' : '#e6edf3',
        padding: '8px 12px', cursor: opts.disabled ? 'default' : 'pointer', fontSize: '0.85rem',
        opacity: opts.disabled ? 0.4 : 1, borderRadius: 6
      }}
      onMouseEnter={e => { if (!opts.disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <Icon icon={icon} style={{ fontSize: '1rem', flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{label}</span>
      {opts.hint && <span style={{ color: '#8b949e', fontSize: '0.72rem' }}>{opts.hint}</span>}
    </button>
  );
  // Keep the menu on-screen near the right/bottom edges.
  const x = Math.min(pos.x, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 210);
  const y = Math.min(pos.y, (typeof window !== 'undefined' ? window.innerHeight : 9999) - 240);
  return (
    <div
      onContextMenu={e => e.preventDefault()}
      style={{
        position: 'fixed', left: x, top: y, zIndex: 3000, minWidth: 190,
        background: '#161b22', border: '1px solid #30363d', borderRadius: 10,
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)', padding: 6
      }}
    >
      {hasSelection ? (
        <>
          {item('lucide:copy-plus', t('canvas.duplicate'), onDuplicate, { hint: 'Ctrl+D' })}
          {item('lucide:copy', t('canvas.copy'), onCopy, { hint: 'Ctrl+C' })}
          {item('lucide:clipboard-paste', t('canvas.paste'), onPaste, { hint: 'Ctrl+V', disabled: !canPaste })}
          {(canGroup || canUngroup) && (
            <>
              <div style={{ height: 1, background: '#30363d', margin: '4px 0' }} />
              {canGroup && item('lucide:group', t('canvas.groupAction'), onGroup, { hint: 'Ctrl+G' })}
              {canUngroup && item('lucide:ungroup', t('canvas.ungroup'), onUngroup, { hint: 'Ctrl+Shift+G' })}
            </>
          )}
          {canLink && (
            <>
              <div style={{ height: 1, background: '#30363d', margin: '4px 0' }} />
              {item('lucide:link', linkSuggestion ? t('canvas.linkTo').replace('{name}', linkSuggestion) : t('canvas.linkProduct'), onLinkProduct, { hint: linkSuggestion ? t('canvas.hidesWhenSoldOut') : undefined })}
              {isLinked && item('lucide:link-2-off', t('canvas.unlink'), onUnlink)}
            </>
          )}
          <div style={{ height: 1, background: '#30363d', margin: '4px 0' }} />
          {item('lucide:chevron-up', t('canvas.bringForward'), onForward)}
          {item('lucide:chevron-down', t('canvas.sendBack'), onBack)}
          <div style={{ height: 1, background: '#30363d', margin: '4px 0' }} />
          {item('lucide:trash-2', selectionCount > 1 ? t('canvas.deleteCount').replace('{n}', selectionCount) : t('canvas.delete'), onDelete, { danger: true })}
        </>
      ) : (
        item('lucide:clipboard-paste', t('canvas.paste'), onPaste, { hint: 'Ctrl+V', disabled: !canPaste })
      )}
    </div>
  );
}

