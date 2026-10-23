import { useState } from 'react';
import { Icon } from '@iconify/react';
import { useProvisioning } from './setup/useProvisioning';
import { SETUP_CSS, styles } from './setup/setupStyles';
import AuthorizeStep from './setup/AuthorizeStep';
import ProjectStep from './setup/ProjectStep';
import AdminStep from './setup/AdminStep';

// Cloud setup: a new install (pick/create project → admin account) or linking
// this device to an existing store (pick project). Both start with Supabase OAuth.
export default function SetupScreen({ initialMode, onBack, onComplete, onShowGuide }) {
  const isConnecting = initialMode === 'connect';
  const p = useProvisioning({ onComplete });
  const [installStep, setInstallStep] = useState(1); // 1 = project, 2 = admin

  const isFullScreenLoading = p.loading && (p.loadingStep || isConnecting);
  const projectReady = p.selectedProject
    && !(p.createdProject && p.provisionStatus !== 'ready')
    && !(p.createMode && !p.createdProject);

  return (
    <>
      <style>{SETUP_CSS}</style>

      <div style={styles.page}>
        <div className="fade-in" style={styles.card}>
          {p.alert.show && <Toast alert={p.alert} />}

          <button type="button" onClick={onBack} className="setup-back" style={styles.backBtn}>
            <Icon icon="lucide:arrow-left" /> Volver
          </button>

          {isFullScreenLoading ? (
            <LoadingView step={p.loadingStep} />
          ) : (
            <>
              <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                <div style={styles.iconBubble}>
                  <Icon icon={isConnecting ? 'lucide:plug-zap' : 'lucide:sparkles'} />
                </div>
                <h2 style={styles.title}>{isConnecting ? 'Vincular Dispositivo' : 'Instalación Automática'}</h2>
                <p style={styles.subtitle}>
                  {isConnecting
                    ? 'Autoriza con Supabase y elige el proyecto existente al que quieres vincular este dispositivo.'
                    : 'Autoriza a tinypos y configuraremos tu base de datos en segundos.'}
                </p>
              </div>

              {!p.authorized && <AuthorizeStep initialMode={initialMode} isConnecting={isConnecting} onShowGuide={onShowGuide} />}

              {p.authorized && (
                <form onSubmit={isConnecting ? p.handleConnect : p.handleInstall} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {!isConnecting && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '4px' }}>
                      {[1, 2].map((s) => (
                        <span key={s} style={{ width: '32px', height: '5px', borderRadius: '3px', background: installStep >= s ? 'var(--brand-color)' : 'var(--border)' }} />
                      ))}
                    </div>
                  )}

                  {(isConnecting || installStep === 1) && <ProjectStep isConnecting={isConnecting} p={p} />}
                  {!isConnecting && installStep === 2 && <AdminStep p={p} />}

                  {isConnecting ? (
                    <button type="submit" disabled={p.loading || !p.selectedProject} className="setup-success-cta" style={{ ...styles.successBtn, marginTop: '4px' }}>
                      <Icon icon="lucide:log-in" width="20" />
                      <span>Acceder a tinypos</span>
                    </button>
                  ) : installStep === 1 ? (
                    <button type="button" onClick={() => { if (projectReady) setInstallStep(2); }} disabled={p.loading || !projectReady} className="setup-success-cta" style={{ ...styles.successBtn, marginTop: '4px' }}>
                      <Icon icon="lucide:arrow-right" width="20" />
                      <span>Continuar</span>
                    </button>
                  ) : (
                    <>
                      <button type="submit" disabled={p.loading} className="setup-success-cta" style={{ ...styles.successBtn, marginTop: '4px' }}>
                        <Icon icon="lucide:rocket" width="20" />
                        <span>Instalar tinypos</span>
                      </button>
                      {!p.loading && (
                        <button type="button" onClick={() => setInstallStep(1)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '6px' }}>
                          <Icon icon="lucide:arrow-left" /> Volver
                        </button>
                      )}
                    </>
                  )}
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Toast({ alert }) {
  const isError = alert.type === 'error';
  return (
    <div
      className="setup-toast"
      style={{
        position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%)',
        minWidth: '260px', maxWidth: '90%', padding: '12px 16px',
        background: isError ? 'var(--color-danger)' : 'var(--color-success)', color: '#fff',
        borderRadius: '12px', boxShadow: '0 12px 28px rgba(0,0,0,0.18)',
        display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', fontWeight: 600, zIndex: 10,
      }}
    >
      <Icon icon={isError ? 'lucide:alert-triangle' : 'lucide:check-circle-2'} width="18" />
      <span style={{ flex: 1 }}>{alert.message}</span>
    </div>
  );
}

function LoadingView({ step }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '24px', padding: '40px 8px 16px', textAlign: 'center' }}>
      <div className="spinner" />
      <div>
        <h3 style={{ margin: '0 0 6px 0', color: 'var(--text-main)', fontSize: '1.15rem', fontWeight: 700 }}>Trabajando…</h3>
        <p className="setup-loading-text" style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem', minHeight: '1.2em' }}>
          {step || 'Un momento…'}
        </p>
      </div>
    </div>
  );
}
