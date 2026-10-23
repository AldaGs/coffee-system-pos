// This device's Supabase project ref ("abcd1234" in https://abcd1234.supabase.co),
// the ?p= value every public link (menu, order, CFDI) uses. '' when not connected.
export function storedProjectRef() {
  try { return new URL(localStorage.getItem('tinypos_supabase_url') || '').hostname.split('.')[0]; }
  catch { return ''; }
}
