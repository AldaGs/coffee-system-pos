import { rewrite } from '@vercel/edge';

export const config = {
  matcher: [
    // Skip static files, api routes, Next.js assets if any, and any path with a dot
    '/((?!api|_next/static|_next/image|favicon.ico|assets|.*\\..*).*)',
  ],
};

// The application's own domains. Requests to these serve the POS/app directly
// and must NEVER trigger the customer-domain DNS lookup below — otherwise every
// navigation on the app fires uncached DoH requests, which Cloudflare
// rate-limits until a lookup hangs and the Edge function times out (a 500 /
// "This page isn't working"). Add every apex + subdomain the app is served on.
const PRIMARY_HOSTS = new Set([
  'tinypos.app',
  'www.tinypos.app',
]);

// Guard rails so a slow/rate-limited DNS lookup can't hang the whole function.
const DOH_TIMEOUT_MS = 1500;
// How long a resolved domain→ref mapping is cached on the visitor's cookie, so
// we don't repeat the lookup on every navigation of the same custom domain.
const REF_COOKIE_MAX_AGE = 3600;

export default async function middleware(req) {
  const url = new URL(req.url);

  // Extract the hostname from the request (e.g. menu.somecafe.com). Strip any
  // :port so localhost:5173 etc. still match.
  const hostname = (req.headers.get('host') || '').split(':')[0];

  if (!hostname) {
    return;
  }

  // Primary/internal domains serve the app as-is — no custom-domain resolution.
  const isPrimary =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.vercel.app') ||
    PRIMARY_HOSTS.has(hostname);

  if (isPrimary) return;

  // Custom (café) domain. Build the menu rewrite for a given project ref,
  // preserving the original path + query and pinning ?p=<ref>.
  const rewriteToMenu = (projectRef) => {
    const path = url.pathname === '/' ? '/menu' : url.pathname;
    const rewriteUrl = new URL(path, req.url);
    url.searchParams.forEach((val, key) => rewriteUrl.searchParams.set(key, val));
    rewriteUrl.searchParams.set('p', projectRef);
    return rewrite(rewriteUrl);
  };

  // Fast path: reuse a ref already resolved for this visitor (cookie-scoped to
  // the custom domain), so navigations don't re-hit Cloudflare DoH.
  const cached = (req.headers.get('cookie') || '').match(/(?:^|;\s*)tinypos_ref=([^;]+)/)?.[1];
  if (cached) {
    return rewriteToMenu(cached);
  }

  // Resolve the project ref from a TXT record. We check both the exact hostname
  // (works with an A record) and a _tinypos subdomain (required with a CNAME,
  // per DNS RFCs). Timed + try/catch: on any failure we fall through and serve
  // the app normally rather than 500.
  try {
    const domainsToCheck = [hostname, `_tinypos.${hostname}`];
    let projectRef = null;

    for (const domain of domainsToCheck) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), DOH_TIMEOUT_MS);
      try {
        const dohResponse = await fetch(`https://cloudflare-dns.com/dns-query?name=${domain}&type=TXT`, {
          headers: { accept: 'application/dns-json' },
          signal: ctrl.signal,
        });
        const dnsData = await dohResponse.json();
        if (dnsData.Answer) {
          for (const record of dnsData.Answer) {
            const txtData = record.data.replace(/^"|"$/g, '');
            if (txtData.startsWith('tinypos-ref=')) {
              projectRef = txtData.split('=')[1].trim();
              break;
            }
          }
        }
      } finally {
        clearTimeout(timer);
      }
      if (projectRef) break;
    }

    if (projectRef) {
      const res = rewriteToMenu(projectRef);
      // Cache the resolution so the next navigation skips the DNS lookup.
      res.headers.append(
        'Set-Cookie',
        `tinypos_ref=${projectRef}; Path=/; Max-Age=${REF_COOKIE_MAX_AGE}; SameSite=Lax`
      );
      return res;
    }
  } catch (err) {
    console.error(`Edge Middleware DNS lookup failed for ${hostname}:`, err);
    // Best-effort report so edge failures aren't invisible on the free tier.
    // Awaited with its own short timeout so it can't hang the response.
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1000);
      await fetch(new URL('/api/log-error', req.url).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'edge-middleware',
          message: `DNS lookup failed for ${hostname}: ${err?.message || err}`,
          url: req.url,
        }),
        signal: ctrl.signal,
      }).catch(() => {});
      clearTimeout(timer);
    } catch { /* never throw from reporting */ }
  }

  // No valid TXT record (or lookup failed) — serve the app normally.
}
