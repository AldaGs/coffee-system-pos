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
