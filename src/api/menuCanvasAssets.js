// Phase 4c.2 — image asset upload for canvas-kind designed menus.
//
// Each asset is converted to WebP client-side (≤2000px wide, q=0.85) and
// stored under canvas-assets/<menu_id>/<asset_id>.webp. Public URLs come
// back with a ?v=<ts> cache buster so re-uploads invalidate the CDN copy.
//
// Lives in the existing menu-assets bucket — same RLS as item photos, no
// extra storage policy work needed.

import { supabase } from '../supabaseClient';

const BUCKET = 'menu-assets';
const MAX_WIDTH = 2000;
const WEBP_QUALITY = 0.85;
export const MAX_ASSET_BYTES = 10 * 1024 * 1024;

function assetId() {
  return 'a_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

async function fileToWebp(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, MAX_WIDTH / img.naturalWidth);
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    return await new Promise((resolve, reject) =>
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob null')), 'image/webp', WEBP_QUALITY)
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadCanvasAsset(menuId, file) {
  if (!menuId) throw new Error('menuId required');
  if (file.size > MAX_ASSET_BYTES) {
    throw new Error(`Imagen supera ${Math.round(MAX_ASSET_BYTES / 1024 / 1024)}MB`);
  }
  const id = assetId();
  const path = `canvas-assets/${menuId}/${id}.webp`;
  const blob = await fileToWebp(file);
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/webp', upsert: false, cacheControl: '3600' });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return {
    id,
    path,
    url: `${data.publicUrl}?v=${Date.now()}`
  };
}

// Lists previously-uploaded assets for this menu so the picker can show
// them without re-uploading. Returns [{path, url, name, updated_at}].
export async function listCanvasAssets(menuId) {
  if (!menuId) return [];
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(`canvas-assets/${menuId}`, { limit: 200, sortBy: { column: 'updated_at', order: 'desc' } });
  if (error) return [];
  return (data || []).filter(o => !o.name.startsWith('.')).map(o => {
    const path = `canvas-assets/${menuId}/${o.name}`;
    const pub = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { path, name: o.name, updated_at: o.updated_at, url: pub.data.publicUrl };
  });
}

export async function deleteCanvasAsset(path) {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}
