import { useState } from 'react';
import { uploadAsset, clearItemImage, setItemImageUrl, listAssets, deleteAsset } from '../../../api/menuImages';
import { useMenuStore } from '../../../store/useMenuStore';
import { useDialog } from '../../../hooks/useDialog';
import { useTranslation } from '../../../hooks/useTranslation';

// Item photos and the shared image library (content-addressed, deduplicated).
export function useMenuAssets({ runMenuWrite }) {
  const menuData = useMenuStore((s) => s.menuData);
  const { showAlert } = useDialog();
  const { t } = useTranslation();
  const [assets, setAssets] = useState([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsBusy, setAssetsBusy] = useState(false);

  const withItemImage = (itemId, imageUrl) => {
    const next = { ...menuData, categories: { ...menuData.categories } };
    for (const cat of Object.keys(next.categories)) {
      const idx = next.categories[cat].findIndex((it) => it.id === itemId);
      if (idx === -1) continue;
      next.categories[cat] = next.categories[cat].map((it, i) => (i === idx ? { ...it, imageUrl } : it));
      break;
    }
    return next;
  };

  const loadAssets = async () => {
    setAssetsLoading(true);
    try {
      setAssets(await listAssets());
    } catch (err) {
      console.error('listAssets failed:', err);
    } finally {
      setAssetsLoading(false);
    }
  };

  const handleSetItemImage = (itemId, blob) => {
    runMenuWrite(withItemImage(itemId, URL.createObjectURL(blob)), async () => {
      await setItemImageUrl(itemId, await uploadAsset(blob));
      loadAssets();
    });
  };

  const handleClearItemImage = (itemId) => {
    runMenuWrite(withItemImage(itemId, ''), () => clearItemImage(itemId));
  };

  const handleSelectAssetForItem = (itemId, url) => {
    runMenuWrite(withItemImage(itemId, url), () => setItemImageUrl(itemId, url));
  };

  // Upload from the library itself, with no target item. Returns the asset URL.
  const handleUploadAsset = async (blob) => {
    setAssetsBusy(true);
    try {
      return await uploadAsset(blob);
    } finally {
      setAssetsBusy(false);
    }
  };

  const handleDeleteAsset = async (path) => {
    setAssetsBusy(true);
    try {
      await deleteAsset(path);
      await loadAssets();
    } catch (err) {
      console.error('deleteAsset failed:', err);
      showAlert(t('common.error') || 'Error', t('menu.deleteAssetFailed') || 'No se pudo eliminar la imagen.');
    } finally {
      setAssetsBusy(false);
    }
  };

  return {
    assets, assetsLoading, assetsBusy, loadAssets,
    handleSetItemImage, handleClearItemImage, handleSelectAssetForItem, handleUploadAsset, handleDeleteAsset,
  };
}
