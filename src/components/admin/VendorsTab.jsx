import { Fragment, useMemo, useState } from 'react';
import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';
import { useDialog } from '../../hooks/useDialog';
import { formatForDisplay, fromCents, toCents } from '../../utils/moneyUtils';
import { computeSettlement } from '../../utils/vendorUtils';
import { recordVendorPayout, reverseVendorPayout } from '../../services/vendorPayoutsService';
import { writeExpense } from '../../services/expenseLedger';
import { shareElementAsPNG, shareElementAsPDF } from '../../utils/sharingUtils';
import VendorStatement from './VendorStatement';

// The active cashier (for stamping who recorded a payout), best-effort.
function activeCashierName() {
  try {
    const raw = localStorage.getItem('tinypos_activeCashier');
    if (raw) return JSON.parse(raw)?.name || null;
  } catch { /* noop */ }
  return null;
}

// A recorded payout "covers" the report range if its settled period overlaps it.
// Falls back to the created_at date when a payout has no stored period.
function payoutInRange(p, from, to) {
  const pf = p.period_from || (p.created_at ? p.created_at.slice(0, 10) : null);
  const pt = p.period_to || pf;
  if (!pf || !pt) return true;
  if (from && pt < from) return false;
  if (to && pf > to) return false;
  return true;
}

// Default the report to the current calendar month (local time).
function defaultRange() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { from: iso(first), to: iso(now) };
}

