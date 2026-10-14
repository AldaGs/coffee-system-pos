// New-online-order alerts, as a Supabase Edge Function ("order-alert") that
// runs inside EACH tenant's own project, deployed alongside the Clip functions.
// Free and non-expiring by design: the shop's own Telegram bot token, and Web
// Push signed with VAPID keys the shop generated itself (no FCM/OneSignal
// account). Nothing here depends on the app being open on any device.
//
// Callers (verify_jwt=false):
//   - the AFTER INSERT trigger on online_orders, via pg_net: { order_id, secret }
//     (and its paid-with-Clip trigger: { paid_order_id, secret })
//     (secret = order_alerts.hook_secret, so outsiders can't trigger alerts);
//   - staff from Admin, with their session JWT: { action: 'telegram_detect' | 'test' }.
//
// Same rule as _clipFunctions.js: the factory must not reference anything
// outside itself, since it is stringified into the deployed Deno source.

export function makeOrderAlert(env, fetch) {
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
  const rows = async (path) => (await (await rest(path)).json().catch(() => [])) || [];

  // ---- base64url / bytes ----
  const enc = new TextEncoder();
  const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
  const cat = (...parts) => {
    const outBuf = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) { outBuf.set(p, o); o += p.length; }
    return outBuf;
  };
  const subtle = crypto.subtle;
  const hkdf = async (salt, ikm, info, len) => new Uint8Array(await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), len * 8));

  // ---- Web Push (RFC 8292 VAPID + RFC 8291 aes128gcm) ----
  const vapidAuth = async (endpoint, pub, priv) => {
    const p = unb64u(pub);
    const signKey = await subtle.importKey('jwk',
      { kty: 'EC', crv: 'P-256', d: priv, x: b64u(p.slice(1, 33)), y: b64u(p.slice(33, 65)), ext: true },
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
    const body = b64u(enc.encode(JSON.stringify({
      aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 3600, // Apple rejects long-lived tokens sub: 'mailto:alerts@tinypos.app',
    })));
    const sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signKey, enc.encode(`${head}.${body}`));
    return `vapid t=${head}.${body}.${b64u(sig)}, k=${pub}`;
  };
  const encryptPush = async (sub, payload) => {
    const uaPub = unb64u(sub.p256dh);
    const authSecret = unb64u(sub.auth);
    const eph = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const asPub = new Uint8Array(await subtle.exportKey('raw', eph.publicKey));
    const uaKey = await subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const shared = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: uaKey }, eph.privateKey, 256));
    const ikm = await hkdf(authSecret, shared, cat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
    const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
    const aes = await subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
    const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, cat(enc.encode(payload), new Uint8Array([2]))));
    return cat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([asPub.length]), asPub, ct); // rs = 4096
  };
  const sendPush = async (cfg, sub, payload) => {
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidAuth(sub.endpoint, cfg.vapid_public, cfg.vapid_private),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '3600',
        // High urgency = delivered right away even in Android Doze; without it
        // pushes can wait until the phone wakes for something else.
        Urgency: 'high',
      },
      body: await encryptPush(sub, payload),
    }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
    // Gone/expired subscription: forget it so the next order doesn't retry it.
    if (res.status === 404 || res.status === 410) {
      await rest(`order_alert_devices?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, { method: 'DELETE' });
    }
    // Failure reason (e.g. Apple's 403 BadJwtToken) so the Admin test can show it.
    return res.ok ? true : `${new URL(sub.endpoint).host} ${res.status} ${(await res.text().catch(() => '')).slice(0, 120)}`;
  };

  // ---- Telegram ----
  const tg = (token, method, body) => fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
  }).then((r) => r.json()).catch(() => null);

  const money = (c) => '$' + (Number(c || 0) / 100).toFixed(2);
  const TYPE = { pickup: 'Recoger', delivery: 'Domicilio', shipping: 'Envío' };
  const describe = (o) => {
    const items = (o.items || []).slice(0, 8).map((i) => `${i.qty || 1}× ${i.name}`).join(', ');
    return {
      title: `🛍️ Nuevo pedido en línea${o.order_num ? ' #' + o.order_num : ''}${o.status === 'accepted' ? ' · aceptado automáticamente, esperando pago Clip' : ''}`,
      body: [`${o.customer_name} · ${TYPE[o.order_type] || o.order_type || ''}`, `Total ${money(o.total_cents)}`, items].filter(Boolean).join('\n'),
    };
  };

  // kind: new_order | clip_paid | cfdi_request; a destination's null event list = all
  // (schema 4.8). No kind (the Admin test) reaches every destination.
  const wants = (events, kind) => !kind || !Array.isArray(events) || events.includes(kind);
  const fanOut = async (cfg, msg, kind) => {
    let telegram = 0, push = 0, errors = [];
    if (cfg.telegram_token && wants(cfg.telegram_events, kind)) {
      for (const chat of cfg.telegram_chat_ids || []) {
        const r = await tg(cfg.telegram_token, 'sendMessage', { chat_id: chat, text: `${msg.title}\n${msg.body}` });
        if (r?.ok) telegram++;
      }
    }
    if (cfg.vapid_public && cfg.vapid_private) {
      const subs = (await rows('order_alert_devices?select=endpoint,p256dh,auth,events')).filter((d) => wants(d.events, kind));
      const payload = JSON.stringify({ title: msg.title, body: msg.body, url: '/' });
      const sent = await Promise.all(subs.map((s) => sendPush(cfg, s, payload)));
      push = sent.filter((s) => s === true).length;
      errors = sent.filter((s) => s !== true);
    }
    return { telegram, push, errors };
  };

  return async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return out({ error: 'method' }, 405);
    try {
      const body = await req.json().catch(() => ({}));
      const cfg = (await rows('order_alerts?id=eq.1&select=*'))[0];
      if (!cfg) return out({ error: 'not_configured' }, 404);

      // 1) The DB trigger: a new order.
      if (body.order_id != null) {
        if (typeof body.secret !== 'string' || body.secret !== cfg.hook_secret) return out({ error: 'forbidden' }, 403);
        if (!cfg.enabled || !/^[0-9]{1,20}$/.test(String(body.order_id))) return out({ ok: true, skipped: true });
        const order = (await rows(`online_orders?id=eq.${body.order_id}&select=order_num,customer_name,total_cents,order_type,items,status`))[0];
        if (!order) return out({ error: 'not_found' }, 404);
        return out({ ok: true, ...(await fanOut(cfg, describe(order), 'new_order')) });
      }

      // 1a) The DB trigger: an online order was paid with Clip (auto or manually accepted).
      if (body.paid_order_id != null) {
        if (typeof body.secret !== 'string' || body.secret !== cfg.hook_secret) return out({ error: 'forbidden' }, 403);
        if (!cfg.enabled || !/^[0-9]{1,20}$/.test(String(body.paid_order_id))) return out({ ok: true, skipped: true });
        const o = (await rows(`online_orders?id=eq.${body.paid_order_id}&select=order_num,customer_name,total_cents,order_type`))[0];
        if (!o) return out({ error: 'not_found' }, 404);
        return out({ ok: true, ...(await fanOut(cfg, {
          title: `💳 Pagado con Clip${o.order_num ? ' #' + o.order_num : ''}`,
          body: [`${o.customer_name} · ${TYPE[o.order_type] || o.order_type || ''}`, `Total ${money(o.total_cents)}`].join('\n'),
        }, 'clip_paid')) });
      }

      // 1b) The DB trigger: a customer requested a factura (CFDI) for a sale.
      if (body.cfdi_sale_id != null) {
        if (typeof body.secret !== 'string' || body.secret !== cfg.hook_secret) return out({ error: 'forbidden' }, 403);
        if (!cfg.enabled || !/^[0-9]{1,20}$/.test(String(body.cfdi_sale_id))) return out({ ok: true, skipped: true });
        const sale = (await rows(`sales?id=eq.${body.cfdi_sale_id}&select=order_name,fiscal_profiles(rfc,razon_social)`))[0];
        if (!sale) return out({ error: 'not_found' }, 404);
        const fp = sale.fiscal_profiles || {};
        return out({ ok: true, ...(await fanOut(cfg, {
          title: '🧾 Nueva solicitud de factura',
          body: [sale.order_name || `Venta #${body.cfdi_sale_id}`, [fp.rfc, fp.razon_social].filter(Boolean).join(' · ')].filter(Boolean).join('\n'),
        }, 'cfdi_request')) });
      }

      // 2) Staff actions from Admin.
      const user = await (await fetch(`${base}/auth/v1/user`, { headers: { apikey: key, Authorization: req.headers.get('Authorization') || '' } })).json().catch(() => null);
      if (!user?.id) return out({ error: 'unauthorized' }, 401);
      const staff = (await rows(`app_users?auth_user_id=eq.${user.id}&disabled_at=is.null&select=auth_user_id`))[0];
      if (!staff) return out({ error: 'forbidden' }, 403);

      if (body.action === 'telegram_detect') {
        if (!cfg.telegram_token) return out({ error: 'no_token' }, 400);
        const me = await tg(cfg.telegram_token, 'getMe');
        if (!me?.ok) return out({ error: 'bad_token' }, 400);
        const upd = await tg(cfg.telegram_token, 'getUpdates', { allowed_updates: ['message', 'my_chat_member'] });
        const found = new Set();
        for (const u of upd?.result || []) {
          const chat = u.message?.chat || u.my_chat_member?.chat;
          if (chat?.id != null) found.add(String(chat.id));
        }
        const chats = [...new Set([...(cfg.telegram_chat_ids || []), ...found])];
        const added = chats.filter((c) => !(cfg.telegram_chat_ids || []).includes(c));
        await rest('order_alerts?id=eq.1', { method: 'PATCH', body: JSON.stringify({ telegram_chat_ids: chats }) });
        for (const c of added) await tg(cfg.telegram_token, 'sendMessage', { chat_id: c, text: '✅ TinyPOS: aquí llegarán los avisos de pedidos en línea.' });
        return out({ ok: true, bot: me.result?.username || null, chats: chats.length, added: added.length });
      }
      if (body.action === 'test') {
        return out({ ok: true, ...(await fanOut(cfg, { title: '🔔 Prueba de TinyPOS', body: 'Así se verán los avisos de pedidos en línea.' })) });
      }
      return out({ error: 'bad_action' }, 400);
    } catch {
      return out({ error: 'internal' }, 500);
    }
  };
}
