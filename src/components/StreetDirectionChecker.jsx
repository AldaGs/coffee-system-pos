import { useState, useRef, useEffect } from 'react';
import { Icon } from '@iconify/react';

const DATASET_PAGE = 'https://datos.pueblacapital.gob.mx/dataset/jerarquizaci%C3%B3n-vial';
const CSV_DIRECT_URL = 'https://datos.pueblacapital.gob.mx/sites/default/files/JerarquizacionVial.csv';
const CKAN_API = 'https://datos.pueblacapital.gob.mx/api/3/action/datastore_search';

// Try latest resource first, then the one from the original URL
const RESOURCE_IDS = [
  'a1703145-77d5-49ab-ad35-4b8dba276ca9',
  'ccc00934-99b4-44b4-841a-350159ddba5c',
];

// Common column name variants used in Mexican government GIS datasets
const NAME_COLS = ['NOMBRE_VIA', 'NOM_VIA', 'NOMBRE', 'nombre_via', 'nombre', 'NOM_CALLE', 'CALLE', 'VIA', 'VIALIDAD', 'NOMBRE_VIALIDAD'];
const DIR_COLS  = ['SENTIDO', 'sentido', 'SENTIDO_VIAL', 'SENTIDO_DE_CIRCULACION', 'CIRCULACION', 'ONEWAY', 'one_way', 'DIRECCION'];

function detectCols(record) {
  const keys = Object.keys(record).filter(k => k !== '_id');
  const nameCol = keys.find(k => NAME_COLS.some(n => k.toUpperCase() === n.toUpperCase()))
    ?? keys.find(k => k.toUpperCase().includes('NOMBRE') || k.toUpperCase().includes('VIA'))
    ?? keys[0];
  const dirCol = keys.find(k => DIR_COLS.some(d => k.toUpperCase() === d.toUpperCase()))
    ?? keys.find(k => k.toUpperCase().includes('SENTIDO') || k.toUpperCase().includes('CIRCULA'));
  return { nameCol, dirCol, allKeys: keys };
}

function parseDirection(raw) {
  if (raw == null || raw === '') return { label: 'Sin dato', type: 'unknown' };
  const v = String(raw).toUpperCase().trim();

  if (/AMBOS|BOTH|DOBLE|B(?:\b|$)|^2$/.test(v))
    return { label: 'Doble sentido', type: 'both', icon: 'lucide:arrow-left-right' };

  if (/UN\s*SOLO|ÚNICO|UNICO|UN\s*SENTIDO|ONE.WAY|^1$|^F$|^S$|^T$/.test(v) || /[NSEO]-[NSEO]/.test(v))
    return { label: `Un solo sentido${/[NSEO]-[NSEO]/.test(v) ? ` (${raw})` : ''}`, type: 'one', icon: 'lucide:arrow-right' };

  return { label: raw, type: 'unknown', icon: 'lucide:help-circle' };
}

const DIR_STYLE = {
  both:    { bg: '#e8f5e9', color: '#2e7d32', border: '#a5d6a7' },
  one:     { bg: '#fff3e0', color: '#e65100', border: '#ffcc80' },
  unknown: { bg: '#f5f5f5', color: '#616161', border: '#e0e0e0' },
};

function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(Boolean);
  if (lines.length < 2) throw new Error('CSV vacío o sin datos');
  const delim = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(delim).map(h => h.replace(/^"|"$/g, '').trim());
  return lines.slice(1).map(line => {
    const vals = line.split(delim).map(v => v.replace(/^"|"$/g, '').trim());
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
  });
}

async function queryAPI(streetName) {
  for (const rid of RESOURCE_IDS) {
    try {
      const url = `${CKAN_API}?resource_id=${rid}&q=${encodeURIComponent(streetName)}&limit=100`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const json = await res.json();
      if (json.success && json.result?.records?.length > 0) {
        return { records: json.result.records, rid };
      }
      // API reachable but no results — still mark as api-ok
      if (json.success) return { records: [], rid };
    } catch {
      // CORS / network failure — try next resource id
    }
  }
  return null; // API unreachable
}

