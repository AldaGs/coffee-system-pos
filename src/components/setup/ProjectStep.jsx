import { Icon } from '@iconify/react';
import { useFlash } from '../../hooks/useFlash';
import { REGIONS, styles } from './setupStyles';

const CHEVRON = `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'%3e%3cpath d='M1 1.5L6 6.5L11 1.5' stroke='%236b7280' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3e%3c/svg%3e")`;
const linkBtn = { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline', padding: '4px' };

// Step 1: pick an existing project or create one. Connecting a device only picks.
export default function ProjectStep({ isConnecting, p }) {
  return (
    <div style={styles.stepCard}>
      <div style={styles.stepHeader}>
        <div style={styles.stepBadge}>1</div>
        <label style={{ ...styles.label, marginBottom: 0 }}>Selecciona tu Proyecto</label>
      </div>
      <ProjectBody isConnecting={isConnecting} p={p} />
    </div>
  );
}

function ProjectBody({ isConnecting, p }) {
  if (isConnecting) {
    return p.projects.length === 0 ? (
      <div style={styles.warnBox}>
        <Icon icon="lucide:alert-circle" width="18" />
        <span>No se encontraron proyectos en esta cuenta.</span>
      </div>
    ) : <ProjectSelect p={p} />;
  }
  if (p.createdProject) return <CreatedProject createdProject={p.createdProject} ready={p.provisionStatus === 'ready'} />;
  if (p.createMode) return <CreateProjectForm p={p} />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <ProjectSelect p={p} />
      <button type="button" onClick={() => p.setCreateMode(true)} style={{ ...linkBtn, color: 'var(--brand-color)', fontWeight: 700, alignSelf: 'flex-start' }}>
        + Crear un nuevo proyecto
      </button>
    </div>
  );
}

function ProjectSelect({ p }) {
  return (
    <div style={styles.inputWrap}>
      <Icon icon="lucide:database" style={styles.inputIcon} />
      <select
        className="setup-select"
        value={p.selectedProject}
        onChange={(e) => p.setSelectedProject(e.target.value)}
        required
        style={{ ...styles.select, backgroundImage: CHEVRON, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 16px center', paddingRight: '42px' }}
      >
        <option value="" disabled>Selecciona un proyecto...</option>
        {p.projects.map((proj) => <option key={proj.id} value={proj.id}>{proj.name}</option>)}
      </select>
    </div>
  );
}

// Shows the generated database password once, while Supabase provisions the project.
function CreatedProject({ createdProject, ready }) {
  const [copied, flashCopied] = useFlash(1500);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ background: 'rgba(241, 196, 15, 0.1)', border: '1px solid rgba(241, 196, 15, 0.35)', borderRadius: '12px', padding: '14px' }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#b8860b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Contraseña de la base de datos</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <code style={{ flex: 1, fontFamily: 'ui-monospace, monospace', fontSize: '0.95rem', color: 'var(--text-main)', wordBreak: 'break-all' }}>{createdProject.dbPass}</code>
          <button type="button" onClick={() => { navigator.clipboard?.writeText(createdProject.dbPass); flashCopied(); }} style={{ border: '1px solid var(--border)', background: 'var(--bg-surface)', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-main)' }}>
            <Icon icon={copied ? 'lucide:check' : 'lucide:copy'} /> {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
        <div style={{ fontSize: '0.8rem', color: '#b8860b', marginTop: '8px' }}>Guárdala en un lugar seguro. No la mostraremos de nuevo y la necesitarías para acceso directo a la base de datos.</div>
      </div>
      {ready ? (
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

function CreateProjectForm({ p }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {p.orgs.length > 1 && (
        <div style={styles.inputWrap}>
          <Icon icon="lucide:building" style={styles.inputIcon} />
          <select className="setup-select" value={p.selectedOrg} onChange={(e) => p.setSelectedOrg(e.target.value)} style={{ ...styles.select, paddingRight: '42px' }}>
            {p.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      )}
      <div style={styles.inputWrap}>
        <Icon icon="lucide:tag" style={styles.inputIcon} />
        <input className="setup-input" type="text" placeholder="Nombre del proyecto" value={p.projectName} onChange={(e) => p.setProjectName(e.target.value.slice(0, 40))} style={styles.input} />
      </div>
      <div style={styles.inputWrap}>
        <Icon icon="lucide:globe" style={styles.inputIcon} />
        <select className="setup-select" value={p.region} onChange={(e) => p.setRegion(e.target.value)} style={{ ...styles.select, paddingRight: '42px' }}>
          {REGIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>
      {p.atFreeLimit && (
        <div style={{ ...styles.warnBox, background: 'rgba(241, 196, 15, 0.1)', border: '1px solid rgba(241, 196, 15, 0.35)', color: '#b8860b' }}>
          <Icon icon="lucide:alert-triangle" width="18" style={{ flexShrink: 0 }} />
          <span>Ya tienes 2 proyectos activos (límite del plan gratuito). Supabase no creará otro hasta que pauses uno en tu panel o subas a Pro.</span>
        </div>
      )}
      <button type="button" onClick={p.handleCreateProject} disabled={p.creating} className="setup-primary-cta" style={{ ...styles.primaryBtn, opacity: p.creating ? 0.7 : 1 }}>
        <Icon icon={p.creating ? 'lucide:loader-2' : 'lucide:plus'} style={{ animation: p.creating ? 'spin 1s linear infinite' : 'none' }} width="18" />
        <span>{p.creating ? 'Creando…' : 'Crear proyecto'}</span>
      </button>
      {p.projects.length > 0 && (
        <button type="button" onClick={() => p.setCreateMode(false)} style={{ ...linkBtn, color: 'var(--text-muted)' }}>
          Usar un proyecto existente
        </button>
      )}
    </div>
  );
}
