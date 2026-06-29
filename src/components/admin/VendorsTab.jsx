import { Fragment, useMemo, useState } from 'react';
import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';
import { useDialog } from '../../hooks/useDialog';
import { formatForDisplay, fromCents } from '../../utils/moneyUtils';
import { computeSettlement } from '../../utils/vendorUtils';

// Default the report to the current calendar month (local time).
function defaultRange() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { from: iso(first), to: iso(now) };
}

const card = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '24px', marginBottom: '24px' };
const inputStyle = { padding: '12px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold' };
const th = { textAlign: 'right', padding: '10px 12px', fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' };
const td = { textAlign: 'right', padding: '12px', fontWeight: 'bold', color: 'var(--text-main)' };

const EMPTY_FORM = { name: '', contact: '', commissionPercent: '0', splitType: 'percentage', isActive: true };

function VendorsTab({ vendors = [], sales = [], onAddVendor, onUpdateVendor, onDeleteVendor }) {
  const { t } = useTranslation();
  const { showAlert, showConfirm } = useDialog();

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState(defaultRange);
  const [expanded, setExpanded] = useState(null);

  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(null); };

  const startEdit = (v) => {
    setEditingId(v.id);
    setForm({ name: v.name, contact: v.contact || '', commissionPercent: String(v.commissionPercent ?? 0), splitType: v.splitType === 'cost' ? 'cost' : 'percentage', isActive: v.isActive !== false });
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
    return computeSettlement(sales, vendors, { fromMs, toMs });
  }, [sales, vendors, range]);

  const exportCSV = () => {
    const head = [t('vendors.colVendor'), t('vendors.colUnits'), t('vendors.colGross'), t('vendors.colRefunds'), t('vendors.colNet'), t('vendors.colCommission'), t('vendors.colPayout')];
    const lines = [head.join(',')];
    const money = (c) => fromCents(c).toFixed(2);
    const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
    settlement.rows.forEach((r) => {
      lines.push([esc(r.vendorName), r.units, money(r.grossCents), money(r.refundCents), money(r.netCents), money(r.commissionCents), money(r.payoutCents)].join(','));
      r.items.forEach((it) => {
        lines.push([esc(`   ${it.name}`), it.units, money(it.grossCents), '', '', '', ''].join(','));
      });
    });
    const { totals } = settlement;
    lines.push([esc(t('vendors.totals')), totals.units, money(totals.grossCents), money(totals.refundCents), money(totals.netCents), money(totals.commissionCents), money(totals.payoutCents)].join(','));

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vendor-settlement_${range.from || 'all'}_${range.to || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const { rows, totals } = settlement;

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

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.4fr 1fr auto auto', gap: '12px', alignItems: 'end', marginBottom: '16px' }}>
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
                <button onClick={() => startEdit(v)} title={t('vendors.edit')} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--brand-color)', borderRadius: '10px', padding: '8px 10px', cursor: 'pointer' }}>
                  <Icon icon="lucide:edit-3" />
                </button>
                <button onClick={() => removeVendor(v)} title={t('vendors.delete')} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: '#e74c3c', borderRadius: '10px', padding: '8px 10px', cursor: 'pointer' }}>
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
                    </tr>
                    {expanded === r.key && r.items.map((it) => (
                      <tr key={`${r.key}::${it.name}`} style={{ background: 'var(--bg-main)' }}>
                        <td style={{ ...td, textAlign: 'left', fontWeight: 'normal', color: 'var(--text-muted)', paddingLeft: '32px' }}>{it.name}</td>
                        <td style={{ ...td, fontWeight: 'normal', color: 'var(--text-muted)' }}>{it.units}</td>
                        <td style={{ ...td, fontWeight: 'normal', color: 'var(--text-muted)' }}>{formatForDisplay(it.grossCents)}</td>
                        <td style={td} colSpan={4}></td>
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
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default VendorsTab;
