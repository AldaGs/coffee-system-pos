/* eslint-env node */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

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
