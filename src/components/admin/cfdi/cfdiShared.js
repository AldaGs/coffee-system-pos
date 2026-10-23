import { supabase } from '../../../supabaseClient';

export const ZIP_BUCKET = 'cfdi';
export const ZIP_DAYS = 90; // must match cfdi_lookup_ticket (migration 064)
// Fields the owner can flag when reopening; keys match fiscal_profiles / the public form.
export const REOPEN_FIELDS = [
  ['rfc', 'RFC'], ['razon_social', 'Razón Social'], ['cp', 'C.P.'],
  ['regimen_fiscal', 'Régimen Fiscal'], ['uso_cfdi', 'Uso CFDI'], ['email', 'Email'],
];
export const reopenFieldLabel = (key) => REOPEN_FIELDS.find(([k]) => k === key)?.[1] || key;

export const fmtCents = (c) => `$${((Number(c) || 0) / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Business name snapshot for the portal legend, from the cached menu settings.
export function cachedBusinessName() {
  try {
    const parsed = JSON.parse(localStorage.getItem('tinypos_cached_menu') || '{}');
    return parsed.receiptSettings?.header || parsed.posSettings?.name || '';
  } catch { return ''; }
}

// Project ref for the DNS instructions.
export function projectRef() {
  try { return new URL(localStorage.getItem('tinypos_supabase_url') || '').hostname.split('.')[0]; }
  catch { return ''; }
}

// Reconciliation totals for one month of paid sales, in cents. The Factura Global
// should total `globalCents` (net sales NOT individually invoiced); `invoicedCents`
// are the individual CFDIs already issued and excluded from the global.
export function monthSummary(sales) {
  const acc = {
    ticketCount: 0, grossCents: 0, refundCents: 0, netCents: 0,
    invoicedCount: 0, invoicedCents: 0, globalCount: 0, globalCents: 0, pendingCount: 0,
  };
  for (const s of sales || []) {
    const gross = Number(s.total_amount) || 0;
    const refund = Number(s.refund_amount) || 0;
    const net = gross - refund;
    acc.ticketCount += 1;
    acc.grossCents += gross;
    acc.refundCents += refund;
    acc.netCents += net;
    if (s.cfdi_status === 'issued') {
      acc.invoicedCount += 1;
      acc.invoicedCents += net;
    } else if (s.cfdi_status === 'requested' || s.cfdi_status === 'reopened') {
      acc.pendingCount += 1;
    } else {
      acc.globalCount += 1;
      acc.globalCents += net;
    }
  }
  return acc;
}

// Supabase Storage has no expiry rules, so the admin tab cleans up: any ZIP
// past its window is deleted and the sale forgets the path. Fire-and-forget.
export async function purgeExpiredZips(sales) {
  const cutoff = Date.now() - ZIP_DAYS * 86400000;
  const expired = sales.filter(s => s.cfdi_zip_path && new Date(s.cfdi_zip_at).getTime() < cutoff);
  if (!expired.length) return;
  const { error } = await supabase.storage.from(ZIP_BUCKET).remove(expired.map(s => s.cfdi_zip_path));
  if (error) return console.warn('CFDI zip purge failed', error);
  await supabase.from('sales').update({ cfdi_zip_path: null, cfdi_zip_at: null }).in('id', expired.map(s => s.id));
}
