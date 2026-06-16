import { Icon } from '@iconify/react';
import { useEffect, useRef, useState } from 'react';
import { migrateLocalToCloud } from '../services/localToCloudMigration';

// Shown once, after the user has connected a Supabase project during a local→cloud
// upgrade and the page has reloaded with live keys. Runs the migration, then calls
// onDone() (which flips tinypos_mode to cloud, clears the upgrade flag, and reloads
// into a normal cloud install). On error it stops and lets the user retry or
// continue anyway, so a transient failure never strands them.
const PHASE_LABELS = {
  auth: 'Verificando tu cuenta…',
  inventory: 'Subiendo inventario…',
  customers: 'Subiendo clientes y lealtad…',
  menu: 'Subiendo el menú…',
  settings: 'Subiendo la configuración…',
  ledgers: 'Subiendo ventas y gastos…',
  done: 'Finalizando…',
};

export default function MigrationScreen({ onDone }) {
  const [phase, setPhase] = useState('inventory');
  const [result, setResult] = useState(null); // { ok, errors, notes }
  const [running, setRunning] = useState(true);
  const startedRef = useRef(false);

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await migrateLocalToCloud(({ phase }) => setPhase(phase));
      setResult(res);
      if (res.ok) {
        // Brief beat so the user sees "done" before the reload.
        setTimeout(() => onDone(res), 800);
      }
    } catch (e) {
      setResult({ ok: false, errors: [e.message], notes: [] });
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ display: 'flex', height: '100dvh', background: 'var(--bg-app, #fdfdfd)', justifyContent: 'center', alignItems: 'center', fontFamily: 'var(--font-main, system-ui)', padding: '20px' }}>
      <div style={{ background: 'var(--bg-surface, #fff)', padding: '40px', borderRadius: '24px', width: '100%', maxWidth: '440px', boxShadow: '0 20px 50px rgba(0,0,0,0.1)', border: '1px solid var(--border, #eee)', textAlign: 'center' }}>
        <div style={{ width: '72px', height: '72px', background: 'rgba(52, 152, 219, 0.12)', color: '#3498db', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.2rem', margin: '0 auto 20px' }}>
          <Icon icon="lucide:cloud-upload" />
        </div>
        <h2 style={{ margin: '0 0 10px', fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-main, #0d3a66)' }}>
          Respaldando tus datos
        </h2>

        {running && (
          <>
            <div className="spinner" style={{ margin: '20px auto' }}></div>
            <p style={{ color: 'var(--text-muted, #546e7a)', margin: 0 }}>{PHASE_LABELS[phase] || 'Trabajando…'}</p>
            <p style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.85rem', marginTop: '12px' }}>
              No cierres la app. Esto puede tardar un momento.
            </p>
          </>
        )}

        {!running && result?.ok && (
          <p style={{ color: '#099b46', fontWeight: 700, marginTop: '16px' }}>
            <Icon icon="lucide:check-circle-2" /> ¡Listo! Entrando a tu tienda en la nube…
          </p>
        )}

        {!running && result && !result.ok && (
          <div style={{ marginTop: '16px', textAlign: 'left' }}>
            <div style={{ background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.25)', color: '#c0392b', padding: '12px 14px', borderRadius: '12px', fontSize: '0.9rem' }}>
              <strong>Algunos datos no se subieron:</strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: '18px' }}>
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button onClick={run} style={{ flex: 1, padding: '14px', background: '#3498db', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 800 }}>
                Reintentar
              </button>
              <button onClick={() => onDone(result)} style={{ flex: 1, padding: '14px', background: 'var(--bg-main, #f1f5f9)', color: 'var(--text-main, #0d3a66)', border: '1px solid var(--border, #e2e8f0)', borderRadius: '12px', cursor: 'pointer', fontWeight: 800 }}>
                Continuar de todos modos
              </button>
            </div>
          </div>
        )}

        {!running && result?.notes?.length > 0 && (
          <div style={{ marginTop: '16px', background: 'rgba(241, 196, 15, 0.08)', border: '1px solid rgba(241, 196, 15, 0.25)', color: '#b8860b', padding: '12px 14px', borderRadius: '12px', fontSize: '0.85rem', textAlign: 'left' }}>
            {result.notes.map((n, i) => <div key={i}>{n}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}
