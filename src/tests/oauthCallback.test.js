import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import handler from '../../api/auth/callback.js';
import start from '../../api/auth/start.js';

// Minimal Express-ish res double: records what the handler did.
function makeRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    redirectedTo: null,
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
    setHeader(k, v) { this.headers[k] = v; },
    redirect(code, url) { this.statusCode = code; this.redirectedTo = url; return this; },
  };
}

const cookieHeader = (pairs) =>
  Object.entries(pairs).map(([k, v]) => `${k}=${v}`).join('; ');

describe('OAuth start', () => {
  beforeEach(() => { process.env.VITE_SUPABASE_MANAGEMENT_CLIENT_ID = 'test-client'; });

  it('refuses an unknown flow rather than defaulting to broad scopes', () => {
    const res = makeRes();
    start({ query: { flow: 'wat' }, headers: { host: 'shop.example' } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.redirectedTo).toBeNull();
  });

  it('sends a PKCE challenge and a state that matches the cookie it sets', () => {
    const res = makeRes();
    start({ query: { flow: 'devices' }, headers: { host: 'shop.example' } }, res);

    const url = new URL(res.redirectedTo);
    expect(url.origin + url.pathname).toBe('https://api.supabase.com/v1/oauth/authorize');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    // Devices pairing must not be able to ask for database write access.
    expect(url.searchParams.get('scope')).toBe('api_keys_read');

    const cookies = res.headers['Set-Cookie'];
    const state = cookies.find(c => c.startsWith('tinypos_oauth_state=')).split(';')[0].split('=')[1];
    const verifier = cookies.find(c => c.startsWith('tinypos_oauth_verifier=')).split(';')[0].split('=')[1];

    expect(url.searchParams.get('state')).toBe(state);
    // The challenge must be the SHA-256 of the verifier we kept, not the
    // verifier itself.
    const expected = crypto.createHash('sha256').update(verifier).digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(url.searchParams.get('code_challenge')).toBe(expected);
    expect(url.searchParams.get('code_challenge')).not.toBe(verifier);

    // Neither secret may be readable by page scripts.
    expect(cookies.every(c => c.includes('HttpOnly'))).toBe(true);
  });
});

describe('OAuth callback', () => {
  beforeEach(() => {
    process.env.VITE_SUPABASE_MANAGEMENT_CLIENT_ID = 'test-client';
    process.env.SUPABASE_MANAGEMENT_CLIENT_SECRET = 'test-secret';
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('rejects a code that arrives with no state cookie (forged callback link)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = makeRes();
    await handler({ query: { code: 'attacker-code', state: 'anything' }, headers: { host: 'shop.example' } }, res);

    expect(res.statusCode).toBe(400);
    // The whole point: no token exchange happened.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a state that does not match the cookie', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = makeRes();
    await handler({
      query: { code: 'attacker-code', state: 'wrong-state-value-of-same-ish-len' },
      headers: { host: 'shop.example', cookie: cookieHeader({
        tinypos_oauth_state: 'real-state-value-here', tinypos_oauth_verifier: 'v' }) },
    }, res);

    expect(res.statusCode).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('exchanges the code with the PKCE verifier when the state matches', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'sbp_token' }),
    });
    const res = makeRes();
    await handler({
      query: { code: 'good-code', state: 'matching-state' },
      headers: { host: 'shop.example', cookie: cookieHeader({
        tinypos_oauth_state: 'matching-state',
        tinypos_oauth_verifier: 'the-verifier',
        tinypos_oauth_flow: 'devices' }) },
    }, res);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = fetchSpy.mock.calls[0][1].body.toString();
    expect(body).toContain('code_verifier=the-verifier');

    // Token goes into an HttpOnly cookie, never the URL.
    const cookies = res.headers['Set-Cookie'];
    expect(cookies[0]).toContain('tinypos_mgmt_token=sbp_token');
    expect(cookies[0]).toContain('HttpOnly');
    expect(res.redirectedTo).toBe('/?oauth=devices');
    expect(res.redirectedTo).not.toContain('sbp_token');

    // One-shot cookies are burned so a replayed code finds no pair waiting.
    expect(cookies.some(c => c.startsWith('tinypos_oauth_state=') && c.includes('Max-Age=0'))).toBe(true);
    expect(cookies.some(c => c.startsWith('tinypos_oauth_verifier=') && c.includes('Max-Age=0'))).toBe(true);
  });
});
