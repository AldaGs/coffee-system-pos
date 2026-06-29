import { formatForDisplay } from './moneyUtils';

// jsPDF is heavy (~1.4 MB), so we load it on demand the first time a PDF is
// generated rather than shipping it in the main bundle / PWA precache.

// Vector, selectable-text PDF of a vendor settlement statement. Mirrors the
// VendorStatement card layout but drawn with jsPDF primitives so the text stays
// searchable/copyable and prints crisp at any zoom. Returns a Blob.

const INK = [31, 41, 55];
const MUTED = [107, 114, 128];
const HAIR = [229, 231, 235];
const ACCENT = [180, 83, 9];
const PANEL = [250, 248, 245];
const GREEN = [21, 128, 61];
const RED = [220, 38, 38];
const AMBER = [146, 64, 14];

const perUnit = (totalCents, units) => Math.round((totalCents || 0) / (units || 1));
const money = (c) => formatForDisplay(c);

function logoFormat(dataUrl) {
  if (/^data:image\/png/i.test(dataUrl)) return 'PNG';
  if (/^data:image\/jpe?g/i.test(dataUrl)) return 'JPEG';
  return null;
}

export async function buildVendorStatementPdf(row, { paidCents = 0, range = {}, branding = {}, t }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();   // ~595.28
  const M = 40;
  const RIGHT = W - M;
  const isCost = row.splitType === 'cost';
  const hasTax = row.taxCents > 0;
  const balance = row.payoutCents - paidCents;
  const shopName = branding.header || 'TinyPOS';
  const generated = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const splitLabel = isCost ? t('vendors.splitCost') : `${t('vendors.colCommission')} · ${row.commissionPercent}%`;

  const text = (s, x, y, { size = 10, color = INK, bold = false, align = 'left' } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(String(s), x, y, { align });
  };

  // --- Header band ---
  doc.setFillColor(INK[0], INK[1], INK[2]);
  doc.rect(0, 0, W, 96, 'F');
  let nameX = M;
  if (branding.logo) {
    const fmt = logoFormat(branding.logo);
    if (fmt) {
      try {
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(M, 26, 44, 44, 6, 6, 'F');
        doc.addImage(branding.logo, fmt, M + 4, 30, 36, 36);
        nameX = M + 56;
      } catch { /* skip a bad logo */ }
    }
  }
  text(shopName, nameX, 48, { size: 16, bold: true, color: [255, 255, 255] });
  if (branding.subheader) text(branding.subheader, nameX, 64, { size: 9, color: [203, 213, 225] });
  text(t('vendors.statementTitle').toUpperCase(), RIGHT, 44, { size: 9, bold: true, color: [203, 213, 225], align: 'right' });
  text(generated, RIGHT, 60, { size: 9, color: [148, 163, 184], align: 'right' });

  // Accent rule
  doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
  doc.rect(0, 96, W, 4, 'F');

  // --- Vendor + period ---
  let y = 134;
  text(t('vendors.statementFor').toUpperCase(), M, y, { size: 8, bold: true, color: MUTED });
  text(row.vendorName, M, y + 20, { size: 20, bold: true });
  // split pill
  const pillText = splitLabel;
  doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  const pillW = doc.getTextWidth(pillText) + 18;
  doc.setFillColor(253, 243, 231);
  doc.roundedRect(M, y + 30, pillW, 18, 9, 9, 'F');
  text(pillText, M + 9, y + 42, { size: 9, bold: true, color: ACCENT });

  text(t('vendors.statementPeriod').toUpperCase(), RIGHT, y, { size: 8, bold: true, color: MUTED, align: 'right' });
  text(`${range.from || '—'}  →  ${range.to || '—'}`, RIGHT, y + 18, { size: 11, bold: true, align: 'right' });

  // --- Items table ---
  y += 76;
  const numCols = isCost
    ? [t('vendors.colUnits'), t('vendors.colUnitPrice'), t('vendors.colUnitCost'), t('vendors.colProfit')]
    : [t('vendors.colUnits'), t('vendors.colUnitPrice'), t('vendors.colGross')];
  const colW = 78;
  const n = numCols.length;
  const rightEdge = (j) => RIGHT - (n - 1 - j) * colW; // j: 0..n-1 left→right
  const nameRight = rightEdge(0) - colW - 8;

  text(t('vendors.colVendor'), M, y, { size: 8, bold: true, color: MUTED });
  numCols.forEach((c, j) => text(c, rightEdge(j), y, { size: 8, bold: true, color: MUTED, align: 'right' }));
  doc.setDrawColor(HAIR[0], HAIR[1], HAIR[2]); doc.setLineWidth(1);
  doc.line(M, y + 5, RIGHT, y + 5);
  y += 22;

  row.items.forEach((it) => {
    const name = doc.splitTextToSize(it.name, nameRight - M)[0];
    text(name, M, y, { size: 10, bold: true });
    text(String(it.units), rightEdge(0), y, { size: 10, color: MUTED, align: 'right' });
    text(money(perUnit(it.grossCents, it.units)), rightEdge(1), y, { size: 10, align: 'right' });
    if (isCost) {
      text(money(perUnit(it.costCents, it.units)), rightEdge(2), y, { size: 10, color: MUTED, align: 'right' });
      text(money(it.grossCents - it.costCents), rightEdge(3), y, { size: 10, bold: true, color: GREEN, align: 'right' });
    } else {
      text(money(it.grossCents), rightEdge(2), y, { size: 10, bold: true, align: 'right' });
    }
    doc.setDrawColor(HAIR[0], HAIR[1], HAIR[2]); doc.setLineWidth(0.5);
    doc.line(M, y + 6, RIGHT, y + 6);
    y += 20;
  });

  // terms line
  y += 8;
  const terms = isCost ? t('vendors.termsCost') : t('vendors.termsCommission').replace('{pct}', String(row.commissionPercent));
  doc.splitTextToSize(terms, RIGHT - M).forEach((ln) => { text(ln, M, y, { size: 9, color: MUTED }); y += 12; });

  // --- Summary panel ---
  y += 12;
  const lines = [];
  lines.push([t('vendors.colGross'), money(row.grossCents), INK]);
  if (row.refundCents) lines.push([t('vendors.colRefunds'), `- ${money(row.refundCents)}`, RED]);
  if (hasTax) lines.push([t('vendors.colBase'), money(row.baseCents), INK]);
  if (hasTax) lines.push([t('vendors.colTax'), money(row.taxCents), INK]);
  lines.push([splitLabel, `- ${money(row.commissionCents)}`, RED]);
  const paidLine = paidCents ? [t('vendors.colPaid'), `- ${money(paidCents)}`, MUTED] : null;

  const panelTop = y;
  const panelH = 16 + lines.length * 18 + 12 + 26 + (paidLine ? 18 : 0) + 12 + 44 + 16;
  doc.setFillColor(PANEL[0], PANEL[1], PANEL[2]);
  doc.setDrawColor(HAIR[0], HAIR[1], HAIR[2]); doc.setLineWidth(1);
  doc.roundedRect(M, panelTop, RIGHT - M, panelH, 12, 12, 'FD');

  let py = panelTop + 24;
  const px = M + 24;
  const pr = RIGHT - 24;
  lines.forEach(([label, value, color]) => {
    text(label, px, py, { size: 11, color: MUTED });
    text(value, pr, py, { size: 11, bold: true, color, align: 'right' });
    py += 18;
  });
  // divider + payout
  py += 4;
  doc.setDrawColor(HAIR[0], HAIR[1], HAIR[2]); doc.setLineWidth(1.5);
  doc.line(px, py, pr, py);
  py += 22;
  text(t('vendors.colPayout'), px, py, { size: 13, bold: true });
  text(money(row.payoutCents), pr, py, { size: 18, bold: true });
  py += 18;
  if (paidLine) {
    text(paidLine[0], px, py, { size: 11, color: MUTED });
    text(paidLine[1], pr, py, { size: 11, bold: true, color: MUTED, align: 'right' });
    py += 18;
  }
  // balance chip
  py += 6;
  doc.setFillColor(balance > 0 ? 254 : 220, balance > 0 ? 243 : 252, balance > 0 ? 199 : 231);
  doc.roundedRect(px, py, pr - px, 40, 10, 10, 'F');
  text(t('vendors.colBalance'), px + 16, py + 25, { size: 12, bold: true });
  text(money(balance), pr - 16, py + 26, { size: 16, bold: true, color: balance > 0 ? AMBER : GREEN, align: 'right' });

  // --- Footer ---
  let fy = panelTop + panelH + 28;
  const cx = W / 2;
  text(t('vendors.statementThanks'), cx, fy, { size: 11, bold: true, align: 'center' });
  fy += 14;
  if (branding.footer) { text(branding.footer, cx, fy, { size: 9, color: MUTED, align: 'center' }); fy += 12; }
  text(`${shopName} · ${generated}`, cx, fy + 4, { size: 9, color: [156, 163, 175], align: 'center' });

  return doc.output('blob');
}
