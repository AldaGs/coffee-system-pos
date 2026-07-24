import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@iconify/react';
import { supabase } from '../../supabaseClient';
import { useTranslation } from '../../hooks/useTranslation';
import { buildCfdiUrl, ensureCfdiConfig } from '../../utils/cfdiUrl';

function CfdiTab({ showAlert, showConfirm }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState('pending'); // 'pending' (requested, reopened) | 'issued'
  
  const [folioModal, setFolioModal] = useState({ isOpen: false, item: null, folio: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Custom Domain State
  const [customDomain, setCustomDomain] = useState(() => localStorage.getItem('tinypos_cfdi_custom_domain') || '');
  const [linkedDomain, setLinkedDomain] = useState(() => localStorage.getItem('tinypos_cfdi_custom_domain') || '');
  const [isAddingDomain, setIsAddingDomain] = useState(false);
  const [isRemovingDomain, setIsRemovingDomain] = useState(false);
  const [domainStatus, setDomainStatus] = useState(null);
  const [showDomainConfig, setShowDomainConfig] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // Derive project ref + anon key for DNS instructions
  const supabaseUrl = localStorage.getItem('tinypos_supabase_url') || '';
  const projectRef = (() => {
    try { return new URL(supabaseUrl).hostname.split('.')[0]; }
    catch { return ''; }
  })();

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch from sales
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select('*, fiscal_profiles(*)')
        .neq('cfdi_status', 'none')
        .order('created_at', { ascending: false });
        
      if (salesError) throw salesError;

      // Fetch from active_tickets
      const { data: ticketsData, error: ticketsError } = await supabase
        .from('active_tickets')
        .select('*, fiscal_profiles(*)')
        .neq('cfdi_status', 'none')
        .order('created_at', { ascending: false });

      if (ticketsError) throw ticketsError;

      // Combine and format
      const combined = [
        ...(salesData || []).map(s => ({ ...s, sourceTable: 'sales', isPaid: true })),
        ...(ticketsData || []).map(t => ({ ...t, sourceTable: 'active_tickets', isPaid: false }))
      ];
      
      // Sort newest first
      combined.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      setRequests(combined);
    } catch (err) {
      console.error('Error fetching CFDI requests:', err);
      showAlert(t('common.error'), 'Error al cargar las solicitudes de CFDI.');
    } finally {
      setLoading(false);
    }
  }, [showAlert, t]);

  useEffect(() => {
    // Wrap in setTimeout to avoid "Calling setState synchronously within an effect" warning
    // since fetchRequests calls setLoading(true) synchronously before the first await.
    const timer = setTimeout(() => {
      fetchRequests();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchRequests]);

  const handleCopy = (text, label) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    showAlert('Copiado', `${label} copiado al portapapeles`);
  };

  const handleReopen = (item) => {
    showConfirm('Reabrir Solicitud', '¿Estás seguro de que deseas reabrir esta solicitud? El cliente podrá editar y reenviar sus datos fiscales.', async () => {
      try {
        setIsSubmitting(true);
        const { error } = await supabase
          .from(item.sourceTable)
          .update({ cfdi_status: 'reopened' })
          .eq(item.sourceTable === 'sales' ? 'id' : 'id', item.id);
          
        if (error) throw error;
        
        showAlert(t('toast.success'), 'Solicitud reabierta');
        fetchRequests();
      } catch (err) {
        console.error(err);
        showAlert(t('common.error'), 'Error al reabrir solicitud');
      } finally {
        setIsSubmitting(false);
      }
    });
  };

  const handleMarkIssued = async () => {
    const { item, folio } = folioModal;
    if (!item || !folio.trim()) return;
    
    try {
      setIsSubmitting(true);
      const { error } = await supabase
        .from(item.sourceTable)
        .update({ cfdi_status: 'issued', cfdi_folio: folio.trim() })
        .eq(item.sourceTable === 'sales' ? 'id' : 'id', item.id);
        
      if (error) throw error;
      
      showAlert(t('toast.success'), 'CFDI Marcado como Emitido');
      setFolioModal({ isOpen: false, item: null, folio: '' });
      fetchRequests();
    } catch (err) {
      console.error(err);
      showAlert(t('common.error'), 'Error al emitir CFDI');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleShareCFDI = (req) => {
    const ticketId = req.sourceTable === 'sales' ? (req.local_id || req.id) : req.id;
    const cfdiUrl = buildCfdiUrl(ticketId);
    ensureCfdiConfig(supabase);

    if (navigator.share) {
      navigator.share({
        title: 'Solicitud de Factura CFDI',
        text: 'Enlace para solicitar factura',
        url: cfdiUrl
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(cfdiUrl);
      showAlert('Copiado', 'Enlace CFDI copiado al portapapeles');
    }
  };

  const handleCancel = (item) => {
    showConfirm('Cancelar Factura', '¿Estás seguro de que deseas marcar esta factura como cancelada?', async () => {
      try {
        setIsSubmitting(true);
        const { error } = await supabase
          .from(item.sourceTable)
          .update({ cfdi_status: 'canceled' })
          .eq(item.sourceTable === 'sales' ? 'id' : 'id', item.id);
          
        if (error) throw error;
        
        showAlert(t('toast.success'), 'Factura Cancelada');
        fetchRequests();
      } catch (err) {
        console.error(err);
        showAlert(t('common.error'), 'Error al cancelar factura');
      } finally {
        setIsSubmitting(false);
      }
    });
  };

  const handleAddDomain = async () => {
    if (!customDomain) return;
    setIsAddingDomain(true);
    setDomainStatus(null);
    try {
      const res = await fetch('/api/add-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: customDomain.trim() })
      });
      const data = await res.json();
      
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Error al agregar dominio');
      }
      
      setDomainStatus({ success: true, message: `Dominio ${data.domain} agregado con éxito.` });
      setLinkedDomain(data.domain);
      localStorage.setItem('tinypos_cfdi_custom_domain', data.domain);
    } catch (err) {
      setDomainStatus({ success: false, message: err.message });
    } finally {
      setIsAddingDomain(false);
    }
  };

  const handleRemoveDomain = async () => {
    setIsRemovingDomain(true);
    setDomainStatus(null);
    try {
      const res = await fetch('/api/remove-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: linkedDomain })
      });
      const data = await res.json();
      
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Error al remover dominio');
      }
      
      setDomainStatus({ success: true, message: `Dominio removido con éxito.` });
      setLinkedDomain('');
      setCustomDomain('');
      localStorage.removeItem('tinypos_cfdi_custom_domain');
    } catch (err) {
      setDomainStatus({ success: false, message: err.message });
    } finally {
      setIsRemovingDomain(false);
    }
  };

  const filteredRequests = requests.filter(r => {
    if (filter === 'pending') return r.cfdi_status === 'requested' || r.cfdi_status === 'reopened';
    if (filter === 'issued') return r.cfdi_status === 'issued' || r.cfdi_status === 'canceled';
    return true;
  });

  return (
    <div className="admin-tab">
      <div className="tab-header" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.8rem', margin: '0 0 5px 0', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Icon icon="lucide:file-text" style={{ color: 'var(--brand-color)' }} />
            {t('admin.cfdi')}
          </h2>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Gestiona las solicitudes de factura de tus clientes.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setShowDomainConfig(!showDomainConfig)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-main)', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon icon="lucide:globe" />
            Configurar Dominio
          </button>
          <button onClick={fetchRequests} disabled={loading} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-main)', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon icon="lucide:refresh-cw" className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {showDomainConfig && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '1.2rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon icon="lucide:globe" style={{ color: 'var(--brand-color)' }} />
            Dominio de Facturación
          </h3>
          <p style={{ margin: '0 0 16px 0', color: 'var(--text-muted)' }}>
            Usa un dominio personalizado para los enlaces de facturación (ej. facturacion.tu-cafe.com).
          </p>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="facturacion.tu-cafe.com"
              value={customDomain}
              onChange={e => setCustomDomain(e.target.value)}
              readOnly={!!linkedDomain}
              style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', opacity: linkedDomain ? 0.7 : 1 }}
            />
            {linkedDomain ? (
              <button
                type="button"
                onClick={handleRemoveDomain}
                disabled={isRemovingDomain}
                style={{ background: '#e74c3c', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: isRemovingDomain ? 0.5 : 1, fontWeight: 'bold' }}
              >
                {isRemovingDomain ? <Icon icon="lucide:loader" style={{ animation: 'spin 1s linear infinite' }} /> : <Icon icon="lucide:trash" />}
                Desvincular
              </button>
            ) : (
              <button
                type="button"
                onClick={handleAddDomain}
                disabled={isAddingDomain || !customDomain}
                style={{ background: 'var(--brand-color)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: (isAddingDomain || !customDomain) ? 0.5 : 1, fontWeight: 'bold' }}
              >
                {isAddingDomain ? <Icon icon="lucide:loader" style={{ animation: 'spin 1s linear infinite' }} /> : <Icon icon="lucide:plus" />}
                Vincular
              </button>
            )}
          </div>
          {domainStatus && (
            <p style={{ marginTop: '12px', fontSize: '0.9rem', color: domainStatus.success ? '#27ae60' : '#e74c3c' }}>
              {domainStatus.message}
            </p>
          )}

          <button 
             type="button" 
             onClick={() => setIsHelpOpen(!isHelpOpen)}
             style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: 0, marginTop: 16, fontSize: '0.9rem' }}
          >
            <Icon icon={isHelpOpen ? "lucide:chevron-up" : "lucide:chevron-down"} />
            {isHelpOpen ? "Ocultar instrucciones DNS" : "Mostrar instrucciones DNS"}
          </button>

          {isHelpOpen && (
            <div style={{ marginTop: 12, padding: 16, background: 'var(--bg-main)', borderRadius: 12, border: '1px solid var(--border)' }}>
              <p style={{ margin: '0 0 8px', fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-main)' }}>Ayuda: Registros DNS</p>
              <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Configura tu DNS en tu proveedor (Hostinger, GoDaddy, etc.) según lo que quieras usar:
              </p>

              <div style={{ marginBottom: 16 }}>
                <strong style={{ fontSize: '0.85rem', color: 'var(--text-main)', display: 'block', marginBottom: 6 }}>Opción A: Usar un Subdominio (ej. facturacion.tu-cafe.com)</strong>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: '6px 12px', fontSize: '0.8rem', alignItems: 'center', background: 'var(--bg-surface)', padding: 8, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <strong style={{ color: 'var(--text-muted)' }}>Tipo</strong>
                  <strong style={{ color: 'var(--text-muted)' }}>Nombre</strong>
                  <strong style={{ color: 'var(--text-muted)' }}>Valor / Objetivo</strong>
                  
                  <code style={{ background: 'var(--bg-main)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>CNAME</code>
                  <code style={{ background: 'var(--bg-main)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>facturacion</code>
                  <code style={{ background: 'var(--bg-main)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>cname.vercel-dns.com.</code>

                  <code style={{ background: 'var(--bg-main)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>TXT</code>
                  <code style={{ background: 'var(--bg-main)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>_tinypos.facturacion</code>
                  <code style={{ background: 'var(--bg-main)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>tinypos-ref={projectRef}</code>
                </div>
              </div>

              <div>
                <strong style={{ fontSize: '0.85rem', color: 'var(--text-main)', display: 'block', marginBottom: 6 }}>Opción B: Usar el Dominio Principal (ej. tu-cafe.com)</strong>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: '6px 12px', fontSize: '0.8rem', alignItems: 'center', background: 'var(--bg-surface)', padding: 8, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <strong style={{ color: 'var(--text-muted)' }}>Tipo</strong>
                  <strong style={{ color: 'var(--text-muted)' }}>Nombre</strong>
                  <strong style={{ color: 'var(--text-muted)' }}>Valor / Objetivo</strong>
                  
                  <code style={{ background: 'var(--bg-main)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>A</code>
                  <code style={{ background: 'var(--bg-main)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>@</code>
                  <code style={{ background: 'var(--bg-main)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>76.76.21.21</code>

                  <code style={{ background: 'var(--bg-main)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>TXT</code>
                  <code style={{ background: 'var(--bg-main)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>_tinypos</code>
                  <code style={{ background: 'var(--bg-main)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>tinypos-ref={projectRef}</code>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button 
          onClick={() => setFilter('pending')}
          style={{ padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', background: filter === 'pending' ? 'var(--brand-color)' : 'var(--bg-surface)', color: filter === 'pending' ? 'white' : 'var(--text-muted)', border: filter === 'pending' ? 'none' : '1px solid var(--border)' }}
        >
          Pendientes
        </button>
        <button 
          onClick={() => setFilter('issued')}
          style={{ padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', background: filter === 'issued' ? 'var(--brand-color)' : 'var(--bg-surface)', color: filter === 'issued' ? 'white' : 'var(--text-muted)', border: filter === 'issued' ? 'none' : '1px solid var(--border)' }}
        >
          Emitidas
        </button>
      </div>

      {loading && requests.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando...</div>
      ) : filteredRequests.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', background: 'var(--bg-surface)', borderRadius: '12px', color: 'var(--text-muted)' }}>
          <Icon icon="lucide:inbox" style={{ fontSize: '3rem', marginBottom: '10px', opacity: 0.5 }} />
          <p>No hay solicitudes en esta categoría.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredRequests.map(req => (
            <div key={`${req.sourceTable}-${req.id}`} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Header Info */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                <div>
                  <h3 style={{ margin: '0 0 5px 0', color: 'var(--text-main)', fontSize: '1.2rem' }}>
                    {req.order_name || req.name || `Ticket #${req.ticket_id || req.id}`}
                  </h3>
                  <div style={{ display: 'flex', gap: '15px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Icon icon="lucide:calendar" /> {new Date(req.created_at).toLocaleString()}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: req.isPaid ? '#27ae60' : '#e74c3c' }}>
                      <Icon icon="lucide:dollar-sign" /> ${(req.total_amount || 0) / 100} ({req.isPaid ? 'Pagado' : 'Pendiente'})
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {req.cfdi_status === 'requested' && <span style={{ background: 'rgba(52, 152, 219, 0.1)', color: '#2980b9', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 'bold' }}>Solicitado</span>}
                  {req.cfdi_status === 'reopened' && <span style={{ background: 'rgba(243, 156, 18, 0.1)', color: '#d68910', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 'bold' }}>Reabierto</span>}
                  {req.cfdi_status === 'issued' && (
                    <span style={{ background: 'rgba(46, 204, 113, 0.1)', color: '#27ae60', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      Emitido: {req.cfdi_folio}
                      <button onClick={(e) => { e.stopPropagation(); handleCopy(req.cfdi_folio, 'Folio Fiscal'); }} style={{ background: 'none', border: 'none', color: '#27ae60', cursor: 'pointer', padding: 0, display: 'flex' }}>
                        <Icon icon="lucide:copy" />
                      </button>
                    </span>
                  )}
                  {req.cfdi_status === 'canceled' && <span style={{ background: 'rgba(231, 76, 60, 0.1)', color: '#c0392b', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 'bold' }}>Cancelado</span>}
                  
                  <button onClick={() => handleShareCFDI(req)} title="Copiar Enlace CFDI" style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', color: 'var(--text-main)', padding: '6px', borderRadius: '50%', cursor: 'pointer', display: 'flex' }}>
                    <Icon icon="lucide:link" />
                  </button>
                </div>
              </div>

              {/* Fiscal Profile Data */}
              {req.fiscal_profiles && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  
                  <div className="fiscal-field">
                    <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '2px' }}>RFC</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong style={{ color: 'var(--text-main)' }}>{req.fiscal_profiles.rfc}</strong>
                      <button onClick={() => handleCopy(req.fiscal_profiles.rfc, 'RFC')} style={{ background: 'none', border: 'none', color: 'var(--brand-color)', cursor: 'pointer', padding: '2px' }}><Icon icon="lucide:copy" /></button>
                    </div>
                  </div>
                  
                  <div className="fiscal-field">
                    <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '2px' }}>Razón Social</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong style={{ color: 'var(--text-main)' }}>{req.fiscal_profiles.razon_social}</strong>
                      <button onClick={() => handleCopy(req.fiscal_profiles.razon_social, 'Razón Social')} style={{ background: 'none', border: 'none', color: 'var(--brand-color)', cursor: 'pointer', padding: '2px' }}><Icon icon="lucide:copy" /></button>
                    </div>
                  </div>
                  
                  <div className="fiscal-field">
                    <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '2px' }}>C.P.</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong style={{ color: 'var(--text-main)' }}>{req.fiscal_profiles.cp}</strong>
                      <button onClick={() => handleCopy(req.fiscal_profiles.cp, 'C.P.')} style={{ background: 'none', border: 'none', color: 'var(--brand-color)', cursor: 'pointer', padding: '2px' }}><Icon icon="lucide:copy" /></button>
                    </div>
                  </div>

                  <div className="fiscal-field">
                    <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '2px' }}>Régimen Fiscal</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong style={{ color: 'var(--text-main)' }}>{req.fiscal_profiles.regimen_fiscal}</strong>
                      <button onClick={() => handleCopy(req.fiscal_profiles.regimen_fiscal, 'Régimen Fiscal')} style={{ background: 'none', border: 'none', color: 'var(--brand-color)', cursor: 'pointer', padding: '2px' }}><Icon icon="lucide:copy" /></button>
                    </div>
                  </div>
                  
                  <div className="fiscal-field">
                    <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '2px' }}>Uso CFDI</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong style={{ color: 'var(--text-main)' }}>{req.fiscal_profiles.uso_cfdi}</strong>
                      <button onClick={() => handleCopy(req.fiscal_profiles.uso_cfdi, 'Uso CFDI')} style={{ background: 'none', border: 'none', color: 'var(--brand-color)', cursor: 'pointer', padding: '2px' }}><Icon icon="lucide:copy" /></button>
                    </div>
                  </div>

                  <div className="fiscal-field">
                    <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '2px' }}>Email</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong style={{ color: 'var(--text-main)' }}>{req.fiscal_profiles.email}</strong>
                      <button onClick={() => handleCopy(req.fiscal_profiles.email, 'Email')} style={{ background: 'none', border: 'none', color: 'var(--brand-color)', cursor: 'pointer', padding: '2px' }}><Icon icon="lucide:copy" /></button>
                    </div>
                  </div>

                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                {(req.cfdi_status === 'requested' || req.cfdi_status === 'reopened' || req.cfdi_status === 'canceled') && (
                  <button 
                    disabled={isSubmitting}
                    onClick={() => handleReopen(req)} 
                    style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-main)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    {req.cfdi_status === 'canceled' ? 'Generar nueva solicitud' : 'Reabrir Solicitud'}
                  </button>
                )}

                {(req.cfdi_status === 'requested' || req.cfdi_status === 'reopened') && (
                    <button 
                      disabled={isSubmitting || !req.isPaid}
                      title={!req.isPaid ? 'El ticket debe ser pagado primero' : ''}
                      onClick={() => setFolioModal({ isOpen: true, item: req, folio: '' })} 
                      style={{ background: req.isPaid ? 'var(--brand-color)' : 'var(--bg-main)', color: req.isPaid ? 'white' : 'var(--text-muted)', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: req.isPaid ? 'pointer' : 'not-allowed', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      <Icon icon="lucide:check" /> Marcar como Emitido
                    </button>
                )}
                
                {req.cfdi_status === 'issued' && (
                  <button 
                    disabled={isSubmitting}
                    onClick={() => handleCancel(req)} 
                    style={{ background: 'rgba(231, 76, 60, 0.1)', border: '1px solid #e74c3c', color: '#c0392b', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <Icon icon="lucide:x-circle" /> Cancelar Factura
                  </button>
                )}
              </div>

            </div>
          ))}
        </div>
      )}

      {/* Emitir Folio Modal */}
      {folioModal.isOpen && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '400px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <h2 style={{ margin: '0 0 10px 0', fontSize: '1.4rem', color: 'var(--text-main)' }}>Emitir Factura</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '20px', fontSize: '0.9rem' }}>
              Ingresa el folio fiscal del CFDI generado para {folioModal.item?.fiscal_profiles?.rfc || 'este ticket'}.
            </p>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-main)' }}>Folio Fiscal / UUID CFDI</label>
              <input
                type="text"
                autoFocus
                value={folioModal.folio}
                onChange={(e) => setFolioModal(prev => ({ ...prev, folio: e.target.value }))}
                placeholder="Ej. AAA123..."
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '10px',
                  border: '2px solid var(--border)',
                  background: 'var(--bg-main)',
                  color: 'var(--text-main)',
                  fontSize: '1.1rem',
                  outline: 'none'
                }}
              />
            </div>

            <div className="modal-actions">
              <button onClick={() => setFolioModal({ isOpen: false, item: null, folio: '' })} className="btn-cancel" style={{ flex: 1 }}>{t('common.cancel')}</button>
              <button onClick={handleMarkIssued} className="btn-confirm" disabled={!folioModal.folio.trim() || isSubmitting} style={{ flex: 1, background: folioModal.folio.trim() ? '#2980b9' : 'var(--bg-main)', color: folioModal.folio.trim() ? 'white' : 'var(--text-muted)' }}>
                {isSubmitting ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CfdiTab;
