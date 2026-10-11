// Cookieless traffic analytics for the public /menu and /order pages.
//
// Events go to the shop's own Supabase through the track_page_events RPC
// (migration 057). Nothing is stored on the visitor's device: the visit id is
// random, lives in memory for this tab only, and is gone on reload, so it can
// group one visit's events but never follow a person. No IP or user agent is
// sent. Browsers asking not to be tracked (Do Not Track / Global Privacy
// Control) send nothing. Every failure is swallowed: analytics never breaks a page.

const FLUSH_MS = 5000;
const MAX_BATCH = 30;

function randomId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

function optedOut() {
  if (typeof navigator === 'undefined') return true;
  return navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';
}

export function createPageTracker(client, page) {
  if (!client || optedOut()) return { track() {}, stop() {} };
  const visit = randomId();
  let queue = [];

  const send = (batch, keepalive) => {
    if (keepalive && client.supabaseUrl && client.supabaseKey) {
      // keepalive lets the request outlive the page when the tab is closing.
      return fetch(`${client.supabaseUrl}/rest/v1/rpc/track_page_events`, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', apikey: client.supabaseKey, Authorization: `Bearer ${client.supabaseKey}` },
        body: JSON.stringify({ p_events: batch }),
      }).catch(() => {});
    }
    return Promise.resolve(client.rpc('track_page_events', { p_events: batch })).catch(() => {});
  };

  const flush = (keepalive = false) => {
    while (queue.length) send(queue.splice(0, MAX_BATCH), keepalive);
  };

  const onHide = () => { if (document.visibilityState === 'hidden') flush(true); };
  const onPageHide = () => flush(true);
  const timer = setInterval(flush, FLUSH_MS);
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onPageHide);

  return {
    track(event, { itemId, categoryId, detail } = {}) {
      queue.push({
        page, event, visit,
        item_id: itemId != null ? String(itemId) : undefined,
        category_id: categoryId ?? undefined,
        detail: detail != null ? String(detail).slice(0, 40) : undefined,
      });
      if (queue.length >= MAX_BATCH) flush();
    },
    stop() {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      flush(true);
    },
  };
}
