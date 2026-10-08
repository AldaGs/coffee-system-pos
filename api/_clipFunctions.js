// Clip (payclip.com) online card checkout, as Supabase Edge Functions that run
// inside EACH tenant's own project (so they hold that business's service role
// and Clip credentials; no Vercel function slots, no server-side tenant map).
//
// The handlers are plain factories so they can be unit-tested in Node
// (src/tests/clipFunctions.test.js); `edgeSource()` stringifies them into the
// self-contained Deno source that deployClipFunctions() uploads. A factory must
// therefore not reference anything outside itself.

// ponytail: every Clip field name below (endpoint paths, request body, response
// ids/urls/status, webhook payload id) is UNVERIFIED against developer.clip.mx
// (createnewpaymentlink). Fix them in the CLIP block of each factory only.

export function makeCheckout(env, fetch) {
  const CLIP = {
    create: 'https://api.payclip.com/v2/checkout',
    body: (o, ret, hook) => ({
      amount: o.total_cents / 100,
      currency: 'MXN',
      purchase_description: `Pedido #${o.order_num || o.id}`,
      payment_method: ['CARD'],
      redirection_url: { success: ret, error: ret, default: ret },
      metadata: { external_reference: String(o.id) },
      webhook_url: hook,
    }),
    paymentId: (r) => r.payment_request_id,
    payUrl: (r) => r.payment_request_url,
  };
  const base = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  };
  const out = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: cors });
  const rest = (path, init = {}) => fetch(`${base}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers },
  });

  return async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return out({ error: 'method' }, 405);
    try {
      const { token, return_url } = await req.json().catch(() => ({}));
      if (typeof token !== 'string' || !/^[a-f0-9]{32}$/.test(token)) return out({ error: 'bad_token' }, 400);
      if (typeof return_url !== 'string' || !/^https?:\/\//.test(return_url)) return out({ error: 'bad_return_url' }, 400);

      // The amount ALWAYS comes from the stored order, never from the client.
      const orders = await (await rest(`online_orders?token=eq.${token}&select=id,order_num,total_cents,status,payment_status,pay_by`)).json();
      const order = orders?.[0];
      if (!order) return out({ error: 'not_found' }, 404);
      if (order.payment_status === 'paid') return out({ error: 'already_paid' }, 409);
      // Pay-after-accept: no link until staff accepted (no refunds on rejection).
      if (!['accepted', 'preparing', 'ready', 'on_delivery'].includes(order.status) || !(order.total_cents > 0)) return out({ error: 'not_payable' }, 409);

      if (order.pay_by && Date.parse(order.pay_by) < Date.now()) return out({ error: 'expired' }, 409);
      const creds = (await (await rest('clip_credentials?id=eq.1&select=api_key,api_secret,enabled')).json())?.[0];
      if (!creds?.enabled || !creds.api_key || !creds.api_secret) return out({ error: 'clip_disabled' }, 403);

      const res = await fetch(CLIP.create, {
        method: 'POST',
        headers: { Authorization: 'Basic ' + btoa(`${creds.api_key}:${creds.api_secret}`), 'Content-Type': 'application/json' },
        body: JSON.stringify(CLIP.body(order, return_url, `${base}/functions/v1/clip-webhook`)),
      });
      const link = await res.json().catch(() => ({}));
      const id = CLIP.paymentId(link), url = CLIP.payUrl(link);
      if (!res.ok || !id || !url) return out({ error: 'clip_error' }, 502);

      await rest(`online_orders?id=eq.${order.id}`, { method: 'PATCH', body: JSON.stringify({ clip_payment_id: id, clip_link_url: url }) });
      return out({ url });
    } catch {
      return out({ error: 'internal' }, 500);
    }
  };
}

export function makeWebhook(env, fetch) {
  const CLIP = {
    status: 'https://api.payclip.com/v2/checkout/',
    webhookId: (b) => b?.payment_request_id ?? b?.id,
    isPaid: (r) => r?.status === 'CHECKOUT_COMPLETED', // verified 2026-10-08 against a real payment
  };
  const base = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const ok = () => new Response('ok', { status: 200 });
  const rest = (path, init = {}) => fetch(`${base}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers },
  });

  // Always 200 (Clip retries on errors). The body is only a pointer: the real
  // status is re-fetched from Clip with this business's credentials.
  return async (req) => {
    try {
      const id = CLIP.webhookId(await req.json().catch(() => ({})));
      if (typeof id !== 'string' || !id) return ok();
      const creds = (await (await rest('clip_credentials?id=eq.1&select=api_key,api_secret')).json())?.[0];
      if (!creds?.api_key || !creds.api_secret) return ok();
      const res = await fetch(CLIP.status + encodeURIComponent(id), {
        headers: { Authorization: 'Basic ' + btoa(`${creds.api_key}:${creds.api_secret}`) },
      });
      if (!res.ok || !CLIP.isPaid(await res.json().catch(() => null))) return ok();
      // Idempotent: only unpaid rows match (a late webhook must not un-refund an order).
      await rest(`online_orders?clip_payment_id=eq.${encodeURIComponent(id)}&payment_status=eq.unpaid`, {
        method: 'PATCH', body: JSON.stringify({ payment_status: 'paid' }),
      });
    } catch { /* swallow: always 200 */ }
    return ok();
  };
}

