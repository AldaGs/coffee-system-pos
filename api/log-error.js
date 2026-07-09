// Lightweight error sink. Both the client ErrorBoundary/global handlers and
// the Edge middleware POST here; we forward a compact summary to a webhook
// (Discord- and Slack-compatible) so failures are visible even on Vercel's
// free tier, which doesn't retain function/edge logs.
//
// Config: set ERROR_WEBHOOK_URL to a Discord or Slack incoming-webhook URL.
// If it's unset, this endpoint is a graceful no-op — nothing breaks before
// it's configured. The webhook secret only ever lives here (server-side), so
// the client can report without exposing it.

const WEBHOOK_TIMEOUT_MS = 2000;
const MAX_FIELD = 1500;

function clip(v, n = MAX_FIELD) {
  if (v == null) return '';
  const s = String(v);
  return s.length > n ? s.slice(0, n) + '…' : s;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const webhook = process.env.ERROR_WEBHOOK_URL;
  // Always succeed for the caller — reporting must never surface its own error.
  if (!webhook) return res.status(200).json({ ok: true, skipped: true });

  const b = req.body || {};
  const source = clip(b.source || 'unknown', 40);
  const message = clip(b.message || 'Unknown error');
  const stack = clip(b.stack, 1200);
  const url = clip(b.url, 300);
  const ua = clip(b.userAgent || req.headers['user-agent'], 300);
  const extra = b.extra ? clip(JSON.stringify(b.extra), 500) : '';
  const when = new Date().toISOString();

  const text = [
    `🛑 *tinypos error* — \`${source}\``,
    `• ${message}`,
    url && `• url: ${url}`,
    extra && `• extra: ${extra}`,
    ua && `• ua: ${ua}`,
    `• at: ${when}`,
    stack && '```\n' + stack + '\n```',
  ].filter(Boolean).join('\n');

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), WEBHOOK_TIMEOUT_MS);
    try {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // `content` → Discord, `text` → Slack. Each platform ignores the other.
        body: JSON.stringify({ content: clip(text, 1900), text: clip(text, 1900) }),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Swallow — a broken webhook must not make the reporter itself throw.
  }

  return res.status(200).json({ ok: true });
}
