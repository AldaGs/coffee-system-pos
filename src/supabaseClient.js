import { createClient } from '@supabase/supabase-js';

// Prioritize keys in the browser's local storage (from the Hardware Setup screen)
// over the hardcoded environment variables.
const supabaseUrl = localStorage.getItem('TINY_POS_URL') || import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = localStorage.getItem('TINY_POS_KEY') || import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log("Supabase Client Init:", { 
  url: supabaseUrl, 
  source: localStorage.getItem('TINY_POS_URL') ? 'localStorage' : 'env' 
});

// Create the connection if keys are available
export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;