// Staff-only full refund of a ticket's Clip payment (docs: developer.clip.mx
// post_refunds / get_refunds-refund-id). The gateway can't tell staff from anon
// (both carry a JWT), so the caller's token is resolved here and checked
// against app_users. Clip's refund API is beta: amount must equal the original.
export function makeRefund(env, fetch) {
  const CLIP = {
    status: 'https://api.payclip.com/v2/checkout/',
    refund: 'https://api.payclip.com/refunds',
    // A checkout exposes both payment_id and receipt_no. The first live try with
    // type 'transaction' + payment_id got 404 "Not Found", so receipt_no is tried
    // when the transaction reference 404s.
    refs: (link) => [['transaction', link.payment_id], ['receipt', link.receipt_no]].filter(([, id]) => id),
    body: (link, reason, [type, id]) => ({ amount: link.amount, reason, reference: { type, id } }),
  };
  const base = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  };
  const out = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: cors });
  const rest = (path, init = {}) => fetch(`${base}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers },
  });

  return async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return out({ error: 'method' }, 405);
    try {
      const user = await (await fetch(`${base}/auth/v1/user`, { headers: { apikey: key, Authorization: req.headers.get('Authorization') || '' } })).json().catch(() => null);
      if (!user?.id) return out({ error: 'unauthorized' }, 401);
      const staff = (await (await rest(`app_users?auth_user_id=eq.${user.id}&disabled_at=is.null&select=auth_user_id`)).json())?.[0];
      if (!staff) return out({ error: 'forbidden' }, 403);

      const { ticket_id, reason } = await req.json().catch(() => ({}));
      if (!/^[0-9]{1,20}$/.test(String(ticket_id ?? ''))) return out({ error: 'bad_ticket' }, 400);
      const order = (await (await rest(`online_orders?active_ticket_id=eq.${ticket_id}&payment_status=eq.paid&select=id,clip_payment_id`)).json())?.[0];
      if (!order?.clip_payment_id) return out({ error: 'not_paid' }, 404);

      const creds = (await (await rest('clip_credentials?id=eq.1&select=api_key,api_secret')).json())?.[0];
      if (!creds?.api_key || !creds.api_secret) return out({ error: 'clip_disabled' }, 403);
      const auth = 'Basic ' + btoa(`${creds.api_key}:${creds.api_secret}`);

      const link = await (await fetch(CLIP.status + encodeURIComponent(order.clip_payment_id), { headers: { Authorization: auth } })).json().catch(() => null);
      const refs = CLIP.refs(link || {});
      if (!refs.length || !(link.amount > 0)) return out({ error: 'clip_lookup_failed' }, 502);

      let res, r;
      for (const ref of refs) {
        res = await fetch(CLIP.refund, {
          method: 'POST',
          // One-minute idempotency window: a double tap can't refund twice.
          headers: { Authorization: auth, 'Content-Type': 'application/json', 'idempotency-key': `refund-${order.id}-${ref[0]}` },
          body: JSON.stringify(CLIP.body(link, String(reason || 'Reembolso').slice(0, 120), ref)),
        });
        r = await res.json().catch(() => ({}));
        if (res.status !== 404) break;
      }
      if (!res.ok) return out({ error: 'clip_refused', status: res.status, code: r?.error_code || r?.code || null, message: r?.message || r?.detail || null }, 409);

      await rest(`online_orders?id=eq.${order.id}`, { method: 'PATCH', body: JSON.stringify({ payment_status: 'refunded' }) });
      return out({ ok: true, refund_id: r?.id ?? null, status: r?.status ?? null });
    } catch {
      return out({ error: 'internal' }, 500);
    }
  };
}

// verify_jwt=false on all: anon customers call checkout, Clip calls the webhook,
// and refund checks the staff session itself.
const edgeSource = (factory) =>
  `Deno.serve((${factory.toString()})((k) => Deno.env.get(k), fetch));\n`;

export const CLIP_FUNCTIONS = {
  'clip-checkout': edgeSource(makeCheckout),
  'clip-webhook': edgeSource(makeWebhook),
  'clip-refund': edgeSource(makeRefund),
};

// Management API multi-part deploy. Returns the slugs that failed (empty = ok).
// ponytail: endpoint/metadata shape from memory of the Management API
// (POST /v1/projects/{ref}/functions/deploy?slug=), unverified.
export async function deployClipFunctions(projectRef, accessToken) {
  const failed = [];
  for (const [slug, source] of Object.entries(CLIP_FUNCTIONS)) {
    const form = new FormData();
    form.append('metadata', JSON.stringify({ entrypoint_path: 'index.ts', name: slug, verify_jwt: false }));
    form.append('file', new Blob([source], { type: 'application/typescript' }), 'index.ts');
    const r = await fetch(
      `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/functions/deploy?slug=${slug}`,
      { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form }
    ).catch(() => null);
    if (!r?.ok) failed.push(slug);
  }
  return failed;
}
