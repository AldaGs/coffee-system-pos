// Start the Supabase Management OAuth flow.
//
// WHY THIS EXISTS
// The three flows that need a Management token (first install, device
// pairing, schema update) used to jump straight to Supabase's authorize URL
// from the browser, with a fixed `state` ("install" / "devices" / "schema")
// and no PKCE. Two problems:
//
//   * A fixed, guessable state is no state at all. Anyone could send the
//     owner a link to /api/auth/callback?code=<their own code>, and the
//     callback would happily exchange it and drop the resulting token in the
//     owner's browser -- login forgery: the owner then "sets up" against the
//     attacker's Supabase project, and every sale, customer and fiscal record
//     lands in a database the attacker controls.
//   * Without PKCE, an authorization code intercepted in transit (a shared
//     machine's history, a logged Referer, a malicious extension) can be
//     redeemed by whoever holds it.
//
// So the flow starts here instead: the server mints a random state and a PKCE
// verifier, keeps both in short-lived HttpOnly cookies the browser cannot
// read, and sends only the state and the SHA-256 challenge to Supabase. The
// callback then proves the code came back from the request this server
// started.
//
// Scopes live here too, keyed by flow, rather than in three client files --
// a page can no longer ask for more than its flow needs.

import crypto from 'crypto';

const FLOWS = {
  // First install: create/inspect the project, read its keys, install schema.
  install: 'api_gateway_keys_read api_keys_read database_read database_write',
  // Device pairing only needs to read the anon key.
  devices: 'api_keys_read',
  // "Update Schema" only touches the database.
  schema: 'database_read database_write',
};

const base64url = (buf) => buf.toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export default function handler(req, res) {
  const flow = typeof req.query.flow === 'string' ? req.query.flow : '';
  const scope = FLOWS[flow];
  if (!scope) return res.status(400).send('Unknown OAuth flow.');

  const clientId = process.env.VITE_SUPABASE_MANAGEMENT_CLIENT_ID;
  if (!clientId) return res.status(500).send('OAuth client is not configured.');

  const isLocalhost = (req.headers.host || '').includes('localhost');
  const protocol = isLocalhost ? 'http' : 'https';
  const redirectUri = `${protocol}://${req.headers.host}/api/auth/callback`;

  // 32 random bytes each: the state ties the callback to this request, the
  // verifier ties the code exchange to it.
  const state = base64url(crypto.randomBytes(32));
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());

  // Both cookies are HttpOnly (JS never sees them), SameSite=Lax so they
  // survive the redirect back from Supabase, and expire in 10 minutes -- long
  // enough to click "Authorize", short enough not to linger.
  const attrs = ['HttpOnly', 'Path=/', 'SameSite=Lax', 'Max-Age=600'];
  if (!isLocalhost) attrs.push('Secure');
  res.setHeader('Set-Cookie', [
    [`tinypos_oauth_state=${state}`, ...attrs].join('; '),
    [`tinypos_oauth_verifier=${verifier}`, ...attrs].join('; '),
    [`tinypos_oauth_flow=${flow}`, ...attrs].join('; '),
  ]);

  const url = new URL('https://api.supabase.com/v1/oauth/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scope);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return res.redirect(302, url.toString());
}
