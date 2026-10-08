import { describe, expect, it } from 'vitest';
import { makeCheckout, makeWebhook, CLIP_FUNCTIONS } from '../../api/_clipFunctions';

const env = (k) => ({ SUPABASE_URL: 'https://t.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' })[k];
const json = (b, ok = true) => ({ ok, json: async () => b });
const TOKEN = 'a'.repeat(32);

// Fake fetch routed by URL; records every call.
function fakeFetch(routes) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, init });
    for (const [match, res] of routes) if (url.includes(match)) return res(init);
    throw new Error('unrouted ' + url);
  };
  return { f, calls };
}
const post = (body) => ({ method: 'POST', json: async () => body });

describe('clip-checkout', () => {
  const creds = [{ api_key: 'k', api_secret: 's', enabled: true }];
  const routes = (order, clip = json({ payment_request_id: 'pr1', payment_request_url: 'https://clip/pay' })) => [
    ['online_orders?token', () => json([order])],
    ['clip_credentials', () => json(creds)],
    ['api.payclip.com', () => clip],
    ['online_orders?id=eq', () => json([])],
  ];

  it('charges the stored total, ignores client amounts, and saves the link', async () => {
    const { f, calls } = fakeFetch(routes({ id: 7, total_cents: 12550, status: 'accepted', payment_status: 'unpaid' }));
    const res = await makeCheckout(env, f)(post({ token: TOKEN, return_url: 'https://x.mx/o', amount: 1 }));
    expect(await res.json()).toEqual({ url: 'https://clip/pay' });
    const clip = calls.find((c) => c.url.includes('payclip'));
    expect(JSON.parse(clip.init.body).amount).toBe(125.5);
    expect(clip.init.headers.Authorization).toBe('Basic ' + btoa('k:s'));
    expect(JSON.parse(clip.init.body).webhook_url).toBe('https://t.supabase.co/functions/v1/clip-webhook');
    expect(JSON.parse(calls.at(-1).init.body)).toEqual({ clip_payment_id: 'pr1', clip_link_url: 'https://clip/pay' });
  });

  it('refuses paid orders and bad input', async () => {
    const { f } = fakeFetch(routes({ id: 7, total_cents: 100, status: 'requested', payment_status: 'paid' }));
    expect((await makeCheckout(env, f)(post({ token: TOKEN, return_url: 'https://x.mx' }))).status).toBe(409);
    expect((await makeCheckout(env, f)(post({ token: 'nope', return_url: 'https://x.mx' }))).status).toBe(400);
  });
});

describe('clip-webhook', () => {
  const run = async (clipRes) => {
    const { f, calls } = fakeFetch([
      ['clip_credentials', () => json([{ api_key: 'k', api_secret: 's' }])],
      ['api.payclip.com/v2/checkout/pr1', () => clipRes],
      ['online_orders?clip_payment_id', () => json([])],
    ]);
    const res = await makeWebhook(env, f)(post({ payment_request_id: 'pr1', status: 'COMPLETED' }));
    return { res, patches: calls.filter((c) => c.init.method === 'PATCH') };
  };

  it('marks paid only when Clip itself says COMPLETED (never the body)', async () => {
    const paid = await run(json({ status: 'COMPLETED' }));
    expect(paid.res.status).toBe(200);
    expect(paid.patches).toHaveLength(1);
    expect(paid.patches[0].url).toContain('payment_status=neq.paid'); // idempotent
    expect((await run(json({ status: 'PENDING' }))).patches).toHaveLength(0);
    expect((await run(json({}, false))).patches).toHaveLength(0);
  });

  it('always answers 200, even on garbage', async () => {
    const { f } = fakeFetch([]);
    const res = await makeWebhook(env, f)({ json: async () => { throw new Error('x'); } });
    expect(res.status).toBe(200);
  });
});

it('edge sources are self-contained', () => {
  for (const src of Object.values(CLIP_FUNCTIONS)) expect(src.startsWith('Deno.serve((')).toBe(true);
});
