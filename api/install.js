// Installs or upgrades a tenant: runs every db/migrations file not yet in
// public.schema_migrations, then redeploys the Edge Functions.
// The baseline on a fresh project can exceed Vercel's default ~10s budget.
import { listMigrations, LEDGER_SQL, appliedSql, recordSql, stampSql } from './_migrations.js';
import { deployClipFunctions } from './_clipFunctions.js';
import { APP_SCHEMA_VERSION } from '../src/utils/schemaVersion.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  // 1. Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 2. The token comes from the HttpOnly `tinypos_mgmt_token` cookie set by
  //    /api/auth/callback (kept out of the URL and out of JS). We still accept
  //    it in the body as a fallback for any transitional caller.
  const { projectRef } = req.body;
  const cookie = req.headers.cookie || '';
  const cookieMatch = cookie.match(/(?:^|;\s*)tinypos_mgmt_token=([^;]+)/);
  const accessToken = cookieMatch ? decodeURIComponent(cookieMatch[1]) : req.body.accessToken;

  if (!accessToken || !projectRef) {
    return res.status(400).json({ error: 'Missing accessToken or projectRef. Please provide both.' });
  }

  const runSql = async (query) => {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(data.message || 'Failed to execute query on Supabase.');
      err.status = response.status;
      throw err;
    }
    return data;
  };

  try {
    // One request per migration keeps each under the function time limit.
    let applied;
    try {
      await runSql(LEDGER_SQL);
      applied = new Set((await runSql(appliedSql)).map((r) => r.id));
    } catch (e) {
      console.error('Supabase API Error:', e);
      return res.status(e.status || 500).json({ success: false, error: e.message });
    }
    const ran = [];
    for (const m of listMigrations()) {
      if (applied.has(m.id)) continue;
      try {
        await runSql(m.sql + '\n' + recordSql(m.id));
      } catch (e) {
        console.error(`Migration ${m.id} failed:`, e);
        return res.status(e.status || 500).json({ success: false, error: `${m.id}: ${e.message}`, ran });
      }
      ran.push(m.id);
    }
    await runSql(stampSql(APP_SCHEMA_VERSION));

    // 6. Close the front door: Supabase leaves "Allow new users to sign up"
    //    ON by default, so without this any stranger can create an account on
    //    the project. Non-fatal -- a working install must not fail because
    //    this call did, so the outcome rides back in the response instead.
    let signupsDisabled = false;  // also turns on leaked-password checking
    try {
      const authRes = await fetch(
        `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          // password_hibp_enabled: Supabase checks new passwords against the
          // Have I Been Pwned breach corpus (k-anonymity: only a hash prefix
          // leaves the server). Free, and the advisor flags its absence.
          body: JSON.stringify({ disable_signup: true, password_hibp_enabled: true }),
        }
      );
      signupsDisabled = authRes.ok;
      if (!authRes.ok) console.error('Could not disable public sign-ups:', await authRes.text());
    } catch (e) {
      console.error('Could not disable public sign-ups:', e);
    }

    // 6b. Clip checkout Edge Functions into the tenant project. Non-fatal, same
    //     reasoning as above: online card payments stay off until redeployed.
    const clipFailed = await deployClipFunctions(projectRef, accessToken).catch(() => ['all']);

    // 7. Success!
    return res.status(200).json({
      success: true,
      message: 'Database installed successfully!',
      ran,
      signupsDisabled,
    });

  } catch (error) {
    console.error("Installation network/server failed:", error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}
