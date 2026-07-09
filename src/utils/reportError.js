// Client-side error reporter. Posts a compact summary to /api/log-error, which
// forwards it to the configured webhook. Fire-and-forget and failure-proof: a
// reporting problem must never cascade into more errors.
//
// Guard rails so a render loop or a noisy page can't flood the webhook:
//   - at most MAX_PER_SESSION reports per page load
//   - identical messages are de-duplicated for DEDUP_MS

const MAX_PER_SESSION = 8;
const DEDUP_MS = 30_000;

let sent = 0;
const recent = new Map(); // message → last-sent timestamp

export function reportError(source, error, extra) {
  try {
    if (typeof window === 'undefined') return;
    if (sent >= MAX_PER_SESSION) return;

    const message = (error && (error.message || error.toString())) || 'Unknown error';
    const now = Date.now();
    const last = recent.get(message);
    if (last && now - last < DEDUP_MS) return;
    recent.set(message, now);
    sent += 1;

    const payload = {
      source,
      message,
      stack: error && error.stack ? String(error.stack) : undefined,
      url: window.location?.href,
      userAgent: navigator?.userAgent,
      extra,
    };

    // keepalive so the report still flushes if the error is followed by a
    // navigation/reload (e.g. the ErrorBoundary's reload button).
    fetch('/api/log-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // never throw from the reporter
  }
}

// Install global handlers once: uncaught errors, unhandled promise rejections,
// and Vite's dynamic-import (stale-chunk) failures. The chunk case also reloads
// once so a deploy mid-session self-heals instead of white-screening.
let installed = false;
export function installGlobalErrorReporting() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (e) => {
    if (e?.error) reportError('window.error', e.error);
    else if (e?.message) reportError('window.error', { message: e.message, stack: `${e.filename}:${e.lineno}:${e.colno}` });
  });

  window.addEventListener('unhandledrejection', (e) => {
    const r = e?.reason;
    reportError('unhandledrejection', r instanceof Error ? r : { message: String(r) });
  });

  // Vite emits this when a lazily-imported chunk 404s (typically a stale bundle
  // after a redeploy). Report, then reload once to fetch the fresh chunks.
  window.addEventListener('vite:preloadError', (e) => {
    reportError('vite:preloadError', e?.payload || { message: 'preload failed' });
    if (!sessionStorage.getItem('tinypos_chunk_reload')) {
      sessionStorage.setItem('tinypos_chunk_reload', '1');
      window.location.reload();
    }
  });
}
