import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Icon } from '@iconify/react';

function decodeParam(value) {
  if (!value) return '';
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    return atob(normalized);
  } catch {
    return '';
  }
}

function PublicCFDI({ ticketId }) {
  const [supabase, setSupabase] = useState(null);
  const [sale, setSale] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    rfc: '',
    razon_social: '',
    regimen_fiscal: '601', // General de Ley Personas Morales
    uso_cfdi: 'G03', // Gastos en general
    cp: '',
    email: ''
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get('p');
    let url = '';
    let key = '';

    if (p) {
      url = `https://${p}.supabase.co`;
      fetch(`https://${p}.supabase.co/storage/v1/object/public/menu/config.json`)
        .then(res => {
          if (!res.ok) throw new Error('config.json missing');
          return res.json();
        })
        .then(config => {
          key = config.k || config.anon_key;
          if (url && key) {
            setSupabase(createClient(url, key, { auth: { persistSession: false } }));
          } else {
            setError("Configuración inválida.");
          }
        })
        .catch(() => setError("No se pudo cargar la configuración de la tienda."));
      return;
    }

    const u = params.get('u');
    const k = params.get('k');
    if (u && k) {
      url = decodeParam(u);
      key = decodeParam(k);
      setTimeout(() => setSupabase(createClient(url, key, { auth: { persistSession: false } })), 0);
    } else {
      setTimeout(() => setError("Faltan parámetros en el enlace."), 0);
    }
  }, []);

  useEffect(() => {
    if (!supabase || !ticketId) return;

    const fetchTicket = async () => {
      try {
        setLoading(true);
        // The ticketId in the URL can be:
        // • a UUID (sale's local_id, from OrdersTab links)
        // • a Date.now() number string (active ticket id, from Register links)
        // We try every relevant column until we get a hit.

        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ticketId);

        let saleData = null;

        // 1) If it looks like a UUID, search sales.local_id
        if (isUUID) {
          const { data } = await supabase
            .from('sales')
            .select('*, fiscal_profiles(*)')
            .eq('local_id', ticketId)
            .maybeSingle();
          saleData = data;
        }

        // 2) If still nothing, try sales.ticket_id (stores the original activeTicket.id as a string)
        if (!saleData) {
          const { data } = await supabase
            .from('sales')
            .select('*, fiscal_profiles(*)')
            .eq('ticket_id', String(ticketId))
            .maybeSingle();
          saleData = data;
        }

        if (saleData) {
          setSale({ ...saleData, is_paid: true });
          if (saleData.fiscal_profiles) {
            setFormData(saleData.fiscal_profiles);
          }
          setLoading(false);
          return;
        }

        // 3) Not a completed sale yet — check active_tickets (numeric id only)
        if (!isUUID) {
          const { data: ticketData, error: ticketError } = await supabase
            .from('active_tickets')
            .select('*')
            .eq('id', ticketId)
            .maybeSingle();

          if (ticketError && ticketError.code !== 'PGRST116') throw ticketError;

          if (ticketData) {
            setSale({ ...ticketData, is_paid: false });
            setLoading(false);
            return;
          }
        }

        setError("Ticket no encontrado.");
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTicket();
  }, [supabase, ticketId]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value.toUpperCase() });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (sale.is_paid === false) {
       // Cannot submit if not paid
       return;
    }
    
    setIsSubmitting(true);
    setError(null);

    try {
      // Upsert fiscal profile (handle unique rfc)
      let profileId = sale.fiscal_profile_id;
      
      const { data: existingProfile } = await supabase
        .from('fiscal_profiles')
        .select('id')
        .eq('rfc', formData.rfc)
        .maybeSingle();

      if (existingProfile) {
        // Update existing
        const { error: updateError } = await supabase
          .from('fiscal_profiles')
          .update({
            razon_social: formData.razon_social,
            regimen_fiscal: formData.regimen_fiscal,
            uso_cfdi: formData.uso_cfdi,
            cp: formData.cp,
            email: formData.email,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingProfile.id);
        if (updateError) throw updateError;
        profileId = existingProfile.id;
      } else {
        // Insert new
        const { data: newProfile, error: insertError } = await supabase
          .from('fiscal_profiles')
          .insert([{
            rfc: formData.rfc,
            razon_social: formData.razon_social,
            regimen_fiscal: formData.regimen_fiscal,
            uso_cfdi: formData.uso_cfdi,
            cp: formData.cp,
            email: formData.email
          }])
          .select()
          .single();
        if (insertError) throw insertError;
        profileId = newProfile.id;
      }

      // Update sale using the row's actual id
      const { error: saleUpdateError } = await supabase
        .from('sales')
        .update({
          fiscal_profile_id: profileId,
          cfdi_status: 'requested'
        })
        .eq('id', sale.id);

      if (saleUpdateError) throw saleUpdateError;

      setSuccess(true);
      setSale(prev => ({ ...prev, cfdi_status: 'requested', fiscal_profile_id: profileId }));

    } catch (err) {
      setError("Error al solicitar CFDI: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (error && !sale) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f5f6fa', fontFamily: 'system-ui' }}>
        <div style={{ background: 'white', padding: '40px', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', textAlign: 'center' }}>
          <Icon icon="lucide:alert-circle" style={{ fontSize: '3rem', color: '#e74c3c', marginBottom: '10px' }} />
          <h2 style={{ margin: '0 0 10px 0', color: '#2c3e50' }}>Error</h2>
          <p style={{ color: '#7f8c8d' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f5f6fa' }}>
        <div className="spinner" style={{ width: '40px', height: '40px', border: '4px solid #3498db', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const isPaid = sale?.is_paid;
  const isIssued = sale?.cfdi_status === 'issued';
  const isRequested = sale?.cfdi_status === 'requested';
  const isReopened = sale?.cfdi_status === 'reopened';
  const isCanceled = sale?.cfdi_status === 'canceled';

  // The form is editable if it's paid AND (status is none OR reopened)
  // If it's requested, it's read-only. If it's issued or canceled, we hide the form.
  const isEditable = isPaid && (!isRequested && !isIssued && !isCanceled);

  return (
    <div style={{ minHeight: '100vh', background: '#f5f6fa', fontFamily: 'system-ui', padding: '20px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', background: 'white', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        
        <div style={{ background: 'linear-gradient(135deg, #3498db, #2980b9)', padding: '30px', color: 'white', textAlign: 'center' }}>
          <Icon icon="lucide:file-text" style={{ fontSize: '3rem', marginBottom: '10px' }} />
          <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: '800' }}>Solicitud de Factura</h1>
          <p style={{ margin: '5px 0 0 0', opacity: 0.9 }}>Ticket: {sale?.order_name || sale?.ticket_id?.slice(-6) || ticketId.slice(-6)}</p>
        </div>

        <div style={{ padding: '30px' }}>
          {/* Status Banners */}
          {!isPaid && (
            <div style={{ background: 'rgba(243, 156, 18, 0.1)', border: '1px solid #f39c12', color: '#d68910', padding: '15px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <Icon icon="lucide:alert-triangle" style={{ fontSize: '1.5rem', flexShrink: 0 }} />
              <div>
                <strong style={{ display: 'block', marginBottom: '5px' }}>Ticket pendiente de pago</strong>
                <span>Puedes ingresar tus datos ahora, pero la factura solo podrá ser solicitada una vez que el ticket sea pagado en caja.</span>
              </div>
            </div>
          )}

          {isPaid && !isRequested && !isIssued && !isReopened && !isCanceled && !success && (
             <div style={{ background: 'rgba(46, 204, 113, 0.1)', border: '1px solid #27ae60', color: '#27ae60', padding: '15px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <Icon icon="lucide:check-circle" style={{ fontSize: '1.5rem', flexShrink: 0 }} />
              <div>
                <strong style={{ display: 'block', marginBottom: '5px' }}>Ticket pagado el {new Date(sale.created_at).toLocaleDateString('es-MX')}</strong>
                <span>Por favor verifica que la fecha fiscal corresponda a tus necesidades.</span>
              </div>
            </div>
          )}

          {isReopened && !success && (
            <div style={{ background: 'rgba(243, 156, 18, 0.1)', border: '1px solid #f39c12', color: '#d68910', padding: '15px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <Icon icon="lucide:alert-circle" style={{ fontSize: '1.5rem', flexShrink: 0 }} />
              <div>
                <strong style={{ display: 'block', marginBottom: '5px' }}>Información Incompleta / Incorrecta</strong>
                <span>Por favor revisa y corrige tus datos fiscales para poder emitir la factura.</span>
              </div>
            </div>
          )}

          {isRequested && !success && (
            <div style={{ background: 'rgba(52, 152, 219, 0.1)', border: '1px solid #3498db', color: '#2980b9', padding: '15px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <Icon icon="lucide:clock" style={{ fontSize: '1.5rem', flexShrink: 0 }} />
              <div>
                <strong style={{ display: 'block', marginBottom: '5px' }}>Solicitud en proceso</strong>
                <span>Tus datos han sido recibidos. Estamos procesando la factura y pronto estará disponible aquí mismo.</span>
              </div>
            </div>
          )}

          {success && (
            <div style={{ background: 'rgba(46, 204, 113, 0.1)', border: '1px solid #27ae60', color: '#27ae60', padding: '20px', borderRadius: '8px', marginBottom: '20px', textAlign: 'center' }}>
              <Icon icon="lucide:check-circle-2" style={{ fontSize: '3rem', marginBottom: '10px' }} />
              <h3 style={{ margin: '0 0 10px 0' }}>¡Solicitud Enviada!</h3>
              <p style={{ margin: 0 }}>Tus datos han sido guardados y la factura será emitida pronto. Se enviará a <strong>{formData.email}</strong>.</p>
            </div>
          )}

          {isIssued && (
            <div style={{ background: 'rgba(52, 152, 219, 0.1)', border: '1px solid #3498db', color: '#2980b9', padding: '20px', borderRadius: '8px', marginBottom: '20px', textAlign: 'center' }}>
              <Icon icon="lucide:file-check-2" style={{ fontSize: '3rem', marginBottom: '10px' }} />
              <h3 style={{ margin: '0 0 10px 0' }}>Factura Emitida</h3>
              <p style={{ margin: 0 }}>Folio: <strong>{sale.cfdi_folio}</strong></p>
            </div>
          )}

          {isCanceled && (
            <div style={{ background: 'rgba(231, 76, 60, 0.1)', border: '1px solid #e74c3c', color: '#c0392b', padding: '20px', borderRadius: '8px', marginBottom: '20px', textAlign: 'center' }}>
              <Icon icon="lucide:x-circle" style={{ fontSize: '3rem', marginBottom: '10px' }} />
              <h3 style={{ margin: '0 0 10px 0' }}>Factura Cancelada</h3>
              <p style={{ margin: 0 }}>Esta factura ha sido marcada como cancelada por el establecimiento.</p>
            </div>
          )}

          {/* Form */}
          {(!success && !isIssued && !isCanceled) && (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontWeight: 'bold', color: '#2c3e50', fontSize: '0.9rem' }}>RFC</label>
                <input required disabled={!isEditable} type="text" name="rfc" value={formData.rfc} onChange={handleChange} placeholder="XAXX010101000" style={{ padding: '12px', borderRadius: '8px', border: '1px solid #bdc3c7', fontSize: '1rem', outline: 'none', textTransform: 'uppercase' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontWeight: 'bold', color: '#2c3e50', fontSize: '0.9rem' }}>Razón Social</label>
                <input required disabled={!isEditable} type="text" name="razon_social" value={formData.razon_social} onChange={handleChange} placeholder="Empresa S.A. de C.V." style={{ padding: '12px', borderRadius: '8px', border: '1px solid #bdc3c7', fontSize: '1rem', outline: 'none' }} />
              </div>

              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 }}>
                  <label style={{ fontWeight: 'bold', color: '#2c3e50', fontSize: '0.9rem' }}>Código Postal</label>
                  <input required disabled={!isEditable} type="text" name="cp" value={formData.cp} onChange={handleChange} placeholder="12345" style={{ padding: '12px', borderRadius: '8px', border: '1px solid #bdc3c7', fontSize: '1rem', outline: 'none' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 2 }}>
                  <label style={{ fontWeight: 'bold', color: '#2c3e50', fontSize: '0.9rem' }}>Email para Factura</label>
                  <input required disabled={!isEditable} type="email" name="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value.toLowerCase() })} placeholder="correo@ejemplo.com" style={{ padding: '12px', borderRadius: '8px', border: '1px solid #bdc3c7', fontSize: '1rem', outline: 'none' }} />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontWeight: 'bold', color: '#2c3e50', fontSize: '0.9rem' }}>Régimen Fiscal</label>
                <select required disabled={!isEditable} name="regimen_fiscal" value={formData.regimen_fiscal} onChange={handleChange} style={{ padding: '12px', borderRadius: '8px', border: '1px solid #bdc3c7', fontSize: '1rem', outline: 'none', background: 'white' }}>
                  <option value="601">601 - General de Ley Personas Morales</option>
                  <option value="603">603 - Personas Morales con Fines no Lucrativos</option>
                  <option value="605">605 - Sueldos y Salarios e Ingresos Asimilados a Salarios</option>
                  <option value="606">606 - Arrendamiento</option>
                  <option value="608">608 - Demás ingresos</option>
                  <option value="612">612 - Personas Físicas con Actividades Empresariales y Profesionales</option>
                  <option value="616">616 - Sin obligaciones fiscales</option>
                  <option value="621">621 - Incorporación Fiscal</option>
                  <option value="626">626 - Régimen Simplificado de Confianza (RESICO)</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontWeight: 'bold', color: '#2c3e50', fontSize: '0.9rem' }}>Uso de CFDI</label>
                <select required disabled={!isEditable} name="uso_cfdi" value={formData.uso_cfdi} onChange={handleChange} style={{ padding: '12px', borderRadius: '8px', border: '1px solid #bdc3c7', fontSize: '1rem', outline: 'none', background: 'white' }}>
                  <option value="G01">G01 - Adquisición de mercancías</option>
                  <option value="G03">G03 - Gastos en general</option>
                  <option value="I08">I08 - Equipo de computo y accesorios</option>
                  <option value="S01">S01 - Sin efectos fiscales</option>
                </select>
              </div>

              {error && (
                <div style={{ background: '#fdedec', color: '#c0392b', padding: '10px', borderRadius: '8px', fontSize: '0.9rem' }}>
                  {error}
                </div>
              )}

              <button 
                type="submit" 
                disabled={!isEditable || isSubmitting}
                style={{ 
                  marginTop: '10px',
                  padding: '16px',
                  background: (!isEditable) ? '#bdc3c7' : '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  cursor: (!isEditable || isSubmitting) ? 'not-allowed' : 'pointer',
                  transition: 'background 0.2s'
                }}
              >
                {isSubmitting ? 'Enviando...' : isRequested ? 'Factura solicitada' : !isPaid ? 'Esperando Pago' : isReopened ? 'Reenviar Datos' : 'Solicitar Factura'}
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}

export default PublicCFDI;
