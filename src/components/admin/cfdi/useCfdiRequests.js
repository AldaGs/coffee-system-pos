import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../supabaseClient';
import { buildCfdiUrl, ensureCfdiConfig } from '../../../utils/cfdiUrl';
import { ZIP_BUCKET, purgeExpiredZips } from './cfdiShared';

const CLOSED_FOLIO = { isOpen: false, item: null, folio: '' };

// CFDI requests from paid sales and open tickets, and every action on one.
export function useCfdiRequests({ showAlert, showConfirm, t }) {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState('pending'); // 'pending' (requested, reopened) | 'issued'
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [folioModal, setFolioModal] = useState(CLOSED_FOLIO);
  const [reopenModal, setReopenModal] = useState(null); // { item, fields: [], note: '' }

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select('*, fiscal_profiles(*)')
        .neq('cfdi_status', 'none')
        .order('created_at', { ascending: false });
      if (salesError) throw salesError;
      purgeExpiredZips(salesData || []);

      const { data: ticketsData, error: ticketsError } = await supabase
        .from('active_tickets')
        .select('*, fiscal_profiles(*)')
        .neq('cfdi_status', 'none')
        .order('created_at', { ascending: false });
      if (ticketsError) throw ticketsError;

      const combined = [
        ...(salesData || []).map(s => ({ ...s, sourceTable: 'sales', isPaid: true })),
        ...(ticketsData || []).map(t => ({ ...t, sourceTable: 'active_tickets', isPaid: false }))
      ];
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
    // Fetch once on mount only. We deliberately do NOT depend on `fetchRequests`
    // here: its identity changes on every render (it closes over `showAlert`/`t`),
    // and because the catch block calls `showAlert` — which updates dialog state and
    // forces a re-render — depending on it created a hot loop. When the Supabase
    // circuit breaker is open every request fails instantly, so that loop spun as
    // fast as React could render, freezing the tab and flooding the console with
    // "Cloud unreachable" errors. Handlers call fetchRequests() directly when
    // a manual refresh is needed.
    const timer = setTimeout(() => { fetchRequests(); }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Runs one write with the shared busy flag, then reloads the list.
  const submit = async (write, okMsg, errMsg, after) => {
    try {
      setIsSubmitting(true);
      await write();
      showAlert(t('toast.success'), okMsg);
      after?.();
      fetchRequests();
    } catch (err) {
      console.error(err);
      showAlert(t('common.error'), errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };
  const update = async (item, patch) => {
    const { error } = await supabase.from(item.sourceTable).update(patch).eq('id', item.id);
    if (error) throw error;
  };

  const handleReopen = () => {
    const { item, fields, note } = reopenModal;
    const reopenNote = fields.length || note.trim() ? { fields, note: note.trim() } : null;
    return submit(() => update(item, { cfdi_status: 'reopened', cfdi_reopen_note: reopenNote }),
      t('cfdiTab.requestReopened'), t('cfdiTab.reopenRequestError'), () => setReopenModal(null));
  };

  const handleMarkIssued = () => {
    const { item, folio, zip } = folioModal;
    if (!item || !folio.trim()) return;
    return submit(async () => {
      const patch = { cfdi_status: 'issued', cfdi_folio: folio.trim() };
      if (zip) {
        // Random name: the bucket serves exact paths only and can't be listed.
        const path = `${crypto.randomUUID()}.zip`;
        const { error: upErr } = await supabase.storage.from(ZIP_BUCKET)
          .upload(path, zip, { contentType: 'application/zip' });
        if (upErr) throw upErr;
        if (item.cfdi_zip_path) supabase.storage.from(ZIP_BUCKET).remove([item.cfdi_zip_path]);
        Object.assign(patch, { cfdi_zip_path: path, cfdi_zip_at: new Date().toISOString() });
      }
      await update(item, patch);
    }, t('cfdiTab.markedIssued'), t('cfdiTab.issueError'), () => setFolioModal(CLOSED_FOLIO));
  };

  const handleCancel = (item) => {
    showConfirm(t('cfdiTab.cancelTitle'), t('cfdiTab.cancelConfirm'), () =>
      submit(() => update(item, { cfdi_status: 'canceled' }), t('cfdiTab.canceled'), t('cfdiTab.cancelError')));
  };

  const handleCopy = (text, label) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    showAlert(t('cfdiTab.copiedTitle'), t('cfdiTab.copiedDesc').replace('{label}', label));
  };

  const handleShareCFDI = (req) => {
    const ticketId = req.sourceTable === 'sales' ? (req.local_id || req.id) : req.id;
    const cfdiUrl = buildCfdiUrl(ticketId);
    ensureCfdiConfig(supabase);
    if (navigator.share) {
      navigator.share({ title: t('cfdiTab.shareTitle'), text: t('cfdiTab.shareText'), url: cfdiUrl }).catch(console.error);
    } else {
      navigator.clipboard.writeText(cfdiUrl);
      showAlert(t('cfdiTab.copiedTitle'), t('cfdiTab.linkCopied'));
    }
  };

  const filteredRequests = requests.filter(r => {
    if (filter === 'pending') return r.cfdi_status === 'requested' || r.cfdi_status === 'reopened';
    if (filter === 'issued') return r.cfdi_status === 'issued' || r.cfdi_status === 'canceled';
    return true;
  });

  return {
    loading, requests, filteredRequests, filter, setFilter, isSubmitting, fetchRequests,
    folioModal, setFolioModal, closeFolio: () => setFolioModal(CLOSED_FOLIO), reopenModal, setReopenModal,
    handleReopen, handleMarkIssued, handleCancel, handleCopy, handleShareCFDI,
  };
}
