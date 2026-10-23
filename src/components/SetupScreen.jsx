import { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { createClient } from '@supabase/supabase-js';
import { isUpgradePending } from '../utils/appMode';

// Burn-after-reading: drop the HttpOnly Management-token cookie the moment a
// setup flow finishes (success or failure) instead of waiting for its Max-Age.
// Fire-and-forget — the token is short-lived and invisible to JS regardless.
function clearMgmtToken() {
  try { fetch('/api/supabase?op=clear', { method: 'POST' }).catch(() => {}); } catch { /* noop */ }
}

export default function SetupScreen({ initialMode, onBack, onComplete, onShowGuide }) {
  const isConnectingExisting = initialMode === 'connect';

  // State for Holy Grail OAuth Flow.
  // We no longer hold the raw Management token in JS — it lives in an HttpOnly
  // cookie set by /api/auth/callback and rides along automatically on our
  // same-origin /api calls. `authorized` is just the boolean "OAuth completed"
  // signal that used to be inferred from the token's presence.
  const [authorized, setAuthorized] = useState(false);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');

  // New Admin Auth credentials
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  // Admin master PIN (4 digits) chosen at setup — seeds the cloud secure_pins
  // instead of a hardcoded default. On a local→cloud upgrade we pre-fill it with
  // the PIN the owner already set locally so they keep the same one.
  const [adminPin, setAdminPin] = useState('');
  const [showPin, setShowPin] = useState(false);

  // --- Guided "create the project for me" flow ---
  const [orgs, setOrgs] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState('');
  const [region, setRegion] = useState('us-east-1'); // East US (N. Virginia)
  const [projectName, setProjectName] = useState('tinypos');
  const [createMode, setCreateMode] = useState(false); // show the create-project UI
  const [installStep, setInstallStep] = useState(1); // 1 = project, 2 = admin (install flow only)
  const [creating, setCreating] = useState(false);
  const [provisionStatus, setProvisionStatus] = useState(''); // '', 'provisioning', 'ready'
  const [createdProject, setCreatedProject] = useState(null); // { ref, dbPass }
  const [dbPassCopied, setDbPassCopied] = useState(false);

  const REGIONS = [
    { value: 'us-east-1', label: 'Este de EE.UU. (Norte de Virginia)' },
    { value: 'us-west-1', label: 'Oeste de EE.UU. (Oregón)' },
  ];

  // Projects already in the chosen org (free tier allows 2 active).
  const orgProjectCount = orgs.length
    ? projects.filter(p => p.organization_id === selectedOrg).length
    : projects.length;
  const atFreeLimit = orgProjectCount >= 2;

  useEffect(() => {
    if (!isUpgradePending()) return;
    let alive = true;
    (async () => {
      try {
        const { getLocalMasterPin } = await import('../utils/localAuth');
        const localPin = await getLocalMasterPin();
        if (alive && localPin) setAdminPin(String(localPin));
      } catch { /* noop */ }
    })();
    return () => { alive = false; };
  }, []);

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [customAlert, setCustomAlert] = useState({ show: false, message: '', type: '' });

  // 1. Detect the OAuth return on boot. The token is in an HttpOnly cookie;
  //    all we get in the URL is the non-secret `?oauth=` marker.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returned = params.get('oauth');

    if (returned) {
      setTimeout(() => setAuthorized(true), 0);
      // Strip the marker from the URL so it doesn't linger.
      window.history.replaceState({}, document.title, "/");
      fetchProjects();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showAlert = (message, type = 'error') => {
    setCustomAlert({ show: true, message, type });
    setTimeout(() => setCustomAlert({ show: false, message: '', type: '' }), 4000);
  };

  // 2. Fetch User's Projects using the Management API. The token rides along as
  //    the HttpOnly cookie on this same-origin request — no header needed.
  const fetchProjects = async () => {
    setLoading(true);
    setLoadingStep('Buscando tus proyectos...');
    try {
      // CHANGED: We now call our own backend proxy instead of api.supabase.com
      const res = await fetch('/api/get-projects');

      const data = await res.json();
      console.log("Supabase API Response:", data);

      if (!res.ok) throw new Error(data.message || 'Error fetching projects');

      setProjects(data);
      if (data.length > 0) setSelectedProject(data[0].id);

      // Fetch orgs so the guided create-project flow can target one. Best-effort:
      // if it fails (scope/permião), we fall back to project-count heuristics.
      let orgList = [];
      try {
        const orgRes = await fetch('/api/get-orgs');
        if (orgRes.ok) {
          orgList = await orgRes.json();
          setOrgs(orgList);
          if (orgList.length > 0) setSelectedOrg(orgList[0].id);
        }
      } catch { /* noop — create flow still usable if exactly one org context */ }

      // No projects yet → default the install flow straight into "create one".
      if (data.length === 0) setCreateMode(true);

    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  // Create a project on the user's behalf, then poll until it's healthy.
  const handleCreateProject = async () => {
    if (!selectedOrg && orgs.length > 0) {
      return showAlert('Selecciona una organización.', 'error');
    }
    setCreating(true);
    setProvisionStatus('provisioning');
    try {
      const res = await fetch('/api/create-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: selectedOrg, name: projectName, region }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Supabase rejected (commonly the free-tier 2-project limit).
        throw new Error(data?.message || data?.error || 'No se pudo crear el proyecto.');
      }
      const ref = data.project?.id || data.project?.ref;
      setCreatedProject({ ref, dbPass: data.dbPass });
      setSelectedProject(ref);

      // Poll status until ACTIVE_HEALTHY (or time out ~5 min).
      const deadline = Date.now() + 5 * 60 * 1000;
      for (;;) {
        await new Promise(r => setTimeout(r, 6000));
        let status = '';
        try {
          const sRes = await fetch(`/api/get-project-status?ref=${encodeURIComponent(ref)}`);
          const sData = await sRes.json().catch(() => ({}));
          status = sData?.status || '';
        } catch { /* transient — keep polling */ }
        if (status === 'ACTIVE_HEALTHY') { setProvisionStatus('ready'); break; }
        if (Date.now() > deadline) {
          throw new Error('La base de datos está tardando más de lo normal. Revisa el estado en Supabase y vuelve a intentar.');
        }
      }
    } catch (err) {
      setProvisionStatus('');
      setCreatedProject(null);
      showAlert(err.message, 'error');
    } finally {
      setCreating(false);
    }
  };

  // 3. The Grand Install Function
  const handleHolyGrailInstall = async (e) => {
    e.preventDefault();
    if (!selectedProject || !adminEmail || !adminPassword) {
      return showAlert("Por favor, llena todos los campos", "error");
    }
    // The PIN is interpolated into the seed SQL, so it must be 4-6 digits only
    // — this both enforces the format and prevents SQL injection.
    if (!/^\d{4,6}$/.test(adminPin)) {
      return showAlert("El PIN de administrador debe tener entre 4 y 6 dígitos.", "error");
    }

    setLoading(true);

    try {
      // --- STEP A: Fetch the Anon Key for the selected project ---
      setLoadingStep('Obteniendo credenciales seguras...');

      const keysRes = await fetch(`/api/get-keys?projectRef=${selectedProject}`);

      const keysData = await keysRes.json();
      console.log("Respuesta de API Keys:", keysData); // <--- NUEVO SNITCH

      if (!keysRes.ok) {
        // Now it will throw the actual Supabase error message!
        throw new Error(keysData.message || keysData.error || "No se pudieron obtener las credenciales");
      }

      const anonKeyObj = keysData.find(k => k.name === 'anon');
      const serviceRoleObj = keysData.find(k => k.name === 'service_role');
      if (!anonKeyObj || !serviceRoleObj) throw new Error("Llaves de API no encontradas");

      // selectedProject IS the project ref (used directly by get-keys/run-sql
      // above). Don't look it up in `projects` — a just-created project isn't in
      // that pre-fetched list, which yielded https://undefined.supabase.co.
      const projectRef = selectedProject;
      const projectUrl = `https://${projectRef}.supabase.co`;

      // --- STEP B: Install the schema (/api/install also locks sign-ups and deploys the Edge Functions) ---
      setLoadingStep('Instalando base de datos (Esto tomará unos segundos)...');

      const installRes = await fetch('/api/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectRef: selectedProject }),
      });
      const installData = await installRes.json().catch(() => ({}));
      if (!installRes.ok || installData.success === false) {
        throw new Error(installData.error || 'Falló la instalación de la base de datos');
      }

      // adminPin is validated as 4–6 digits above.
      const seedQuery = `
        UPDATE public.shop_settings SET menu_data = jsonb_set(jsonb_set(jsonb_set(menu_data,
          '{cashiers}', '[{"id": 1, "name": "Admin", "pin": "${adminPin}", "isAdmin": true}]'),
          '{posSettings,pinCode}', '"${adminPin}"'),
          '{posSettings,name}', '"tinypos"')
        WHERE id = 1;
        INSERT INTO public.cashier_pins (cashier_id, pin_hash)
        VALUES (0, crypt('${adminPin}', gen_salt('bf'))),
               (1, crypt('${adminPin}', gen_salt('bf')))
        ON CONFLICT (cashier_id) DO NOTHING;
      `;
      const sqlRes = await fetch(`/api/run-sql?projectRef=${selectedProject}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: seedQuery }),
      });
      const sqlData = await sqlRes.json().catch(() => ({}));
      if (!sqlRes.ok) throw new Error(sqlData.message || 'Falló la instalación de la base de datos');

      // --- STEP C: Create the Admin Auth User (GOD MODE) ---
      setLoadingStep('Creando usuario administrador...');

      // Burn-after-reading: the service_role key lives only in this closure.
      // We never write it to localStorage — daily POS operation must run on
      // the anon key alone. The Admin "Dispositivos" tab re-fetches a
      // short-lived PAT via OAuth each time it needs to provision hardware.
      const adminClient = createClient(projectUrl, serviceRoleObj.api_key);

      // Use the auth.admin namespace to bypass email confirmation
      const { error: authError } = await adminClient.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true
      });

      if (authError) throw new Error(`Error en Auth: ${authError.message}`);

      // Local→cloud upgrade only: sign in as the new admin (persisted session)
      // BEFORE reloading. The migration runs immediately on reload — before the
      // normal device-login gate — so without this it would write as the anon
      // role and be blocked by RLS. The normal new-store flow is unchanged: it
      // still routes through the device-login gate after reload.
      if (isUpgradePending()) {
        setLoadingStep('Preparando la migración de tus datos...');
        const sessionClient = createClient(projectUrl, anonKeyObj.api_key, {
          auth: { persistSession: true, autoRefreshToken: true },
        });
        const { error: signInErr } = await sessionClient.auth.signInWithPassword({
          email: adminEmail,
          password: adminPassword,
        });
        if (signInErr) throw new Error(`No se pudo iniciar sesión para migrar: ${signInErr.message}`);
      }

      // --- STEP D: Complete! Boot the app ---
      setLoadingStep('¡Todo listo! Arrancando tinypos...');

      // Wait a moment for UX
      await new Promise(r => setTimeout(r, 1000));

      // Pass the new keys to App.jsx to save and boot
      onComplete(projectUrl, anonKeyObj.api_key);

    } catch (err) {
      console.error(err);
      showAlert(err.message, 'error');
    } finally {
      clearMgmtToken();
      setLoading(false);
      setLoadingStep('');
    }
  };


  const handleStandardConnect = async (e) => {
    e.preventDefault();
    if (!selectedProject) {
      return showAlert("Por favor selecciona un proyecto", "error");
    }

    setLoading(true);
    setLoadingStep('Obteniendo credenciales del dispositivo...');

    try {
      // We reuse the exact same proxy we built for the installation!
      const keysRes = await fetch(`/api/get-keys?projectRef=${selectedProject}`);

      const keysData = await keysRes.json();
      if (!keysRes.ok) throw new Error("No se pudieron obtener las credenciales");
      
      const anonKeyObj = keysData.find(k => k.name === 'anon');
      if (!anonKeyObj) throw new Error("Llave anónima no encontrada");

      // Burn-after-reading: we do NOT persist service_role to localStorage.
      // Device provisioning re-authorizes via OAuth on demand from the
      // Admin "Dispositivos" tab.

      // Calculate the Project URL — selectedProject is already the ref.
      const projectRef = selectedProject;
      const projectUrl = `https://${projectRef}.supabase.co`;

      // Pass the keys back to App.jsx so it saves them to localStorage and reloads!
      onComplete(projectUrl, anonKeyObj.api_key);

    } catch (err) {
      console.error(err);
      showAlert(err.message, 'error');
    } finally {
      clearMgmtToken();
      setLoading(false);
      setLoadingStep('');
    }
  };

  // ==========================================
  // RENDER UI
  // ==========================================

  // --- STYLE TOKENS ---
  const styles = {
    page: {
      display: 'flex',
      minHeight: '100dvh',
      height: '100dvh',
      backgroundColor: 'var(--bg-app)',
      justifyContent: 'center',
      // flex-start + margin:auto on the card centers it when it fits and lets the
      // page scroll when it's taller than the viewport (centering alone clips the
      // top in flexbox). overflowY makes the whole page a scroll area.
      alignItems: 'flex-start',
      overflowY: 'auto',
      WebkitOverflowScrolling: 'touch',
      fontFamily: 'var(--font-main, system-ui)',
      padding: '20px',
      boxSizing: 'border-box',
    },
    card: {
      background: 'var(--bg-surface)',
      padding: '40px',
      borderRadius: '24px',
      width: '100%',
      maxWidth: '440px',
      margin: 'auto',
      boxShadow: '0 20px 50px rgba(0,0,0,0.18)',
      border: '1px solid var(--border)',
      position: 'relative',
    },
    backBtn: {
      background: 'transparent',
      border: 'none',
      color: 'var(--text-muted)',
      cursor: 'pointer',
      marginBottom: '24px',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '6px 10px',
      borderRadius: '8px',
      fontSize: '0.9rem',
      fontWeight: 600,
      transition: 'background 0.15s ease, color 0.15s ease',
    },
    iconBubble: {
      width: '72px',
      height: '72px',
      background: 'rgba(242, 139, 5, 0.12)',
      color: 'var(--brand-color)',
      borderRadius: '20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '2.2rem',
      margin: '0 auto 16px',
    },
    title: {
      margin: '0 0 8px 0',
      color: 'var(--text-main)',
      fontSize: '1.6rem',
      fontWeight: 800,
      textAlign: 'center',
      letterSpacing: '-0.01em',
    },
    subtitle: {
      color: 'var(--text-muted)',
      margin: 0,
      fontSize: '0.95rem',
      textAlign: 'center',
      lineHeight: 1.5,
    },
    label: {
      fontWeight: 700,
      color: 'var(--text-main)',
      fontSize: '0.85rem',
      display: 'block',
      marginBottom: '8px',
    },
    inputWrap: { position: 'relative' },
    inputIcon: {
      position: 'absolute',
      left: '14px',
      top: '50%',
      transform: 'translateY(-50%)',
      color: 'var(--text-muted)',
      fontSize: '1.1rem',
      pointerEvents: 'none',
    },
    input: {
      width: '100%',
      padding: '13px 14px 13px 42px',
      borderRadius: '12px',
      border: '1px solid var(--border)',
      background: 'var(--bg-main)',
      color: 'var(--text-main)',
      fontSize: '1rem',
      boxSizing: 'border-box',
      outline: 'none',
      transition: 'border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease',
    },
    select: {
      width: '100%',
      padding: '13px 14px 13px 42px',
      borderRadius: '12px',
      border: '1px solid var(--border)',
      background: 'var(--bg-main)',
      color: 'var(--text-main)',
      fontSize: '1rem',
      boxSizing: 'border-box',
      outline: 'none',
      appearance: 'none',
      cursor: 'pointer',
      transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
    },
    stepCard: {
      background: 'var(--bg-main)',
      padding: '18px',
      borderRadius: '16px',
      border: '1px solid var(--border)',
    },
    stepHeader: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      marginBottom: '12px',
    },
    stepBadge: {
      width: '26px',
      height: '26px',
      borderRadius: '50%',
      background: 'var(--brand-color)',
      color: '#fff',
      fontSize: '0.8rem',
      fontWeight: 800,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    primaryBtn: {
      padding: '16px',
      background: 'var(--brand-color)',
      color: '#fff',
      border: 'none',
      borderRadius: '14px',
      cursor: 'pointer',
      fontWeight: 700,
      fontSize: '1.05rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '10px',
      boxShadow: '0 8px 24px rgba(242, 139, 5, 0.35)',
      transition: 'box-shadow 0.2s ease, transform 0.05s ease, opacity 0.2s ease',
    },
    warnBox: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '12px 14px',
      background: 'rgba(231, 76, 60, 0.08)',
      border: '1px solid rgba(231, 76, 60, 0.25)',
      borderRadius: '10px',
      color: 'var(--color-danger)',
      fontSize: '0.85rem',
      lineHeight: 1.4,
    },
    successBtn: {
      padding: '16px',
      background: 'var(--brand-color)',
      color: '#fff',
      border: 'none',
      borderRadius: '14px',
      cursor: 'pointer',
      fontWeight: 700,
      fontSize: '1.05rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '10px',
      boxShadow: '0 8px 22px rgba(242, 139, 5, 0.3)',
      transition: 'box-shadow 0.2s ease, opacity 0.2s ease',
    },
    helperText: {
      fontSize: '0.8rem',
      color: 'var(--text-muted)',
      margin: '0 0 12px 0',
      lineHeight: 1.45,
    },
  };

  const isFullScreenLoading = loading && (loadingStep || isConnectingExisting);

  return (
    <>
      {/* Local style block — pseudo-selectors and keyframes can't be inlined */}
      <style>{`
        .setup-input:focus,
        .setup-select:focus {
          border-color: var(--brand-color) !important;
          box-shadow: 0 0 0 4px rgba(242, 139, 5, 0.15);
          background: var(--bg-surface) !important;
        }
        .setup-back:hover {
          background: var(--bg-main);
          color: var(--text-main);
        }
        .setup-cta-supabase {
          position: relative;
          overflow: hidden;
        }
        .setup-cta-supabase::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          box-shadow: 0 0 0 0 rgba(62, 179, 112, 0.55);
          animation: setup-pulse 2.2s ease-out infinite;
          pointer-events: none;
        }
        .setup-cta-supabase:hover {
          box-shadow: 0 14px 32px rgba(62, 179, 112, 0.45);
        }
        @keyframes setup-pulse {
          0%   { box-shadow: 0 0 0 0   rgba(62, 179, 112, 0.55); }
          70%  { box-shadow: 0 0 0 18px rgba(62, 179, 112, 0);   }
          100% { box-shadow: 0 0 0 0   rgba(62, 179, 112, 0);    }
        }
        @keyframes setup-text-pulse {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 1; }
        }
        .setup-loading-text {
          animation: setup-text-pulse 1.6s ease-in-out infinite;
        }
        @keyframes setup-toast-in {
          from { opacity: 0; transform: translate(-50%, -12px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
        .setup-toast {
          animation: setup-toast-in 0.25s ease-out both;
        }
        .setup-primary-cta:hover {
          box-shadow: 0 12px 30px rgba(242, 139, 5, 0.45);
        }
        .setup-success-cta:hover {
          box-shadow: 0 12px 30px rgba(242, 139, 5, 0.45);
        }
        .setup-primary-cta:disabled,
        .setup-success-cta:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }
      `}</style>

      <div style={styles.page}>
        <div className="fade-in" style={styles.card}>

          {/* --- TOAST ALERT --- */}
          {customAlert.show && (
            <div
              className="setup-toast"
              style={{
                position: 'absolute',
                top: '-14px',
                left: '50%',
                transform: 'translateX(-50%)',
                minWidth: '260px',
                maxWidth: '90%',
                padding: '12px 16px',
                background: customAlert.type === 'error' ? 'var(--color-danger)' : 'var(--color-success)',
                color: '#fff',
                borderRadius: '12px',
                boxShadow: '0 12px 28px rgba(0,0,0,0.18)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '0.9rem',
                fontWeight: 600,
                zIndex: 10,
              }}
            >
              <Icon
                icon={customAlert.type === 'error' ? 'lucide:alert-triangle' : 'lucide:check-circle-2'}
                width="18"
              />
              <span style={{ flex: 1 }}>{customAlert.message}</span>
            </div>
          )}

          {/* --- BACK BUTTON --- */}
          <button
            type="button"
            onClick={onBack}
            className="setup-back"
            style={styles.backBtn}
          >
            <Icon icon="lucide:arrow-left" /> Volver
          </button>

          {/* --- FULL-SCREEN LOADING VIEW --- */}
          {isFullScreenLoading ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '24px',
              padding: '40px 8px 16px',
              textAlign: 'center',
            }}>
              <div className="spinner" />
              <div>
                <h3 style={{
                  margin: '0 0 6px 0',
                  color: 'var(--text-main)',
                  fontSize: '1.15rem',
                  fontWeight: 700,
                }}>
                  Trabajando…
                </h3>
                <p
                  className="setup-loading-text"
                  style={{
                    margin: 0,
                    color: 'var(--text-muted)',
                    fontSize: '0.95rem',
                    minHeight: '1.2em',
                  }}
                >
                  {loadingStep || 'Un momento…'}
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* --- HEADER --- */}
              <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                <div style={styles.iconBubble}>
                  <Icon icon={isConnectingExisting ? 'lucide:plug-zap' : 'lucide:sparkles'} />
                </div>
                <h2 style={styles.title}>
                  {isConnectingExisting ? 'Vincular Dispositivo' : 'Instalación Automática'}
                </h2>
                <p style={styles.subtitle}>
                  {isConnectingExisting
                    ? 'Autoriza con Supabase y elige el proyecto existente al que quieres vincular este dispositivo.'
                    : 'Autoriza a tinypos y configuraremos tu base de datos en segundos.'}
                </p>
              </div>

              {/* --- SCENARIO A: PRE-OAUTH (both modes need the token) --- */}
              {!authorized && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  <div style={{
                    background: 'var(--bg-main)',
                    border: '1px solid var(--border)',
                    borderRadius: '14px',
                    padding: '14px 16px',
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'flex-start',
                  }}>
                    <Icon icon="lucide:shield-check" style={{ color: 'var(--color-success)', fontSize: '1.3rem', marginTop: '2px', flexShrink: 0 }} />
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.5 }}>
                      {isConnectingExisting
                        ? 'Conexión segura. tinypos sólo leerá las llaves del proyecto que elijas — no modificará tu base de datos.'
                        : 'Conexión segura. tinypos sólo solicitará los permisos mínimos para crear las tablas necesarias.'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      // Stash the current mode so the post-OAuth return into App.jsx
                      // can restore 'connect' vs 'new' instead of always defaulting to 'new'.
                      try { sessionStorage.setItem('tinypos_setup_mode', initialMode); } catch { /* noop */ }

                      // /api/auth/start owns the whole handshake now: it
                      // mints a random state and a PKCE verifier into
                      // HttpOnly cookies, picks this flow's scopes, and
                      // redirects on to Supabase. Without that state, a
                      // crafted callback link could plant an attacker's
                      // Management token in the owner's browser and have the
                      // POS installed into the attacker's project.
                      window.location.href = '/api/auth/start?flow=install';
                    }}
                    className="setup-cta-supabase"
                    style={{
                      padding: '18px',
                      background: 'var(--brand-color)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '14px',
                      cursor: 'pointer',
                      fontWeight: 700,
                      fontSize: '1.05rem',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: '10px',
                      boxShadow: '0 10px 28px rgba(242, 139, 5, 0.4)',
                      transition: 'box-shadow 0.2s ease',
                    }}
                  >
                    <Icon icon="mdi:database-sync" width="22" />
                    Conectar con Supabase
                  </button>

                  {onShowGuide && (
                    <button
                      type="button"
                      onClick={onShowGuide}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        fontSize: '0.88rem',
                        textDecoration: 'underline',
                        padding: '4px',
                      }}
                    >
                      ¿No tienes una cuenta de Supabase?
                    </button>
                  )}
                </div>
              )}

              {/* --- SCENARIO B: POST-OAUTH — install (new) OR link (connect) --- */}
              {authorized && (
                <form
                  onSubmit={isConnectingExisting ? handleStandardConnect : handleHolyGrailInstall}
                  style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
                >

                  {/* Step indicator (install flow only) */}
                  {!isConnectingExisting && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '4px' }}>
                      {[1, 2].map((s) => (
                        <span key={s} style={{ width: '32px', height: '5px', borderRadius: '3px', background: installStep >= s ? 'var(--brand-color)' : 'var(--border)' }} />
                      ))}
                    </div>
                  )}

                  {/* Step 1 — Project */}
                  {(isConnectingExisting || installStep === 1) && (
                  <div style={styles.stepCard}>
                    <div style={styles.stepHeader}>
                      <div style={styles.stepBadge}>1</div>
                      <label style={{ ...styles.label, marginBottom: 0 }}>Selecciona tu Proyecto</label>
                    </div>

                    {(() => {
                      const selectDropdown = (
                        <div style={styles.inputWrap}>
                          <Icon icon="lucide:database" style={styles.inputIcon} />
                          <select
                            className="setup-select"
                            value={selectedProject}
                            onChange={e => setSelectedProject(e.target.value)}
                            required
                            style={{
                              ...styles.select,
                              backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'%3e%3cpath d='M1 1.5L6 6.5L11 1.5' stroke='%236b7280' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3e%3c/svg%3e")`,
                              backgroundRepeat: 'no-repeat',
                              backgroundPosition: 'right 16px center',
                              paddingRight: '42px',
                            }}
                          >
                            <option value="" disabled>Selecciona un proyecto...</option>
                            {projects.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                      );

                      // Connecting an existing device: always pick a project (no create).
                      if (isConnectingExisting) {
                        return projects.length === 0 ? (
                          <div style={styles.warnBox}>
                            <Icon icon="lucide:alert-circle" width="18" />
                            <span>No se encontraron proyectos en esta cuenta.</span>
                          </div>
                        ) : selectDropdown;
                      }

                      // After creation: show the generated DB password + provisioning state.
                      if (createdProject) {
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ background: 'rgba(241, 196, 15, 0.1)', border: '1px solid rgba(241, 196, 15, 0.35)', borderRadius: '12px', padding: '14px' }}>
                              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#b8860b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Contraseña de la base de datos</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <code style={{ flex: 1, fontFamily: 'ui-monospace, monospace', fontSize: '0.95rem', color: 'var(--text-main)', wordBreak: 'break-all' }}>{createdProject.dbPass}</code>
                                <button type="button" onClick={() => { navigator.clipboard?.writeText(createdProject.dbPass); setDbPassCopied(true); setTimeout(() => setDbPassCopied(false), 1500); }} style={{ border: '1px solid var(--border)', background: 'var(--bg-surface)', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-main)' }}>
                                  <Icon icon={dbPassCopied ? 'lucide:check' : 'lucide:copy'} /> {dbPassCopied ? 'Copiado' : 'Copiar'}
                                </button>
                              </div>
                              <div style={{ fontSize: '0.8rem', color: '#b8860b', marginTop: '8px' }}>Guárdala en un lugar seguro. No la mostraremos de nuevo y la necesitarías para acceso directo a la base de datos.</div>
                            </div>
                            {provisionStatus === 'ready' ? (
                              <div style={{ ...styles.warnBox, background: 'rgba(39, 174, 96, 0.08)', border: '1px solid rgba(39, 174, 96, 0.3)', color: 'var(--color-success)' }}>
                                <Icon icon="lucide:check-circle-2" width="18" />
                                <span>Tu base de datos está lista. Continúa con tu cuenta de administrador.</span>
                              </div>
                            ) : (
                              <div style={{ ...styles.warnBox, background: 'rgba(52, 152, 219, 0.08)', border: '1px solid rgba(52, 152, 219, 0.25)', color: 'var(--text-main)' }}>
                                <Icon icon="lucide:loader-2" width="18" style={{ animation: 'spin 1s linear infinite' }} />
                                <span>Supabase está creando tu base de datos (~2 min). Deja esta pantalla abierta.</span>
                              </div>
                            )}
                          </div>
                        );
                      }

                      // Create-project form (no projects yet, or user chose to create).
                      if (createMode) {
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {orgs.length > 1 && (
                              <div style={styles.inputWrap}>
                                <Icon icon="lucide:building" style={styles.inputIcon} />
                                <select className="setup-select" value={selectedOrg} onChange={e => setSelectedOrg(e.target.value)} style={{ ...styles.select, paddingRight: '42px' }}>
                                  {orgs.map(o => (<option key={o.id} value={o.id}>{o.name}</option>))}
                                </select>
                              </div>
                            )}
                            <div style={styles.inputWrap}>
                              <Icon icon="lucide:tag" style={styles.inputIcon} />
                              <input className="setup-input" type="text" placeholder="Nombre del proyecto" value={projectName} onChange={e => setProjectName(e.target.value.slice(0, 40))} style={styles.input} />
                            </div>
                            <div style={styles.inputWrap}>
                              <Icon icon="lucide:globe" style={styles.inputIcon} />
                              <select className="setup-select" value={region} onChange={e => setRegion(e.target.value)} style={{ ...styles.select, paddingRight: '42px' }}>
                                {REGIONS.map(r => (<option key={r.value} value={r.value}>{r.label}</option>))}
                              </select>
                            </div>
                            {atFreeLimit && (
                              <div style={{ ...styles.warnBox, background: 'rgba(241, 196, 15, 0.1)', border: '1px solid rgba(241, 196, 15, 0.35)', color: '#b8860b' }}>
                                <Icon icon="lucide:alert-triangle" width="18" style={{ flexShrink: 0 }} />
                                <span>Ya tienes 2 proyectos activos (límite del plan gratuito). Supabase no creará otro hasta que pauses uno en tu panel o subas a Pro.</span>
                              </div>
                            )}
                            <button type="button" onClick={handleCreateProject} disabled={creating} className="setup-primary-cta" style={{ ...styles.primaryBtn, opacity: creating ? 0.7 : 1 }}>
                              <Icon icon={creating ? 'lucide:loader-2' : 'lucide:plus'} style={{ animation: creating ? 'spin 1s linear infinite' : 'none' }} width="18" />
                              <span>{creating ? 'Creando…' : 'Crear proyecto'}</span>
                            </button>
                            {projects.length > 0 && (
                              <button type="button" onClick={() => setCreateMode(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline', padding: '4px' }}>
                                Usar un proyecto existente
                              </button>
                            )}
                          </div>
                        );
                      }

                      // Default: select an existing project, with a create fallback.
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {selectDropdown}
                          <button type="button" onClick={() => setCreateMode(true)} style={{ background: 'transparent', border: 'none', color: 'var(--brand-color)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, textDecoration: 'underline', padding: '4px', alignSelf: 'flex-start' }}>
                            + Crear un nuevo proyecto
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                  )}

                  {/* Step 2 — Admin (install flow, second step) */}
                  {!isConnectingExisting && installStep === 2 && (
                  <div style={styles.stepCard}>
                    <div style={styles.stepHeader}>
                      <div style={styles.stepBadge}>2</div>
                      <label style={{ ...styles.label, marginBottom: 0 }}>Crea tu cuenta de Administrador</label>
                    </div>
                    <p style={styles.helperText}>
                      Esta será tu llave maestra (RLS) para entrar al sistema.
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={styles.inputWrap}>
                        <Icon icon="lucide:mail" style={styles.inputIcon} />
                        <input
                          className="setup-input"
                          type="email"
                          placeholder="Correo electrónico"
                          value={adminEmail}
                          onChange={e => setAdminEmail(e.target.value)}
                          required
                          style={styles.input}
                        />
                      </div>
                      <div style={styles.inputWrap}>
                        <Icon icon="lucide:lock" style={styles.inputIcon} />
                        <input
                          className="setup-input"
                          type="password"
                          placeholder="Contraseña segura"
                          value={adminPassword}
                          onChange={e => setAdminPassword(e.target.value)}
                          required
                          style={styles.input}
                        />
                      </div>
                      <div style={styles.inputWrap}>
                        <Icon icon="lucide:shield" style={styles.inputIcon} />
                        <input
                          className="setup-input"
                          type={showPin ? 'text' : 'password'}
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder="PIN de administrador (4-6 dígitos)"
                          value={adminPin}
                          onChange={e => setAdminPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          required
                          style={{ ...styles.input, paddingRight: '44px' }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPin(v => !v)}
                          aria-label={showPin ? 'Ocultar PIN' : 'Mostrar PIN'}
                          style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px', display: 'flex' }}
                        >
                          <Icon icon={showPin ? 'lucide:eye-off' : 'lucide:eye'} />
                        </button>
                      </div>
                    </div>
                    <p style={styles.helperText}>
                      El PIN desbloquea la caja y el panel. {isUpgradePending() ? 'Se rellenó con tu PIN local para que conserves el mismo.' : ''}
                    </p>
                  </div>
                  )}

                  {(() => {
                    const projectReady = selectedProject
                      && !(createdProject && provisionStatus !== 'ready')
                      && !(createMode && !createdProject);

                    // Install flow, step 1 → advance to admin step (no submit yet).
                    if (!isConnectingExisting && installStep === 1) {
                      return (
                        <button
                          type="button"
                          onClick={() => { if (projectReady) { setInstallStep(2); } }}
                          disabled={loading || !projectReady}
                          className="setup-success-cta"
                          style={{ ...styles.successBtn, marginTop: '4px' }}
                        >
                          <Icon icon="lucide:arrow-right" width="20" />
                          <span>Continuar</span>
                        </button>
                      );
                    }

                    // Install flow, step 2 → submit + back.
                    if (!isConnectingExisting && installStep === 2) {
                      return (
                        <>
                          <button type="submit" disabled={loading} className="setup-success-cta" style={{ ...styles.successBtn, marginTop: '4px' }}>
                            <Icon icon="lucide:rocket" width="20" />
                            <span>Instalar tinypos</span>
                          </button>
                          {!loading && (
                            <button type="button" onClick={() => setInstallStep(1)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '6px' }}>
                              <Icon icon="lucide:arrow-left" /> Volver
                            </button>
                          )}
                        </>
                      );
                    }

                    // Connect-existing flow → single submit.
                    return (
                      <button type="submit" disabled={loading || !selectedProject} className="setup-success-cta" style={{ ...styles.successBtn, marginTop: '4px' }}>
                        <Icon icon="lucide:log-in" width="20" />
                        <span>Acceder a tinypos</span>
                      </button>
                    );
                  })()}
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
