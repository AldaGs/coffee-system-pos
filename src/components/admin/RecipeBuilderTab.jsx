function RecipeBuilderTab({ recipes, activeRecipe, setActiveRecipe, handleCreateDraftRecipe, menuData, handleAddIngredient, handleUpdateIngredient, handleDeleteIngredient, handleDeleteRecipe, handleSaveRecipeToCloud }) {
  return (
    <div className="admin-section fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, color: 'var(--text-main)' }}>Recipe Builder</h1>
          <p style={{ color: 'var(--text-muted)', margin: '5px 0 0 0' }}>Calculate profitable selling prices based on item cost and target margins.</p>
        </div>
        <button
          onClick={handleCreateDraftRecipe}
          style={{ padding: '10px 20px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
          + Create New Recipe
        </button>
      </div>

      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>

        {/* LEFT: SAVED RECIPES LIST */}
        <div style={{ flex: '0 0 300px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '70vh', overflowY: 'auto' }}>
          <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-main)' }}>Saved Recipes</h3>

          {recipes.length === 0 && !activeRecipe && (
            <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center' }}>No recipes saved yet.</p>
          )}

          {/* Show draft if it exists */}
          {activeRecipe && activeRecipe.isDraft && (
            <button
              style={{ padding: '16px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold' }}
            >
              📝 {activeRecipe.name || "Draft"}
            </button>
          )}

          {recipes.map(recipe => (
            <button
              key={recipe.id}
              onClick={() => setActiveRecipe(recipe)}
              style={{ padding: '16px', background: activeRecipe?.id === recipe.id ? 'var(--brand-color)' : 'var(--bg-main)', color: activeRecipe?.id === recipe.id ? 'white' : 'var(--text-main)', border: `1px solid ${activeRecipe?.id === recipe.id ? 'var(--brand-color)' : 'var(--border)'}`, borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold', transition: 'all 0.2s', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span>{recipe.name}</span>
              <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                ${(recipe.ingredients || []).reduce((sum, ing) => sum + parseFloat(ing.cost || 0), 0).toFixed(2)}
              </span>
            </button>
          ))}
        </div>

        {/* RIGHT: DYNAMIC BUILDER */}
        {activeRecipe ? (
          <div style={{ flex: 1, minWidth: '400px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* TOP HEADER SETTINGS */}
            <div style={{ background: 'var(--bg-surface)', padding: '32px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ flex: 2, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Recipe Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Mocha 16oz"
                    value={activeRecipe.name}
                    onChange={(e) => setActiveRecipe({ ...activeRecipe, name: e.target.value })}
                    style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '1.2rem', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                  />
                </div>

                <div style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Link to POS Item (Optional)</label>
                  <select
                    value={activeRecipe.linked_menu_item || ""}
                    onChange={(e) => setActiveRecipe({ ...activeRecipe, linked_menu_item: e.target.value })}
                    style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                  >
                    <option value="">-- No Link --</option>
                    {menuData?.categories && Object.entries(menuData.categories).map(([cat, items]) => (
                      <optgroup key={cat} label={cat.toUpperCase()}>
                        {items.map(item => (
                          <option key={item.name} value={item.name}>{item.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* INGREDIENTS LIST */}
            <div style={{ background: 'var(--bg-surface)', padding: '32px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                <h3 style={{ margin: 0, color: 'var(--text-main)' }}>Ingredients Breakdown</h3>
                <button onClick={handleAddIngredient} style={{ padding: '8px 16px', background: 'rgba(52, 152, 219, 0.1)', color: '#3498db', border: '1px solid #3498db', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold' }}>
                  + Add Row
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {(!activeRecipe.ingredients || activeRecipe.ingredients.length === 0) && (
                  <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', margin: '20px 0' }}>Add your first ingredient to start calculating COGS.</p>
                )}

                {activeRecipe.ingredients?.map((ing, index) => (
                  <div key={ing.id} className="fade-in" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 'bold', width: '20px' }}>{index + 1}.</span>
                    <input
                      type="text"
                      placeholder="Ingredient Name (e.g. Milk 8oz)"
                      value={ing.name}
                      onChange={(e) => handleUpdateIngredient(ing.id, 'name', e.target.value)}
                      style={{ flex: 2, padding: '12px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0 12px', flex: 1 }}>
                      <span style={{ color: 'var(--text-muted)' }}>$</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={ing.cost}
                        onChange={(e) => handleUpdateIngredient(ing.id, 'cost', e.target.value)}
                        style={{ width: '100%', padding: '12px', border: 'none', background: 'transparent', color: 'var(--text-main)', outline: 'none' }}
                      />
                    </div>
                    <button onClick={() => handleDeleteIngredient(ing.id)} style={{ padding: '12px', background: 'rgba(231, 76, 60, 0.1)', color: '#e74c3c', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* PROFIT ENGINE */}
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>

              {/* LEFT OUTPUT */}
              <div style={{ flex: 1, minWidth: '250px', background: 'var(--bg-surface)', padding: '32px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', borderTop: '4px solid #2980b9' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                  <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Target Food Cost %</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <input
                      type="range" min="10" max="60"
                      value={activeRecipe.target_margin || 25}
                      onChange={(e) => setActiveRecipe({ ...activeRecipe, target_margin: parseFloat(e.target.value) })}
                      style={{ flex: 1 }}
                    />
                    <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{activeRecipe.target_margin || 25}%</span>
                  </div>
                </div>

                {(() => {
                  const totalCost = (activeRecipe.ingredients || []).reduce((sum, ing) => sum + parseFloat(ing.cost || 0), 0);
                  const recommendedPrice = totalCost / ((activeRecipe.target_margin || 25) / 100);
                  const expectedProfit = recommendedPrice - totalCost;
                  return (
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ color: 'var(--text-muted)', margin: '0 0 5px 0', textTransform: 'uppercase', fontSize: '0.8rem' }}>Total Ingredients COGS</p>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '16px' }}>${totalCost.toFixed(2)}</div>

                      <div style={{ padding: '16px', background: 'rgba(46, 204, 113, 0.1)', borderRadius: '8px', border: '1px solid #27ae60' }}>
                        <p style={{ color: '#27ae60', margin: '0 0 5px 0', fontWeight: 'bold' }}>Recommended Selling Price</p>
                        <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#27ae60' }}>${recommendedPrice.toFixed(2)}</div>
                        <small style={{ color: '#27ae60' }}>Est. Profit: ${expectedProfit.toFixed(2)}</small>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* RIGHT: WHAT-IF */}
              <div style={{ flex: 1, minWidth: '250px', background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                <h3 style={{ marginTop: 0, color: 'var(--text-main)' }}>"What-If" Analysis</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '16px' }}>What happens if you sell it at a custom price?</p>

                <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0 12px', marginBottom: '24px' }}>
                  <span style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>$</span>
                  <input
                    type="number" step="0.01" placeholder="My Custom Price..."
                    value={activeRecipe.custom_price || ""}
                    onChange={(e) => setActiveRecipe({ ...activeRecipe, custom_price: e.target.value })}
                    style={{ flex: 1, padding: '12px', border: 'none', background: 'transparent', fontSize: '1.2rem', color: 'var(--text-main)', outline: 'none' }}
                  />
                </div>

                {activeRecipe.custom_price && parseFloat(activeRecipe.custom_price) > 0 ? (() => {
                  const cost = (activeRecipe.ingredients || []).reduce((sum, ing) => sum + parseFloat(ing.cost || 0), 0);
                  const customPrice = parseFloat(activeRecipe.custom_price);
                  const profit = customPrice - cost;
                  const trueCostPercentage = cost > 0 ? ((cost / customPrice) * 100).toFixed(1) : 0;

                  return (
                    <div style={{ background: profit >= 0 ? 'rgba(26, 188, 156, 0.1)' : 'rgba(231, 76, 60, 0.1)', padding: '16px', borderRadius: '8px', border: `1px solid ${profit >= 0 ? '#1abc9c' : '#e74c3c'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ color: 'var(--text-main)' }}>True Profit:</span>
                        <span style={{ fontWeight: 'bold', color: profit >= 0 ? '#1abc9c' : '#e74c3c' }}>${profit.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-main)' }}>True Margin %:</span>
                        <span style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{trueCostPercentage}%</span>
                      </div>
                    </div>
                  );
                })() : null}
              </div>
            </div>

            {/* MASTER ACTIONS */}
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end', marginTop: '16px' }}>
              {!activeRecipe.isDraft && (
                <button onClick={() => handleDeleteRecipe(activeRecipe.id)} style={{ padding: '16px 24px', background: 'rgba(231, 76, 60, 0.1)', color: '#e74c3c', border: '2px solid #e74c3c', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                  Delete Recipe
                </button>
              )}
              <button onClick={handleSaveRecipeToCloud} style={{ padding: '16px 40px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.2rem' }}>
                💾 Save Recipe
              </button>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, minWidth: '400px', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-surface)', borderRadius: '12px', minHeight: '400px', border: '2px dashed var(--border)' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', textAlign: 'center' }}>
              Select a recipe from the list<br />or create a new one to begin.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}

export default RecipeBuilderTab;
