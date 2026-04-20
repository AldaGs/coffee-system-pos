import { useTranslation } from '../../hooks/useTranslation';

function MenuEditorTab({ 
  menuData, newCategoryName, setNewCategoryName, handleAddCategory, 
  newItemForm, setNewItemForm, handleAddDrink, handleDeleteCategory, 
  handleDeleteDrink, setEditingDrink, saveMenuToCloud, 
  recipes, inventoryItems, showAlert 
}) {
  const { t } = useTranslation();

  return (
    <div>
      <h1 style={{ color: 'var(--text-main)' }}>{t('menu.title')}</h1>
      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        
        <div style={{ flex: 1, minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* CATEGORY SECTION */}
          <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <h3 style={{ marginTop: 0, color: 'var(--text-main)' }}>{t('menu.addCategory')}</h3>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input 
                type="text" 
                placeholder={t('menu.placeholderCat')} 
                value={newCategoryName} 
                onChange={(e) => setNewCategoryName(e.target.value)} 
                style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} 
              />
              <button onClick={handleAddCategory} style={{ padding: '10px 20px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                {t('menu.btnAdd')}
              </button>
            </div>
          </div>

          {/* ITEM SECTION */}
          <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <h3 style={{ marginTop: 0, color: 'var(--text-main)' }}>{t('menu.addItem')}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <select 
                value={newItemForm.category} 
                onChange={(e) => setNewItemForm({ ...newItemForm, category: e.target.value })} 
                style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
              >
                {Object.keys(menuData.categories).map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              
              <div style={{ display: 'flex', gap: '10px' }}>
                <input 
                  type="text" maxLength="2" placeholder="☕" 
                  value={newItemForm.emoji} 
                  onChange={(e) => setNewItemForm({ ...newItemForm, emoji: e.target.value })} 
                  style={{ width: '60px', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', textAlign: 'center', fontSize: '1.2rem' }} 
                />
                <input 
                  type="text" 
                  placeholder={t('menu.placeholderName')} 
                  value={newItemForm.name} 
                  onChange={(e) => setNewItemForm({ ...newItemForm, name: e.target.value })} 
                  style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} 
                />
              </div>
              
              <input 
                type="number" 
                placeholder={t('menu.placeholderPrice')} 
                value={newItemForm.price} 
                onChange={(e) => setNewItemForm({ ...newItemForm, price: e.target.value })} 
                style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} 
              />
              
              {/* INVENTORY TRACKING */}
              <div style={{ marginBottom: '16px', background: 'var(--bg-main)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-main)' }}>
                  {t('menu.invStrategy')}
                </label>
                <select
                  value={newItemForm.inventoryMode || 'none'}
                  onChange={(e) => {
                    const mode = e.target.value;
                    if (mode === 'recipe') {
                      if (!newItemForm.name) {
                        showAlert(t('menu.alertMissingName'), t('menu.alertMissingNameDesc'));
                        return setNewItemForm({ ...newItemForm, inventoryMode: 'none' });
                      }
                      const matchedRecipe = recipes?.find(r => r.name.toLowerCase() === newItemForm.name.toLowerCase());
                      if (matchedRecipe) {
                        setNewItemForm({ ...newItemForm, inventoryMode: 'recipe', linkedRecipeId: matchedRecipe.id, linkedWarehouseId: '' });
                      } else {
                        showAlert(t('menu.alertNoRecipe'), t('menu.alertNoRecipeDesc'));
                        setNewItemForm({ ...newItemForm, inventoryMode: 'none', linkedRecipeId: '', linkedWarehouseId: '' });
                      }
                    } else {
                      setNewItemForm({ ...newItemForm, inventoryMode: mode, linkedRecipeId: '', linkedWarehouseId: '' });
                    }
                  }}
                  style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-main)' }}
                >
                  <option value="none">{t('menu.invNone')}</option>
                  <option value="standard">{t('menu.invStandard')}</option>
                  <option value="recipe">{t('menu.invRecipe')}</option>
                </select>

                {newItemForm.inventoryMode === 'standard' && (
                  <div className="fade-in" style={{ marginTop: '16px' }}>
                    <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px', color: 'var(--text-main)' }}>
                      {t('menu.selectPhysical')}
                    </label>
                    <select
                      value={newItemForm.linkedWarehouseId || ''}
                      onChange={(e) => setNewItemForm({ ...newItemForm, linkedWarehouseId: e.target.value })}
                      style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-main)' }}
                    >
                      <option value="">{t('menu.selectInvItem')}</option>
                      {[...(inventoryItems || [])].sort((a, b) => a.name.localeCompare(b.name)).map(item => (
                        <option key={item.id} value={item.id}>{item.name} ({item.current_stock} {item.unit} {t('menu.inStock')})</option>
                      ))}
                    </select>
                  </div>
                )}

                {newItemForm.inventoryMode === 'recipe' && newItemForm.linkedRecipeId && (
                  <div className="fade-in" style={{ marginTop: '16px', padding: '12px', background: 'rgba(39, 174, 96, 0.1)', color: '#27ae60', borderRadius: '6px', border: '1px solid rgba(39, 174, 96, 0.3)' }}>
                    <strong>{t('menu.recipeLinked')}</strong> {recipes.find(r => r.id === newItemForm.linkedRecipeId)?.name}
                  </div>
                )}
              </div>

              <button onClick={handleAddDrink} style={{ padding: '12px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                {t('menu.btnSaveItem')}
              </button>
            </div>
          </div>
        </div>

        {/* PREVIEW SECTION */}
        <div style={{ flex: 1, minWidth: '300px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>{t('menu.livePreview')}</h3>
          {Object.keys(menuData.categories).map(category => (
            <div key={category} style={{ marginBottom: '20px', padding: '10px', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ color: 'var(--text-main)', margin: 0 }}>{category}</h4>
                <button onClick={() => handleDeleteCategory(category)} style={{ background: 'transparent', border: 'none', color: '#e74c3c', cursor: 'pointer' }}>🗑️</button>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {menuData.categories[category].length === 0 ? (
                  <li style={{ color: 'var(--text-muted)', fontSize: '0.9rem', paddingLeft: '10px' }}>{t('menu.noItems')}</li>
                ) : (
                  menuData.categories[category].map(item => (
                    <li key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderBottom: '1px dashed var(--border)', fontSize: '0.95rem', background: 'var(--bg-surface)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ color: 'var(--text-main)' }}>{item.emoji || '•'} {item.name}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>${item.basePrice}</span>
                        <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                          {item.inventoryMode === 'recipe' ? (
                            <span style={{ background: '#e8f4fd', color: '#2980b9', padding: '2px 6px', borderRadius: '4px' }}>{t('menu.badgeRecipe')}</span>
                          ) : item.inventoryMode === 'standard' ? (
                            <span style={{ background: '#fdf3e8', color: '#e67e22', padding: '2px 6px', borderRadius: '4px' }}>{t('menu.badgeStandard')}</span>
                          ) : (
                            <span style={{ background: '#f1f2f6', color: '#7f8c8d', padding: '2px 6px', borderRadius: '4px' }}>{t('menu.badgeUntracked')}</span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => setEditingDrink({ categoryName: category, drink: item })} style={{ background: '#e8f4fd', border: 'none', color: '#2980b9', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>
                          {t('menu.btnEditMods')}
                        </button>
                        <button onClick={() => handleDeleteDrink(category, item.id, item.name)} style={{ background: '#ffeeee', border: 'none', color: '#e74c3c', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>
                          {t('menu.btnDelete')}
                        </button>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default MenuEditorTab;