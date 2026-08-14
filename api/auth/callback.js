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

    // 4. Success! Hand the Management token to the front-end WITHOUT putting it
    // in the URL. Previously we redirected to `/?setup_token=<token>`, which
    // leaked the token into browser history, the `Referer` header of any
    // resource loaded before the SPA stripped it, and every access log that
    // records the request path. Instead we set it as an HttpOnly cookie the
    // browser attaches automatically to our same-origin /api proxies, and
    // redirect to a clean URL carrying only a non-secret marker so the SPA
    // knows OAuth just completed. JS never reads the raw token.
    const isLocalhost = req.headers.host.includes('localhost');
    const cookieParts = [
      `tinypos_mgmt_token=${tokenData.access_token}`,
      'HttpOnly',
      'Path=/',
      'SameSite=Lax',
      // Short-lived: only needs to survive the setup/device/schema flow that
      // immediately follows. The token itself is short-lived server-side too.
      'Max-Age=1800',
    ];
    // `Secure` can't be sent over http, which the local dev server uses.
    if (!isLocalhost) cookieParts.push('Secure');
    res.setHeader('Set-Cookie', cookieParts.join('; '));

    // `state` echoes back what each flow sent (setup/devices/schema); the SPA
    // routes off its own sessionStorage flags, so the marker only needs to
    // signal "OAuth done". We forward state anyway for clarity/debuggability.
    const state = typeof req.query.state === 'string' ? req.query.state : '1';
    res.redirect(302, `/?oauth=${encodeURIComponent(state)}`);

  } catch (error) {
    console.error("Callback failed:", error);
    res.status(500).send("Internal Server Error during authentication.");
  }
}