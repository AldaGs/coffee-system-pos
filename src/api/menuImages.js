// Item photo upload pipeline. Owners crop/zoom in the modal, this module
// turns the cropped canvas into a WebP blob, then stores it CONTENT-ADDRESSED:
// the SHA-256 of the bytes is the filename (assets/<hash>.webp). Identical
// images therefore collapse to a single object no matter how many items use
// them — that's the dedup guarantee behind the asset library. The public URL
// written onto menu_items.image_url is stable (the hash IS the version, so no
// ?v= cache-buster is needed).
//
// Single size (max 800px width) keeps storage cheap and the public menu
// fast; v0.2.1 can introduce srcset if mobile bandwidth becomes an issue.

import { supabase } from '../supabaseClient';

const BUCKET = 'menu-assets';
const ASSET_DIR = 'assets';
const LEGACY_DIR = 'items'; // per-item files from before content-addressing
const MAX_WIDTH = 800;
const WEBP_QUALITY = 0.85;
export const MAX_SOURCE_BYTES = 5 * 1024 * 1024;

// Takes a crop area (pixels, source coords) + the source image, returns a
// WebP Blob no wider than MAX_WIDTH. Aspect ratio of the crop is preserved.
export async function cropToWebpBlob(imageSrc, cropPx) {
  const img = await loadImage(imageSrc);
  const targetW = Math.min(MAX_WIDTH, Math.round(cropPx.width));
  const scale = targetW / cropPx.width;
  const targetH = Math.round(cropPx.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(
    img,
    cropPx.x, cropPx.y, cropPx.width, cropPx.height,
    0, 0, targetW, targetH
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null')),
      'image/webp',
      WEBP_QUALITY
    );
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.crossOrigin = 'anonymous';
    img.src = src;
  });
}

// SHA-256 of a Blob's bytes, lowercase hex. Used as the content address.
async function hashBlob(blob) {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Uploads a WebP blob content-addressed and returns its stable public URL.
// If an object with the same hash already exists we skip the upload (dedup) —
// upsert:false makes Supabase return a "Duplicate"/409 we treat as success.
export async function uploadAsset(blob) {
  const hash = await hashBlob(blob);
  const path = `${ASSET_DIR}/${hash}.webp`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/webp', upsert: false, cacheControl: '31536000' });
  // Duplicate just means another item already uploaded these exact bytes.
  if (upErr && !isDuplicateError(upErr)) throw upErr;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

function isDuplicateError(err) {
  const msg = (err?.message || '').toLowerCase();
  return err?.statusCode === '409' || err?.status === 409 ||
    msg.includes('duplicate') || msg.includes('already exists') || msg.includes('resource already exists');
}

// Back-compat alias — older call sites passed an itemId we no longer need.
export async function uploadItemImage(_itemId, blob) {
  return uploadAsset(blob);
}

// Clears an item's photo. Assets are SHARED, so we never delete the storage
// object here (another item may reference it) — only null the DB column.
// Orphan cleanup is handled deliberately via the asset library (deleteAsset).
export async function clearItemImage(itemId) {
  const { error } = await supabase
    .from('menu_items').update({ image_url: null }).eq('id', itemId);
  if (error) throw error;
}

// Lists every stored image (new content-addressed assets + legacy per-item
// files) as { path, url, name, size, updatedAt }. Powers the asset library.
export async function listAssets() {
  const dirs = [ASSET_DIR, LEGACY_DIR];
  const results = await Promise.all(dirs.map(async dir => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(dir, { limit: 1000, sortBy: { column: 'updated_at', order: 'desc' } });
    if (error) return [];
    return (data || [])
      .filter(o => o.id && /\.(webp|png|jpe?g)$/i.test(o.name))
      .map(o => {
        const path = `${dir}/${o.name}`;
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        return {
          path,
          url: pub.publicUrl,
          name: o.name,
          size: o.metadata?.size ?? null,
          updatedAt: o.updated_at ?? o.created_at ?? null,
        };
      });
  }));
  return results.flat();
}

// Permanently removes a stored asset. Caller is responsible for ensuring no
// item still references it (the library blocks delete on in-use assets).
export async function deleteAsset(path) {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

export async function setItemImageUrl(itemId, imageUrl) {
  const { error } = await supabase
    .from('menu_items').update({ image_url: imageUrl }).eq('id', itemId);
  if (error) throw error;
}
