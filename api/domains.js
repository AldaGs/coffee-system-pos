/* global process */
//
// Consolidated custom-domain endpoint. Merges what used to be three separate
// serverless functions (add-domain / remove-domain / resolve-domain) into one
// so the deployment stays under Vercel's Hobby-plan 12-function cap.
//
// Routing is preserved for existing clients via rewrites in vercel.json:
//   GET  /api/resolve-domain?domain=…      -> here (method GET)
//   POST /api/add-domain     {domain}      -> here with ?op=add
//   POST /api/remove-domain  {domain}      -> here with ?op=remove
// Callers keep hitting the old paths unchanged.

export default async function handler(req, res) {
  if (req.method === 'GET') return resolveDomain(req, res);
  if (req.method === 'POST') {
    const op = req.query.op;
    if (op === 'remove') return removeDomain(req, res);
    return addDomain(req, res); // default POST = add
  }
  return res.status(405).json({ success: false, error: 'Method Not Allowed' });
}

async function addDomain(req, res) {
  const { domain } = req.body || {};

  if (!domain) {
    return res.status(400).json({ success: false, error: 'Missing domain' });
  }

  const vercelApiToken = process.env.VERCEL_API_TOKEN;
  const vercelProjectId = process.env.VERCEL_PROJECT_ID;

  if (!vercelApiToken || !vercelProjectId) {
    return res.status(500).json({
      success: false,
      error: 'Vercel API Token or Project ID is not configured on this server. Please contact support.'
    });
  }

  try {
    // Add domain to Vercel Project
    const response = await fetch(`https://api.vercel.com/v10/projects/${vercelProjectId}/domains`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vercelApiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: domain,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      // Return the error message from Vercel
      return res.status(response.status).json({ success: false, error: data.error?.message || 'Failed to add domain' });
    }

    return res.status(200).json({
      success: true,
      domain: data.name,
      status: data.status,
    });
  } catch (err) {
    console.error('add-domain failed:', err);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}

async function removeDomain(req, res) {
  const { domain } = req.body || {};

  if (!domain) {
    return res.status(400).json({ success: false, error: 'Missing domain' });
  }

  const vercelApiToken = process.env.VERCEL_API_TOKEN;
  const vercelProjectId = process.env.VERCEL_PROJECT_ID;

  if (!vercelApiToken || !vercelProjectId) {
    return res.status(500).json({
      success: false,
      error: 'Vercel API Token or Project ID is not configured on this server. Please contact support.'
    });
  }

  try {
    // Remove domain from Vercel Project
    const response = await fetch(`https://api.vercel.com/v9/projects/${vercelProjectId}/domains/${domain}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${vercelApiToken}`,
      },
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return res.status(response.status).json({ success: false, error: data.error?.message || 'Failed to remove domain' });
    }

    return res.status(200).json({
      success: true,
      domain: domain,
    });
  } catch (err) {
    console.error('remove-domain failed:', err);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}

async function resolveDomain(req, res) {
  const { domain } = req.query;

  if (!domain) {
    return res.status(400).json({ success: false, error: 'Missing domain' });
  }

  try {
    const domainsToCheck = [domain, `_tinypos.${domain}`];
    let projectRef = null;

    for (const d of domainsToCheck) {
      const dohResponse = await fetch(`https://cloudflare-dns.com/dns-query?name=${d}&type=TXT`, {
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
      return res.status(200).json({ success: true, projectRef });
    } else {
      return res.status(404).json({ success: false, error: 'TXT record not found' });
    }
  } catch (err) {
    console.error('resolve-domain failed:', err);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}
