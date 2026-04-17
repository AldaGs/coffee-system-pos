function ExpenseModal({ isExpenseModalOpen, setIsExpenseModalOpen, expenseForm, setExpenseForm, handleSaveExpense }) {
  if (!isExpenseModalOpen) return null;
  return (
    <div className="modal-overlay" style={{ zIndex: 100 }}><div className="modal-content fade-in" style={{ maxWidth: '400px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}><h2 style={{ margin: 0, color: '#e74c3c' }}>Record Expense (Gasto)</h2><button onClick={() => setIsExpenseModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-main)' }}>✕</button></div>
      <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>Log money taken out of the cash drawer to keep your register balanced.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div><label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'block', marginBottom: '8px' }}>Amount ($)</label><input type="number" step="0.01" placeholder="e.g., 150.50" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} style={{ width: '100%', padding: '15px', fontSize: '1.2rem', borderRadius: '8px', border: '2px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} /></div>
        <div><label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'block', marginBottom: '8px' }}>Reason / Vendor</label><input type="text" placeholder="e.g., Hielo, Leche, Propinas" value={expenseForm.reason} onChange={(e) => setExpenseForm({ ...expenseForm, reason: e.target.value })} style={{ width: '100%', padding: '15px', fontSize: '1.2rem', borderRadius: '8px', border: '2px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} /></div>
        <button onClick={handleSaveExpense} style={{ width: '100%', padding: '16px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem', marginTop: '10px' }}>Withdraw Cash</button>
      </div>
    </div></div>
  );
}
export default ExpenseModal;
