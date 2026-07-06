import { rewrite } from '@vercel/edge';

export const config = {
  matcher: [
    // Skip static files, api routes, Next.js assets if any, and any path with a dot
    '/((?!api|_next/static|_next/image|favicon.ico|assets|.*\\..*).*)',
  ],
};

export default async function middleware(req) {
  const url = new URL(req.url);
  
  // Extract the hostname from the request (e.g. menu.somecafe.com)
  const hostname = req.headers.get('host');
  
  if (!hostname) {
    return;
  }

  // Determine if this is a primary/internal domain that shouldn't be rewritten.
  // Add your primary application domains here (e.g., app.tinypos.app, tinypos.com)
  const isPrimary = 
    hostname.includes('localhost') || 
    hostname.includes('127.0.0.1') || 
    hostname.endsWith('.vercel.app');

  // If it's a custom domain, perform a DoH lookup for the TXT record
  if (!isPrimary) {
    try {
      // Cloudflare DNS over HTTPS (DoH)
      // We check both the exact hostname (works if they use an A record) 
      // and a special _tinypos subdomain (required if they use a CNAME, due to DNS RFCs)
      const domainsToCheck = [hostname, `_tinypos.${hostname}`];
      
      let projectRef = null;
      
      for (const domain of domainsToCheck) {
        const dohResponse = await fetch(`https://cloudflare-dns.com/dns-query?name=${domain}&type=TXT`, {
          headers: { accept: 'application/dns-json' }
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
        if (projectRef) break;
      }
      
      if (projectRef) {
        // Rewrite the request to /menu?p=PROJECT_REF
        const path = url.pathname === '/' ? '/menu' : url.pathname;
        const rewriteUrl = new URL(path, req.url);
        
        url.searchParams.forEach((val, key) => rewriteUrl.searchParams.set(key, val));
        rewriteUrl.searchParams.set('p', projectRef);
        
        return rewrite(rewriteUrl);
      }
    } catch (err) {
      console.error(`Edge Middleware DNS lookup failed for ${hostname}:`, err);
    }
  }

  // If not a custom domain or no valid TXT record found, proceed normally
}