const card = { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '20px', padding: '24px', marginBottom: '24px' };
const inputStyle = { padding: '12px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold' };
const th = { textAlign: 'right', padding: '10px 12px', fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' };
const td = { textAlign: 'right', padding: '12px', fontWeight: 'bold', color: 'var(--text-main)' };

const EMPTY_FORM = { name: '', contact: '', commissionPercent: '0', splitType: 'percentage', commissionBase: 'gross', isActive: true };

function VendorsTab({ vendors = [], sales = [], menuData = null, payouts = [], taxRate = 16, branding = {}, onAddVendor, onUpdateVendor, onDeleteVendor }) {
  const { t } = useTranslation();
  const { showAlert, showConfirm } = useDialog();

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState(defaultRange);
  const [expanded, setExpanded] = useState(null);
  const [useMenuFallback, setUseMenuFallback] = useState(false);
  const [payFor, setPayFor] = useState(null);   // settlement row being paid
  const [payForm, setPayForm] = useState({ amount: '', method: 'cash', note: '', postExpense: true });
  const [statementRow, setStatementRow] = useState(null); // row being rendered for share
  const [shareRow, setShareRow] = useState(null);         // row whose format chooser is open
  const [sharing, setSharing] = useState(false);

  // Map current menu item id -> its vendor assignment, for retroactively
  // attributing pre-tagging sale lines (those with no vendor snapshot).
  const itemVendorMap = useMemo(() => {
    const map = new Map();
    const cats = menuData?.categories || {};
    Object.values(cats).forEach((items) => {
      (items || []).forEach((it) => {
        if (it?.id != null && it.vendorId) {
          map.set(String(it.id), { vendorId: it.vendorId, vendorName: it.vendorName || '', vendorUnitCostCents: it.vendorUnitCostCents || 0 });
        }
      });
    });
    return map;
  }, [menuData]);

  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(null); };

  const startEdit = (v) => {
    setEditingId(v.id);
    setForm({ name: v.name, contact: v.contact || '', commissionPercent: String(v.commissionPercent ?? 0), splitType: v.splitType === 'cost' ? 'cost' : 'percentage', commissionBase: v.commissionBase === 'base' ? 'base' : 'gross', isActive: v.isActive !== false });
  };

  const saveVendor = async () => {
    if (!form.name.trim()) return showAlert(t('vendors.title'), t('vendors.nameRequired'));
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        contact: form.contact.trim(),
        commissionPercent: Math.max(0, Math.min(100, Number(form.commissionPercent) || 0)),
        splitType: form.splitType === 'cost' ? 'cost' : 'percentage',
        commissionBase: form.commissionBase === 'base' ? 'base' : 'gross',
        isActive: form.isActive,
      };
      if (editingId) await onUpdateVendor(editingId, payload);
      else await onAddVendor(payload);
      resetForm();
    } catch (e) {
      showAlert(t('vendors.title'), e.message);
    } finally {
      setBusy(false);
    }
  };

  const removeVendor = (v) => {
    showConfirm(t('vendors.deleteConfirmTitle'), t('vendors.deleteConfirmBody'), async () => {
      setBusy(true);
      try { await onDeleteVendor(v.id); if (editingId === v.id) resetForm(); }
      catch (e) { showAlert(t('vendors.title'), e.message); }
      finally { setBusy(false); }
    });
  };

  // --- Settlement report -----------------------------------------------------
  const settlement = useMemo(() => {
    const fromMs = range.from ? Date.parse(`${range.from}T00:00:00`) : null;
    const toMs = range.to ? Date.parse(`${range.to}T23:59:59.999`) : null;
    return computeSettlement(sales, vendors, { fromMs, toMs, taxRate, itemVendorMap: useMenuFallback ? itemVendorMap : null });
  }, [sales, vendors, range, taxRate, useMenuFallback, itemVendorMap]);

  // Payouts already recorded that overlap the report range, summed per vendor.
  // Keyed by vendor_id when present, else by name (so deleted vendors still match).
  const paidInRange = useMemo(() => {
    const map = new Map();
    (payouts || []).forEach((p) => {
      if (!payoutInRange(p, range.from, range.to)) return;
      const key = p.vendor_id ? `id:${p.vendor_id}` : `name:${p.vendor_name}`;
      map.set(key, (map.get(key) || 0) + (Number(p.amount) || 0));
    });
    return map;
  }, [payouts, range]);

  const paidFor = (row) => {
    const byId = row.vendorId ? paidInRange.get(`id:${row.vendorId}`) : 0;
    return byId || paidInRange.get(`name:${row.vendorName}`) || 0;
  };

  // --- Record a payment against a frozen statement ---------------------------
  const openPay = (row) => {
    const balance = row.payoutCents - paidFor(row);
    setPayFor(row);
    setPayForm({ amount: fromCents(Math.max(0, balance)).toFixed(2), method: 'cash', note: '', postExpense: true });
  };

  const submitPay = async () => {
    if (!payFor) return;
    const amountCents = toCents(payForm.amount || 0);
    if (!amountCents) return showAlert(t('vendors.payTitle'), t('vendors.payAmountRequired'));
    const cashier = activeCashierName();
    setBusy(true);
    try {
      await recordVendorPayout({
        vendorId: payFor.vendorId,
        vendorName: payFor.vendorName,
        periodFrom: range.from || null,
        periodTo: range.to || null,
        owedCents: payFor.payoutCents,
        amountCents,
        method: payForm.method,
        note: payForm.note?.trim() || null,
        cashierName: cashier,
        // Freeze the statement so this payment is anchored to a locked number.
        statement: {
          range: { from: range.from, to: range.to },
          menuFallback: useMenuFallback,
          splitType: payFor.splitType,
          commissionPercent: payFor.commissionPercent,
          postedToExpenses: !!payForm.postExpense,
          totals: {
            units: payFor.units, grossCents: payFor.grossCents, refundCents: payFor.refundCents,
            costCents: payFor.costCents, netCents: payFor.netCents,
            commissionCents: payFor.commissionCents, payoutCents: payFor.payoutCents,
          },
          items: payFor.items,
        },
      });
      // Post the disbursement to the expense/cash-out ledger so it reconciles
      // against revenue in Analytics. This is a cash-flow entry (settling the
      // vendor-payable liability), not a second P&L expense — see books summary.
      if (payForm.postExpense) {
        try {
          await writeExpense({
            amountCents,
            reason: `${t('vendors.expenseReason')}: ${payFor.vendorName}`,
            category: t('vendors.expenseCategory'),
            cashierName: cashier,
          });
        } catch (e) { console.warn('vendor payout expense post failed', e); }
      }
      setPayFor(null);
    } catch (e) {
      showAlert(t('vendors.payTitle'), e.message);
    } finally {
      setBusy(false);
    }
  };

  // Render a premium per-vendor statement off-screen, snapshot it, and open the
  // share sheet (falls back to download). format: 'png' (quick, for friends) or
  // 'pdf' (professional). Two RAFs let the off-screen node paint first.
  const shareStatement = async (row, format) => {
    if (sharing) return;
    setShareRow(null);
    setSharing(true);
    setStatementRow(row);
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const safe = (row.vendorName || 'vendor').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      const base = `estado-${safe}_${range.from || ''}_${range.to || ''}`;
      const meta = { title: t('vendors.statementTitle'), text: `${row.vendorName} · ${range.from || ''} → ${range.to || ''}` };
      if (format === 'pdf') {
        await shareElementAsPDF('vendor-statement-capture', `${base}.pdf`, meta);
      } else {
        await shareElementAsPNG('vendor-statement-capture', `${base}.png`, meta);
      }
    } catch (e) {
      showAlert(t('vendors.statementTitle'), e.message);
    } finally {
      setStatementRow(null);
      setSharing(false);
    }
  };

  const undoPayout = (p) => {
    showConfirm(t('vendors.reverseTitle'), t('vendors.reverseBody'), async () => {
      setBusy(true);
      try {
        await reverseVendorPayout(p);
        // Offset the linked cash-out entry so the drawer/books net back.
        if (p.data?.postedToExpenses) {
          try {
            await writeExpense({
              amountCents: -Math.round(Number(p.amount) || 0),
              reason: `${t('vendors.expenseReversalReason')}: ${p.vendor_name}`,
              category: t('vendors.expenseCategory'),
              cashierName: activeCashierName(),
            });
          } catch (e) { console.warn('vendor payout expense reversal failed', e); }
        }
      }
      catch (e) { showAlert(t('vendors.payTitle'), e.message); }
      finally { setBusy(false); }
    });
  };

  const exportCSV = () => {
    const head = [t('vendors.colVendor'), t('vendors.colUnits'), t('vendors.colGross'), t('vendors.colRefunds'), t('vendors.colNet'), t('vendors.colBase'), t('vendors.colTax'), t('vendors.colCommission'), t('vendors.colPayout')];
    const lines = [head.join(',')];
    const money = (c) => fromCents(c).toFixed(2);
    const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
    settlement.rows.forEach((r) => {
      lines.push([esc(r.vendorName), r.units, money(r.grossCents), money(r.refundCents), money(r.netCents), money(r.baseCents), money(r.taxCents), money(r.commissionCents), money(r.payoutCents)].join(','));
      r.items.forEach((it) => {
        lines.push([esc(`   ${it.name}`), it.units, money(it.grossCents), '', '', '', '', '', ''].join(','));
      });
    });
    const { totals } = settlement;
    lines.push([esc(t('vendors.totals')), totals.units, money(totals.grossCents), money(totals.refundCents), money(totals.netCents), money(totals.baseCents), money(totals.taxCents), money(totals.commissionCents), money(totals.payoutCents)].join(','));

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vendor-settlement_${range.from || 'all'}_${range.to || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const { rows, totals } = settlement;
  const totalPaid = [...paidInRange.values()].reduce((s, v) => s + v, 0);
  const totalVendorOwed = rows.filter((r) => !r.isHouse).reduce((s, r) => s + r.payoutCents, 0);
  const totalBalance = totalVendorOwed - totalPaid;

  return (
    <div>
      <h2 style={{ color: 'var(--text-main)', marginBottom: '4px' }}>{t('vendors.title')}</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>{t('vendors.subtitle')}</p>

      {/* --- REGISTRY --- */}
      <div style={card}>
        <h3 style={{ color: 'var(--text-main)', marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon icon="lucide:store" style={{ color: 'var(--brand-color)' }} />
          {t('vendors.registry')}
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', alignItems: 'end', marginBottom: '16px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
            {t('vendors.name')}
            <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="AldaGs" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
            {t('vendors.contact')}
            <input style={inputStyle} value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="55…" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
            {t('vendors.splitType')}
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.splitType} onChange={(e) => setForm({ ...form, splitType: e.target.value })}>
              <option value="percentage">{t('vendors.splitPercentage')}</option>
              <option value="cost">{t('vendors.splitCost')}</option>
            </select>
          </label>
          {form.splitType === 'cost' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.72rem', color: 'var(--text-muted)', paddingBottom: '14px' }}>
              {t('vendors.costPerItemNote')}
            </div>
          ) : (
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
              {t('vendors.commission')}
              <input style={inputStyle} type="number" min="0" max="100" step="0.5" value={form.commissionPercent} onChange={(e) => setForm({ ...form, commissionPercent: e.target.value })} />
            </label>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'bold', paddingBottom: '12px', whiteSpace: 'nowrap', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            {t('vendors.active')}
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button disabled={busy} onClick={saveVendor} style={{ padding: '12px 18px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon icon="lucide:save" />{editingId ? t('vendors.save') : t('vendors.addVendor')}
            </button>
            {editingId && (
              <button disabled={busy} onClick={resetForm} style={{ padding: '12px 16px', background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border)', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>
                {t('vendors.cancel')}
              </button>
            )}
          </div>
        </div>
        {form.splitType === 'percentage' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'bold', maxWidth: '320px', marginBottom: '12px' }}>
            {t('vendors.commissionBaseLabel')}
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.commissionBase} onChange={(e) => setForm({ ...form, commissionBase: e.target.value })}>
              <option value="gross">{t('vendors.commissionBaseGross')}</option>
              <option value="base">{t('vendors.commissionBaseBase')}</option>
            </select>
          </label>
        )}
        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '0 0 16px' }}>{t('vendors.commissionHint')}</p>

        {vendors.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>{t('vendors.noVendors')}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {vendors.map((v) => (
              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: 'var(--bg-main)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>
                    {v.name}{v.isActive === false ? ' · ✕' : ''}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {v.contact ? `${v.contact} · ` : ''}
                    {v.splitType === 'cost'
                      ? t('vendors.splitCost')
                      : `${t('vendors.commission')}: ${v.commissionPercent}%`}
                  </div>
                </div>
                <button onClick={() => startEdit(v)} title={t('vendors.edit')} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--brand-color)', borderRadius: '10px', padding: '8px 10px', cursor: 'pointer' }}>
                  <Icon icon="lucide:edit-3" />
                </button>
                <button onClick={() => removeVendor(v)} title={t('vendors.delete')} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: '#e74c3c', borderRadius: '10px', padding: '8px 10px', cursor: 'pointer' }}>
                  <Icon icon="lucide:trash-2" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- SETTLEMENT REPORT --- */}
      <div style={card}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'end', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 style={{ color: 'var(--text-main)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon icon="lucide:scale" style={{ color: 'var(--brand-color)' }} />
            {t('vendors.report')}
          </h3>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'end', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
              {t('vendors.from')}
              <input style={inputStyle} type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
              {t('vendors.to')}
              <input style={inputStyle} type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
            </label>
            <button onClick={exportCSV} style={{ padding: '12px 16px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon icon="lucide:download" />{t('vendors.exportCSV')}
            </button>
          </div>
        </div>

        {itemVendorMap.size > 0 && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '16px', padding: '12px 14px', background: 'var(--bg-main)', borderRadius: '12px', border: '1px solid var(--border)', cursor: 'pointer' }}>
            <input type="checkbox" checked={useMenuFallback} onChange={(e) => setUseMenuFallback(e.target.checked)} style={{ marginTop: '2px' }} />
            <span>
              <span style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{t('vendors.menuFallback')}</span>
              <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t('vendors.menuFallbackHint')}</span>
            </span>
          </label>
        )}

        {rows.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>{t('vendors.noSales')}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ ...th, textAlign: 'left' }}>{t('vendors.colVendor')}</th>
                  <th style={th}>{t('vendors.colUnits')}</th>
                  <th style={th}>{t('vendors.colGross')}</th>
                  <th style={th}>{t('vendors.colRefunds')}</th>
                  <th style={th}>{t('vendors.colNet')}</th>
                  <th style={th}>{t('vendors.colCommission')}</th>
                  <th style={th}>{t('vendors.colPayout')}</th>
                  <th style={th}>{t('vendors.colPaid')}</th>
                  <th style={th}>{t('vendors.colBalance')}</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.key}>
                    <tr style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => setExpanded(expanded === r.key ? null : r.key)}>
                      <td style={{ ...td, textAlign: 'left' }}>
                        <Icon icon={expanded === r.key ? 'lucide:chevron-down' : 'lucide:chevron-right'} style={{ verticalAlign: 'middle', marginRight: '6px', color: 'var(--text-muted)' }} />
                        {r.vendorName}{r.isHouse ? ` · ${t('vendors.house')}` : (r.splitType === 'cost' ? ` · ${t('vendors.splitCost')}` : ` · ${r.commissionPercent}%`)}
                      </td>
                      <td style={td}>{r.units}</td>
                      <td style={td}>{formatForDisplay(r.grossCents)}</td>
                      <td style={{ ...td, color: r.refundCents ? '#e74c3c' : 'var(--text-muted)' }}>{r.refundCents ? `-${formatForDisplay(r.refundCents)}` : '—'}</td>
                      <td style={td}>{formatForDisplay(r.netCents)}</td>
                      <td style={td}>{r.isHouse ? '—' : formatForDisplay(r.commissionCents)}</td>
                      <td style={{ ...td, color: 'var(--brand-color)' }}>{formatForDisplay(r.payoutCents)}</td>
                      {(() => {
                        if (r.isHouse) return (<><td style={{ ...td, color: 'var(--text-muted)' }}>—</td><td style={{ ...td, color: 'var(--text-muted)' }}>—</td><td style={td}></td></>);
                        const paid = paidFor(r);
                        const balance = r.payoutCents - paid;
                        return (
                          <>
                            <td style={{ ...td, color: paid ? 'var(--text-main)' : 'var(--text-muted)' }}>{paid ? formatForDisplay(paid) : '—'}</td>
                            <td style={{ ...td, color: balance > 0 ? '#e67e22' : (balance < 0 ? '#e74c3c' : '#27ae60') }}>{formatForDisplay(balance)}</td>
                            <td style={{ ...td, whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                              <button onClick={() => setShareRow(r)} disabled={sharing} title={t('vendors.shareStatement')} style={{ background: 'var(--bg-main)', color: 'var(--brand-color)', border: '1px solid var(--border)', borderRadius: '10px', padding: '6px 10px', cursor: 'pointer', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px', marginRight: '6px' }}>
                                <Icon icon="lucide:share-2" />
                              </button>
                              <button onClick={() => openPay(r)} title={t('vendors.recordPayment')} style={{ background: '#27ae60', color: 'white', border: 'none', borderRadius: '10px', padding: '6px 10px', cursor: 'pointer', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <Icon icon="lucide:hand-coins" />
                              </button>
                            </td>
                          </>
                        );
                      })()}
                    </tr>
                    {expanded === r.key && r.items.map((it) => (
                      <tr key={`${r.key}::${it.name}`} style={{ background: 'var(--bg-main)' }}>
                        <td style={{ ...td, textAlign: 'left', fontWeight: 'normal', color: 'var(--text-muted)', paddingLeft: '32px' }}>{it.name}</td>
                        <td style={{ ...td, fontWeight: 'normal', color: 'var(--text-muted)' }}>{it.units}</td>
                        <td style={{ ...td, fontWeight: 'normal', color: 'var(--text-muted)' }}>{formatForDisplay(it.grossCents)}</td>
                        <td style={td} colSpan={7}></td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)' }}>
                  <td style={{ ...td, textAlign: 'left' }}>{t('vendors.totals')}</td>
                  <td style={td}>{totals.units}</td>
                  <td style={td}>{formatForDisplay(totals.grossCents)}</td>
                  <td style={td}>{totals.refundCents ? `-${formatForDisplay(totals.refundCents)}` : '—'}</td>
                  <td style={td}>{formatForDisplay(totals.netCents)}</td>
                  <td style={td}>{formatForDisplay(totals.commissionCents)}</td>
                  <td style={{ ...td, color: 'var(--brand-color)' }}>{formatForDisplay(totals.payoutCents)}</td>
                  <td style={td}>{totalPaid ? formatForDisplay(totalPaid) : '—'}</td>
                  <td style={{ ...td, color: totalBalance > 0 ? '#e67e22' : (totalBalance < 0 ? '#e74c3c' : '#27ae60') }}>{formatForDisplay(totalBalance)}</td>
                  <td style={td}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {rows.length > 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '12px 0 0' }}>{t('vendors.payHint')}</p>
        )}
      </div>

      {/* --- BOOKS SUMMARY (agent-accounting view) --- */}
      {rows.length > 0 && (() => {
        const houseRow = rows.find((r) => r.isHouse);
        const houseNet = houseRow?.netCents || 0;
        const commissionIncome = totals.commissionCents;       // house contributes 0
        const yourIncome = houseNet + commissionIncome;        // what's actually yours
        const tiles = [
          { label: t('vendors.booksHouseSales'), value: houseNet, color: 'var(--text-main)', hint: t('vendors.booksHouseSalesHint') },
          { label: t('vendors.booksCommissionIncome'), value: commissionIncome, color: '#27ae60', hint: t('vendors.booksCommissionHint') },
          { label: t('vendors.booksIvaCollected'), value: totals.taxCents, color: 'var(--text-main)', hint: t('vendors.booksIvaHint') },
          { label: t('vendors.booksYourIncome'), value: yourIncome, color: '#27ae60', strong: true, hint: t('vendors.booksYourIncomeHint') },
          { label: t('vendors.booksVendorPayable'), value: totalVendorOwed, color: 'var(--text-main)', hint: t('vendors.booksVendorPayableHint') },
          { label: t('vendors.booksPaid'), value: totalPaid, color: 'var(--text-muted)', hint: t('vendors.booksPaidHint') },
          { label: t('vendors.booksOutstanding'), value: totalBalance, color: totalBalance > 0 ? '#e67e22' : '#27ae60', strong: true, hint: t('vendors.booksOutstandingHint') },
        ];
        return (
          <div style={card}>
            <h3 style={{ color: 'var(--text-main)', marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon icon="lucide:book-open-check" style={{ color: 'var(--brand-color)' }} />
              {t('vendors.booksTitle')}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              {tiles.map((tile) => (
                <div key={tile.label} style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px 16px' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{tile.label}</div>
                  <div style={{ fontSize: tile.strong ? '1.35rem' : '1.15rem', fontWeight: '800', color: tile.color, marginTop: '4px' }}>{formatForDisplay(tile.value)}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.3 }}>{tile.hint}</div>
                </div>
              ))}
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.76rem', margin: '14px 0 0', lineHeight: 1.4 }}>{t('vendors.booksNote')}</p>
          </div>
        );
      })()}

      {/* --- PAYOUT HISTORY --- */}
      <div style={card}>
        <h3 style={{ color: 'var(--text-main)', marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon icon="lucide:history" style={{ color: 'var(--brand-color)' }} />
          {t('vendors.history')}
        </h3>
        {(!payouts || payouts.length === 0) ? (
          <p style={{ color: 'var(--text-muted)' }}>{t('vendors.historyEmpty')}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {payouts.map((p) => (
              <div key={p.local_id || p.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: 'var(--bg-main)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>
                    {p.vendor_name} · <span style={{ color: p.amount < 0 ? '#e74c3c' : 'var(--brand-color)' }}>{formatForDisplay(Math.round(Number(p.amount) || 0))}</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {new Date(p.created_at).toLocaleDateString()} · {p.method || 'cash'}
                    {p.period_from ? ` · ${p.period_from} → ${p.period_to || ''}` : ''}
                    {p.note ? ` · ${p.note}` : ''}
                  </div>
                </div>
                {p.amount >= 0 && (
                  <button onClick={() => undoPayout(p)} title={t('vendors.reverse')} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: '#e74c3c', borderRadius: '10px', padding: '8px 10px', cursor: 'pointer' }}>
                    <Icon icon="lucide:undo-2" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- SHARE FORMAT CHOOSER --- */}
      {shareRow && (
        <div onClick={() => setShareRow(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...card, marginBottom: 0, width: '100%', maxWidth: '420px', boxShadow: '0 12px 40px rgba(0,0,0,0.35)' }}>
            <h3 style={{ color: 'var(--text-main)', marginTop: 0 }}>{t('vendors.shareStatement')}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 0 }}>{shareRow.vendorName} · {range.from || ''} → {range.to || ''}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
              <button disabled={sharing} onClick={() => shareStatement(shareRow, 'pdf')} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '14px', cursor: 'pointer', textAlign: 'left' }}>
                <Icon icon="lucide:file-text" width="24" />
                <span>
                  <span style={{ display: 'block', fontWeight: 800, fontSize: '1rem' }}>{t('vendors.sharePdf')}</span>
                  <span style={{ display: 'block', fontSize: '0.78rem', opacity: 0.85 }}>{t('vendors.sharePdfHint')}</span>
                </span>
              </button>
              <button disabled={sharing} onClick={() => shareStatement(shareRow, 'png')} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border)', borderRadius: '14px', cursor: 'pointer', textAlign: 'left' }}>
                <Icon icon="lucide:image" width="24" style={{ color: 'var(--brand-color)' }} />
                <span>
                  <span style={{ display: 'block', fontWeight: 800, fontSize: '1rem' }}>{t('vendors.sharePng')}</span>
                  <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t('vendors.sharePngHint')}</span>
                </span>
              </button>
              <button disabled={sharing} onClick={() => setShareRow(null)} style={{ padding: '12px', background: 'transparent', color: 'var(--text-muted)', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
                {t('vendors.payCancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- OFF-SCREEN STATEMENT (rendered only while sharing) --- */}
      {statementRow && (
        <div style={{ position: 'fixed', left: '-99999px', top: 0, pointerEvents: 'none' }} aria-hidden="true">
          <VendorStatement
            id="vendor-statement-capture"
            row={statementRow}
            paidCents={paidFor(statementRow)}
            range={range}
            branding={branding}
            t={t}
          />
        </div>
      )}

      {/* --- RECORD PAYMENT MODAL --- */}
      {payFor && (
        <div onClick={() => setPayFor(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...card, marginBottom: 0, width: '100%', maxWidth: '420px', boxShadow: '0 12px 40px rgba(0,0,0,0.35)' }}>
            <h3 style={{ color: 'var(--text-main)', marginTop: 0 }}>{t('vendors.payTitle')}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 0 }}>
              {payFor.vendorName} · {t('vendors.colPayout')}: <strong>{formatForDisplay(payFor.payoutCents)}</strong>
              {' · '}{t('vendors.colBalance')}: <strong>{formatForDisplay(payFor.payoutCents - paidFor(payFor))}</strong>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
                {t('vendors.payAmount')}
                <input style={inputStyle} type="number" min="0" step="0.01" autoFocus value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
                {t('vendors.payMethod')}
                <select style={{ ...inputStyle, cursor: 'pointer' }} value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
                  <option value="cash">{t('vendors.methodCash')}</option>
                  <option value="transfer">{t('vendors.methodTransfer')}</option>
                  <option value="other">{t('vendors.methodOther')}</option>
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
                {t('vendors.payNote')}
                <input style={inputStyle} value={payForm.note} onChange={(e) => setPayForm({ ...payForm, note: e.target.value })} />
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <input type="checkbox" checked={payForm.postExpense} onChange={(e) => setPayForm({ ...payForm, postExpense: e.target.checked })} style={{ marginTop: '2px' }} />
                <span>
                  <span style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{t('vendors.payPostExpense')}</span>
                  <span style={{ display: 'block', fontSize: '0.74rem' }}>{t('vendors.payPostExpenseHint')}</span>
                </span>
              </label>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button disabled={busy} onClick={() => setPayFor(null)} style={{ padding: '12px 16px', background: 'var(--bg-main)', color: 'var(--text-main)', border: '1px solid var(--border)', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>
                  {t('vendors.payCancel')}
                </button>
                <button disabled={busy} onClick={submitPay} style={{ padding: '12px 18px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Icon icon="lucide:hand-coins" />{t('vendors.payConfirm')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default VendorsTab;
