import { useState, useEffect } from 'react';
import { readCustomDomain, persistCustomDomain, backfillCustomDomain } from '../../../utils/customDomainSync';

const postDomain = async (endpoint, domain, fallbackError) => {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain })
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || fallbackError);
  return data;
};

// Links a custom domain to the portal (Vercel /api/add-domain) and syncs it across devices.
export function useCustomDomain(kind, t) {
  const [customDomain, setCustomDomain] = useState(() => readCustomDomain(kind));
  const [linkedDomain, setLinkedDomain] = useState(() => readCustomDomain(kind));
  const [busy, setBusy] = useState(null); // 'add' | 'remove'
  const [domainStatus, setDomainStatus] = useState(null);
  useEffect(() => backfillCustomDomain(kind), [kind]);

  const handleAddDomain = async () => {
    if (!customDomain) return;
    setBusy('add');
    setDomainStatus(null);
    try {
      const data = await postDomain('/api/add-domain', customDomain.trim(), t('cfdiTab.addDomainError'));
      setDomainStatus({ success: true, message: t('cfdiTab.domainAdded').replace('{domain}', data.domain) });
      setLinkedDomain(data.domain);
      await persistCustomDomain(kind, data.domain);
    } catch (err) {
      setDomainStatus({ success: false, message: err.message });
    } finally {
      setBusy(null);
    }
  };

  const handleRemoveDomain = async () => {
    setBusy('remove');
    setDomainStatus(null);
    try {
      await postDomain('/api/remove-domain', linkedDomain, t('cfdiTab.removeDomainError'));
      setDomainStatus({ success: true, message: t('cfdiTab.domainRemoved') });
      setLinkedDomain('');
      setCustomDomain('');
      await persistCustomDomain(kind, '');
    } catch (err) {
      setDomainStatus({ success: false, message: err.message });
    } finally {
      setBusy(null);
    }
  };

  return {
    customDomain, setCustomDomain, linkedDomain, domainStatus,
    isAddingDomain: busy === 'add', isRemovingDomain: busy === 'remove', handleAddDomain, handleRemoveDomain,
  };
}
