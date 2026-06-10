// Asset library — browse every image uploaded for menu items, see which items
// use each one, reuse an existing image (no re-upload), upload a new one, and
// delete assets that nothing references. Images are stored content-addressed
// (see api/menuImages.js) so picking an existing asset for a new item costs
// zero extra storage.
//
// Two entry points, same component:
//   • Picker  — opened from an item row; clicking an asset assigns it (onSelect).
//   • Manager — opened from the toolbar; focus is on usage + cleanup.
// `onSelect` being present is what enables the per-asset "Usar" action.

import { Icon } from '@iconify/react';

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AssetLibraryModal({
  assets,
  usageByPath,        // Map<path, string[]> — item names using each asset
  loading,
  busy,
  onSelect,           // optional — (url) => void; presence enables "Usar"
  onUploadNew,        // () => void — triggers the parent's file picker + crop
  onDelete,           // (path) => void
  onClose,
}) {
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <header style={headerStyle}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Biblioteca de imágenes</h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {onSelect ? 'Elige una imagen existente o sube una nueva.' : 'Imágenes en uso y disponibles para reutilizar.'}
            </p>
          </div>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Cerrar"><Icon icon="lucide:x" /></button>
        </header>

        <div style={toolbarStyle}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 700 }}>
            {assets.length} {assets.length === 1 ? 'imagen' : 'imágenes'}
          </span>
          <button onClick={onUploadNew} disabled={busy} style={uploadBtnStyle}>
            <Icon icon="lucide:upload" /> Subir nueva
          </button>
        </div>

        <div style={bodyStyle}>
          {loading ? (
            <div style={emptyStyle}><Icon icon="lucide:loader-2" className="spin" /> Cargando…</div>
          ) : assets.length === 0 ? (
            <div style={emptyStyle}>
              <Icon icon="lucide:image" style={{ fontSize: '2rem', opacity: 0.4 }} />
              <p style={{ margin: '8px 0 0' }}>Aún no hay imágenes. Sube la primera.</p>
            </div>
          ) : (
            <div style={gridStyle}>
              {assets.map(asset => {
                const users = usageByPath?.get(asset.path) || [];
                const inUse = users.length > 0;
                return (
                  <div key={asset.path} style={cardStyle}>
                    <div style={thumbWrapStyle}>
                      <img src={asset.url} alt="" style={thumbImgStyle} loading="lazy" />
                      {inUse && (
                        <span style={usageBadgeStyle} title={users.join(', ')}>
                          <Icon icon="lucide:link" style={{ fontSize: '0.7rem' }} />
                          {users.length}
                        </span>
                      )}
                    </div>
                    <div style={cardMetaStyle}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{formatSize(asset.size)}</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {onSelect && (
                          <button
                            onClick={() => onSelect(asset.url)}
                            disabled={busy}
                            style={useBtnStyle}
                            title="Usar esta imagen"
                          >
                            <Icon icon="lucide:check" /> Usar
                          </button>
                        )}
                        <button
                          onClick={() => onDelete(asset.path)}
                          disabled={busy || inUse}
                          style={{ ...delBtnStyle, opacity: inUse ? 0.35 : 1, cursor: inUse ? 'not-allowed' : 'pointer' }}
                          title={inUse ? `En uso por: ${users.join(', ')}` : 'Eliminar'}
                        >
                          <Icon icon="lucide:trash-2" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
};
const modalStyle = {
  background: 'var(--bg-surface)', borderRadius: 16, width: '100%', maxWidth: 720,
  maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
  boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
};
const headerStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
  padding: '20px', borderBottom: '1px solid var(--border)',
};
const closeBtnStyle = { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-muted)' };
const toolbarStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '12px 20px', borderBottom: '1px solid var(--border)',
};
const uploadBtnStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px',
  borderRadius: 10, background: 'var(--brand-color)', color: 'white', border: 'none',
  fontWeight: 800, cursor: 'pointer',
};
const bodyStyle = { padding: 20, overflowY: 'auto' };
const emptyStyle = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  gap: 8, padding: '48px 16px', color: 'var(--text-muted)', textAlign: 'center',
};
const gridStyle = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 14,
};
const cardStyle = {
  border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-main)',
};
const thumbWrapStyle = { position: 'relative', width: '100%', aspectRatio: '1 / 1', background: 'var(--bg-surface)' };
const thumbImgStyle = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' };
const usageBadgeStyle = {
  position: 'absolute', top: 6, right: 6, display: 'inline-flex', alignItems: 'center', gap: 3,
  padding: '2px 7px', borderRadius: 999, background: 'rgba(39,174,96,0.95)', color: 'white',
  fontSize: '0.7rem', fontWeight: 800,
};
const cardMetaStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', gap: 6,
};
const useBtnStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 8,
  background: 'var(--brand-color)', color: 'white', border: 'none', fontWeight: 700,
  fontSize: '0.8rem', cursor: 'pointer',
};
const delBtnStyle = {
  display: 'inline-flex', alignItems: 'center', padding: '6px 8px', borderRadius: 8,
  background: 'transparent', color: '#e74c3c', border: '1px solid rgba(231,76,60,0.25)',
  fontSize: '0.85rem',
};

export default AssetLibraryModal;
