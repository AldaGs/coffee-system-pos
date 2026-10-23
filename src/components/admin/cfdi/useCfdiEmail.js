import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../supabaseClient';
import { buildCfdiUrl, ensureCfdiConfig } from '../../../utils/cfdiUrl';
import { cachedBusinessName } from './cfdiShared';

const invokeEmail = async (body) => {
  const { data, error } = await supabase.functions.invoke('cfdi-email', { body });
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.detail || detail?.error || error.message);
  }
  return data;
};

// Emailing the CFDI (cfdi-email Edge Function, schema 5.3). emailStatus stays null
// on schemas too old to have it, which hides the whole feature.
export function useCfdiEmail({ showAlert, t, onResent }) {
  const [emailStatus, setEmailStatus] = useState(null);
  const [emailForm, setEmailForm] = useState({ apiKey: '', from: '', replyTo: '', enabled: false, message: '', footer: '' });
  const [emailBusy, setEmailBusy] = useState(null);
  const [emailPreview, setEmailPreview] = useState(null); // rendered HTML from the function

  const loadEmailStatus = useCallback(() => supabase.rpc('cfdi_email_status').then(({ data }) => {
    if (!data) return;
    setEmailStatus(data);
    setEmailForm(prev => ({
      ...prev, from: data.from_address || '', replyTo: data.reply_to || '', enabled: !!data.enabled,
      message: data.email_message || '', footer: data.email_footer || '',
    }));
  }), []);
  useEffect(() => { loadEmailStatus(); }, [loadEmailStatus]);

  const handleSaveEmail = async () => {
    setEmailBusy('save');
    const supabaseUrl = (localStorage.getItem('tinypos_supabase_url') || '').replace(/\/+$/, '');
    ensureCfdiConfig(supabase);
    const { error } = await supabase.rpc('set_cfdi_email', {
      p_provider: 'resend',
      p_api_key: emailForm.apiKey,
      p_from: emailForm.from,
      p_reply_to: emailForm.replyTo,
      p_business_name: cachedBusinessName(),
      // The email links to the same portal URL the share button builds.
      p_link_template: buildCfdiUrl('{id}'),
      p_hook_url: `${supabaseUrl}/functions/v1/cfdi-email`,
      p_enabled: emailForm.enabled,
    });
    const { error: msgError } = error ? {} : await supabase.rpc('set_cfdi_email_message', { p_message: emailForm.message, p_footer: emailForm.footer });
    setEmailBusy(null);
    if (error || msgError) return showAlert(t('common.error'), (error || msgError).message);
    setEmailForm(prev => ({ ...prev, apiKey: '' }));
    loadEmailStatus();
    showAlert(t('toast.success'), t('cfdiTab.emailSaved'));
  };

  // Runs one function call under a busy key; errors become an alert.
  const run = async (busy, call, errKey) => {
    setEmailBusy(busy);
    try {
      await call();
    } catch (err) {
      showAlert(t('common.error'), t(errKey).replace('{msg}', err.message));
    } finally {
      setEmailBusy(null);
    }
  };

  const handlePreviewEmail = () => run('preview', async () => {
    const { html } = await invokeEmail({ action: 'preview', message: emailForm.message, footer: emailForm.footer });
    setEmailPreview(html);
  }, 'cfdiTab.previewError');

  const handleTestEmail = () => {
    const to = window.prompt(t('cfdiTab.testPrompt'), emailForm.replyTo || '');
    if (!to) return;
    return run('test', async () => {
      await invokeEmail({ action: 'test', to: to.trim() });
      showAlert(t('toast.success'), t('cfdiTab.testSent').replace('{to}', to.trim()));
    }, 'cfdiTab.sendError');
  };

  const handleResendEmail = async (req) => {
    await run(`resend-${req.id}`, async () => {
      await invokeEmail({ action: 'resend', sale_id: req.id });
      showAlert(t('toast.success'), t('cfdiTab.invoiceSent').replace('{email}', req.fiscal_profiles?.email || ''));
    }, 'cfdiTab.sendError');
    onResent();
  };

  return { emailStatus, emailForm, setEmailForm, emailBusy, emailPreview, handleSaveEmail, handlePreviewEmail, handleTestEmail, handleResendEmail };
}
