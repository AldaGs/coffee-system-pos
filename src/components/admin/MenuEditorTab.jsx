import { useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';
import { useDialog } from '../../hooks/useDialog';
import { formatForDisplay, fromCents } from '../../utils/moneyUtils';
import ImageCropModal from './ImageCropModal';
import AssetLibraryModal from './AssetLibraryModal';
import MenuHistoryPanel from './MenuHistoryPanel';
import { MAX_SOURCE_BYTES } from '../../api/menuImages';
import { isLocalMode } from '../../utils/appMode';

// Full public URL → storage path ("assets/<hash>.webp"). Lets us match an
// item's image_url back to the storage object so we know which assets are used.
function urlToAssetPath(url) {
  if (!url) return null;
  const clean = url.split('?')[0];
  const marker = '/menu-assets/';
  const i = clean.indexOf(marker);
  return i === -1 ? null : clean.slice(i + marker.length);
}

function MenuEditorTab({
  menuData, newCategoryName, setNewCategoryName, handleAddCategory,
  newItemForm, setNewItemForm, handleAddDrink, handleDeleteCategory,
  handleDeleteDrink, setEditingDrink,
  recipes, inventoryItems,
  handleRenameCategory, editingItemId, setEditingItemId,
  handleMoveCategory, handleToggleCategoryVisibility, handleToggleDrinkVisibility,
  handleSetItemImage, handleClearItemImage,
  assets = [], assetsLoading = false, assetsBusy = false,
  loadAssets, handleSelectAssetForItem, handleDeleteAsset, handleUploadAsset,
  vendors = []
}) {
  const { t } = useTranslation();
  const { showPrompt, showAlert, showConfirm } = useDialog();
  const fileInputRef = useRef(null);
  // Refs to drive auto-scroll between the editor form and the item in the list.
  // The scroll container is `.admin-main` (not the window), so scrollIntoView —
  // which walks up to the real scroll parent — is what actually works here.
  const editorRef = useRef(null);
  const itemRefs = useRef(new Map());
  // Item id to scroll back to once editing finishes (save/cancel).
  const returnToItemId = useRef(null);
  const [pendingItemId, setPendingItemId] = useState(null);
  const [cropSrc, setCropSrc] = useState(null);
  // null = closed. { mode: 'manage' } or { mode: 'pick', itemId } when open.
  const [library, setLibrary] = useState(null);

  // Which item names reference each stored asset path — drives usage badges
  // and blocks deleting an in-use asset.
  const usageByPath = (() => {
    const map = new Map();
    for (const items of Object.values(menuData.categories || {})) {
      for (const item of items) {
        const path = urlToAssetPath(item.imageUrl);
        if (!path) continue;
        if (!map.has(path)) map.set(path, []);
        map.get(path).push(item.name);
      }
    }
    return map;
  })();

  // Product photos require Supabase Storage (the menu-assets bucket), which a
  // local install doesn't have. Rather than store heavy Base64 blobs in
  // IndexedDB (boot bloat), photos are a cloud-upgrade feature: gate the entry
  // points with an upsell prompt. Items still render their emoji/initial.
  const imageUpsell = () => {
    showAlert?.(
      t('menu.imageUpsellTitle') || 'Las fotos requieren la nube',
      t('menu.imageUpsellBody') || 'Las fotos de productos se guardan en la nube. Actualiza gratis a Supabase para habilitarlas. Por ahora se muestra el emoji del producto.'
    );
  };

  // When editing ends (editingItemId cleared by save or cancel), bring the
  // edited row back into view so the user doesn't lose their place in a long list.
  useEffect(() => {
    if (editingItemId) return;
    const id = returnToItemId.current;
    if (!id) return;
    returnToItemId.current = null;
    const el = itemRefs.current.get(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [editingItemId]);

  const openLibrary = (next) => {
    if (isLocalMode()) { imageUpsell(); return; }
    loadAssets?.();
    setLibrary(next);
  };

  const onPickAsset = (url) => {
    if (library?.mode === 'pick' && library.itemId && handleSelectAssetForItem) {
      handleSelectAssetForItem(library.itemId, url);
    }
    setLibrary(null);
  };

  const onDeleteAsset = (path) => {
    showConfirm?.(
      t('menu.confirmDeleteAsset') || 'Eliminar imagen',
      t('menu.confirmDeleteAssetBody') || '¿Eliminar esta imagen de la biblioteca? Esta acción no se puede deshacer.',
      () => handleDeleteAsset?.(path)
    );
  };

  const openPicker = (itemId) => {
    if (isLocalMode()) { imageUpsell(); return; }
    setPendingItemId(itemId);
    fileInputRef.current?.click();
  };

  const onFileSelected = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_SOURCE_BYTES) {
      showAlert?.('Imagen muy grande', 'El archivo supera 5 MB. Usa una imagen más pequeña.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result);
    reader.readAsDataURL(file);
  };

  const onCropConfirm = (blob) => {
    const itemId = pendingItemId;
    setCropSrc(null);
    setPendingItemId(null);
    if (itemId) {
      // Upload + assign to the item.
      handleSetItemImage?.(itemId, blob);
      setLibrary(null);
    } else {
      // "Upload new" from the manager with no target item — add to library only.
      handleUploadAsset?.(blob).then(() => loadAssets?.());
    }
  };

  return (
    <div className="admin-section fade-in">
      <div className="admin-section-header" style={{ marginBottom: '40px' }}>
        <h1 style={{ margin: 0, color: 'var(--text-main)', fontSize: '2rem', fontWeight: '800' }}>{t('menu.title')}</h1>
        <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0', fontSize: '1.1rem' }}>{t('menu.subtitle')}</p>
      </div>

      <div className="admin-grid-responsive" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(350px, 100%), 1fr))', gap: '32px', alignItems: 'flex-start' }}>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', minWidth: 0 }}>
          
          {/* CATEGORY SECTION */}
          <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '24px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: '800' }}>
              <Icon icon="lucide:folder-plus" style={{ color: 'var(--brand-color)' }} />
              {t('menu.addCategory')}
            </h3>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <input 
                type="text" 
                placeholder={t('menu.placeholderCat')} 
                value={newCategoryName} 
                onChange={(e) => setNewCategoryName(e.target.value)} 
                style={{ flex: 1, minWidth: '150px', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold' }} 
              />
              <button onClick={handleAddCategory} style={{ flex: '1', minWidth: '120px', padding: '14px 24px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(52, 152, 219, 0.2)' }}>
                <Icon icon="lucide:plus" />
                {t('menu.btnAdd')}
              </button>
            </div>
          </div>

          {/* ITEM SECTION */}
          <div ref={editorRef} style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', scrollMarginTop: '16px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '24px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: '800' }}>
              <Icon icon="lucide:plus-square" style={{ color: 'var(--brand-color)' }} />
              {t('menu.addItem')}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('menu.labelCategory') || 'Category'}</label>
                <select 
                  value={newItemForm.category} 
                  onChange={(e) => setNewItemForm({ ...newItemForm, category: e.target.value })} 
                  style={{ padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  {Object.keys(menuData.categories).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>Icon</label>
                  <input 
                    type="text" maxLength="2" placeholder="☕" 
                    value={newItemForm.emoji} 
                    onChange={(e) => setNewItemForm({ ...newItemForm, emoji: e.target.value })} 
                    style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', textAlign: 'center', fontSize: '1.5rem', outline: 'none' }} 
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('menu.labelName') || 'Item Name'}</label>
                  <input 
                    type="text" 
                    placeholder={t('menu.placeholderName')} 
                    value={newItemForm.name} 
                    onChange={(e) => setNewItemForm({ ...newItemForm, name: e.target.value })} 
                    style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold' }} 
                  />
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('menu.labelPriceType') || 'Price Type'}</label>
                  <select 
                    value={newItemForm.priceType || 'fixed'} 
                    onChange={(e) => setNewItemForm({ ...newItemForm, priceType: e.target.value })} 
                    style={{ padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    <option value="fixed">{t('menu.priceFixed') || 'Fixed Price'}</option>
                    <option value="variable">{t('menu.priceVariable') || 'Variable / Open Price'}</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('menu.labelPrice') || 'Base Price'}</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', fontWeight: 'bold', color: 'var(--text-muted)' }}>$</span>
                    <input 
                      type="number" 
                      placeholder={t('menu.placeholderPrice')} 
                      value={newItemForm.price} 
                      onChange={(e) => setNewItemForm({ ...newItemForm, price: e.target.value })} 
                      style={{ width: '100%', padding: '14px 14px 14px 32px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: '900', fontSize: '1.2rem' }} 
                    />
                  </div>
                </div>
              </div>

              {/* IVA TREATMENT — drives the tax split tinybooks ingests. MX:
                  prepared/served = 16%; unprepared food (ground coffee to-go) =
                  tasa 0%; exento = no IVA and no input-IVA credit. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('menu.labelIva') || 'Tratamiento de IVA'}</label>
                <select
                  value={newItemForm.ivaTreatment || 'tasa0'}
                  onChange={(e) => setNewItemForm({ ...newItemForm, ivaTreatment: e.target.value })}
                  style={{ padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  <option value="iva16">{t('menu.ivaRate16') || 'Grava IVA 16% (preparado)'}</option>
                  <option value="tasa0">{t('menu.ivaRate0') || 'Tasa 0% (alimento no preparado)'}</option>
                  <option value="exento">{t('menu.ivaExento') || 'Exento'}</option>
                </select>
              </div>

              {/* VENDOR / CONSIGNMENT OWNER — who this product belongs to. Snapshots
                  onto every sale line (via the cart spread) so the per-vendor
                  settlement report can total each vendor's sales. */}
              {vendors.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('menu.labelVendor') || 'Vendedor'}</label>
                  <select
                    value={newItemForm.vendorId || ''}
                    onChange={(e) => setNewItemForm({ ...newItemForm, vendorId: e.target.value })}
                    style={{ padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    <option value="">{t('menu.vendorHouse') || 'Casa (sin vendedor)'}</option>
                    {/* Hide deactivated vendors, but keep the one already assigned
                        to this item selectable so editing doesn't silently drop it. */}
                    {vendors
                      .filter(v => v.isActive !== false || String(v.id) === String(newItemForm.vendorId))
                      .map(v => (
                        <option key={v.id} value={v.id}>{v.name}{v.isActive === false ? ` · ${t('vendors.inactive') || 'inactivo'}` : ''}</option>
                      ))}
                  </select>

                  {/* Production cost — only for cost-recovery vendors. The house
                      recovers this per unit; the vendor keeps the rest. */}
                  {vendors.find(v => String(v.id) === String(newItemForm.vendorId))?.splitType === 'cost' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('menu.labelVendorCost') || 'Costo de producción (unitario)'}</label>
                      <input
                        type="number" min="0" step="0.01"
                        value={newItemForm.vendorUnitCost || ''}
                        onChange={(e) => setNewItemForm({ ...newItemForm, vendorUnitCost: e.target.value })}
                        placeholder="35.00"
                        style={{ padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold' }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* INVENTORY TRACKING */}
              <div style={{ marginTop: '8px', background: 'var(--bg-main)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', marginBottom: '12px', color: 'var(--text-main)' }}>
                  <Icon icon="lucide:package-search" style={{ color: 'var(--brand-color)' }} />
                  {t('menu.invStrategy')}
                </label>
                <select
                  value={newItemForm.inventoryMode || 'none'}
                  onChange={(e) => {
                    const mode = e.target.value;
                    if (mode === 'recipe') {
                      setNewItemForm({ ...newItemForm, inventoryMode: 'recipe', linkedRecipeId: '', linkedWarehouseId: '' });
                    } else {
                      setNewItemForm({ ...newItemForm, inventoryMode: mode, linkedRecipeId: '', linkedWarehouseId: '' });
                    }
                  }}
                  style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  <option value="none">{t('menu.invNone')}</option>
                  <option value="standard">{t('menu.invStandard')}</option>
                  <option value="recipe">{t('menu.invRecipe')}</option>
                </select>

                {newItemForm.inventoryMode === 'standard' && (
                  <div className="fade-in" style={{ marginTop: '16px' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '8px', color: 'var(--text-muted)', fontWeight: 'bold' }}>
                      {t('menu.selectPhysical')}
                    </label>
                    <select
                      value={newItemForm.linkedWarehouseId || ''}
                      onChange={(e) => setNewItemForm({ ...newItemForm, linkedWarehouseId: e.target.value })}
                      style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      <option value="">{t('menu.selectInvItem')}</option>
                      {[...(inventoryItems || [])].sort((a, b) => a.name.localeCompare(b.name)).map(item => (
                        <option key={item.id} value={item.id}>{item.name} ({item.current_stock} {item.unit} {t('menu.inStock')})</option>
                      ))}
                    </select>
                  </div>
                )}

                {newItemForm.inventoryMode === 'recipe' && (
                  <div className="fade-in" style={{ marginTop: '16px' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '8px', color: 'var(--text-muted)', fontWeight: 'bold' }}>
                      {t('menu.selectRecipe')}
                    </label>
                    <select
                      value={newItemForm.linkedRecipeId || ''}
                      onChange={(e) => setNewItemForm({ ...newItemForm, linkedRecipeId: e.target.value })}
                      style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      <option value="">{t('menu.pickRecipe')}</option>
                      {[...(recipes || [])].sort((a, b) => a.name.localeCompare(b.name)).map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {newItemForm.inventoryMode === 'recipe' && newItemForm.linkedRecipeId && (
                  <div className="fade-in" style={{ marginTop: '16px', padding: '14px', background: 'rgba(39, 174, 96, 0.05)', color: '#27ae60', borderRadius: '12px', border: '1px solid rgba(39, 174, 96, 0.2)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icon icon="lucide:link-2" />
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase' }}>{t('menu.recipeLinked')}</div>
                      <div style={{ fontWeight: '900' }}>{recipes.find(r => r.id === newItemForm.linkedRecipeId)?.name}</div>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button onClick={handleAddDrink} style={{ flex: 1, padding: '16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '16px', cursor: 'pointer', fontWeight: '900', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: '0 8px 20px rgba(39, 174, 96, 0.2)' }}>
                  <Icon icon="lucide:save" />
                  {editingItemId ? t('menu.btnUpdateItem') : t('menu.btnSaveItem')}
                </button>
                {editingItemId && (
                  <button
                    onClick={() => {
                      setEditingItemId(null);
                      setNewItemForm({
                        ...newItemForm,
                        name: '',
                        price: '',
                        emoji: '☕',
                        ivaTreatment: 'tasa0',
                        inventoryMode: 'none',
                        linkedWarehouseId: '',
                        linkedRecipeId: '',
                        vendorId: '',
                        vendorUnitCost: ''
                      });
                    }}
                    style={{ padding: '16px 20px', background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border)', borderRadius: '16px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    <Icon icon="lucide:x" />
                    {t('menu.btnCancel')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* PREVIEW SECTION */}
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', height: 'fit-content', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', gap: '12px', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: '800' }}>
              <Icon icon="lucide:layout-panel-left" style={{ color: 'var(--brand-color)' }} />
              {t('menu.livePreview')}
            </h3>
            <button
              onClick={() => openLibrary({ mode: 'manage' })}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--brand-color)', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              <Icon icon="lucide:images" />
              {t('menu.assetLibrary') || 'Biblioteca de imágenes'}
            </button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {(() => {
              const allCats = Object.keys(menuData.categories);
              const order = menuData.categoryOrder || [];
              const ordered = [
                ...order.filter(c => allCats.includes(c)),
                ...allCats.filter(c => !order.includes(c)),
              ];
              const hiddenSet = new Set(menuData.hiddenCategories || []);
              return ordered.map((category, idx) => {
                const isHidden = hiddenSet.has(category);
                return (
              <div key={category} style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '20px', overflow: 'hidden', opacity: isHidden ? 0.55 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid var(--border)' }}>
                  <h4 style={{ color: 'var(--text-main)', margin: 0, fontWeight: '900', fontSize: '1.1rem' }}>
                    {category}
                    {isHidden && (
                      <span style={{ marginLeft: '8px', fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        {t('menu.categoryHiddenBadge') || 'hidden'}
                      </span>
                    )}
                  </h4>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleMoveCategory && handleMoveCategory(category, -1)}
                      disabled={idx === 0}
                      style={{ background: 'rgba(52, 152, 219, 0.05)', border: 'none', color: 'var(--brand-color)', cursor: idx === 0 ? 'not-allowed' : 'pointer', height: '32px', width: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: idx === 0 ? 0.4 : 1 }}
                      title={t('menu.titleMoveCategoryUp') || 'Move up'}
                    >
                      <Icon icon="lucide:arrow-up" style={{ fontSize: '1.1rem' }} />
                    </button>
                    <button
                      onClick={() => handleMoveCategory && handleMoveCategory(category, 1)}
                      disabled={idx === ordered.length - 1}
                      style={{ background: 'rgba(52, 152, 219, 0.05)', border: 'none', color: 'var(--brand-color)', cursor: idx === ordered.length - 1 ? 'not-allowed' : 'pointer', height: '32px', width: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: idx === ordered.length - 1 ? 0.4 : 1 }}
                      title={t('menu.titleMoveCategoryDown') || 'Move down'}
                    >
                      <Icon icon="lucide:arrow-down" style={{ fontSize: '1.1rem' }} />
                    </button>
                    <button
                      onClick={() => handleToggleCategoryVisibility && handleToggleCategoryVisibility(category)}
                      style={{ background: 'rgba(52, 152, 219, 0.05)', border: 'none', color: 'var(--brand-color)', cursor: 'pointer', height: '32px', width: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title={isHidden ? (t('menu.titleShowCategory') || 'Show in register') : (t('menu.titleHideCategory') || 'Hide from register')}
                    >
                      <Icon icon={isHidden ? 'lucide:eye-off' : 'lucide:eye'} style={{ fontSize: '1.1rem' }} />
                    </button>
                    <button
                      onClick={() => {
                        showPrompt(t('menu.promptRenameCategory'), category, (newName) => {
                          if (newName && newName.trim() && newName !== category) {
                            handleRenameCategory(category, newName.trim());
                          }
                        });
                      }}
                      style={{ background: 'rgba(52, 152, 219, 0.05)', border: 'none', color: 'var(--brand-color)', cursor: 'pointer', height: '32px', width: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title={t('menu.titleRenameCategory')}
                    >
                      <Icon icon="lucide:edit-3" style={{ fontSize: '1.1rem' }} />
                    </button>
                    <button onClick={() => handleDeleteCategory(category)} style={{ background: 'rgba(231, 76, 60, 0.05)', border: 'none', color: '#e74c3c', cursor: 'pointer', height: '32px', width: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon icon="lucide:trash-2" style={{ fontSize: '1.1rem' }} />
                    </button>
                  </div>
                </div>
                <div style={{ padding: '8px' }}>
                  {menuData.categories[category].length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.9rem' }}>
                      {t('menu.noItems')}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {menuData.categories[category].map(item => (
                        <div
                          key={item.id}
                          ref={(el) => {
                            if (el) itemRefs.current.set(item.id, el);
                            else itemRefs.current.delete(item.id);
                          }}
                          style={{ display: 'flex', flexDirection: 'column', padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border)', gap: '10px', opacity: item.isHidden ? 0.55 : 1, scrollMarginTop: '16px', scrollMarginBottom: '16px' }}
                        >
                          {/* Top row: item image/info + visibility & delete icons */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1', minWidth: 0 }}>
                              <div
                                onClick={() => openPicker(item.id)}
                                title={item.imageUrl ? 'Cambiar foto' : 'Subir foto'}
                                style={{ fontSize: '1.5rem', background: 'var(--bg-main)', width: '48px', height: '48px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', position: 'relative', flexShrink: 0 }}
                              >
                                {item.imageUrl ? (
                                  <img src={item.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                  <span>{item.emoji || '•'}</span>
                                )}
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); openLibrary({ mode: 'pick', itemId: item.id }); }}
                                title="Elegir de la biblioteca"
                                style={{ background: 'transparent', border: 'none', color: 'var(--brand-color)', cursor: 'pointer', padding: 4, flexShrink: 0 }}
                              >
                                <Icon icon="lucide:images" />
                              </button>
                              {item.imageUrl && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleClearItemImage && handleClearItemImage(item.id); }}
                                  title="Quitar foto"
                                  style={{ background: 'transparent', border: 'none', color: '#e74c3c', cursor: 'pointer', padding: 4, flexShrink: 0 }}
                                >
                                  <Icon icon="lucide:image-off" />
                                </button>
                              )}
                              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                <span style={{ color: 'var(--text-main)', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {item.name}
                                  {item.isHidden && (
                                    <span style={{ marginLeft: '8px', fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                      {t('menu.itemHiddenBadge') || 'hidden'}
                                    </span>
                                  )}
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                                  <span style={{ color: '#27ae60', fontWeight: '900', fontSize: '0.85rem' }}>{formatForDisplay(item.basePrice)}</span>
                                  <span style={{ height: '3px', width: '3px', background: 'var(--border)', borderRadius: '50%', flexShrink: 0 }} />
                                  {item.priceType === 'variable' && (
                                    <>
                                      <span style={{ color: 'var(--brand-color)', fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase' }}>{t('menu.badgeVariable') || 'Open Price'}</span>
                                      <span style={{ height: '3px', width: '3px', background: 'var(--border)', borderRadius: '50%', flexShrink: 0 }} />
                                    </>
                                  )}
                                  {item.inventoryMode === 'recipe' ? (
                                    <span style={{ color: '#2980b9', fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase' }}>{t('menu.badgeRecipe')}</span>
                                  ) : item.inventoryMode === 'standard' ? (
                                    <span style={{ color: '#e67e22', fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase' }}>{t('menu.badgeStandard')}</span>
                                  ) : (
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase' }}>{t('menu.badgeUntracked')}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                              <button
                                onClick={() => handleToggleDrinkVisibility && handleToggleDrinkVisibility(category, item.id)}
                                style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', color: 'var(--brand-color)', borderRadius: '10px', padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                title={item.isHidden ? (t('menu.titleShowItem') || 'Show on menu & register') : (t('menu.titleHideItem') || 'Hide from menu & register')}
                              >
                                <Icon icon={item.isHidden ? 'lucide:eye-off' : 'lucide:eye'} />
                              </button>
                              <button onClick={() => handleDeleteDrink(category, item.id, item.name)} style={{ background: 'rgba(231, 76, 60, 0.05)', border: '1px solid rgba(231, 76, 60, 0.2)', color: '#e74c3c', borderRadius: '10px', padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                <Icon icon="lucide:trash-2" />
                              </button>
                            </div>
                          </div>
                          {/* Bottom row: edit action buttons */}
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => {
                                setEditingItemId(item.id);
                                setNewItemForm({
                                  ...newItemForm,
                                  category: category,
                                  name: item.name,
                                  price: String(fromCents(item.basePrice ?? 0)),
                                  priceType: item.priceType || 'fixed',
                                  emoji: item.emoji || '☕',
                                  ivaTreatment: item.ivaTreatment || 'tasa0',
                                  inventoryMode: item.inventoryMode || 'none',
                                  linkedWarehouseId: item.linkedWarehouseId || '',
                                  linkedRecipeId: item.linkedRecipeId || '',
                                  vendorId: item.vendorId || '',
                                  vendorUnitCost: item.vendorUnitCostCents ? String(fromCents(item.vendorUnitCostCents)) : ''
                                });
                                // Remember where to return after save/cancel, then
                                // scroll the editor form into view (scrollIntoView
                                // targets the real scroll parent, .admin-main).
                                returnToItemId.current = item.id;
                                editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }}
                              style={{ flex: 1, minWidth: 0, background: 'var(--bg-main)', border: '1px solid var(--border)', color: 'var(--brand-color)', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                              title={t('menu.titleEditDetails')}
                            >
                              <Icon icon="lucide:edit-3" style={{ flexShrink: 0 }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('menu.btnEditDetails')}</span>
                            </button>
                            <button onClick={() => setEditingDrink({ categoryName: category, drink: item })} style={{ flex: 1, minWidth: 0, background: 'var(--bg-main)', border: '1px solid var(--border)', color: 'var(--brand-color)', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                              <Icon icon="lucide:settings-2" style={{ flexShrink: 0 }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('menu.btnEditMods')}</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
                );
              });
            })()}
          </div>
        </div>
      </div>

      <MenuHistoryPanel />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={onFileSelected}
      />
      {cropSrc && (
        <ImageCropModal
          imageSrc={cropSrc}
          onConfirm={onCropConfirm}
          onCancel={() => { setCropSrc(null); setPendingItemId(null); }}
        />
      )}
      {library && (
        <AssetLibraryModal
          assets={assets}
          usageByPath={usageByPath}
          loading={assetsLoading}
          busy={assetsBusy}
          onSelect={library.mode === 'pick' ? onPickAsset : undefined}
          onUploadNew={() => openPicker(library.mode === 'pick' ? library.itemId : null)}
          onDelete={onDeleteAsset}
          onClose={() => setLibrary(null)}
        />
      )}
    </div>
  );
}

export default MenuEditorTab;