// Phase 4c.2 — image asset picker for the canvas editor.
// Modal that lists previously-uploaded images for this menu and lets the
// owner upload more. Drag-drop and click-to-pick supported. Resolves the
// chosen URL via the onPick prop.

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import { listCanvasAssets, uploadCanvasAsset, deleteCanvasAsset, MAX_ASSET_BYTES } from '../../api/menuCanvasAssets';

export default function AssetPicker({ menuId, onPick, onClose }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  async function reload() {
    setLoading(true);
    try { setAssets(await listCanvasAssets(menuId)); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, [menuId]);

  async function handleFiles(files) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const f of files) {
        if (!f.type.startsWith('image/')) continue;
        await uploadCanvasAsset(menuId, f);
      }
      await reload();
    } catch (err) {
      setError(err.message);
    } finally { setUploading(false); }
  }

  async function remove(asset) {
    if (!window.confirm('¿Eliminar esta imagen?')) return;
    try { await deleteCanvasAsset(asset.path); await reload(); }
    catch (err) { setError(err.message); }
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={dialog} onClick={e => e.stopPropagation()}>
        <header style={header}>
          <h3 style={{ margin: 0, fontWeight: 800 }}>Elegir imagen</h3>
          <button onClick={onClose} style={iconCloseBtn}><Icon icon="lucide:x" /></button>
        </header>

        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          style={{
            border: `2px dashed ${dragOver ? '#1f6feb' : '#30363d'}`,
            background: dragOver ? 'rgba(31,111,235,0.08)' : '#0d1117',
            borderRadius: 10, padding: 18, textAlign: 'center', cursor: 'pointer', color: '#aaa'
          }}
          onClick={() => fileRef.current?.click()}
        >
          <Icon icon={uploading ? 'lucide:loader' : 'lucide:upload-cloud'} style={{ fontSize: '1.5rem', marginBottom: 4 }} />
          <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>
            {uploading ? 'Subiendo…' : 'Arrastra o haz clic para subir'}
          </div>
          <div style={{ fontSize: '0.78rem', marginTop: 2, opacity: 0.7 }}>
            Hasta {Math.round(MAX_ASSET_BYTES / 1024 / 1024)}MB · convertimos a WebP
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
          />
        </div>

        {error && <div style={errStyle}>{error}</div>}

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', marginTop: 12 }}>
          {loading ? (
            <p style={{ color: '#888', textAlign: 'center', padding: 20 }}>Cargando…</p>
          ) : assets.length === 0 ? (
            <p style={{ color: '#888', textAlign: 'center', padding: 20 }}>Aún no hay imágenes subidas para este menú.</p>
          ) : (
            <div style={grid}>
              {assets.map(a => (
                <div key={a.path} style={tile}>
                  <img
                    src={a.url}
                    alt=""
                    onClick={() => onPick(`${a.url}?v=${Date.now()}`)}
                    style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 6, cursor: 'pointer', background: '#222' }}
                  />
                  <button onClick={() => remove(a)} style={tileDelete} title="Eliminar">
                    <Icon icon="lucide:trash-2" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const backdrop = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 };
const dialog = { background: '#161b22', border: '1px solid #30363d', borderRadius: 12, padding: 18, width: 'min(720px, 100%)', maxHeight: '85vh', display: 'flex', flexDirection: 'column', color: 'white', gap: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' };
const header = { display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
const iconCloseBtn = { background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', padding: 6, borderRadius: 6 };
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 };
const tile = { position: 'relative' };
const tileDelete = { position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.65)', color: 'white', border: 'none', borderRadius: 6, padding: 6, cursor: 'pointer' };
const errStyle = { background: 'rgba(204,51,51,0.12)', color: '#ff8a8a', border: '1px solid #c33', borderRadius: 8, padding: '8px 12px', fontSize: '0.85rem' };
