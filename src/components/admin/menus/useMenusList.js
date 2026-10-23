import { useEffect, useEffectEvent, useState } from 'react';
import { loadMenus, addMenu, updateMenu, deleteMenu } from '../../../api/menus';
import { uploadMenuFile, deleteMenuUploads } from '../../../api/menuUploads';

// The menu rows and every list-level action. Each action reloads the list.
export function useMenusList({ showAlert, showConfirm, t }) {
  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadProgress, setUploadProgress] = useState(null);

  async function reload() {
    try {
      setMenus(await loadMenus());
    } catch (err) {
      showAlert?.('Error', err.message);
    } finally {
      setLoading(false);
    }
  }
  // Load once on mount; reload is also called imperatively after mutations.
  const loadOnMount = useEffectEvent(() => { reload(); });
  useEffect(() => { loadOnMount(); }, []);

  // Runs a write, then reloads; any error becomes an alert.
  const act = async (write) => {
    try { await write(); await reload(); }
    catch (err) { showAlert?.('Error', err.message); }
  };

  // New menus start as 'designed'; returns the created row so the caller can open it.
  const create = async (name) => {
    let created = null;
    await act(async () => { created = await addMenu({ name, kind: 'designed', priority: 1 }); });
    return created;
  };
  const rename = (menu, name) => act(() => updateMenu(menu.id, { name }));
  const toggleActive = (menu) => act(() => updateMenu(menu.id, { is_active: !menu.is_active }));
  const bumpPriority = (menu, delta) => act(() => updateMenu(menu.id, { priority: Math.max(0, menu.priority + delta) }));

  const remove = (menu) => {
    if (menu.kind === 'live') return;
    showConfirm?.(t('menusTab.deleteTitle'), t('menusTab.deleteDesc').replace('{name}', menu.name), () => act(async () => {
      // Best-effort storage cleanup before the row goes; FK cascade handles schedules.
      if (menu.kind === 'pdf' || menu.kind === 'image') await deleteMenuUploads(menu.id);
      await deleteMenu(menu.id);
    }));
  };

  // Upload flow: create the menu row first so we have a stable id for the
  // storage folder, then convert + upload, then write the data envelope.
  // If conversion fails after the row is created we still leave the row
  // (kind defaults to 'designed' empty), so the user can see and retry/delete.
  async function upload(file) {
    if (!file) return;
    const stem = file.name.replace(/\.[^.]+$/, '') || t('menusTab.defaultName');
    let menu;
    try {
      menu = await addMenu({ name: stem, kind: 'designed', priority: 1 });
    } catch (err) {
      showAlert?.('Error', err.message);
      return;
    }
    try {
      setUploadProgress({ phase: 'starting' });
      const { kind, data } = await uploadMenuFile(menu.id, file, p => setUploadProgress(p));
      await updateMenu(menu.id, { kind, data });
      await reload();
    } catch (err) {
      // Leave the empty row behind so the user can choose what to do; don't
      // silently delete their work.
      showAlert?.(t('menusTab.uploadError'), err.message);
    } finally {
      setUploadProgress(null);
    }
  }

  return { menus, loading, uploadProgress, reload, create, rename, toggleActive, bumpPriority, remove, upload };
}
