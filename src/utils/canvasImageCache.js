// src/utils/canvasImageCache.js
//
// Shared, downscaled, LRU-capped bitmap cache for the menu canvas editor.
//
// Why this exists: KonvaImageNode used to do `new window.Image()` per node
// instance and decode the asset at its FULL uploaded resolution — a single
// 12 MP phone photo decodes to ~48 MB of RGBA in memory. With several image
// nodes (and a re-decode on every remount, since nothing was cached) the
// editor tab climbed past a gigabyte and the renderer OOM-crashed.
//
// This module decodes each source URL exactly once, downscales it to a sane
// display ceiling, and hands every consumer the SAME small canvas. An LRU cap
// bounds total retained pixels so a big menu can't grow without limit.

import { useEffect, useState } from 'react';

// Longest edge (in device pixels) we keep for a decoded asset. 2048 is plenty
// for a full-page menu background on any screen; item photos are far smaller.
const MAX_EDGE = 2048;
// Hard ceiling on distinct cached bitmaps. Bounded per menu in practice; the
// LRU eviction below is the real safety net.
const MAX_ENTRIES = 48;

// key: src (string) -> { canvas, width, height, promise, status, lastUsed }
const cache = new Map();

function evictIfNeeded() {
  while (cache.size > MAX_ENTRIES) {
    // Drop the least-recently-used *resolved* entry. Skip in-flight loads so we
    // never evict something a live node is still waiting on.
    let oldestKey = null;
    let oldestTime = Infinity;
    for (const [k, v] of cache) {
      if (v.status !== 'loaded') continue;
      if (v.lastUsed < oldestTime) { oldestTime = v.lastUsed; oldestKey = k; }
    }
    if (oldestKey == null) break;
    const victim = cache.get(oldestKey);
    // Zero the canvas dimensions so the backing bitmap is released promptly
    // instead of lingering until GC.
    if (victim?.canvas) { victim.canvas.width = 0; victim.canvas.height = 0; }
    cache.delete(oldestKey);
  }
}

function downscaleToCanvas(img) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.min(1, MAX_EDGE / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  return { canvas, width: w, height: h };
}

function load(src) {
  const existing = cache.get(src);
  if (existing) return existing;

  const entry = { canvas: null, width: 0, height: 0, status: 'loading', lastUsed: Date.now() };
  entry.promise = new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const { canvas, width, height } = downscaleToCanvas(img);
        entry.canvas = canvas;
        entry.width = width;
        entry.height = height;
        entry.status = 'loaded';
      } catch {
        entry.status = 'error';
      }
      // The full-res source Image is no longer referenced past this point, so
      // its decoded bitmap is free to be collected — only the small canvas stays.
      evictIfNeeded();
      resolve(entry);
    };
    img.onerror = () => { entry.status = 'error'; resolve(entry); };
    img.src = src;
  });
  cache.set(src, entry);
  return entry;
}

/**
 * Resolve a source URL to a shared, downscaled canvas suitable for Konva's
 * <Image image={...} />. Returns { image, width, height, failed }.
 *
 * `image` is null until the asset finishes decoding; `width`/`height` are the
 * downscaled bitmap's intrinsic dimensions (use these for cover/contain crop
 * math, exactly as you would img.width/img.height).
 */
export function useCanvasImage(src) {
  const [, force] = useState(0);

  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    const entry = load(src);
    entry.lastUsed = Date.now();
    if (entry.status === 'loading') {
      entry.promise.then(() => { if (!cancelled) force(n => n + 1); });
    }
    return () => { cancelled = true; };
  }, [src]);

  if (!src) return { image: null, width: 0, height: 0, failed: false };
  const entry = cache.get(src);
  if (!entry) return { image: null, width: 0, height: 0, failed: false };
  // Note: LRU freshness is bumped in the effect above (a side effect), not
  // here — render must stay pure.
  return {
    image: entry.status === 'loaded' ? entry.canvas : null,
    width: entry.width,
    height: entry.height,
    failed: entry.status === 'error',
  };
}
