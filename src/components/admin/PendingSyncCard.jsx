import { useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from '@iconify/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { supabase } from '../../supabaseClient';
import { useMenuStore } from '../../store/useMenuStore';
import { useTranslation } from '../../hooks/useTranslation';
import { formatForDisplay } from '../../utils/moneyUtils';
import { attemptBackgroundSync } from '../../services/syncService';
import SharedPinPad from '../shared/SharedPinPad';

const LS_EXPENSE_QUEUE = 'tinypos_expense_queue';
const LS_WA_QUEUE = 'tinypos_wa_queue';

// Read a localStorage-backed queue. Returns [] on any parse failure so the UI
// never crashes when a user has corrupt queue data — we'd rather surface a
// zero count than a blank screen.
function readLsQueue(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
  } catch {
    return String(iso);
  }
}

function summarizeSale(s) {
  const total = formatForDisplay(s.total_amount || 0);
  const items = Array.isArray(s.items_sold) ? s.items_sold.length : (Array.isArray(s.items) ? s.items.length : 0);
  return `${fmtDate(s.created_at)} · ${total} · ${s.payment_method || '?'} · ${items} item${items === 1 ? '' : 's'} · ${s.cashier_name || '—'}`;
}

function summarizeExpense(e) {
  return `${fmtDate(e.created_at)} · ${formatForDisplay(e.amount || 0)} · ${e.category || 'General'} · ${e.reason || '—'} · ${e.cashier_name || '—'}`;
}

function summarizeInventoryLog(l) {
  return `${fmtDate(l.created_at)} · ${l.item_name || '—'} · qty ${l.qty_deducted} · ${l.deduction_type}`;
}

function summarizeUpdate(u) {
  const target = u.local_id || u.cloud_id || u.ticket_id || '—';
  return `${u.type || 'update'} → ${target}`;
}

function summarizeWa(w) {
  return `${fmtDate(w.created_at)} · ${w.phone || '—'} · ticket ${w.ticket_id || '—'}`;
}

