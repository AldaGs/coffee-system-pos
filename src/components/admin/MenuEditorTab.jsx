import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';
import { useDialog } from '../../hooks/useDialog';

function MenuEditorTab({ 
  menuData, newCategoryName, setNewCategoryName, handleAddCategory, 
  newItemForm, setNewItemForm, handleAddDrink, handleDeleteCategory, 
  handleDeleteDrink, setEditingDrink, 
  recipes, inventoryItems,
  handleRenameCategory, editingItemId, setEditingItemId
}) {
  const { t } = useTranslation();
  const { showPrompt } = useDialog();

  return (
    <div className="admin-section fade-in">
      <div className="admin-section-header" style={{ marginBottom: '40px' }}>
        <h1 style={{ margin: 0, color: 'var(--text-main)', fontSize: '2rem', fontWeight: '800' }}>{t('menu.title')}</h1>
        <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0', fontSize: '1.1rem' }}>{t('menu.subtitle')}</p>
      </div>

      <div className="admin-grid-responsive" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '32px', alignItems: 'flex-start' }}>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          
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
          <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)' }}>
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
                        inventoryMode: 'none',
                        linkedWarehouseId: '',
                        linkedRecipeId: ''
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
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', height: 'fit-content' }}>
          <h3 style={{ marginTop: 0, marginBottom: '24px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: '800' }}>
            <Icon icon="lucide:layout-panel-left" style={{ color: 'var(--brand-color)' }} />
            {t('menu.livePreview')}
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {Object.keys(menuData.categories).map(category => (
              <div key={category} style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '20px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid var(--border)' }}>
                  <h4 style={{ color: 'var(--text-main)', margin: 0, fontWeight: '900', fontSize: '1.1rem' }}>{category}</h4>
                  <div style={{ display: 'flex', gap: '8px' }}>
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
                        <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border)', flexWrap: 'wrap', gap: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: '1', minWidth: '200px' }}>
                            <div style={{ fontSize: '1.5rem', background: 'var(--bg-main)', width: '48px', height: '48px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {item.emoji || '•'}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ color: 'var(--text-main)', fontWeight: 'bold' }}>{item.name}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                                <span style={{ color: '#27ae60', fontWeight: '900', fontSize: '0.85rem' }}>${item.basePrice.toFixed(2)}</span>
                                <span style={{ height: '3px', width: '3px', background: 'var(--border)', borderRadius: '50%' }} />
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
                          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                            <button
                              onClick={() => {
                                setEditingItemId(item.id);
                                setNewItemForm({
                                  ...newItemForm,
                                  category: category,
                                  name: item.name,
                                  price: String(item.basePrice ?? ''),
                                  emoji: item.emoji || '☕',
                                  inventoryMode: item.inventoryMode || 'none',
                                  linkedWarehouseId: item.linkedWarehouseId || '',
                                  linkedRecipeId: item.linkedRecipeId || ''
                                });
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', color: 'var(--brand-color)', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}
                              title={t('menu.titleEditDetails')}
                            >
                              <Icon icon="lucide:edit-3" />
                              {t('menu.btnEditDetails')}
                            </button>
                            <button onClick={() => setEditingDrink({ categoryName: category, drink: item })} style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', color: 'var(--brand-color)', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Icon icon="lucide:settings-2" />
                              {t('menu.btnEditMods')}
                            </button>
                            <button onClick={() => handleDeleteDrink(category, item.id, item.name)} style={{ background: 'rgba(231, 76, 60, 0.05)', border: '1px solid rgba(231, 76, 60, 0.1)', color: '#e74c3c', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Icon icon="lucide:trash-2" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default MenuEditorTab;