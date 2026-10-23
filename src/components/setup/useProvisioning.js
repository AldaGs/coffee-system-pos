import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { isUpgradePending } from '../../utils/appMode';
import { useFlash } from '../../hooks/useFlash';

// The Management token lives in an HttpOnly cookie set by /api/auth/callback;
// drop it as soon as a setup flow ends instead of waiting for it to expire.
function clearMgmtToken() {
  try { fetch('/api/supabase?op=clear', { method: 'POST' }).catch(() => {}); } catch { /* noop */ }
}

const NO_ALERT = { show: false, message: '', type: '' };
const projectUrlFor = (ref) => `https://${ref}.supabase.co`;

async function fetchKeys(projectRef) {
  const res = await fetch(`/api/get-keys?projectRef=${projectRef}`);
  const keys = await res.json();
  if (!res.ok) throw new Error(keys.message || keys.error || 'No se pudieron obtener las credenciales');
  return { anon: keys.find((k) => k.name === 'anon'), serviceRole: keys.find((k) => k.name === 'service_role') };
}

// Everything behind the setup screen: Supabase OAuth, picking or creating a
// project, installing the schema, and creating the admin account.
export function useProvisioning({ onComplete }) {
  // OAuth sends the user back here with a non-secret ?oauth= marker.
  const [authorized] = useState(() => !!new URLSearchParams(window.location.search).get('oauth'));
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [orgs, setOrgs] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState('');
  const [region, setRegion] = useState('us-east-1');
  const [projectName, setProjectName] = useState('tinypos');
  const [createMode, setCreateMode] = useState(false);
  const [creating, setCreating] = useState(false);
  const [provisionStatus, setProvisionStatus] = useState(''); // '', 'provisioning', 'ready'
  const [createdProject, setCreatedProject] = useState(null); // { ref, dbPass }

  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  // Seeds the cloud PINs; a local→cloud upgrade pre-fills the owner's local PIN.
  const [adminPin, setAdminPin] = useState('');

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [alert, flashAlert] = useFlash(4000, NO_ALERT);
  const showAlert = useCallback((message, type = 'error') => flashAlert({ show: true, message, type }), [flashAlert]);

  const finish = () => {
    clearMgmtToken();
    setLoading(false);
    setLoadingStep('');
  };

  useEffect(() => {
    if (!isUpgradePending()) return;
    let alive = true;
    import('../../utils/localAuth')
      .then(({ getLocalMasterPin }) => getLocalMasterPin())
      .then((pin) => { if (alive && pin) setAdminPin(String(pin)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setLoadingStep('Buscando tus proyectos...');
    try {
      const res = await fetch('/api/get-projects');
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Error fetching projects');
      setProjects(data);
      if (data.length > 0) setSelectedProject(data[0].id);

      // Best effort: without orgs, the create flow still works for a single org.
      try {
        const orgRes = await fetch('/api/get-orgs');
        if (orgRes.ok) {
          const orgList = await orgRes.json();
          setOrgs(orgList);
          if (orgList.length > 0) setSelectedOrg(orgList[0].id);
        }
      } catch { /* noop */ }

      if (data.length === 0) setCreateMode(true);
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  }, [showAlert]);

  useEffect(() => {
    if (!authorized) return;
    window.history.replaceState({}, document.title, '/');
    fetchProjects();
  }, [authorized, fetchProjects]);

  // The free tier allows 2 active projects per org.
  const orgProjectCount = orgs.length ? projects.filter((p) => p.organization_id === selectedOrg).length : projects.length;
  const atFreeLimit = orgProjectCount >= 2;

  // Creates the project, then polls until Supabase reports it healthy (~5 min max).
  const handleCreateProject = async () => {
    if (!selectedOrg && orgs.length > 0) return showAlert('Selecciona una organización.', 'error');
    setCreating(true);
    setProvisionStatus('provisioning');
    try {
      const res = await fetch('/api/create-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: selectedOrg, name: projectName, region }),
      });
      const data = await res.json().catch(() => ({}));
      // Usually the free-tier 2-project limit.
      if (!res.ok) throw new Error(data?.message || data?.error || 'No se pudo crear el proyecto.');
      const ref = data.project?.id || data.project?.ref;
      setCreatedProject({ ref, dbPass: data.dbPass });
      setSelectedProject(ref);

      const deadline = Date.now() + 5 * 60 * 1000;
      for (;;) {
        await new Promise((r) => setTimeout(r, 6000));
        let status = '';
        try {
          const sRes = await fetch(`/api/get-project-status?ref=${encodeURIComponent(ref)}`);
          status = (await sRes.json().catch(() => ({})))?.status || '';
        } catch { /* transient; keep polling */ }
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

  const handleInstall = async (e) => {
    e.preventDefault();
    if (!selectedProject || !adminEmail || !adminPassword) return showAlert('Por favor, llena todos los campos', 'error');
    // The PIN goes into the seed SQL, so digits only (this is also the injection guard).
    if (!/^\d{4,6}$/.test(adminPin)) return showAlert('El PIN de administrador debe tener entre 4 y 6 dígitos.', 'error');

    setLoading(true);
    try {
      setLoadingStep('Obteniendo credenciales seguras...');
      const { anon, serviceRole } = await fetchKeys(selectedProject);
      if (!anon || !serviceRole) throw new Error('Llaves de API no encontradas');
      // selectedProject is the ref; a just-created project isn't in `projects`.
      const projectUrl = projectUrlFor(selectedProject);

      // /api/install also turns off public sign-ups and deploys the Edge Functions.
      setLoadingStep('Instalando base de datos (Esto tomará unos segundos)...');
      const installRes = await fetch('/api/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectRef: selectedProject }),
      });
      const installData = await installRes.json().catch(() => ({}));
      if (!installRes.ok || installData.success === false) throw new Error(installData.error || 'Falló la instalación de la base de datos');

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

      // The service_role key lives only in this closure; day-to-day the POS runs on the anon key.
      setLoadingStep('Creando usuario administrador...');
      const adminClient = createClient(projectUrl, serviceRole.api_key);
      const { error: authError } = await adminClient.auth.admin.createUser({
        email: adminEmail, password: adminPassword, email_confirm: true,
      });
      if (authError) throw new Error(`Error en Auth: ${authError.message}`);

      // A local→cloud upgrade migrates data right after reload, before the device
      // login, so it needs the admin's session or RLS blocks the writes.
      if (isUpgradePending()) {
        setLoadingStep('Preparando la migración de tus datos...');
        const sessionClient = createClient(projectUrl, anon.api_key, { auth: { persistSession: true, autoRefreshToken: true } });
        const { error: signInErr } = await sessionClient.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
        if (signInErr) throw new Error(`No se pudo iniciar sesión para migrar: ${signInErr.message}`);
      }

      setLoadingStep('¡Todo listo! Arrancando tinypos...');
      onComplete(projectUrl, anon.api_key);
    } catch (err) {
      console.error(err);
      showAlert(err.message, 'error');
    } finally {
      finish();
    }
  };

  // Links this device to an existing store: only the anon key is kept.
  const handleConnect = async (e) => {
    e.preventDefault();
    if (!selectedProject) return showAlert('Por favor selecciona un proyecto', 'error');
    setLoading(true);
    setLoadingStep('Obteniendo credenciales del dispositivo...');
    try {
      const { anon } = await fetchKeys(selectedProject).catch(() => { throw new Error('No se pudieron obtener las credenciales'); });
      if (!anon) throw new Error('Llave anónima no encontrada');
      onComplete(projectUrlFor(selectedProject), anon.api_key);
    } catch (err) {
      console.error(err);
      showAlert(err.message, 'error');
    } finally {
      finish();
    }
  };

  return {
    authorized, projects, selectedProject, setSelectedProject,
    orgs, selectedOrg, setSelectedOrg, region, setRegion, projectName, setProjectName,
    createMode, setCreateMode, creating, provisionStatus, createdProject, atFreeLimit, handleCreateProject,
    adminEmail, setAdminEmail, adminPassword, setAdminPassword, adminPin, setAdminPin,
    loading, loadingStep, alert, handleInstall, handleConnect,
  };
}
