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
};

export default async function handler(req, res) {
  const op = OPS[req.query.op];
  if (!op) return res.status(400).json({ error: 'Unknown or missing op' });
  if (req.method !== op.method) return res.status(405).send('Method Not Allowed');

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).send('Missing Authorization header');

  try {
    return await op.handle(req, res, authHeader);
  } catch (error) {
    console.error(`Supabase proxy error (op=${req.query.op}):`, error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
