function TeamTab({ newCashier, setNewCashier, handleAddCashier, cashiers, editingCashier, setEditingCashier, handleSaveEditCashier, handleDeleteCashier }) {
  return (
    <div className="admin-section fade-in">
      <h2 style={{ color: 'var(--text-main)', borderBottom: '2px solid var(--border)', paddingBottom: '10px' }}>Team Management</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>Create profiles and 4-digit PINs for your staff to track who is running the register.</p>

      {/* ADD NEW CASHIER FORM */}
      <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', marginBottom: '30px' }}>
        <h3 style={{ marginTop: 0, color: 'var(--text-main)' }}>Add New Team Member</h3>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Cashier Name (e.g., Alex)"
            value={newCashier.name}
            onChange={(e) => setNewCashier({ ...newCashier, name: e.target.value })}
            style={{ flex: 2, padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1rem' }}
          />
          <input
            type="password"
            maxLength="4"
            placeholder="4-Digit PIN"
            value={newCashier.pin}
            onChange={(e) => setNewCashier({ ...newCashier, pin: e.target.value.replace(/\D/g, '') })} // Force numbers only
            style={{ flex: 1, padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1.2rem', letterSpacing: '4px', textAlign: 'center' }}
          />
          <button
            onClick={handleAddCashier}
            style={{ padding: '12px 24px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}
          >
            + Add Profile
          </button>
        </div>
      </div>

      {/* CURRENT STAFF LIST */}
      <h3 style={{ color: 'var(--text-main)', marginBottom: '15px' }}>Current Staff</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {cashiers.map(cashier => (
          <div key={cashier.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)', padding: '16px 20px', borderRadius: '8px', border: '1px solid var(--border)' }}>

            {/* IF THIS ROW IS IN EDIT MODE */}
            {editingCashier && editingCashier.id === cashier.id ? (
              <div style={{ display: 'flex', gap: '10px', width: '100%', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={editingCashier.name}
                  onChange={(e) => setEditingCashier({ ...editingCashier, name: e.target.value })}
                  style={{ flex: 2, padding: '10px', borderRadius: '6px', border: '2px solid var(--brand-color)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                />
                <input
                  type="password"
                  maxLength="4"
                  value={editingCashier.pin}
                  onChange={(e) => setEditingCashier({ ...editingCashier, pin: e.target.value.replace(/\D/g, '') })}
                  style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '2px solid var(--brand-color)', background: 'var(--bg-main)', color: 'var(--text-main)', textAlign: 'center', letterSpacing: '4px' }}
                />
                <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                  <button onClick={() => setEditingCashier(null)} style={{ padding: '8px 16px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={handleSaveEditCashier} style={{ padding: '8px 16px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Save</button>
                </div>
              </div>
            ) : (

              /* IF THIS ROW IS IN NORMAL DISPLAY MODE */
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <div style={{ height: '40px', width: '40px', borderRadius: '20px', background: 'var(--brand-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 'bold' }}>
                    {cashier.name.charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '1.1rem' }}>{cashier.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>PIN: ****</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {/* THE NEW EDIT BUTTON */}
                  <button
                    onClick={() => setEditingCashier(cashier)}
                    style={{ padding: '8px 16px', background: 'transparent', color: '#2980b9', border: '1px solid #2980b9', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteCashier(cashier.id)}
                    style={{ padding: '8px 16px', background: 'transparent', color: '#e74c3c', border: '1px solid #e74c3c', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    Remove
                  </button>
                </div>
              </>
            )}

          </div>
        ))}
      </div>

    </div>
  );
}

export default TeamTab;
