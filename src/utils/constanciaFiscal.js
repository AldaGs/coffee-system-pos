// Parse a SAT "Constancia de Situación Fiscal" PDF and pull out the fields
// the CFDI request form needs. The constancia is a digitally-generated PDF with
// a real text layer, so we read text (no OCR) and regex the known labels.
//
// Extractable: RFC, name/razón social, código postal, régimen fiscal.
// NOT in the document: email and uso de CFDI — those stay for the customer.

// pdf.js is loaded lazily so the public CFDI page doesn't pay the bundle cost
// unless a customer actually uploads a constancia. Mirrors src/api/menuUploads.js.
let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
      const workerUrl = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).href;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

// Régimen name (as printed in the constancia) → SAT c_RegimenFiscal code.
// Matched against accent-stripped, lowercased text, so keys are ASCII fragments.
// Ordered by priority: when a taxpayer has several régimenes we prefer the one a
// business purchase would be invoiced under over salary/no-obligation régimenes.
const REGIMEN_MATCHERS = [
  { code: '626', needle: 'simplificado de confianza' },                       // RESICO
  { code: '612', needle: 'actividades empresariales y profesionales' },
  { code: '621', needle: 'incorporacion fiscal' },
  { code: '606', needle: 'arrendamiento' },
  { code: '601', needle: 'general de ley personas morales' },
  { code: '603', needle: 'personas morales con fines no lucrativos' },
  { code: '608', needle: 'demas ingresos' },
  { code: '605', needle: 'sueldos y salarios' },
  { code: '616', needle: 'sin obligaciones fiscales' },
];

const stripAccents = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// Extract the full text of the PDF (fields all live on page 1, but we read the
// first couple of pages to be safe). Text items are joined with spaces.
async function extractText(file) {
  const pdfjs = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const pageCount = Math.min(pdf.numPages, 2);
  let text = '';
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => it.str).join(' ') + '\n';
  }
  return text;
}

function pickRegimen(text) {
  const hay = stripAccents(text).toLowerCase();
  for (const { code, needle } of REGIMEN_MATCHERS) {
    if (hay.includes(needle)) return code;
  }
  return '';
}

// The razón social / nombre for CFDI 4.0 must match SAT exactly, spaces included.
// The header (right after "Registro Federal de Contribuyentes") keeps the proper
// spacing for both personas físicas and morales, whereas the body's
// "Denominación/Razón Social" field renders morales with the words glued
// together ("LONGSUMMERDAYSFILMS"), so we read the header first.
function pickName(text) {
  const header = text.match(/Registro\s*Federal\s*de\s*Contribuyentes\s+(.+?)\s+(?:Nombre\s*,?\s*denominaci|Lugar\s*y\s*Fecha|idCIF)/i);
  if (header) {
    const name = header[1].trim().replace(/\s+/g, ' ');
    // Guard against accidentally grabbing the RFC line if layout differs.
    if (name && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(name)) return name;
  }

  // Fallback — persona física: "Nombre(s) PrimerApellido SegundoApellido".
  const grab = (label) => {
    const m = text.match(new RegExp(`${label}\\s*:?\\s*([^\\n]*?)\\s*(?:Segundo|Primer|Nombre|CURP|Fecha|Estatus|Datos|$)`, 'i'));
    return m ? m[1].trim() : '';
  };
  const full = ['Nombre\\(s\\)', 'Primer\\s*Apellido', 'Segundo\\s*Apellido']
    .map(grab).filter(Boolean).join(' ').trim();
  if (full) return full.replace(/\s+/g, ' ');

  // Fallback — persona moral: denominación / razón social. Stop before the next
  // labelled field, notably "Régimen Capital" (S.A. de C.V.), which must NOT be
  // part of the razón social. Note: morales can come out glued here.
  const moral = text.match(/Denominaci[oó]n\s*\/?\s*Raz[oó]n\s*Social\s*:\s*([^\n]+?)\s*(?:R[eé]gimen|Nombre|Estatus|Fecha|RFC|CURP|Datos|C[oó]digo|$)/i);
  return moral ? moral[1].trim().replace(/\s+/g, ' ') : '';
}

/**
 * Parse a constancia PDF File/Blob into prefillable form fields.
 * Returns { rfc, razon_social, cp, regimen_fiscal } — each '' if not found.
 * Throws if the file isn't a readable PDF or isn't a constancia.
 */
export async function parseConstancia(file) {
  const raw = await extractText(file);
  // Collapse runs of whitespace for easier matching, but keep single spaces.
  const text = raw.replace(/[ \t]+/g, ' ');

  const rfcMatch = text.match(/\bRFC\s*:?\s*([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{2}[0-9A])\b/i);
  const cpMatch = text.match(/C[oó]digo\s*Postal\s*:?\s*(\d{5})\b/i);

  const result = {
    rfc: rfcMatch ? rfcMatch[1].toUpperCase() : '',
    razon_social: pickName(text).toUpperCase(),
    cp: cpMatch ? cpMatch[1] : '',
    regimen_fiscal: pickRegimen(text),
  };

  // Sanity check: a real constancia always has an RFC. If we found none, the
  // upload probably wasn't a constancia (or was a scan with no text layer).
  if (!result.rfc) {
    const err = new Error('No pudimos leer el RFC. Asegúrate de subir tu Constancia de Situación Fiscal en PDF.');
    err.code = 'NOT_A_CONSTANCIA';
    throw err;
  }

  return result;
}