function QueueSection({ icon, title, items, summarize, onDiscardOne, onDiscardAll, disabled, t }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h4 style={{ margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon icon={icon} style={{ color: '#e67e22' }} />
          {title} <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>({items.length})</span>
        </h4>
        <button
          onClick={onDiscardAll}
          disabled={disabled}
          style={{
            padding: '8px 12px', borderRadius: '8px', border: '1px solid #e74c3c',
            background: 'transparent', color: '#e74c3c', cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1, fontWeight: 700, fontSize: '0.85rem'
          }}
        >
          {t('pendingSync.clearAll')}
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {items.map((it, idx) => (
          <div key={it.id ?? it.local_id ?? idx} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 14px', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '10px',
            gap: '12px'
          }}>
            <span style={{ flex: 1, fontSize: '0.88rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={summarize(it)}>
              {summarize(it)}
            </span>
            <button
              onClick={() => onDiscardOne(it, idx)}
              disabled={disabled}
              style={{
                padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)',
                background: 'transparent', color: '#e74c3c', cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1, fontWeight: 700, fontSize: '0.8rem',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}
              aria-label={t('pendingSync.discard')}
            >
              <Icon icon="lucide:trash-2" />
              {t('pendingSync.discard')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PendingSyncCard({ showAlert, showConfirm }) {
  const { t } = useTranslation();

  // --- PIN gate (separate from the broader Admin unlock) ---
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);

  // --- Live queue contents ---
  const pendingSales = useLiveQuery(() => db.syncQueue.toArray(), []) || [];
  const pendingInventory = useLiveQuery(() => db.inventory_logs.toArray(), []) || [];
  const pendingUpdates = useLiveQuery(() => db.updateQueue.toArray(), []) || [];

  // localStorage queues — no live binding, so poll on a light timer and on
  // window focus to catch external updates from the sync drain or other tabs.
  const [expenseQueue, setExpenseQueue] = useState(() => readLsQueue(LS_EXPENSE_QUEUE));
  const [waQueue, setWaQueue] = useState(() => readLsQueue(LS_WA_QUEUE));
  useEffect(() => {
    const refresh = () => {
      setExpenseQueue(readLsQueue(LS_EXPENSE_QUEUE));
      setWaQueue(readLsQueue(LS_WA_QUEUE));
    };
    refresh();
    const id = setInterval(refresh, 3000);
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  // --- Status (online + authenticated) ---
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [hasSession, setHasSession] = useState(true);
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!cancelled) setHasSession(!!session);
    })();
    return () => {
      cancelled = true;
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // --- Action mutex: only one of {sync, discard} runs at a time ---
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const lockBusy = useCallback(async (fn) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try { await fn(); } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const totalCount = pendingSales.length + pendingInventory.length + pendingUpdates.length + expenseQueue.length + waQueue.length;

  // --- Try sync now ---
  const handleTrySync = () => lockBusy(async () => {
    const authError = await attemptBackgroundSync(expenseQueue, () => {
      localStorage.setItem(LS_EXPENSE_QUEUE, '[]');
      setExpenseQueue([]);
    });
    // Refresh ls queues after drain
    setExpenseQueue(readLsQueue(LS_EXPENSE_QUEUE));
    setWaQueue(readLsQueue(LS_WA_QUEUE));
    if (authError) {
      showAlert(t('pendingSync.authErrorTitle'), t('pendingSync.authErrorDesc'));
    } else {
      showAlert(t('pendingSync.syncDoneTitle'), t('pendingSync.syncDoneDesc'));
    }
  });

  // --- Discard handlers ---
  const confirmAndDiscard = (description, action) => {
    showConfirm(t('pendingSync.confirmTitle'), description, () => {
      lockBusy(async () => {
        await action();
      });
    });
  };

  const discardSale = (item) => confirmAndDiscard(
    `${t('pendingSync.confirmOne')}\n\n${summarizeSale(item)}\n\n${t('pendingSync.permanent')}`,
    async () => { await db.syncQueue.delete(item.id); }
  );
  const discardAllSales = () => confirmAndDiscard(
    `${t('pendingSync.confirmAllSales').replace('{count}', pendingSales.length)}\n\n${t('pendingSync.permanent')}`,
    async () => { await db.syncQueue.clear(); }
  );

  const discardInventoryLog = (item) => confirmAndDiscard(
    `${t('pendingSync.confirmOne')}\n\n${summarizeInventoryLog(item)}\n\n${t('pendingSync.permanent')}`,
    async () => { await db.inventory_logs.delete(item.id); }
  );
  const discardAllInventory = () => confirmAndDiscard(
    `${t('pendingSync.confirmAllInventory').replace('{count}', pendingInventory.length)}\n\n${t('pendingSync.permanent')}`,
    async () => { await db.inventory_logs.clear(); }
  );

  const discardUpdate = (item) => confirmAndDiscard(
    `${t('pendingSync.confirmOne')}\n\n${summarizeUpdate(item)}\n\n${t('pendingSync.permanent')}`,
    async () => { await db.updateQueue.delete(item.id); }
  );
  const discardAllUpdates = () => confirmAndDiscard(
    `${t('pendingSync.confirmAllUpdates').replace('{count}', pendingUpdates.length)}\n\n${t('pendingSync.permanent')}`,
    async () => { await db.updateQueue.clear(); }
  );

  const discardExpense = (item, idx) => confirmAndDiscard(
    `${t('pendingSync.confirmOne')}\n\n${summarizeExpense(item)}\n\n${t('pendingSync.permanent')}`,
    async () => {
      const next = expenseQueue.filter((_, i) => i !== idx);
      localStorage.setItem(LS_EXPENSE_QUEUE, JSON.stringify(next));
      setExpenseQueue(next);
    }
  );
  const discardAllExpenses = () => confirmAndDiscard(
    `${t('pendingSync.confirmAllExpenses').replace('{count}', expenseQueue.length)}\n\n${t('pendingSync.permanent')}`,
    async () => {
      localStorage.setItem(LS_EXPENSE_QUEUE, '[]');
      setExpenseQueue([]);
    }
  );

  const discardWa = (item, idx) => confirmAndDiscard(
    `${t('pendingSync.confirmOne')}\n\n${summarizeWa(item)}\n\n${t('pendingSync.permanent')}`,
    async () => {
      const next = waQueue.filter((_, i) => i !== idx);
      localStorage.setItem(LS_WA_QUEUE, JSON.stringify(next));
      setWaQueue(next);
    }
  );
  const discardAllWa = () => confirmAndDiscard(
    `${t('pendingSync.confirmAllWa').replace('{count}', waQueue.length)}\n\n${t('pendingSync.permanent')}`,
    async () => {
      localStorage.setItem(LS_WA_QUEUE, '[]');
      setWaQueue([]);
    }
  );

  // --- Card chrome ---
  return (
    <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: 'var(--admin-card-radius, 18px)', border: '1px solid var(--border)', marginTop: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.4rem' }}>
            <Icon icon="lucide:cloud-off" style={{ color: '#e74c3c' }} />
            {t('pendingSync.title')}
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            {t('pendingSync.subtitle')}
          </p>
        </div>
        <div style={{ background: totalCount === 0 ? 'rgba(39,174,96,0.10)' : 'rgba(231,76,60,0.10)', color: totalCount === 0 ? '#27ae60' : '#e74c3c', padding: '10px 14px', borderRadius: '10px', fontWeight: 800 }}>
          {totalCount} {t('pendingSync.queued')}
        </div>
      </div>

      <div style={{
        padding: '12px 14px', borderRadius: '10px',
        background: isOnline && hasSession ? 'rgba(39,174,96,0.08)' : 'rgba(231,76,60,0.08)',
        border: `1px solid ${isOnline && hasSession ? '#27ae60' : '#e74c3c'}`,
        marginBottom: '20px', fontSize: '0.9rem', color: 'var(--text-main)'
      }}>
        {isOnline && hasSession
          ? t('pendingSync.statusReady')
          : !isOnline ? t('pendingSync.statusOffline') : t('pendingSync.statusNoSession')}
      </div>

      {!isUnlocked ? (
        <div style={{ textAlign: 'center', padding: '24px 16px', background: 'var(--bg-main)', borderRadius: '12px', border: '1px dashed var(--border)' }}>
          <Icon icon="lucide:lock" style={{ fontSize: '2rem', color: 'var(--text-muted)' }} />
          <p style={{ color: 'var(--text-muted)', margin: '12px 0 16px 0' }}>{t('pendingSync.lockedDesc')}</p>
          <button
            onClick={() => { setPinInput(''); setPinError(false); setPinModalOpen(true); }}
            style={{ padding: '12px 20px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 700 }}
          >
            <Icon icon="lucide:unlock" /> {t('pendingSync.unlock')}
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
            <button
              onClick={handleTrySync}
              disabled={busy || !isOnline || !hasSession || totalCount === 0}
              style={{
                padding: '12px 16px', borderRadius: '10px', border: 'none',
                background: '#2980b9', color: 'white',
                cursor: (busy || !isOnline || !hasSession || totalCount === 0) ? 'not-allowed' : 'pointer',
                opacity: (busy || !isOnline || !hasSession || totalCount === 0) ? 0.55 : 1,
                fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px'
              }}
            >
              <Icon icon={busy ? 'lucide:loader-2' : 'lucide:refresh-cw'} className={busy ? 'spin' : ''} />
              {busy ? t('pendingSync.working') : t('pendingSync.trySync')}
            </button>
            <button
              onClick={() => setIsUnlocked(false)}
              style={{ padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-main)', cursor: 'pointer', fontWeight: 700 }}
            >
              <Icon icon="lucide:lock" /> {t('pendingSync.relock')}
            </button>
          </div>

          {totalCount === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>
              {t('pendingSync.empty')}
            </p>
          ) : (
            <>
              <QueueSection icon="lucide:shopping-cart" title={t('pendingSync.sales')} items={pendingSales} summarize={summarizeSale}
                onDiscardOne={discardSale} onDiscardAll={discardAllSales} disabled={busy} t={t} />
              <QueueSection icon="lucide:wallet" title={t('pendingSync.expenses')} items={expenseQueue} summarize={summarizeExpense}
                onDiscardOne={discardExpense} onDiscardAll={discardAllExpenses} disabled={busy} t={t} />
              <QueueSection icon="lucide:database" title={t('pendingSync.inventory')} items={pendingInventory} summarize={summarizeInventoryLog}
                onDiscardOne={discardInventoryLog} onDiscardAll={discardAllInventory} disabled={busy} t={t} />
              <QueueSection icon="lucide:refresh-ccw" title={t('pendingSync.updates')} items={pendingUpdates} summarize={summarizeUpdate}
                onDiscardOne={discardUpdate} onDiscardAll={discardAllUpdates} disabled={busy} t={t} />
              <QueueSection icon="lucide:message-circle" title={t('pendingSync.wa')} items={waQueue} summarize={summarizeWa}
                onDiscardOne={discardWa} onDiscardAll={discardAllWa} disabled={busy} t={t} />
            </>
          )}
        </>
      )}

      {pinModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <SharedPinPad
            variant="modal"
            icon="lucide:lock"
            title={t('pendingSync.pinTitle')}
            subtitle={t('pendingSync.pinSubtitle')}
            pin={pinInput}
            setPin={setPinInput}
            error={pinError}
            setError={setPinError}
            onCancel={() => { setPinModalOpen(false); setPinInput(''); setPinError(false); }}
            submitText={t('pendingSync.unlock')}
            submitIcon="lucide:unlock"
            onSubmit={async () => {
              const { verifyAdminPin } = useMenuStore.getState();
              try {
                const ok = await verifyAdminPin(pinInput);
                if (ok) {
                  setIsUnlocked(true);
                  setPinModalOpen(false);
                  setPinError(false);
                  setPinInput('');
                } else {
                  setPinError(true);
                  setPinInput('');
                }
              } catch (err) {
                showAlert(t('admin.error'), err.message);
                setPinInput('');
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
