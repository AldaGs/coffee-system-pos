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
      const dohResponse = await fetch(`https://cloudflare-dns.com/dns-query?name=${hostname}&type=TXT`, {
        headers: { accept: 'application/dns-json' }
      });
      
      const dnsData = await dohResponse.json();
      
      if (dnsData.Answer) {
        // Iterate through all TXT records to find ours
        for (const record of dnsData.Answer) {
          // TXT record data often comes wrapped in quotes, e.g., "tinypos-ref=xyz"
          const txtData = record.data.replace(/^"|"$/g, '');
          
          if (txtData.startsWith('tinypos-ref=')) {
            const projectRef = txtData.split('=')[1].trim();
            
            // Rewrite the request to /menu?p=PROJECT_REF
            // If they visited the root (menu.somecafe.com/), we send them to /menu.
            // If they visited /menu/tv (menu.somecafe.com/menu/tv), we preserve the path.
            const path = url.pathname === '/' ? '/menu' : url.pathname;
            const rewriteUrl = new URL(path, req.url);
            
            // Preserve existing query params if any, and add the project ref
            url.searchParams.forEach((val, key) => rewriteUrl.searchParams.set(key, val));
            rewriteUrl.searchParams.set('p', projectRef);
            
            return rewrite(rewriteUrl);
          }
        }
      }
    } catch (err) {
      console.error(`Edge Middleware DNS lookup failed for ${hostname}:`, err);
    }
  }

  // If not a custom domain or no valid TXT record found, proceed normally
}
