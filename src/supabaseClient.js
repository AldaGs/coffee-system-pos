import { createClient } from '@supabase/supabase-js';

// Look for the keys in the browser's local storage
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// If the keys exist, create the connection. If not, return null.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);