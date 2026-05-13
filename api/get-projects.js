export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }

  // Grab the token that the frontend sends us in the headers
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send('Missing Authorization header');
  }

  try {
    // Make the actual call to Supabase FROM the server (bypassing CORS)
    const response = await fetch('https://api.supabase.com/v1/projects', {
      method: 'GET',
      headers: {
        'Authorization': authHeader, // Pass the token through
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    // Send the data back to the React frontend
    return res.status(200).json(data);

  } catch (error) {
    console.error("Error fetching projects:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}