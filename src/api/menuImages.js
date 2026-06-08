// Item photo upload pipeline. Owners crop/zoom in the modal, this module
// turns the cropped canvas into a WebP blob, uploads it under a deterministic
// path (overwriting any prior version), and writes the public URL — with a
// ?v=<timestamp> cache buster — onto menu_items.image_url.
//
// Single size (max 800px width) keeps storage cheap and the public menu
// fast; v0.2.1 can introduce srcset if mobile bandwidth becomes an issue.

import { supabase } from '../supabaseClient';

const BUCKET = 'menu-assets';
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

// Uploads the blob and returns the full public URL with cache-buster appended.
// Path is items/<item_id>.webp — overwrite-on-update so we don't pile up orphans.
export async function uploadItemImage(itemId, blob) {
  const path = `items/${itemId}.webp`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/webp', upsert: true, cacheControl: '3600' });
  if (upErr) throw upErr;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

// Removes both the storage object and the DB column. Storage delete failures
// don't block the DB clear — orphan cleanup is cheaper than blocking the user.
export async function clearItemImage(itemId) {
  const path = `items/${itemId}.webp`;
  try {
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    // Ignore — file may not exist, or RLS may deny on first run.
  }
  const { error } = await supabase
    .from('menu_items').update({ image_url: null }).eq('id', itemId);
  if (error) throw error;
}

export async function setItemImageUrl(itemId, imageUrl) {
  const { error } = await supabase
    .from('menu_items').update({ image_url: imageUrl }).eq('id', itemId);
  if (error) throw error;
}
