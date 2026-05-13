// Vercel serverless proxy: creates a confirmed Supabase auth user using the
// project's service_role key. The frontend must never call this with the
// admin's logged-in session — that would call signUp() and log the admin out.
// Instead, we hit the admin REST endpoint here so the admin's session is
// untouched.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { supabaseUrl, serviceRoleKey, email, password } = req.body || {};

  if (!supabaseUrl || !serviceRoleKey || !email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: supabaseUrl, serviceRoleKey, email, password.'
    });
  }

  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({
      success: false,
      error: 'Password must be at least 6 characters.'
    });
  }

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message =
        data?.msg ||
        data?.error_description ||
        data?.message ||
        data?.error ||
        'Failed to create device user.';
      return res.status(response.status).json({ success: false, error: message });
    }

    return res.status(200).json({
      success: true,
      user: { id: data?.id, email: data?.email || email },
    });
  } catch (err) {
    console.error('add-device failed:', err);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}
