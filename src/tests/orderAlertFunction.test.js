import { describe, expect, it } from 'vitest';
import { makeOrderAlert } from '../../api/_orderAlertFunction';
import { CLIP_FUNCTIONS } from '../../api/_clipFunctions';

const subtle = globalThis.crypto.subtle;
const env = (k) => ({ SUPABASE_URL: 'https://t.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' })[k];
const json = (b, status = 200) => ({ ok: status < 300, status, json: async () => b });
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64u = (s) => new Uint8Array(Buffer.from(s, 'base64url'));

function fakeFetch(routes) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, init });
    for (const [match, res] of routes) if (url.includes(match)) return res(init, url);
    throw new Error('unrouted ' + url);
  };
  return { f, calls };
}
const post = (body, auth) => ({ method: 'POST', json: async () => body, headers: { get: () => auth || '' } });

async function vapidKeys() {
  const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return { pub: b64u(await subtle.exportKey('raw', kp.publicKey)), priv: (await subtle.exportKey('jwk', kp.privateKey)).d };
}

// A browser's push subscription: its ECDH key pair + auth secret.
async function browserSub(endpoint) {
  const kp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const auth = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return { kp, row: { endpoint, p256dh: b64u(await subtle.exportKey('raw', kp.publicKey)), auth: b64u(auth) } };
}

const hkdf = async (salt, ikm, info, len) => new Uint8Array(await subtle.deriveBits(
  { name: 'HKDF', hash: 'SHA-256', salt, info }, await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), len * 8));

// RFC 8291 receiver side, independent of the sender code.
async function decrypt(body, sub) {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPub = body.slice(21, 21 + idlen);
  const ct = body.slice(21 + idlen);
  const asKey = await subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: asKey }, sub.kp.privateKey, 256));
  const uaPub = unb64u(sub.row.p256dh);
  const te = new TextEncoder();
  const ikm = await hkdf(unb64u(sub.row.auth), shared, new Uint8Array([...te.encode('WebPush: info\0'), ...uaPub, ...asPub]), 32);
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const pt = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce },
    await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), ct));
  expect(pt.at(-1)).toBe(2); // last-record delimiter
  return new TextDecoder().decode(pt.slice(0, -1));
}

const ORDER = { order_num: 12, customer_name: 'Ana', total_cents: 12550, order_type: 'pickup', items: [{ qty: 2, name: 'Latte' }] };

describe('order-alert', () => {
  it('rejects a trigger call with the wrong secret', async () => {
    const { f, calls } = fakeFetch([['order_alerts', () => json([{ enabled: true, hook_secret: 's3cret' }])]]);
    const res = await makeOrderAlert(env, f)(post({ order_id: 1, secret: 'nope' }));
    expect(res.status).toBe(403);
    expect(calls.some((c) => c.url.includes('telegram'))).toBe(false);
  });

  it('sends Telegram + an encrypted, VAPID-signed push for a new order', async () => {
    const keys = await vapidKeys();
    const sub = await browserSub('https://fcm.googleapis.com/fcm/send/abc');
    const cfg = { enabled: true, hook_secret: 's3cret', telegram_token: 'T', telegram_chat_ids: ['42'], vapid_public: keys.pub, vapid_private: keys.priv };
    const { f, calls } = fakeFetch([
      ['order_alerts', () => json([cfg])],
      ['online_orders?id=eq.9', () => json([ORDER])],
      ['order_alert_devices', () => json([sub.row])],
      ['api.telegram.org/botT/sendMessage', () => json({ ok: true })],
      ['fcm.googleapis.com', () => json({}, 201)],
    ]);
    const res = await makeOrderAlert(env, f)(post({ order_id: 9, secret: 's3cret' }));
    expect(await res.json()).toEqual({ ok: true, telegram: 1, push: 1 });

    const tgCall = calls.find((c) => c.url.includes('sendMessage'));
    const tgBody = JSON.parse(tgCall.init.body);
    expect(tgBody.chat_id).toBe('42');
    expect(tgBody.text).toContain('#12');
    expect(tgBody.text).toContain('$125.50');
    expect(tgBody.text).toContain('2× Latte');

    const push = calls.find((c) => c.url.includes('fcm'));
    expect(push.init.headers.Urgency).toBe('high');
    const msg = JSON.parse(await decrypt(push.init.body, sub));
    expect(msg.title).toContain('#12');

    // VAPID JWT verifies against the shop's public key, audience = push service origin.
    const [, t, k] = push.init.headers.Authorization.match(/^vapid t=([^,]+), k=(.+)$/);
    expect(k).toBe(keys.pub);
    const [h, p, s] = t.split('.');
    const pubKey = await subtle.importKey('raw', unb64u(keys.pub), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    expect(await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pubKey, unb64u(s), new TextEncoder().encode(`${h}.${p}`))).toBe(true);
    expect(JSON.parse(Buffer.from(p, 'base64url')).aud).toBe('https://fcm.googleapis.com');
  });

  it('drops a subscription the push service says is gone', async () => {
    const keys = await vapidKeys();
    const sub = await browserSub('https://push.example/x');
    const cfg = { enabled: true, hook_secret: 's', telegram_chat_ids: [], vapid_public: keys.pub, vapid_private: keys.priv };
    const { f, calls } = fakeFetch([
      ['order_alerts', () => json([cfg])],
      ['online_orders?id=eq.1', () => json([ORDER])],
      ['order_alert_devices', (init) => json(init.method === 'DELETE' ? null : [sub.row])],
      ['push.example', () => json({}, 410)],
    ]);
    await makeOrderAlert(env, f)(post({ order_id: 1, secret: 's' }));
    expect(calls.some((c) => c.init.method === 'DELETE' && c.url.includes(encodeURIComponent('https://push.example/x')))).toBe(true);
  });

  it('staff can link Telegram chats that messaged the bot', async () => {
    const cfg = { enabled: true, telegram_token: 'T', telegram_chat_ids: ['1'] };
    const { f, calls } = fakeFetch([
      ['order_alerts?id=eq.1&select', () => json([cfg])],
      ['auth/v1/user', () => json({ id: 'u1' })],
      ['app_users', () => json([{ auth_user_id: 'u1' }])],
      ['getMe', () => json({ ok: true, result: { username: 'cafe_bot' } })],
      ['getUpdates', () => json({ ok: true, result: [{ message: { chat: { id: 1 } } }, { message: { chat: { id: 77 } } }] })],
      ['order_alerts?id=eq.1', () => json(null)],
      ['sendMessage', () => json({ ok: true })],
    ]);
    const res = await makeOrderAlert(env, f)(post({ action: 'telegram_detect' }, 'Bearer jwt'));
    expect(await res.json()).toEqual({ ok: true, bot: 'cafe_bot', chats: 2, added: 1 });
    const patch = calls.find((c) => c.init.method === 'PATCH');
    expect(JSON.parse(patch.init.body)).toEqual({ telegram_chat_ids: ['1', '77'] });
  });

  it('is deployed with the Clip functions', () => {
    expect(CLIP_FUNCTIONS['order-alert'].startsWith('Deno.serve((')).toBe(true);
  });
});
