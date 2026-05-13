export default async function handler(req, res) {
  // 1. Supabase sends the user back here with a temporary "code" in the URL
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('No authorization code provided.');
  }

  // 2. Load your keys from the .env file
  // Load your keys
  const clientId = process.env.VITE_SUPABASE_MANAGEMENT_CLIENT_ID;
  const clientSecret = process.env.SUPABASE_MANAGEMENT_CLIENT_SECRET;

  const protocol = req.headers.host.includes('localhost') ? 'http' : 'https';
  const redirectUri = `${protocol}://${req.headers.host}/api/auth/callback`;

  try {
    // Trade the temporary code for a real Access Token
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    const tokenResponse = await fetch('https://api.supabase.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}` // Securely identifying your app
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri
      })
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("Token Exchange Error:", tokenData);
      return res.status(400).send(`Error exchanging token: ${tokenData.error_description || tokenData.error}`);
    }

    // 4. Success! Redirect the user back to the front-end Setup Screen,
    // passing the new secure token in the URL so the React app can use it.
    res.redirect(302, `/?setup_token=${tokenData.access_token}`);

  } catch (error) {
    console.error("Callback failed:", error);
    res.status(500).send("Internal Server Error during authentication.");
  }
}