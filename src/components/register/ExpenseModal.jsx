import { useTranslation } from '../../hooks/useTranslation';

function ExpenseModal({ isExpenseModalOpen, setIsExpenseModalOpen, expenseForm, setExpenseForm, handleSaveExpense, isSavingExpense = false }) {
  const { t } = useTranslation();

  if (!isExpenseModalOpen) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 100 }}>
      <div className="modal-content fade-in" style={{ maxWidth: '400px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, color: 'var(--text-main)' }}>{t('exp.title')}</h2>
          <button onClick={() => setIsExpenseModalOpen(false)} aria-label={t('common.close')} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-main)' }}>✕</button>
        </div>
        <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>{t('exp.subtitle')}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'block', marginBottom: '8px' }}>{t('exp.amount')}</label>
            <input type="number" step="0.01" placeholder={t('expense.amountPlaceholder')} value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} style={{ width: '100%', padding: '15px', fontSize: '1.2rem', borderRadius: '8px', border: '2px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
          </div>
          <div>
            <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'block', marginBottom: '8px' }}>{t('expense.categoryLabel')}</label>
            <select value={expenseForm.category || 'General'} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })} style={{ width: '100%', padding: '15px', fontSize: '1.2rem', borderRadius: '8px', border: '2px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}>
              <option value="General">{t('expense.catGeneral')}</option>
              <option value="Inventario">{t('expense.catInventory')}</option>
              <option value="Marketing">{t('expense.catMarketing')}</option>
              <option value="Operativo">{t('expense.catOperational')}</option>
              <option value="Nómina">{t('expense.catPayroll')}</option>
            </select>
          </div>
          <div>
            <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'block', marginBottom: '8px' }}>{t('exp.reason')}</label>
            <input type="text" placeholder={t('exp.reasonPlaceholder')} value={expenseForm.reason} onChange={(e) => setExpenseForm({ ...expenseForm, reason: e.target.value })} style={{ width: '100%', padding: '15px', fontSize: '1.2rem', borderRadius: '8px', border: '2px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
          </div>
          <button
            onClick={handleSaveExpense}
            disabled={isSavingExpense}
            style={{
              width: '100%', padding: '16px',
              background: isSavingExpense ? 'var(--text-muted)' : 'var(--action-primary)',
              color: 'white', border: 'none', borderRadius: '8px',
              cursor: isSavingExpense ? 'not-allowed' : 'pointer',
              opacity: isSavingExpense ? 0.7 : 1,
              fontWeight: 'bold', fontSize: '1.1rem', marginTop: '10px'
            }}
          >
            {isSavingExpense ? t('expense.saving') : t('exp.btnWithdraw')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ExpenseModal;