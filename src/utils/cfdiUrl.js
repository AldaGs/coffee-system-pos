/**
 * Shared CFDI URL builder.
 *
 * Reads Supabase connection details from localStorage and builds the URL for
 * the public CFDI invoice-request portal for a given ticket/sale.
 *
 * Used by:
 *  - TicketArea  (share CFDI link)
 *  - OrdersTab   (share CFDI link for past sales)
 *  - CfdiTab     (preview link)
 *  - TicketImage  (QR code on PNG receipts)
 *  - sharingUtils (QR on thermal / link in WhatsApp)
 */
export function buildCfdiUrl(ticketOrSaleId) {
  const cfdiDomain =
    localStorage.getItem('tinypos_cfdi_custom_domain') ||
    localStorage.getItem('tinypos_custom_domain');
  const baseUrl = cfdiDomain ? `https://${cfdiDomain}` : window.location.origin;
  const supabaseUrl = localStorage.getItem('tinypos_supabase_url');
  const anonKey = localStorage.getItem('tinypos_supabase_anon_key');

  const projectRef = supabaseUrl
    ? new URL(supabaseUrl).hostname.split('.')[0]
    : '';

  if (projectRef) {
    return `${baseUrl}/cfdi/${ticketOrSaleId}?p=${projectRef}`;
  }
  return `${baseUrl}/cfdi/${ticketOrSaleId}?u=${btoa(supabaseUrl)}&k=${btoa(anonKey)}`;
}

/**
 * Fiscal-period warning for a CFDI request.
 *
 * In Mexico a factura is safest when issued in the *same calendar month* the
 * sale was paid. Invoicing a sale from a previous month can force refacturación
 * or fall outside the monthly declaration window. This helper compares the
 * payment date against "now" and returns a small descriptor the UI can use to
 * escalate its messaging.
 *
 * @param {string|Date} paidAt  Payment timestamp (sale.created_at). Falsy → no
 *                              warning (e.g. an unpaid active ticket).
 * @param {Date}        [now]   Injectable clock, mainly for tests.
 * @returns {null | { crossMonth: boolean, paidStr: string, monthName: string }}
 */
export function getCfdiPeriodWarning(paidAt, now = new Date()) {
  if (!paidAt) return null;
  const paid = paidAt instanceof Date ? paidAt : new Date(paidAt);
  if (isNaN(paid.getTime())) return null;

  const crossMonth =
    paid.getFullYear() !== now.getFullYear() ||
    paid.getMonth() !== now.getMonth();

  return {
    crossMonth,
    paidStr: paid.toLocaleDateString('es-MX'),
    monthName: paid.toLocaleDateString('es-MX', { month: 'long' }),
  };
}

/**
 * Fire-and-forget: upload the config.json blob so that short-URL lookups
 * (`?p=<projectRef>`) work on the CFDI portal.  Call this once after building
 * the URL whenever the caller has access to the supabase client.
 */
export function ensureCfdiConfig(supabase) {
  if (!supabase) return;
  const supabaseUrl = localStorage.getItem('tinypos_supabase_url');
  const anonKey = localStorage.getItem('tinypos_supabase_anon_key');
  const projectRef = supabaseUrl
    ? new URL(supabaseUrl).hostname.split('.')[0]
    : '';
  if (!projectRef) return;

  const config = JSON.stringify({ k: anonKey });
  const blob = new Blob([config], { type: 'application/json' });
  supabase.storage
    .from('menu')
    .upload('config.json', blob, {
      upsert: true,
      contentType: 'application/json',
      cacheControl: '0',
    })
    .catch(console.error);
}
