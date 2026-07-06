export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

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
