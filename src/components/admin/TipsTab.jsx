import { useState, useMemo } from 'react';
import { Icon } from '@iconify/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { useTranslation } from '../../hooks/useTranslation';
import { useDialog } from '../../hooks/useDialog';
import { formatForDisplay, toCents } from '../../utils/moneyUtils';
import { recordTipPayout } from '../../services/tipsService';

// Tips ledger admin surface.
// Top:    outstanding liability balance (Accrued - Paid out).
// Middle: form to record a payout to staff.
// Bottom: immutable event ledger (accruals / refunds / payouts / adjustments).
function TipsTab({ activeCashierName = null }) {
  const { t } = useTranslation();
  const { showAlert } = useDialog();

  const allSales = useLiveQuery(() => db.sales.toArray(), []) || [];
  const payouts = useLiveQuery(() => db.tip_payouts.orderBy('created_at').reverse().toArray(), []) || [];
  const events = useLiveQuery(() => db.tip_events.orderBy('created_at').reverse().toArray(), []) || [];

  const [form, setForm] = useState({ amount: '', method: 'cash', recipient: '', note: '' });
  const [saving, setSaving] = useState(false);

  const balance = useMemo(() => {
    const accrued = allSales.reduce((sum, s) => {
      const tip = Number(s.tip_amount) || 0;
      const refunded = Number(s.tip_refunded) || 0;
      return sum + Math.max(0, tip - refunded);
    }, 0);
    const paid = payouts.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    return { accrued, paid, balance: accrued - paid };
  }, [allSales, payouts]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cents = toCents(form.amount);
    if (!cents || cents <= 0) return showAlert(t('common.error'), t('tips.invalidAmount'));
    if (cents > balance.balance) {
      // Hard guard: refusing to pay out more than the recorded liability.
      return showAlert(t('common.error'), t('tips.exceedsBalance'));
    }
    setSaving(true);
    try {
      await recordTipPayout({
        amountCents: cents,
        method: form.method,
        recipient: form.recipient || null,
        note: form.note || null,
        cashier_name: activeCashierName
      });
      setForm({ amount: '', method: 'cash', recipient: '', note: '' });
      showAlert(t('toast.success'), t('toast.success'));
    } catch (err) {
      showAlert(t('common.error'), err.message);
    } finally {
      setSaving(false);
    }
  };

  const eventLabel = (type) => {
    if (type === 'accrual') return t('tips.eventAccrual');
    if (type === 'refund') return t('tips.eventRefund');
    if (type === 'payout') return t('tips.eventPayout');
    return t('tips.eventAdjustment');
  };
  const eventColor = (type) => ({ accrual: '#27ae60', refund: '#e67e22', payout: '#3498db', adjustment: '#9b59b6' }[type] || '#7f8c8d');

  return (
    <div className="admin-section fade-in">
      <div className="admin-section-header" style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: 0, color: 'var(--text-main)', fontSize: '2rem', fontWeight: '800' }}>{t('tips.title')}</h1>
        <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0', fontSize: '1.1rem' }}>{t('tips.subtitle')}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '20px', border: '1px solid var(--border)', borderTop: '4px solid #16a085' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>{t('tips.balance')}</div>
          <div style={{ fontSize: '2.2rem', fontWeight: 900, color: balance.balance < 0 ? '#e74c3c' : '#16a085', marginTop: 6 }}>{formatForDisplay(balance.balance)}</div>
        </div>
        <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '20px', border: '1px solid var(--border)' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>{t('tips.accrued')}</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-main)', marginTop: 6 }}>{formatForDisplay(balance.accrued)}</div>
        </div>
        <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '20px', border: '1px solid var(--border)' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>{t('tips.paidOut')}</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-main)', marginTop: 6 }}>{formatForDisplay(balance.paid)}</div>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '20px', border: '1px solid var(--border)', marginBottom: '32px' }}>
        <h3 style={{ marginTop: 0, color: 'var(--text-main)' }}>{t('tips.recordPayout')}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700 }}>{t('tips.amount')}</span>
            <input type="number" step="0.01" min="0" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={{ padding: '12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700 }}>{t('tips.method')}</span>
            <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} style={{ padding: '12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}>
              <option value="cash">{t('tips.methodCash')}</option>
              <option value="payroll">{t('tips.methodPayroll')}</option>
              <option value="transfer">{t('tips.methodTransfer')}</option>
              <option value="other">{t('tips.methodOther')}</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700 }}>{t('tips.recipient')}</span>
            <input type="text" value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} placeholder={t('tips.recipientPlaceholder')} style={{ padding: '12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700 }}>{t('tips.note')}</span>
            <input type="text" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={{ padding: '12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
          </label>
        </div>
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" disabled={saving} style={{ padding: '12px 24px', borderRadius: 12, background: 'var(--brand-color)', color: 'white', border: 'none', fontWeight: 800, cursor: saving ? 'wait' : 'pointer' }}>
            {saving ? t('common.saving') : t('tips.btnRecord')}
          </button>
        </div>
      </form>

      <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '20px', border: '1px solid var(--border)' }}>
        <h3 style={{ marginTop: 0, color: 'var(--text-main)' }}>{t('tips.ledger')}</h3>
        {events.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{t('tips.noEvents')}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {events.slice(0, 200).map((ev) => (
              <div key={ev.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--bg-main)', borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: eventColor(ev.event_type) }} />
                  <div>
                    <div style={{ fontWeight: 800, color: 'var(--text-main)' }}>{eventLabel(ev.event_type)}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {new Date(ev.created_at).toLocaleString()} {ev.actor ? `· ${ev.actor}` : ''} {ev.reason ? `· ${ev.reason}` : ''}
                    </div>
                  </div>
                </div>
                <div style={{ fontWeight: 900, color: Number(ev.delta_cents) >= 0 ? '#27ae60' : '#e67e22' }}>
                  {Number(ev.delta_cents) >= 0 ? '+' : ''}{formatForDisplay(Number(ev.delta_cents))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default TipsTab;
