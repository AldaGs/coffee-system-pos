import { createClient } from '@supabase/supabase-js';
import { createTimeoutFetch } from './utils/network';

// Prioritize keys in the browser's local storage (from the SetupScreen)
// over the hardcoded environment variables.
const supabaseUrl = localStorage.getItem('tinypos_supabase_url') || import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = localStorage.getItem('tinypos_supabase_anon_key') || import.meta.env.VITE_SUPABASE_ANON_KEY;

if (import.meta.env.DEV) {
  console.log("Supabase Client Init:", { 
    url: supabaseUrl, 
    source: localStorage.getItem('tinypos_supabase_url') ? 'localStorage' : 'env' 
  });
}

// Create the connection if keys are available
if (!supabaseUrl) {
  console.error('Supabase URL is missing. Set tinypos_supabase_url in localStorage or VITE_SUPABASE_URL env variable.');
}
if (!supabaseAnonKey) {
  console.error('Supabase anon key is missing. Set tinypos_supabase_anon_key in localStorage or VITE_SUPABASE_ANON_KEY env variable.');
}

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
      // Give every cloud request a deadline + circuit breaker so a slow /
      // half-open connection fails fast into the offline path instead of
      // freezing the UI. See src/utils/network.js.
      global: {
        fetch: createTimeoutFetch(),
      },
    })
  : null;

// Reachability probe for the connectivity heartbeat (src/utils/network.js).
//
// Deliberately uses the RAW fetch, NOT the wrapped client above: the wrapped
// fetch rejects immediately while the breaker is open, which is exactly when the
// heartbeat needs to reach the network to detect recovery. Hits GoTrue's
// unauthenticated health endpoint with its own short deadline. Any HTTP answer
// (even non-2xx) proves the link is alive end-to-end; only a network-layer
// failure or timeout counts as unreachable.
export async function probeCloud(timeoutMs = 3000) {
  if (!supabaseUrl) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/health`, {
      method: 'GET',
      headers: supabaseAnonKey ? { apikey: supabaseAnonKey } : undefined,
      signal: controller.signal,
      cache: 'no-store',
    });
    return !!res;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}