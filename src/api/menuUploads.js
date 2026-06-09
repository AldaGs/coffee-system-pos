// PDF/PNG menu upload pipeline (Phase 2). Converts a PDF client-side into
// WebP page images, uploads everything to Supabase Storage, and returns the
// `data` envelope that gets written onto the menus row.
//
// Storage layout per menu:
//   menu-assets/uploads/<menu_id>/original.pdf      (PDF kind only — owner keeps original for download)
//   menu-assets/uploads/<menu_id>/page-1.webp
//   menu-assets/uploads/<menu_id>/page-N.webp
//
// menu.data shape (read by PublicMenu when kind in ('pdf','image')):
//   {
//     format:       'pdf' | 'image',
//     page_count:   number,
//     pages:        string[],   // public URLs with ?v=<ts> cache buster
//     original_url: string?     // pdf only
//   }
//
// All work runs in the browser — no server runtime, no edge function — so
// it stays cheap on Supabase's free tier.

import { supabase } from '../supabaseClient';

const BUCKET = 'menu-assets';
const MAX_RENDER_WIDTH = 1600;   // hi-res enough for tablets; trades off vs egress
const WEBP_QUALITY = 0.85;
export const MAX_PDF_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// pdf.js is loaded lazily so a shop that never uploads a PDF doesn't pay the
// bundle cost. The worker URL is resolved via Vite's import.meta.url so it
// works in dev + prod without a separate static-copy step.
let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
      const workerUrl = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).href;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

// Convert one PDF page to a WebP blob at a sane width.
async function renderPdfPageToWebp(page) {
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(2, MAX_RENDER_WIDTH / baseViewport.width);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');

  await page.render({ canvasContext: ctx, viewport, canvas }).promise;

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      b => b ? resolve(b) : reject(new Error('canvas.toBlob returned null')),
      'image/webp',
      WEBP_QUALITY
    );
  });
}

// Convert a single image file (PNG/JPG/WebP) to WebP, downscaling to
// MAX_RENDER_WIDTH so the public menu doesn't ship 4000px originals.
async function imageFileToWebp(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, MAX_RENDER_WIDTH / img.naturalWidth);
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    return await new Promise((resolve, reject) =>
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob null')), 'image/webp', WEBP_QUALITY));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function pageStoragePath(menuId, index) {
  return `uploads/${menuId}/page-${index + 1}.webp`;
}
function originalPdfPath(menuId) {
  return `uploads/${menuId}/original.pdf`;
}

async function uploadBlob(path, blob, contentType) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType, upsert: true, cacheControl: '3600' });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

// Wipe any prior page-*.webp + original.pdf for this menu so re-uploads
// don't leak orphans. Best-effort — RLS or transient failures don't block
// the new upload.
async function wipeMenuFolder(menuId) {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET).list(`uploads/${menuId}`, { limit: 200 });
    if (error || !data?.length) return;
    const paths = data.map(o => `uploads/${menuId}/${o.name}`);
    await supabase.storage.from(BUCKET).remove(paths);
  } catch { /* ignore */ }
}

// Main entry: convert + upload a file for the given menu row.
// `onProgress({ phase, current, total })` lets the UI show "Página 2 / 5".
export async function uploadMenuFile(menuId, file, onProgress = () => {}) {
  if (!menuId) throw new Error('menuId required');
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

  if (isPdf && file.size > MAX_PDF_BYTES) {
    throw new Error(`El PDF supera ${Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB`);
  }
  if (!isPdf && file.size > MAX_IMAGE_BYTES) {
    throw new Error(`La imagen supera ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB`);
  }

  await wipeMenuFolder(menuId);

  if (isPdf) {
    onProgress({ phase: 'loading-pdf' });
    const pdfjs = await loadPdfjs();
    const buf = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buf }).promise;
    const pageCount = pdf.numPages;
    const pageUrls = [];
    for (let i = 0; i < pageCount; i++) {
      onProgress({ phase: 'rendering', current: i + 1, total: pageCount });
      const page = await pdf.getPage(i + 1);
      const blob = await renderPdfPageToWebp(page);
      onProgress({ phase: 'uploading', current: i + 1, total: pageCount });
      pageUrls.push(await uploadBlob(pageStoragePath(menuId, i), blob, 'image/webp'));
    }
    onProgress({ phase: 'uploading-original' });
    const originalUrl = await uploadBlob(originalPdfPath(menuId), file, 'application/pdf');
    return {
      kind: 'pdf',
      data: { format: 'pdf', page_count: pageCount, pages: pageUrls, original_url: originalUrl }
    };
  }

  // image kind — single page
  onProgress({ phase: 'rendering', current: 1, total: 1 });
  const blob = await imageFileToWebp(file);
  onProgress({ phase: 'uploading', current: 1, total: 1 });
  const url = await uploadBlob(pageStoragePath(menuId, 0), blob, 'image/webp');
  return {
    kind: 'image',
    data: { format: 'image', page_count: 1, pages: [url] }
  };
}

// Called when a pdf/image menu is deleted by the user — wipes the folder.
export async function deleteMenuUploads(menuId) {
  await wipeMenuFolder(menuId);
}
