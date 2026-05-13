export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  const { projectRef } = req.query;
  const { query } = req.body;

  try {
    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: { 
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: query })
    });
    const data = await response.json();
    
    if (!response.ok) return res.status(response.status).json(data);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: "Server Error" });
  }
}