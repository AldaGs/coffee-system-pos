import { loadMenu } from '../../../api/menu';
import { debouncedSnapshot } from '../../../api/menuVersions';
import { useMenuStore } from '../../../store/useMenuStore';
import { useDialog } from '../../../hooks/useDialog';
import { useTranslation } from '../../../hooks/useTranslation';
import { isLocalMode } from '../../../utils/appMode';
import { fetchCloudSettings } from './useAdminData';

// Re-reads the menu so the screen matches what is persisted after a failed write.
export async function reloadMenuFromCloud() {
  const { menuData, setMenuData } = useMenuStore.getState();
  try {
    if (isLocalMode()) {
      setMenuData({ ...(menuData || {}), ...(await loadMenu()) });
      return;
    }
    const [menu, settings] = await Promise.all([loadMenu(), fetchCloudSettings().catch(() => ({}))]);
    setMenuData({ ...menu, ...settings });
  } catch (err) {
    console.error('Failed to reload menu after write error:', err.message);
  }
}

// Applies optimisticMenu, runs the writer, and rolls back on failure. One burst
// of edits becomes one menu_versions snapshot (debounced ~5s).
export function useMenuWrite(setIsSaving) {
  const { showAlert } = useDialog();
  const { t } = useTranslation();

  return async (optimisticMenu, writeFn, op) => {
    useMenuStore.getState().setMenuData(optimisticMenu);
    setIsSaving(true);
    try {
      await writeFn();
      debouncedSnapshot(op || writeFn.name || 'menu-write');
    } catch (err) {
      showAlert(t('common.error'), t('admin.cloudSaveFailPrefix') + err.message);
      await reloadMenuFromCloud();
    } finally {
      setIsSaving(false);
    }
  };
}
