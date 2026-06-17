import crypto from 'crypto';

// Creates a new Supabase project on the user's behalf via the Management API, so
// the owner only has to create an org + authorize tinypos (no manual project
// wizard). The DB password is generated here (strong random) and returned to the
// client ONCE so the owner can save it — we never persist it server-side.
//
// Region is restricted to the two we offer (validated below). Project creation
// is async on Supabase's side: this returns immediately with the new project's
// ref in a COMING_UP state; the client polls get-project-status until healthy.

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send('Missing Authorization header');
  }

  const { organizationId, name, region } = req.body || {};
  if (!organizationId) return res.status(400).json({ error: 'Missing organizationId' });
  if (!region || !ALLOWED_REGIONS.has(region)) {
    return res.status(400).json({ error: 'Invalid region' });
  }

  const dbPass = generateDbPassword();

  try {
    const response = await fetch('https://api.supabase.com/v1/projects', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: (name || 'tinypos').slice(0, 40),
        organization_id: organizationId,
        region,
        db_pass: dbPass,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      // Surface Supabase's real error (e.g. free-tier project limit reached) so
      // the client can show actionable guidance.
      return res.status(response.status).json(data);
    }

    // Return the created project plus the generated password (shown once).
    return res.status(200).json({ project: data, dbPass });
  } catch (error) {
    console.error('Error creating project:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
