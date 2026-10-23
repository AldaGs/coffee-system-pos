import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../supabaseClient';
import { cachedBusinessName, monthSummary } from './cfdiShared';

// Totals for a month ('YYYY-MM') from the paid sales in it.
async function computeMonthSummary(period) {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return null;
  const { data, error } = await supabase
    .from('sales')
    .select('total_amount, refund_amount, cfdi_status')
    .gte('created_at', new Date(y, m - 1, 1).toISOString())
    .lt('created_at', new Date(y, m, 1).toISOString());
  if (error) throw error;
  return monthSummary(data);
}

// Factura Global: closed months, each with a frozen summary.
export function useGlobalPeriods({ open, showAlert, showConfirm, t }) {
  const [globalPeriods, setGlobalPeriods] = useState([]);
  const [newPeriod, setNewPeriod] = useState('');
  const [isSavingPeriod, setIsSavingPeriod] = useState(false);
  const [periodPreview, setPeriodPreview] = useState(null); // live summary for newPeriod
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const fetchGlobalPeriods = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('cfdi_global_periods')
        .select('*')
        .order('period', { ascending: false });
      if (error) throw error;
      setGlobalPeriods(data || []);
    } catch (err) {
      console.error('Error fetching global periods:', err);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { fetchGlobalPeriods(); }, 0);
    return () => clearTimeout(timer);
  }, [fetchGlobalPeriods]);

  // Live preview of the selected month's totals before closing.
  useEffect(() => {
    if (!open || !newPeriod) { setPeriodPreview(null); return; }
    let cancelled = false;
    setIsLoadingPreview(true);
    computeMonthSummary(newPeriod)
      .then(s => { if (!cancelled) setPeriodPreview(s); })
      .catch(err => { console.error(err); if (!cancelled) setPeriodPreview(null); })
      .finally(() => { if (!cancelled) setIsLoadingPreview(false); });
    return () => { cancelled = true; };
  }, [open, newPeriod]);

  const handleCloseGlobalPeriod = async () => {
    if (!newPeriod) return;
    try {
      setIsSavingPeriod(true);
      // Snapshot the totals now so a later refund can't change what was filed.
      let summary = null;
      try { summary = await computeMonthSummary(newPeriod); } catch { /* keep null */ }
      if (summary?.pendingCount > 0) {
        showAlert(t('common.error'), t('cfdiTab.pendingBlock').replace('{n}', summary.pendingCount).replace('{period}', newPeriod));
        return;
      }
      const { error } = await supabase
        .from('cfdi_global_periods')
        .upsert({ period: newPeriod, business_name: cachedBusinessName() || null, summary }, { onConflict: 'period' });
      if (error) throw error;
      showAlert(t('toast.success'), t('cfdiTab.periodClosed').replace('{period}', newPeriod));
      setNewPeriod('');
      fetchGlobalPeriods();
    } catch (err) {
      console.error(err);
      showAlert(t('common.error'), t('cfdiTab.closeError'));
    } finally {
      setIsSavingPeriod(false);
    }
  };

  const handleReopenGlobalPeriod = (period) => {
    showConfirm(t('cfdiTab.reopenPeriodTitle'), t('cfdiTab.reopenPeriodDesc').replace('{period}', period), async () => {
      try {
        setIsSavingPeriod(true);
        const { error } = await supabase.from('cfdi_global_periods').delete().eq('period', period);
        if (error) throw error;
        showAlert(t('toast.success'), t('cfdiTab.periodReopened').replace('{period}', period));
        fetchGlobalPeriods();
      } catch (err) {
        console.error(err);
        showAlert(t('common.error'), t('cfdiTab.reopenPeriodError'));
      } finally {
        setIsSavingPeriod(false);
      }
    });
  };

  return { globalPeriods, newPeriod, setNewPeriod, isSavingPeriod, periodPreview, isLoadingPreview, handleCloseGlobalPeriod, handleReopenGlobalPeriod };
}
