import { useMemo } from 'react';
import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';

function RecipeBuilderTab({ recipes, activeRecipe, setActiveRecipe, handleCreateDraftRecipe, menuData, handleAddIngredient, handleUpdateIngredient, handleDeleteIngredient, handleDeleteRecipe, handleSaveRecipeToCloud, inventoryItems }) {
  const { t } = useTranslation();

  // --- 1. ALPHABETICAL INVENTORY SORTING ---
  const sortedInventory = useMemo(() => {
    if (!inventoryItems) return [];
    return [...inventoryItems].sort((a, b) => a.name.localeCompare(b.name));
  }, [inventoryItems]);

  // --- 2. GLOBAL DYNAMIC MATH ENGINE ---
  const calculateLiveCost = (ingredients) => {
    return (ingredients || []).reduce((sum, ing) => {
      if (ing.isManual) {
        return sum + (parseFloat(ing.qty || 0) * parseFloat(ing.manualCostPerUnit || 0));
      } else {
        const matchedItem = inventoryItems?.find(inv => inv.name === ing.name);
        const unitCost = matchedItem?.unit_cost || 0;
        return sum + (parseFloat(ing.qty || 0) * unitCost);
      }
    }, 0);
  };

  let linkedMenuItemName = null;
  if (activeRecipe && menuData && menuData.categories) {
    const categoryList = Object.values(menuData.categories);
    for (const category of categoryList) {
      const itemsArray = Array.isArray(category) ? category : (Array.isArray(category?.items) ? category.items : []);
      const foundItem = itemsArray.find(item => String(item?.linkedRecipeId) === String(activeRecipe.id));
      if (foundItem) {
        linkedMenuItemName = foundItem.name;
        break;
      }
    }
  }

  return (
    <div className="admin-section fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div>
          <h1 style={{ margin: 0, color: 'var(--text-main)', fontSize: '2rem', fontWeight: '800' }}>{t('recipe.title')}</h1>
          <p style={{ color: 'var(--text-muted)', margin: '5px 0 0 0', fontSize: '1.1rem' }}>{t('recipe.subtitle')}</p>
        </div>
        <button
          onClick={handleCreateDraftRecipe}
          style={{ padding: '12px 24px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(52, 152, 219, 0.2)' }}>
          <Icon icon="lucide:plus" />
          {t('recipe.btnNew')}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', alignItems: 'flex-start' }}>

        {/* LEFT: SAVED RECIPES LIST */}
        <div style={{ flex: '0 0 320px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '75vh', overflowY: 'auto', border: '1px solid var(--border)' }}>
          <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border)', paddingBottom: '16px', color: 'var(--text-main)', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon icon="lucide:book-open" style={{ color: 'var(--brand-color)' }} />
            {t('recipe.savedTitle')}
          </h3>

          {recipes.length === 0 && !activeRecipe && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Icon icon="lucide:file-question" style={{ fontSize: '2.5rem', marginBottom: '12px', opacity: 0.3 }} />
              <p style={{ margin: 0, fontSize: '0.9rem', fontStyle: 'italic' }}>{t('recipe.noRecipes')}</p>
            </div>
          )}

          {activeRecipe && activeRecipe.isDraft && (
            <button
              style={{ padding: '16px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '16px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}
            >
              <Icon icon="lucide:pencil-line" />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeRecipe.name || t('recipe.draft')}</span>
            </button>
          )}

          {recipes.map(recipe => (
            <button
              key={recipe.id}
              onClick={() => setActiveRecipe(recipe)}
              style={{ padding: '16px', background: activeRecipe?.id === recipe.id ? 'var(--brand-color)' : 'var(--bg-main)', color: activeRecipe?.id === recipe.id ? 'white' : 'var(--text-main)', border: `1px solid ${activeRecipe?.id === recipe.id ? 'var(--brand-color)' : 'var(--border)'}`, borderRadius: '16px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold', transition: 'all 0.2s', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{recipe.name}</span>
              <span style={{ fontSize: '0.85rem', opacity: 0.9, background: activeRecipe?.id === recipe.id ? 'rgba(255,255,255,0.2)' : 'var(--bg-surface)', padding: '4px 10px', borderRadius: '10px' }}>
                ${calculateLiveCost(recipe.ingredients).toFixed(2)}
              </span>
            </button>
          ))}
        </div>

        {/* RIGHT: DYNAMIC BUILDER */}
        {activeRecipe ? (
          <div style={{ flex: 1, minWidth: '400px', display: 'flex', flexDirection: 'column', gap: '32px' }}>

            {/* TOP HEADER SETTINGS */}
            <div style={{ background: 'var(--bg-surface)', padding: '32px', borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '24px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icon icon="lucide:tag" style={{ color: 'var(--brand-color)' }} />
                    {t('recipe.labelName')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('recipe.placeholderName')}
                    value={activeRecipe.name}
                    onChange={(e) => setActiveRecipe({ ...activeRecipe, name: e.target.value })}
                    style={{ padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '1.2rem', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icon icon="lucide:link" style={{ color: 'var(--brand-color)' }} />
                    {t('recipe.linkStatus')}
                  </label>
                  {linkedMenuItemName ? (
                    <div style={{ padding: '14px', background: 'rgba(52, 152, 219, 0.05)', color: '#2980b9', borderRadius: '12px', border: '1px solid rgba(52, 152, 219, 0.2)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon icon="lucide:check-circle-2" />
                      {t('recipe.linkedTo')} {linkedMenuItemName}
                    </div>
                  ) : (
                    <div style={{ padding: '14px', background: 'rgba(231, 76, 60, 0.05)', color: '#e74c3c', borderRadius: '12px', border: '1px dashed rgba(231, 76, 60, 0.3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon icon="lucide:alert-circle" />
                      {t('recipe.notLinked')}
                    </div>
                  )}
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
                    {t('recipe.manageLinks')}
                  </p>
                </div>
              </div>
            </div>

            {/* INGREDIENTS LIST */}
            <div style={{ background: 'var(--bg-surface)', padding: '32px', borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                <h3 style={{ margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Icon icon="lucide:list-ordered" style={{ color: 'var(--brand-color)' }} />
                  {t('recipe.cogsTitle')}
                </h3>
                <button onClick={handleAddIngredient} style={{ padding: '10px 20px', background: 'rgba(52, 152, 219, 0.1)', color: '#3498db', border: '1px solid #3498db', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Icon icon="lucide:plus-circle" />
                  {t('recipe.btnAddRow')}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {(!activeRecipe.ingredients || activeRecipe.ingredients.length === 0) && (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Icon icon="lucide:layers" style={{ fontSize: '2.5rem', marginBottom: '12px', opacity: 0.3 }} />
                    <p style={{ margin: 0, fontStyle: 'italic' }}>{t('recipe.emptyIngredients')}</p>
                  </div>
                )}

                {activeRecipe.ingredients.map(ing => {
                  const isManual = ing.isManual || false;
                  const matchedWarehouseItem = !isManual ? inventoryItems?.find(inv => inv.name === ing.name) : null;

                  return (
                    <div key={ing.id} style={{ display: 'grid', gridTemplateColumns: 'auto 2fr 1.5fr 1fr 1fr auto', gap: '12px', alignItems: 'center', background: isManual ? 'rgba(155, 89, 182, 0.05)' : 'var(--bg-main)', padding: '12px', borderRadius: '16px', border: `1px solid ${isManual ? 'rgba(155, 89, 182, 0.2)' : 'var(--border)'}` }}>
                      <button 
                        onClick={() => handleUpdateIngredient(ing.id, 'isManual', !isManual)}
                        title={isManual ? 'Switch to Live Inventory' : 'Switch to Manual Cost'}
                        style={{ padding: '10px', background: isManual ? '#9b59b6' : 'var(--bg-surface)', color: isManual ? 'white' : 'var(--text-muted)', border: isManual ? 'none' : '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', display: 'flex' }}
                      >
                        <Icon icon={isManual ? 'lucide:database-backup' : 'lucide:database'} />
                      </button>

                      {isManual ? (
                        <input
                          type="text"
                          placeholder={t('recipe.placeholderTheoretical')}
                          value={ing.name || ''}
                          onChange={(e) => handleUpdateIngredient(ing.id, 'name', e.target.value)}
                          style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #9b59b6', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }}
                        />
                      ) : (
                        <select
                          value={ing.name}
                          onChange={(e) => handleUpdateIngredient(ing.id, 'name', e.target.value)}
                          style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}
                        >
                          <option value="">{t('recipe.selectWarehouse')}</option>
                          {sortedInventory.map(invItem => (
                            <option key={invItem.id} value={invItem.name}>{invItem.name}</option>
                          ))}
                        </select>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-surface)', border: `1px solid ${isManual ? '#9b59b6' : 'var(--border)'}`, borderRadius: '10px', overflow: 'hidden' }}>
                        <input
                          type="number"
                          placeholder={t('recipe.qty')}
                          value={ing.qty || ''}
                          onChange={(e) => handleUpdateIngredient(ing.id, 'qty', e.target.value)}
                          style={{ width: '100%', padding: '12px', border: 'none', background: 'transparent', color: 'var(--text-main)', outline: 'none', textAlign: 'right' }}
                        />
                        <div style={{ padding: '0 10px', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 'bold', background: 'rgba(0,0,0,0.03)', height: '100%', display: 'flex', alignItems: 'center' }}>
                          {isManual ? (
                            <input 
                              type="text" 
                              placeholder="unit"
                              value={ing.manualUnit || ''} 
                              onChange={(e) => handleUpdateIngredient(ing.id, 'manualUnit', e.target.value)}
                              style={{ width: '40px', fontSize: '0.8rem', border: 'none', background: 'transparent', color: 'var(--text-main)', outline: 'none', textAlign: 'center' }}
                            />
                          ) : (
                            matchedWarehouseItem ? matchedWarehouseItem.unit : 'unit'
                          )}
                        </div>
                      </div>

                      {isManual ? (
                        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-surface)', border: '1px solid #9b59b6', borderRadius: '10px', paddingLeft: '10px' }}>
                          <span style={{ color: '#9b59b6', fontSize: '0.8rem', fontWeight: 'bold' }}>$</span>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Cost"
                            value={ing.manualCostPerUnit || ''}
                            onChange={(e) => handleUpdateIngredient(ing.id, 'manualCostPerUnit', e.target.value)}
                            style={{ width: '100%', padding: '12px', border: 'none', background: 'transparent', color: 'var(--text-main)', outline: 'none' }}
                          />
                        </div>
                      ) : (
                        <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', background: 'rgba(0,0,0,0.02)', borderRadius: '10px' }}>
                          ${(matchedWarehouseItem?.unit_cost || 0).toFixed(4)}
                        </div>
                      )}

                      <div style={{ padding: '12px', borderRadius: '10px', background: 'var(--bg-main)', color: 'var(--text-main)', textAlign: 'right', fontWeight: '900', border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginRight: '4px' }}>$</span>
                        {isManual 
                          ? (parseFloat(ing.qty || 0) * parseFloat(ing.manualCostPerUnit || 0)).toFixed(2)
                          : (matchedWarehouseItem && ing.qty ? (parseFloat(ing.qty) * (matchedWarehouseItem.unit_cost || 0)).toFixed(2) : '0.00')
                        }
                      </div>

                      <button onClick={() => handleDeleteIngredient(ing.id)} style={{ padding: '10px', background: 'rgba(231, 76, 60, 0.05)', color: '#e74c3c', border: 'none', borderRadius: '10px', cursor: 'pointer', display: 'flex' }}>
                        <Icon icon="lucide:trash-2" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* PROFIT ENGINE */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px' }}>
              <div style={{ background: 'var(--bg-surface)', padding: '32px', borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', borderTop: '4px solid #3498db' }}>
                <h3 style={{ marginTop: 0, marginBottom: '24px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: '800' }}>
                  <Icon icon="lucide:target" style={{ color: '#3498db' }} />
                  {t('recipe.targetFoodCost')}
                </h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '32px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '2.5rem', fontWeight: '900', color: 'var(--text-main)' }}>{activeRecipe.target_margin || 25}%</span>
                  </div>
                  <input
                    type="range" min="10" max="60"
                    value={activeRecipe.target_margin || 25}
                    onChange={(e) => setActiveRecipe({ ...activeRecipe, target_margin: parseFloat(e.target.value) })}
                    style={{ width: '100%', height: '8px', borderRadius: '4px', accentColor: '#3498db' }}
                  />
                </div>

                {(() => {
                  const liveTotalCost = calculateLiveCost(activeRecipe.ingredients);
                  const recommendedPrice = liveTotalCost > 0 ? liveTotalCost / ((activeRecipe.target_margin || 25) / 100) : 0;
                  const expectedProfit = recommendedPrice - liveTotalCost;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div style={{ padding: '20px', background: 'var(--bg-main)', borderRadius: '16px', textAlign: 'center' }}>
                        <p style={{ color: 'var(--text-muted)', margin: '0 0 4px 0', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '1px', fontWeight: 'bold' }}>{t('recipe.totalCogs')}</p>
                        <div style={{ fontSize: '1.5rem', fontWeight: '900', color: 'var(--text-main)' }}>${liveTotalCost.toFixed(2)}</div>
                      </div>
                      
                      <div style={{ padding: '24px', background: 'rgba(46, 204, 113, 0.05)', borderRadius: '16px', border: '1px solid rgba(46, 204, 113, 0.2)', textAlign: 'center' }}>
                        <p style={{ color: '#27ae60', margin: '0 0 4px 0', fontWeight: '800', fontSize: '0.85rem' }}>{t('recipe.recPrice')}</p>
                        <div style={{ fontSize: '3rem', fontWeight: '900', color: '#27ae60', letterSpacing: '-1px' }}>${recommendedPrice.toFixed(2)}</div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: '#27ae60', fontSize: '0.9rem', marginTop: '4px', fontWeight: 'bold' }}>
                          <Icon icon="lucide:trending-up" />
                          {t('recipe.estProfit')} ${expectedProfit.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* WHAT-IF NAPKIN MATH */}
              <div style={{ background: 'var(--bg-surface)', padding: '32px', borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)' }}>
                <h3 style={{ marginTop: 0, marginBottom: '8px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: '800' }}>
                  <Icon icon="lucide:calculator" style={{ color: 'var(--brand-color)' }} />
                  {t('recipe.whatIfTitle')}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '24px' }}>{t('recipe.whatIfSubtitle')}</p>
                
                <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-main)', border: '2px solid var(--border)', borderRadius: '16px', padding: '0 16px', marginBottom: '24px', focusWithin: { borderColor: 'var(--brand-color)' } }}>
                  <span style={{ fontSize: '1.5rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>$</span>
                  <input
                    type="number" step="0.01" placeholder={t('recipe.customPricePlaceholder')}
                    value={activeRecipe.custom_price || ""}
                    onChange={(e) => setActiveRecipe({ ...activeRecipe, custom_price: e.target.value })}
                    style={{ flex: 1, padding: '16px', border: 'none', background: 'transparent', fontSize: '1.5rem', color: 'var(--text-main)', outline: 'none', fontWeight: '900' }}
                  />
                </div>
                
                {activeRecipe.custom_price && parseFloat(activeRecipe.custom_price) > 0 ? (() => {
                  const liveTotalCost = calculateLiveCost(activeRecipe.ingredients);
                  const customPrice = parseFloat(activeRecipe.custom_price);
                  const netProfit = customPrice - liveTotalCost;
                  const foodCostPercentage = liveTotalCost > 0 ? ((liveTotalCost / customPrice) * 100).toFixed(1) : 0;
                  const grossMarginPercentage = netProfit > 0 ? ((netProfit / customPrice) * 100).toFixed(1) : 0;
                  return (
                    <div style={{ background: netProfit >= 0 ? 'rgba(26, 188, 156, 0.05)' : 'rgba(231, 76, 60, 0.05)', padding: '24px', borderRadius: '16px', border: `1px solid ${netProfit >= 0 ? 'rgba(26, 188, 156, 0.2)' : 'rgba(231, 76, 60, 0.2)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: `1px dashed ${netProfit >= 0 ? '#1abc9c' : '#e74c3c'}`, paddingBottom: '12px' }}>
                        <span style={{ color: 'var(--text-main)', fontWeight: 'bold' }}>{t('recipe.netProfitCup')}</span>
                        <span style={{ fontWeight: '900', fontSize: '1.8rem', color: netProfit >= 0 ? '#1abc9c' : '#e74c3c' }}>
                          ${netProfit.toFixed(2)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-main)', fontSize: '0.95rem' }}>{t('recipe.grossMargin')}</span>
                          <span style={{ fontWeight: '800', color: 'var(--brand-color)', fontSize: '1rem' }}>{grossMarginPercentage}%</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('recipe.foodCost')}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 'bold' }}>{foodCostPercentage}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })() : (
                  <div style={{ padding: '40px 20px', textAlign: 'center', background: 'var(--bg-main)', borderRadius: '16px', border: '1px dashed var(--border)', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    Enter a price to see margin analysis
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end', marginTop: '16px' }}>
              {!activeRecipe.isDraft && (
                <button onClick={() => handleDeleteRecipe(activeRecipe.id)} style={{ padding: '16px 24px', background: 'rgba(231, 76, 60, 0.05)', color: '#e74c3c', border: '2px solid rgba(231, 76, 60, 0.2)', borderRadius: '16px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }}>
                  <Icon icon="lucide:trash-2" />
                  {t('recipe.btnDelete')}
                </button>
              )}
              <button onClick={handleSaveRecipeToCloud} style={{ padding: '16px 48px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '16px', cursor: 'pointer', fontWeight: '900', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 8px 20px rgba(39, 174, 96, 0.2)' }}>
                <Icon icon="lucide:save" />
                {t('recipe.btnSave')}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, minWidth: '400px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-surface)', borderRadius: '24px', minHeight: '500px', border: '2px dashed var(--border)', color: 'var(--text-muted)', gap: '16px' }}>
            <div style={{ background: 'var(--bg-main)', padding: '24px', borderRadius: '50%', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
              <Icon icon="lucide:chef-hat" style={{ fontSize: '4rem', opacity: 0.2 }} />
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', textAlign: 'center', fontWeight: 'bold' }}>
              {t('recipe.selectPrompt')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default RecipeBuilderTab;