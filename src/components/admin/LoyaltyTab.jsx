import { useMemo } from 'react';

function LoyaltyTab({ loyaltyForm, setLoyaltyForm, menuData, handleSaveLoyalty, handleResetLoyaltyData }) {
  
  // Flatten all menu items into a single alphabetical list for the dropdown
  const allMenuItems = useMemo(() => {
    if (!menuData || !menuData.categories) return [];
    let items = [];
    Object.values(menuData.categories).forEach(categoryArray => {
      items = [...items, ...categoryArray.map(drink => drink.name)];
    });
    return items.sort();
  }, [menuData]);

  return (
    <div className="admin-section fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, color: 'var(--text-main)' }}>Loyalty Program</h1>
          <p style={{ color: 'var(--text-muted)', margin: '5px 0 0 0' }}>Configure automated digital rewards via WhatsApp.</p>
        </div>
      </div>

      <div style={{ background: 'var(--bg-surface)', padding: '32px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', maxWidth: '600px' }}>
        
        {/* MASTER SWITCH */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px', paddingBottom: '24px', borderBottom: '1px solid var(--border)' }}>
          <input 
            type="checkbox" 
            checked={loyaltyForm.isActive || false}
            onChange={(e) => setLoyaltyForm({ ...loyaltyForm, isActive: e.target.checked })}
            style={{ width: '24px', height: '24px', cursor: 'pointer' }}
          />
          <div>
            <h3 style={{ margin: 0, color: 'var(--text-main)' }}>Enable Loyalty Tracking</h3>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>If disabled, the POS will only send guest receipts.</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', opacity: loyaltyForm.isActive ? 1 : 0.5, pointerEvents: loyaltyForm.isActive ? 'auto' : 'none' }}>
          
          {/* TARGET ITEM DROPDOWN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>What earns a loyalty star?</label>
            <select 
              value={loyaltyForm.targetItem || 'any'} 
              onChange={(e) => setLoyaltyForm({ ...loyaltyForm, targetItem: e.target.value })}
              style={{ padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1.1rem' }}
            >
              <option value="any">Any Visit (General Check-in)</option>
              <optgroup label="Specific Menu Items">
                {allMenuItems.map((itemName, idx) => (
                  <option key={idx} value={itemName}>{itemName}</option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* NEW: EARNING RULE DROPDOWN (Only visible if a specific item is selected) */}
          {loyaltyForm.targetItem !== 'any' && loyaltyForm.targetItem !== undefined && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '16px', borderLeft: '4px solid var(--brand-color)' }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>Earning Rule (Multipliers)</label>
              <select 
                value={loyaltyForm.countMode || 'per_item'} 
                onChange={(e) => setLoyaltyForm({ ...loyaltyForm, countMode: e.target.value })}
                style={{ padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-main)', fontSize: '1rem' }}
              >
                <option value="per_item">Accelerated: Count EVERY item (e.g., buy 3 = earn 3 stars)</option>
                <option value="per_ticket">Capped: Max 1 star per transaction (e.g., buy 3 = earn 1 star)</option>
              </select>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>How many stars to unlock the reward?</label>
            <input 
              type="number" 
              min="1"
              value={loyaltyForm.visitsRequired} 
              onChange={(e) => setLoyaltyForm({ ...loyaltyForm, visitsRequired: parseInt(e.target.value) || 1 })}
              style={{ padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1.1rem' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>What is the reward?</label>
            <input 
              type="text" 
              placeholder="e.g., tu próxima bebida GRATIS"
              value={loyaltyForm.rewardDescription} 
              onChange={(e) => setLoyaltyForm({ ...loyaltyForm, rewardDescription: e.target.value })}
              style={{ padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1.1rem' }}
            />
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>This message is injected into the customer's WhatsApp receipt.</p>
          </div>

          <button onClick={handleSaveLoyalty} style={{ padding: '16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem', marginTop: '16px' }}>
            💾 Save Settings
          </button>
        </div>
      </div>

      <div style={{ marginTop: '40px', padding: '24px', background: 'rgba(231, 76, 60, 0.05)', border: '2px dashed #e74c3c', borderRadius: '12px', maxWidth: '600px' }}>
        <h3 style={{ margin: '0 0 10px 0', color: '#e74c3c' }}>Danger Zone</h3>
        <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>Starting a brand new promotion? You can wipe all current customer stars back to zero.</p>
        <button onClick={handleResetLoyaltyData} style={{ padding: '12px 24px', background: 'rgba(231, 76, 60, 0.1)', color: '#e74c3c', border: '1px solid #e74c3c', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
          ⚠️ Reset All Customer Stars
        </button>
      </div>
    </div>
  );
}

export default LoyaltyTab;