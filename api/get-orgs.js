// Lists the authenticated user's Supabase organizations. Used by the guided
// "create project for me" flow to pick which org the new project belongs to.
// Same thin server-side proxy pattern as get-projects.js (passes the OAuth
// bearer through, bypassing browser CORS).
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send('Missing Authorization header');
  }

  try {
    const response = await fetch('https://api.supabase.com/v1/organizations', {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching organizations:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
