import crypto from 'crypto';

function cookieValue(req, name) {
  const m = (req.headers.cookie || '').match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

// Equal-length constant-time compare. Length is not secret (both values are
// 32 random bytes, base64url), so an early length check is fine.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export default async function handler(req, res) {
  // 1. Supabase sends the user back here with a temporary "code" in the URL
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('No authorization code provided.');
  }

  // 1b. Prove this callback belongs to a flow THIS server started.
  //
  // Without it, anyone could hand the owner a link to this endpoint carrying
  // their own authorization code; the exchange would succeed and the owner's
  // browser would end up holding a Management token for the ATTACKER's
  // Supabase account -- so the owner would then install the POS into, and
  // send every sale and every customer's fiscal data to, a database the
  // attacker controls. The state cookie is HttpOnly and random per request
  // (see /api/auth/start), so an attacker cannot produce a matching pair.
  const expectedState = cookieValue(req, 'tinypos_oauth_state');
  const verifier = cookieValue(req, 'tinypos_oauth_verifier');
  const flow = cookieValue(req, 'tinypos_oauth_flow') || '1';
  const returnedState = typeof req.query.state === 'string' ? req.query.state : '';

  if (!expectedState || !safeEqual(expectedState, returnedState)) {
    console.error('OAuth state mismatch -- refusing to exchange the code.');
    return res.status(400).send(
      'Authorization could not be verified. Please start the connection again from the app.'
    );
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
      // code_verifier completes PKCE: the token endpoint only honours this
      // code for the party that sent its SHA-256 challenge at /api/auth/start.
      // An intercepted code is useless without the verifier, which never left
      // this server.
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        ...(verifier ? { code_verifier: verifier } : {}),
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

    // Burn the one-shot state/verifier/flow cookies: they have done their job,
    // and a replayed code must not find a matching pair waiting for it.
    const expire = ['Path=/', 'SameSite=Lax', 'HttpOnly', 'Max-Age=0'];
    if (!isLocalhost) expire.push('Secure');
    res.setHeader('Set-Cookie', [
      cookieParts.join('; '),
      ['tinypos_oauth_state=', ...expire].join('; '),
      ['tinypos_oauth_verifier=', ...expire].join('; '),
      ['tinypos_oauth_flow=', ...expire].join('; '),
    ]);

    // The marker only has to say "OAuth just finished" -- the SPA routes off
    // its own sessionStorage flags. It used to echo the state; now that state
    // is a random secret, echo the flow name from the cookie instead.
    res.redirect(302, `/?oauth=${encodeURIComponent(flow)}`);

  } catch (error) {
    console.error("Callback failed:", error);
    res.status(500).send("Internal Server Error during authentication.");
  }
}