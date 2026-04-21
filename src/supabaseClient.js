import { createClient } from '@supabase/supabase-js';

// Prioritize keys in the browser's local storage (from the SetupScreen)
// over the hardcoded environment variables.
const supabaseUrl = localStorage.getItem('tinypos_supabase_url') || import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = localStorage.getItem('tinypos_supabase_anon_key') || import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log("Supabase Client Init:", { 
  url: supabaseUrl, 
  source: localStorage.getItem('tinypos_supabase_url') ? 'localStorage' : 'env' 
});

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
    })
  : null;