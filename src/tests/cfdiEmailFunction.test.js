import { describe, expect, it } from 'vitest';
import { makeCfdiEmail } from '../../api/_cfdiEmailFunction';
import { CLIP_FUNCTIONS } from '../../api/_clipFunctions';

const env = (k) => ({ SUPABASE_URL: 'https://t.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' })[k];
const json = (b, status = 200) => ({ ok: status < 300, status, json: async () => b, text: async () => JSON.stringify(b) });
const post = (body, auth) => ({ method: 'POST', json: async () => body, headers: { get: () => auth || '' } });

function fakeFetch(routes) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, init });
    for (const [match, res] of routes) if (url.includes(match)) return res(init, url);
    throw new Error('unrouted ' + url);
  };
  return { f, calls };
}

const CFG = { enabled: true, provider: 'resend', api_key: 're_x', from_address: 'Café <f@cafe.mx>', hook_secret: 's3cret', link_template: 'https://cafe.mx/cfdi/{id}?p=ref', business_name: 'Café' };
const SALE = { id: 7, local_id: 'L7', cfdi_status: 'issued', cfdi_folio: 'UUID-1', cfdi_zip_path: 'a.zip', fiscal_profiles: { email: 'c@x.mx', rfc: 'XAXX010101000', razon_social: 'ANA' } };

describe('cfdi-email', () => {
  it('rejects a trigger call with the wrong secret', async () => {
    const { f } = fakeFetch([['cfdi_email_settings', () => json([CFG])]]);
    const res = await makeCfdiEmail(env, f)(post({ sale_id: 7, secret: 'nope' }));
    expect(res.status).toBe(403);
  });

  it('emails the issued sale with link + ZIP and records the send', async () => {
    const { f, calls } = fakeFetch([
      ['cfdi_email_settings', () => json([CFG])],
      ['/storage/v1/object/public/cfdi/a.zip', () => ({ ok: true, arrayBuffer: async () => new Uint8Array([80, 75]).buffer })],
      ['sales?id=eq.7&select', () => json([SALE])],
      ['api.resend.com', () => json({ id: 'e1' })],
      ['sales?id=eq.7', () => json([])],
    ]);
    const res = await makeCfdiEmail(env, f)(post({ sale_id: 7, secret: 's3cret' }));
    expect(res.status).toBe(200);
    const sent = JSON.parse(calls.find(c => c.url.includes('resend')).init.body);
    expect(sent.to).toEqual(['c@x.mx']);
    expect(sent.html).toContain('https://cafe.mx/cfdi/L7?p=ref');
    expect(sent.attachments[0]).toEqual({ filename: 'factura-UUID-1.zip', content: 'UEs=' });
    const patch = calls.find(c => c.init.method === 'PATCH');
    expect(JSON.parse(patch.init.body).cfdi_emailed_at).toBeTruthy();
  });

  it('records the provider error when the send fails', async () => {
    const { f, calls } = fakeFetch([
      ['cfdi_email_settings', () => json([CFG])],
      ['sales?id=eq.7&select', () => json([{ ...SALE, cfdi_zip_path: null }])],
      ['api.resend.com', () => json({ message: 'domain not verified' }, 403)],
      ['sales?id=eq.7', () => json([])],
    ]);
    const res = await makeCfdiEmail(env, f)(post({ sale_id: 7, secret: 's3cret' }));
    expect(res.status).toBe(502);
    expect(JSON.parse(calls.find(c => c.init.method === 'PATCH').init.body).cfdi_email_error).toContain('403');
  });

  it('is deployed with the other functions', () => {
    expect(CLIP_FUNCTIONS['cfdi-email'].startsWith('Deno.serve((')).toBe(true);
  });
});
