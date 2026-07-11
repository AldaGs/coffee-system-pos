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