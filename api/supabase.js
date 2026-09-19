import crypto from 'crypto';

// Single entry point for every Supabase Management API call the setup flow makes.
// These were six separate files (get-orgs / get-projects / get-keys /
// get-project-status / create-project / run-sql); they were near-identical thin
// proxies that pass the user's OAuth bearer through from the server, bypassing
// browser CORS. Vercel's Hobby plan caps a deploy at 14 Serverless Functions, so
// they're merged here and dispatched on ?op= — same pattern as domains.js.
// vercel.json rewrites the old /api/<name> paths onto this one, so callers are
// unchanged.
//
// install.js deliberately stays separate: it needs maxDuration: 60, which would
// otherwise apply to all of these fast passthroughs too.

const ALLOWED_REGIONS = new Set(['us-east-1', 'us-west-1']);

// The Management token arrives as an HttpOnly cookie set by /api/auth/callback
// (so it never rides in the URL). Parse it out here; we still accept a bearer
// Authorization header as a fallback for any transitional caller.
function tokenFromRequest(req) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|;\s*)tinypos_mgmt_token=([^;]+)/);
  if (m) return decodeURIComponent(m[1]);
  const auth = req.headers.authorization || '';
  const bearer = auth.match(/^Bearer\s+(.+)$/i);
  return bearer ? bearer[1] : null;
}

// Expire the token cookie. Attributes (Path, SameSite, Secure) must match the
// ones used to set it or the browser won't overwrite it.
function clearTokenCookie(req, res) {
  const isLocalhost = (req.headers.host || '').includes('localhost');
  const parts = ['tinypos_mgmt_token=', 'HttpOnly', 'Path=/', 'SameSite=Lax', 'Max-Age=0'];
  if (!isLocalhost) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

// Strong random DB password: 24 url-safe chars, guaranteed to satisfy Supabase's
// complexity (mixed case + digits). No ambiguous/SQL-hostile characters.
function generateDbPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(24);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
  // Force at least one lower, upper, digit by overwriting the first three.
  return 'Aa1' + out.slice(3);
}

// Proxy a request to the Management API and relay the response verbatim.
// `transform` optionally reshapes a successful body before it goes back.
async function proxy(res, url, { method = 'GET', authHeader, body, transform } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return res.status(response.status).json(data);
  return res.status(200).json(transform ? transform(data) : data);
}

const OPS = {
  // GET /api/get-orgs
  orgs: {
    method: 'GET',
    handle: (req, res, authHeader) =>
      proxy(res, 'https://api.supabase.com/v1/organizations', { authHeader }),
  },

  // GET /api/get-projects
  projects: {
    method: 'GET',
    handle: (req, res, authHeader) =>
      proxy(res, 'https://api.supabase.com/v1/projects', { authHeader }),
  },

  // GET /api/get-keys?projectRef=…
  keys: {
    method: 'GET',
    handle: (req, res, authHeader) => {
      const { projectRef } = req.query;
      if (!projectRef) return res.status(400).json({ error: 'Missing projectRef' });
      return proxy(
        res,
        `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/api-keys`,
        { authHeader }
      );
    },
  },

  // GET /api/get-project-status?ref=… — polled on an interval after `create`
  // until status is ACTIVE_HEALTHY. Callers only need the status + ref.
  status: {
    method: 'GET',
    handle: (req, res, authHeader) => {
      const ref = req.query.ref;
      if (!ref) return res.status(400).json({ error: 'Missing ref' });
      return proxy(res, `https://api.supabase.com/v1/projects/${encodeURIComponent(ref)}`, {
        authHeader,
        transform: (data) => ({ id: data.id, ref: data.ref || ref, status: data.status }),
      });
    },
  },

  // POST /api/create-project — creates a project on the user's behalf so the
  // owner never touches the Supabase project wizard. The DB password is
  // generated here and returned to the client ONCE; we never persist it.
  // Creation is async on Supabase's side: this returns with the new ref in a
  // COMING_UP state and the client polls `status` until healthy.
  create: {
    method: 'POST',
    handle: (req, res, authHeader) => {
      const { organizationId, name, region } = req.body || {};
      if (!organizationId) return res.status(400).json({ error: 'Missing organizationId' });
      if (!region || !ALLOWED_REGIONS.has(region)) {
        return res.status(400).json({ error: 'Invalid region' });
      }

      const dbPass = generateDbPassword();
      return proxy(res, 'https://api.supabase.com/v1/projects', {
        method: 'POST',
        authHeader,
        body: {
          name: (name || 'tinypos').slice(0, 40),
          organization_id: organizationId,
          region,
          db_pass: dbPass,
        },
        // Errors (e.g. free-tier project limit reached) relay untouched so the
        // client can show actionable guidance.
        transform: (project) => ({ project, dbPass }),
      });
    },
  },

  // POST /api/run-sql?projectRef=…
  sql: {
    method: 'POST',
    handle: (req, res, authHeader) => {
      const { projectRef } = req.query;
      const { query } = req.body || {};
      if (!projectRef) return res.status(400).json({ error: 'Missing projectRef' });
      if (!query) return res.status(400).json({ error: 'Missing query' });
      return proxy(
        res,
        `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/database/query`,
        { method: 'POST', authHeader, body: { query } }
      );
    },
  },

  // POST /api/supabase?op=lockauth&projectRef=… — turn off public sign-ups
  // and turn on leaked-password checking.
  // Supabase leaves "Allow new users to sign up" ON by default, and the POS has
  // no use for it: accounts are created by the owner (setup) or by the device
  // pairing flow, both through the Management API. Left on, any stranger could
  // create an account on the project -- and until the allowlist landed in the
  // RLS policies (migration 042), that account could read and write every
  // table. Called right after the schema install, and non-fatal: a failure
  // here must not fail a working install, so the client reports it instead.
  lockauth: {
    method: 'POST',
    handle: (req, res, authHeader) => {
      const { projectRef } = req.query;
      if (!projectRef) return res.status(400).json({ error: 'Missing projectRef' });
      return proxy(
        res,
        `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/config/auth`,
        {
          method: 'PATCH',
          authHeader,
          // password_hibp_enabled rejects passwords found in the Have I Been
          // Pwned corpus (k-anonymity; only a hash prefix leaves the server).
          body: { disable_signup: true, password_hibp_enabled: true },
        }
      );
    },
  },

  // POST /api/supabase?op=clear — burn-after-reading: the client calls this
  // when a setup/device/schema flow finishes so the Management token cookie is
  // dropped immediately instead of lingering until Max-Age. Needs no token.
  clear: {
    method: 'POST',
    needsToken: false,
    handle: (req, res) => {
      clearTokenCookie(req, res);
      return res.status(200).json({ cleared: true });
    },
  },
};

export default async function handler(req, res) {
  const op = OPS[req.query.op];
  if (!op) return res.status(400).json({ error: 'Unknown or missing op' });
  if (req.method !== op.method) return res.status(405).send('Method Not Allowed');

  // Ops default to requiring a token; `clear` opts out.
  let authHeader;
  if (op.needsToken !== false) {
    const token = tokenFromRequest(req);
    if (!token) return res.status(401).send('Missing Management token');
    authHeader = `Bearer ${token}`;
  }

  try {
    return await op.handle(req, res, authHeader);
  } catch (error) {
    console.error(`Supabase proxy error (op=${req.query.op}):`, error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
