// Polls a single project's provisioning status. The client calls this on an
// interval after create-project until status is ACTIVE_HEALTHY, then proceeds to
// fetch keys + run the install SQL. Thin passthrough of the OAuth bearer.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send('Missing Authorization header');
  }

  const ref = req.query.ref;
  if (!ref) return res.status(400).json({ error: 'Missing ref' });

  try {
    const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(ref)}`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json(data);
    // Normalize: callers only need the status + ref.
    return res.status(200).json({ id: data.id, ref: data.ref || ref, status: data.status });
  } catch (error) {
    console.error('Error fetching project status:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
