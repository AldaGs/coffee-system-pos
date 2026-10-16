// Emails the customer their CFDI when a sale is marked issued, as a Supabase
// Edge Function ("cfdi-email") deployed into EACH tenant's project alongside
// the Clip/alert functions. Each tenant brings its own email provider account
// (cfdi_email_settings: provider + api key + from address, service-role only).
//
// Callers (verify_jwt=false):
//   - the AFTER UPDATE trigger on sales (status -> issued), via pg_net: { sale_id, secret };
//   - staff from Admin, with their session JWT: { action: 'resend', sale_id } | { action: 'test', to }.
//
// Same rule as _clipFunctions.js: the factory must not reference anything
// outside itself, since it is stringified into the deployed Deno source.

export function makeCfdiEmail(env, fetch) {
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
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const b64 = (buf) => {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };

  // One adapter per provider: msg = { to, from, replyTo, subject, html, attachments: [{ filename, content (base64) }] }.
  // Add a provider = add an entry here + an option in the Admin card.
  const SENDERS = {
    resend: (cfg, m) => fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.api_key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: m.from, to: [m.to], subject: m.subject, html: m.html,
        ...(m.replyTo ? { reply_to: m.replyTo } : {}),
        ...(m.attachments.length ? { attachments: m.attachments } : {}),
      }),
    }),
  };
  const send = async (cfg, m) => {
    const sender = SENDERS[cfg.provider];
    if (!sender) return `unknown provider ${cfg.provider}`;
    const res = await sender(cfg, m).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
    return res.ok ? true : `${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`;
  };

  const linkFor = (cfg, sale) => (cfg.link_template || '').replace('{id}', encodeURIComponent(String(sale.local_id || sale.id)));

  // The owner's text (cfdi_email_settings.email_message/email_footer) with
  // placeholders; the folio, button and ZIP note always stay around it.
  const DEFAULT_MESSAGE = 'Hola {cliente}, {negocio} emitió la factura de tu compra {ticket}.';
  const DEFAULT_FOOTER = 'También puedes descargarla en el portal del SAT con tu folio fiscal.';
  const fill = (text, vars) => esc(text)
    .replace(/\{(cliente|negocio|folio|rfc|ticket)\}/g, (_, k) => esc(vars[k] ?? ''))
    .replace(/\r?\n/g, '<br>');
  const renderHtml = (cfg, vars, link, hasZip) => `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;color:#2c3e50">
<h2 style="margin:0 0 12px">Tu factura está lista</h2>
<p>${fill(cfg.email_message || DEFAULT_MESSAGE, vars)}</p>
<p>Folio fiscal: <strong>${esc(vars.folio)}</strong><br>RFC: ${esc(vars.rfc)}</p>
${hasZip ? '<p>Adjuntamos el XML y PDF en un archivo ZIP.</p>' : ''}
${link ? `<p><a href="${esc(link)}" style="display:inline-block;padding:12px 20px;background:#2980b9;color:#fff;border-radius:10px;text-decoration:none;font-weight:bold">Ver mi factura</a></p>` : ''}
<p style="color:#7f8c8d;font-size:13px">${fill(cfg.email_footer || DEFAULT_FOOTER, vars)}</p></div>`;

  const buildMsg = async (cfg, sale) => {
    const attachments = [];
    if (sale.cfdi_zip_path) {
      const zip = await fetch(`${base}/storage/v1/object/public/cfdi/${encodeURIComponent(sale.cfdi_zip_path)}`).catch(() => null);
      if (zip?.ok) attachments.push({ filename: `factura-${sale.cfdi_folio || sale.id}.zip`, content: b64(await zip.arrayBuffer()) });
    }
    const biz = cfg.business_name || 'Tu factura';
    const vars = {
      cliente: sale.fiscal_profiles.razon_social, negocio: cfg.business_name || '',
      folio: sale.cfdi_folio, rfc: sale.fiscal_profiles.rfc, ticket: sale.order_name || '',
    };
    return {
      to: sale.fiscal_profiles.email,
      from: cfg.from_address,
      replyTo: cfg.reply_to,
      subject: `${biz}: tu factura ${sale.cfdi_folio || ''}`.trim(),
      attachments,
      html: renderHtml(cfg, vars, linkFor(cfg, sale), attachments.length > 0),
    };
  };

  const emailSale = async (cfg, saleId) => {
    const sale = (await rows(`sales?id=eq.${saleId}&select=id,local_id,order_name,cfdi_status,cfdi_folio,cfdi_zip_path,fiscal_profiles(email,rfc,razon_social)`))[0];
    if (!sale) return { status: 404, body: { error: 'not_found' } };
    if (sale.cfdi_status !== 'issued') return { status: 409, body: { error: 'not_issued' } };
    if (!sale.fiscal_profiles?.email) return { status: 409, body: { error: 'no_email' } };
    const r = await send(cfg, await buildMsg(cfg, sale));
    await rest(`sales?id=eq.${sale.id}`, {
      method: 'PATCH',
      body: JSON.stringify(r === true ? { cfdi_emailed_at: new Date().toISOString(), cfdi_email_error: null } : { cfdi_email_error: r }),
    });
    return r === true ? { status: 200, body: { ok: true } } : { status: 502, body: { error: 'send_failed', detail: r } };
  };

  return async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return out({ error: 'method' }, 405);
    try {
      const body = await req.json().catch(() => ({}));
      const cfg = (await rows('cfdi_email_settings?id=eq.1&select=*'))[0];
      if (!cfg) return out({ error: 'not_configured' }, 404);
      const ready = cfg.enabled && cfg.api_key && cfg.from_address;

      // 1) The DB trigger: a sale was just marked issued.
      if (body.action == null) {
        if (typeof body.secret !== 'string' || body.secret !== cfg.hook_secret) return out({ error: 'forbidden' }, 403);
        if (!ready || !/^[0-9]{1,20}$/.test(String(body.sale_id))) return out({ ok: true, skipped: true });
        const r = await emailSale(cfg, body.sale_id);
        return out(r.body, r.status);
      }

      // 2) Staff actions from Admin.
      const user = await (await fetch(`${base}/auth/v1/user`, { headers: { apikey: key, Authorization: req.headers.get('Authorization') || '' } })).json().catch(() => null);
      if (!user?.id) return out({ error: 'unauthorized' }, 401);
      const staff = (await rows(`app_users?auth_user_id=eq.${user.id}&disabled_at=is.null&select=auth_user_id`))[0];
      if (!staff) return out({ error: 'forbidden' }, 403);
      // Unsaved text from the Admin panel, rendered with sample data.
      if (body.action === 'preview') {
        const draft = { ...cfg, email_message: String(body.message || '').slice(0, 2000), email_footer: String(body.footer || '').slice(0, 500) };
        const vars = { cliente: 'JUAN PÉREZ', negocio: cfg.business_name || 'Mi Café', folio: '47957DB2-F967-4636-938A-B7F8E08AA72D', rfc: 'XAXX010101000', ticket: 'Ticket #123' };
        return out({ html: renderHtml(draft, vars, linkFor(cfg, { id: 123 }) || '#', true) });
      }

      if (!cfg.api_key || !cfg.from_address) return out({ error: 'not_configured' }, 400);

      if (body.action === 'resend') {
        if (!/^[0-9]{1,20}$/.test(String(body.sale_id))) return out({ error: 'bad_sale' }, 400);
        const r = await emailSale(cfg, body.sale_id);
        return out(r.body, r.status);
      }
      if (body.action === 'test') {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.to || ''))) return out({ error: 'bad_email' }, 400);
        const r = await send(cfg, {
          to: body.to, from: cfg.from_address, replyTo: cfg.reply_to, attachments: [],
          subject: 'Prueba de correo de facturas · TinyPOS',
          html: '<p>Así llegarán los correos con la factura de tus clientes.</p>',
        });
        return r === true ? out({ ok: true }) : out({ error: 'send_failed', detail: r }, 502);
      }
      return out({ error: 'bad_action' }, 400);
    } catch {
      return out({ error: 'internal' }, 500);
    }
  };
}