export default function StreetDirectionChecker() {
  const [query, setQuery]     = useState('Peso Mexicano');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [apiOk, setApiOk]     = useState(null); // true | false | null (unknown)
  const [csvData, setCsvData] = useState(null);
  const [csvCols, setCsvCols] = useState(null);
  const fileRef = useRef();

  // Auto-run for "Peso Mexicano" on first render
  useEffect(() => { runSearch('Peso Mexicano'); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function runSearch(term) {
    if (!term.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      if (csvData) {
        const t = term.trim().toUpperCase();
        const { nameCol } = csvCols;
        const matches = csvData.filter(r => String(r[nameCol] ?? '').toUpperCase().includes(t));
        setResults({ records: matches, cols: csvCols, source: 'csv' });
      } else {
        const res = await queryAPI(term.trim());
        if (res !== null) {
          setApiOk(true);
          const cols = res.records.length > 0 ? detectCols(res.records[0]) : { nameCol: null, dirCol: null, allKeys: [] };
          setResults({ records: res.records, cols, source: 'api', rid: res.rid });
        } else {
          setApiOk(false);
          setError('La API del portal no respondió (posiblemente bloqueada por CORS). Descarga el CSV y cárgalo aquí.');
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    runSearch(query);
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const rows = parseCSV(ev.target.result);
        if (rows.length === 0) throw new Error('Sin registros');
        const cols = detectCols(rows[0]);
        setCsvData(rows);
        setCsvCols(cols);
        setError(null);
        // Re-run current search against new data
        const t = query.trim().toUpperCase();
        const matches = rows.filter(r => String(r[cols.nameCol] ?? '').toUpperCase().includes(t));
        setResults({ records: matches, cols, source: 'csv' });
      } catch (err) {
        setError('Error al leer el CSV: ' + err.message);
      }
    };
    reader.onerror = () => setError('Error al leer el archivo');
    reader.readAsText(file, 'UTF-8');
  }

  const displayedSource = results?.source === 'csv'
    ? `CSV local (${csvData?.length?.toLocaleString()} registros)`
    : results?.source === 'api'
    ? 'API oficial — Jerarquización Vial, Puebla Capital'
    : null;

  return (
    <div style={{ minHeight: '100dvh', background: '#f0f4f8', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '20px 16px' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ background: 'white', borderRadius: '16px', padding: '20px 24px', marginBottom: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '48px', height: '48px', background: '#eff6ff', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1d4ed8', fontSize: '1.4rem', flexShrink: 0 }}>
              <Icon icon="lucide:traffic-cone" />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', color: '#1e293b' }}>
                Verificador de Sentido Vial — Puebla Capital
              </h1>
              <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: '0.82rem' }}>
                Fuente oficial:{' '}
                <a href={DATASET_PAGE} target="_blank" rel="noopener noreferrer" style={{ color: '#1d4ed8' }}>
                  Jerarquización Vial · datos.pueblacapital.gob.mx
                </a>
              </p>
            </div>
          </div>
        </div>

        {/* Search form */}
        <form onSubmit={handleSubmit} style={{ background: 'white', borderRadius: '16px', padding: '20px 24px', marginBottom: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
          <label style={{ display: 'block', fontWeight: '700', color: '#374151', marginBottom: '8px', fontSize: '0.88rem' }}>
            Nombre de la vialidad
          </label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Icon icon="lucide:search" style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.95rem', pointerEvents: 'none' }} />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Ej: Peso Mexicano, Reforma, 5 de Mayo…"
                style={{ width: '100%', padding: '11px 12px 11px 36px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '0.95rem', boxSizing: 'border-box', color: '#1e293b', outline: 'none' }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{ padding: '11px 22px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', fontSize: '0.9rem', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.65 : 1, display: 'flex', alignItems: 'center', gap: '7px', whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              <Icon icon={loading ? 'lucide:loader-2' : 'lucide:arrow-right'} />
              {loading ? 'Buscando…' : 'Verificar'}
            </button>
          </div>

          {/* CSV fallback */}
          <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px dashed #e2e8f0' }}>
            <p style={{ margin: '0 0 8px', color: '#64748b', fontSize: '0.8rem' }}>
              Si la API está bloqueada, descarga el CSV oficial y cárgalo para búsqueda local:
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => fileRef.current.click()}
                style={{ padding: '7px 14px', background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '0.8rem', color: '#374151', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Icon icon="lucide:upload" /> Cargar CSV
              </button>
              <a href={CSV_DIRECT_URL} target="_blank" rel="noopener noreferrer"
                style={{ color: '#1d4ed8', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Icon icon="lucide:download" /> Descargar JerarquizacionVial.csv
              </a>
              {csvData && (
                <span style={{ color: '#16a34a', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '600' }}>
                  <Icon icon="lucide:check-circle-2" /> {csvData.length.toLocaleString()} registros cargados
                </span>
              )}
              {apiOk === false && !csvData && (
                <span style={{ color: '#dc2626', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Icon icon="lucide:wifi-off" /> API no disponible — usa el CSV
                </span>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".csv,.CSV" onChange={handleFile} style={{ display: 'none' }} />
          </div>
        </form>

        {/* Error banner */}
        {error && (
          <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '12px', padding: '14px 18px', marginBottom: '16px', color: '#92400e', fontSize: '0.88rem', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <Icon icon="lucide:alert-triangle" style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>{error}</span>
          </div>
        )}

        {/* Results */}
        {results && (
          <div>
            {/* Meta bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '6px' }}>
              <span style={{ fontWeight: '700', color: '#374151', fontSize: '0.88rem' }}>
                {results.records.length === 0
                  ? 'Sin resultados'
                  : `${results.records.length} vialidad${results.records.length !== 1 ? 'es' : ''} encontrada${results.records.length !== 1 ? 's' : ''}`}
              </span>
              {displayedSource && (
                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Icon icon={results.source === 'csv' ? 'lucide:file-spreadsheet' : 'lucide:cloud'} />
                  {displayedSource}
                </span>
              )}
            </div>

            {results.records.length === 0 ? (
              <div style={{ background: 'white', borderRadius: '12px', padding: '40px 20px', textAlign: 'center', color: '#64748b', border: '1px solid #e2e8f0' }}>
                <Icon icon="lucide:map-pin-off" style={{ fontSize: '2rem', marginBottom: '10px', display: 'block', margin: '0 auto 10px' }} />
                <p style={{ margin: 0 }}>No se encontraron vialidades con ese nombre en el dataset oficial.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {results.records.map((row, i) => {
                  const { nameCol, dirCol, allKeys } = results.cols;
                  const name    = nameCol ? row[nameCol] : Object.values(row)[0];
                  const dirRaw  = dirCol ? row[dirCol] : null;
                  const dir     = parseDirection(dirRaw);
                  const ds      = DIR_STYLE[dir.type];
                  const extras  = allKeys.filter(k => k !== nameCol && k !== dirCol && k !== '_id');

                  return (
                    <div key={i} style={{ background: 'white', borderRadius: '12px', padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
                        {/* Street info */}
                        <div style={{ flex: 1, minWidth: '160px' }}>
                          <div style={{ fontWeight: '800', color: '#1e293b', fontSize: '1rem', marginBottom: '4px' }}>
                            {name || '—'}
                          </div>
                          {extras.map(k => (
                            <div key={k} style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                              <span style={{ color: '#64748b', fontWeight: '600' }}>{k}:</span> {row[k] || '—'}
                            </div>
                          ))}
                        </div>

                        {/* Direction badge */}
                        <div style={{ padding: '8px 16px', borderRadius: '20px', fontWeight: '700', fontSize: '0.82rem', background: ds.bg, color: ds.color, border: `1.5px solid ${ds.border}`, display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                          {dir.icon && <Icon icon={dir.icon} />}
                          {dir.label}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Column legend if dirCol is null (couldn't detect direction field) */}
            {results.cols.dirCol == null && results.records.length > 0 && (
              <div style={{ marginTop: '12px', padding: '12px 16px', background: '#eff6ff', borderRadius: '10px', fontSize: '0.8rem', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                <Icon icon="lucide:info" style={{ marginRight: '6px' }} />
                No se detectó automáticamente la columna de sentido de circulación.
                Columnas disponibles: <strong>{results.cols.allKeys.join(', ')}</strong>
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        <div style={{ marginTop: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {[
            { type: 'both', label: 'Doble sentido', icon: 'lucide:arrow-left-right' },
            { type: 'one',  label: 'Un solo sentido', icon: 'lucide:arrow-right' },
            { type: 'unknown', label: 'Sin dato / otro', icon: 'lucide:help-circle' },
          ].map(({ type, label, icon }) => {
            const ds = DIR_STYLE[type];
            return (
              <div key={type} style={{ padding: '6px 12px', borderRadius: '16px', fontSize: '0.78rem', fontWeight: '600', background: ds.bg, color: ds.color, border: `1px solid ${ds.border}`, display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Icon icon={icon} /> {label}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: '16px', fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center' }}>
          Datos: Secretaría de Movilidad e Infraestructura · Municipio de Puebla ·{' '}
          <a href={DATASET_PAGE} target="_blank" rel="noopener noreferrer" style={{ color: '#64748b' }}>
            datos.pueblacapital.gob.mx
          </a>
        </div>
      </div>
    </div>
  );
}
