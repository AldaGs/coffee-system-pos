import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';
import { toCents, formatForDisplay } from '../../utils/moneyUtils';

const DOW = [0, 1, 2, 3, 4, 5, 6];

// Shared inline styles kept terse so the JSX below stays readable.
const inputStyle = { padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold' };
const labelStyle = { fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)' };
const sectionStyle = { display: 'flex', flexDirection: 'column', gap: '14px', padding: '18px', borderRadius: '16px', background: 'var(--bg-main)', border: '1px solid var(--border)' };
const sectionTitleStyle = { margin: 0, fontSize: '0.8rem', fontWeight: '900', letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' };

function DiscountsTab({ menuData, newRule, setNewRule, handleAddDiscountRule, handleToggleDiscountRule, handleDeleteDiscountRule, showAlert, showConfirm }) {
  const { t } = useTranslation();

  const allItems = Object.entries(menuData.categories || {}).flatMap(([cat, items]) =>
    (items || []).map(item => ({ ...item, cat }))
  );

  const patch = (fields) => setNewRule({ ...newRule, ...fields });
  const isBogo = newRule.kind === 'buyXgetY';
  const isCombo = newRule.kind === 'comboPrice';

  // --- required-items editor helpers ---
  const addRequiredItem = () => patch({ requiredItems: [...(newRule.requiredItems || []), { name: '', minQty: 1 }] });
  const updateRequiredItem = (idx, field, value) => {
    const next = (newRule.requiredItems || []).map((r, i) => i === idx ? { ...r, [field]: value } : r);
    patch({ requiredItems: next });
  };
  const removeRequiredItem = (idx) => patch({ requiredItems: (newRule.requiredItems || []).filter((_, i) => i !== idx) });

  // --- combo-items editor helpers ---
  const addComboItem = () => patch({ comboItems: [...(newRule.comboItems || []), { name: '', qty: 1 }] });
  const updateComboItem = (idx, field, value) => {
    const next = (newRule.comboItems || []).map((r, i) => i === idx ? { ...r, [field]: value } : r);
    patch({ comboItems: next });
  };
  const removeComboItem = (idx) => patch({ comboItems: (newRule.comboItems || []).filter((_, i) => i !== idx) });

  const toggleDay = (d) => {
    const days = newRule.days || [];
    patch({ days: days.includes(d) ? days.filter(x => x !== d) : [...days, d].sort() });
  };

  const handleSubmit = () => {
    if (!newRule.name) return showAlert(t('disc.alertError'), t('disc.alertErrorDesc'));

    let reward;
    if (isBogo) {
      const buyQty = parseInt(newRule.buyQty, 10);
      const payQty = parseInt(newRule.payQty, 10);
      if (!newRule.bogoItem || isNaN(buyQty) || isNaN(payQty) || buyQty < 1 || payQty < 0 || payQty >= buyQty) {
        return showAlert(t('disc.alertError'), t('disc.alertBogoDesc'));
      }
      reward = { kind: 'buyXgetY', bogoItem: newRule.bogoItem, buyQty, payQty };
    } else if (isCombo) {
      const comboItems = (newRule.comboItems || []).filter(c => c.name).map(c => ({ name: c.name, qty: Math.max(1, parseInt(c.qty, 10) || 1) }));
      if (comboItems.length < 1 || !newRule.comboPrice) {
        return showAlert(t('disc.alertError'), t('disc.alertComboDesc'));
      }
      reward = { kind: 'comboPrice', comboItems, comboPrice: toCents(newRule.comboPrice) };
    } else {
      if (!newRule.value || (newRule.targetType === 'item' && !newRule.targetValue)) {
        return showAlert(t('disc.alertError'), t('disc.alertErrorDesc'));
      }
      const val = newRule.type === 'percentage' ? parseFloat(newRule.value) : toCents(newRule.value);
      reward = { kind: 'standard', type: newRule.type, value: val, targetType: newRule.targetType, targetValue: newRule.targetValue };
    }

    // Build conditions, omitting empties so simple rules stay clean.
    const conditions = {};
    const reqItems = (newRule.requiredItems || []).filter(r => r.name).map(r => ({ name: r.name, minQty: Math.max(1, parseInt(r.minQty, 10) || 1) }));
    if (reqItems.length) conditions.requiredItems = reqItems;
    if (newRule.minSubtotal) conditions.minSubtotal = toCents(newRule.minSubtotal);
    if (newRule.customer && newRule.customer !== 'any') conditions.customer = newRule.customer;
    if ((newRule.days || []).length) conditions.days = newRule.days;
    if (newRule.startDate) conditions.startDate = newRule.startDate;
    if (newRule.endDate) conditions.endDate = newRule.endDate;
    if (newRule.startTime) conditions.startTime = newRule.startTime;
    if (newRule.endTime) conditions.endTime = newRule.endTime;

    // Usage caps, omitted when unset.
    const caps = {};
    if (newRule.maxRedemptions) caps.maxRedemptions = Math.max(1, parseInt(newRule.maxRedemptions, 10) || 0);
    if (newRule.maxPerDay) caps.maxPerDay = Math.max(1, parseInt(newRule.maxPerDay, 10) || 0);
    if (newRule.maxBudget) caps.maxBudget = toCents(newRule.maxBudget);

    handleAddDiscountRule({
      id: Date.now(),
      name: newRule.name,
      isActive: true,
      trigger: newRule.trigger || 'auto',
      ...(newRule.code && newRule.code.trim() ? { code: newRule.code.trim() } : {}),
      ...reward,
      ...(Object.keys(conditions).length ? { conditions } : {}),
      ...(Object.keys(caps).length ? { caps } : {}),
      ...(newRule.maxDiscount ? { maxDiscount: toCents(newRule.maxDiscount) } : {}),
      priority: parseInt(newRule.priority, 10) || 0,
      allowStack: !!newRule.allowStack,
      ...(newRule.requireApproval ? { requireApproval: true } : {}),
      usage: newRule.usage || 'recurring',
    });

    setNewRule({
      name: '', trigger: 'auto', code: '', kind: 'standard', type: 'percentage', value: '', targetType: 'cart', targetValue: '',
      bogoItem: '', buyQty: 2, payQty: 1, comboItems: [], comboPrice: '', requiredItems: [], minSubtotal: '', customer: 'any',
      days: [], startDate: '', endDate: '', startTime: '', endTime: '',
      maxRedemptions: '', maxPerDay: '', maxBudget: '', maxDiscount: '', priority: 0, allowStack: false, requireApproval: false, usage: 'recurring',
    });
    showAlert(t('disc.alertSuccess'), t('disc.alertSuccessDesc'));
  };

  return (
    <div className="admin-section fade-in">
      <div className="admin-section-header" style={{ marginBottom: '40px' }}>
        <h1 style={{ margin: 0, color: 'var(--text-main)', fontSize: '2rem', fontWeight: '800' }}>{t('disc.title')}</h1>
        <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0', fontSize: '1.1rem' }}>{t('disc.subtitle')}</p>
      </div>

      <div className="admin-grid-responsive" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '32px', alignItems: 'flex-start' }}>

        {/* CREATE RULE SECTION */}
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '24px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: '800' }}>
            <Icon icon="lucide:ticket-plus" style={{ color: 'var(--brand-color)' }} />
            {t('disc.createTitle')}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Name */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={labelStyle}>{t('disc.labelName')}</label>
              <input type="text" placeholder={t('disc.placeholderName')} value={newRule.name}
                onChange={(e) => patch({ name: e.target.value })} style={inputStyle} />
            </div>

            {/* Trigger: automatic vs cashier-applied */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={labelStyle}>{t('disc.triggerLabel')}</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {[{ v: 'auto', label: t('disc.triggerAuto'), icon: 'lucide:zap' }, { v: 'manual', label: t('disc.triggerManual'), icon: 'lucide:hand' }].map(opt => (
                  <button key={opt.v} onClick={() => patch({ trigger: opt.v })}
                    style={{ flex: 1, padding: '12px', borderRadius: '12px', fontWeight: 'bold', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', border: `2px solid ${(newRule.trigger || 'auto') === opt.v ? 'var(--brand-color)' : 'var(--border)'}`, background: (newRule.trigger || 'auto') === opt.v ? 'rgba(52, 152, 219, 0.08)' : 'var(--bg-main)', color: (newRule.trigger || 'auto') === opt.v ? 'var(--brand-color)' : 'var(--text-main)' }}>
                    <Icon icon={opt.icon} /> {opt.label}
                  </button>
                ))}
              </div>
              {newRule.trigger === 'manual' && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('disc.triggerManualHint')}</span>}
            </div>

            {/* Coupon code (optional) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '6px' }}><Icon icon="lucide:tag" /> {t('disc.codeLabel')}</label>
              <input type="text" placeholder={t('disc.codePlaceholder')} value={newRule.code} onChange={(e) => patch({ code: e.target.value })} style={{ ...inputStyle, textTransform: 'uppercase' }} />
              {newRule.code && newRule.code.trim() && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('disc.codeHint')}</span>}
            </div>

            {/* Reward kind selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={labelStyle}>{t('disc.rewardKind')}</label>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {[{ k: 'standard', label: t('disc.kindStandard'), icon: 'lucide:percent' }, { k: 'buyXgetY', label: t('disc.kindBogo'), icon: 'lucide:gift' }, { k: 'comboPrice', label: t('disc.kindCombo'), icon: 'lucide:package' }].map(opt => (
                  <button key={opt.k} onClick={() => patch({ kind: opt.k })}
                    style={{ flex: '1 1 30%', minWidth: '96px', padding: '12px', borderRadius: '12px', fontWeight: 'bold', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', border: `2px solid ${newRule.kind === opt.k ? 'var(--brand-color)' : 'var(--border)'}`, background: newRule.kind === opt.k ? 'rgba(52, 152, 219, 0.08)' : 'var(--bg-main)', color: newRule.kind === opt.k ? 'var(--brand-color)' : 'var(--text-main)' }}>
                    <Icon icon={opt.icon} /> {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Standard reward fields */}
            {!isBogo && (
              <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={labelStyle}>{t('disc.labelType')}</label>
                    <select value={newRule.type} onChange={(e) => patch({ type: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                      <option value="percentage">{t('disc.typePerc')}</option>
                      <option value="flat">{t('disc.typeFlat')}</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={labelStyle}>{t('disc.labelValue')}</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                        {newRule.type === 'percentage' ? '%' : '$'}
                      </span>
                      <input type="number" placeholder={t('disc.placeholderValue')} value={newRule.value}
                        onChange={(e) => patch({ value: e.target.value })}
                        style={{ ...inputStyle, width: '100%', padding: '14px 14px 14px 32px', fontWeight: '900', fontSize: '0.85rem' }} />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icon icon="lucide:target" style={{ color: 'var(--brand-color)' }} />
                    {t('disc.applyTo')}
                  </label>
                  <select value={newRule.targetType} onChange={(e) => patch({ targetType: e.target.value, targetValue: '' })} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="cart">{t('disc.targetCart')}</option>
                    <option value="item">{t('disc.targetItem')}</option>
                  </select>
                </div>

                {newRule.targetType === 'item' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }} className="fade-in">
                    <label style={labelStyle}>{t('disc.selectItem')}</label>
                    <select value={newRule.targetValue} onChange={(e) => patch({ targetValue: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                      <option value="">{t('disc.selectItemPlaceholder')}</option>
                      {allItems.map(item => <option key={item.id} value={item.name}>{item.name} ({item.cat})</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Buy X get Y reward fields */}
            {isBogo && (
              <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={labelStyle}>{t('disc.bogoItem')}</label>
                  <select value={newRule.bogoItem} onChange={(e) => patch({ bogoItem: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">{t('disc.selectItemPlaceholder')}</option>
                    {allItems.map(item => <option key={item.id} value={item.name}>{item.name} ({item.cat})</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={labelStyle}>{t('disc.bogoPresets')}</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {[{ b: 2, p: 1, l: '2x1' }, { b: 3, p: 2, l: '3x2' }].map(preset => (
                      <button key={preset.l} onClick={() => patch({ buyQty: preset.b, payQty: preset.p })}
                        style={{ flex: 1, padding: '10px', borderRadius: '10px', fontWeight: '900', cursor: 'pointer', border: `2px solid ${newRule.buyQty == preset.b && newRule.payQty == preset.p ? 'var(--brand-color)' : 'var(--border)'}`, background: newRule.buyQty == preset.b && newRule.payQty == preset.p ? 'rgba(52, 152, 219, 0.08)' : 'var(--bg-main)', color: 'var(--text-main)' }}>
                        {preset.l}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={labelStyle}>{t('disc.bogoBuy')}</label>
                    <input type="number" min="1" value={newRule.buyQty} onChange={(e) => patch({ buyQty: e.target.value })} style={{ ...inputStyle, fontWeight: '900' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={labelStyle}>{t('disc.bogoPay')}</label>
                    <input type="number" min="0" value={newRule.payQty} onChange={(e) => patch({ payQty: e.target.value })} style={{ ...inputStyle, fontWeight: '900' }} />
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {Math.max(0, (parseInt(newRule.buyQty, 10) || 0) - (parseInt(newRule.payQty, 10) || 0))} {t('disc.bogoHintFree')}
                </p>
              </div>
            )}

            {/* Combo price reward fields */}
            {isCombo && (
              <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={labelStyle}>{t('disc.comboItems')}</label>
                  {(newRule.comboItems || []).map((c, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <select value={c.name} onChange={(e) => updateComboItem(idx, 'name', e.target.value)} style={{ ...inputStyle, flex: 1, padding: '10px', cursor: 'pointer' }}>
                        <option value="">{t('disc.selectItemPlaceholder')}</option>
                        {allItems.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
                      </select>
                      <input type="number" min="1" title={t('disc.minQtyShort')} value={c.qty} onChange={(e) => updateComboItem(idx, 'qty', e.target.value)} style={{ ...inputStyle, width: '64px', padding: '10px', textAlign: 'center' }} />
                      <button onClick={() => removeComboItem(idx)} style={{ background: 'rgba(231, 76, 60, 0.08)', color: '#e74c3c', border: 'none', borderRadius: '10px', width: '38px', height: '38px', cursor: 'pointer', flexShrink: 0 }}>
                        <Icon icon="lucide:x" />
                      </button>
                    </div>
                  ))}
                  <button onClick={addComboItem} style={{ padding: '10px', borderRadius: '10px', border: '1px dashed var(--border)', background: 'transparent', color: 'var(--brand-color)', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <Icon icon="lucide:plus" /> {t('disc.addComboItem')}
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={labelStyle}>{t('disc.comboPrice')}</label>
                  <input type="number" min="0" step="0.01" placeholder={t('disc.minSubtotalPlaceholder')} value={newRule.comboPrice} onChange={(e) => patch({ comboPrice: e.target.value })} style={{ ...inputStyle, fontWeight: '900' }} />
                </div>
              </div>
            )}

            {/* CONDITIONS */}
            <div style={sectionStyle}>
              <h4 style={sectionTitleStyle}><Icon icon="lucide:sliders-horizontal" /> {t('disc.conditionsTitle')}</h4>
              <p style={{ margin: '-6px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t('disc.conditionsHint')}</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={labelStyle}>{t('disc.requiredItems')}</label>
                {(newRule.requiredItems || []).map((req, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <select value={req.name} onChange={(e) => updateRequiredItem(idx, 'name', e.target.value)} style={{ ...inputStyle, flex: 1, padding: '10px', cursor: 'pointer' }}>
                      <option value="">{t('disc.selectItemPlaceholder')}</option>
                      {allItems.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
                    </select>
                    <input type="number" min="1" title={t('disc.minQtyShort')} value={req.minQty} onChange={(e) => updateRequiredItem(idx, 'minQty', e.target.value)} style={{ ...inputStyle, width: '64px', padding: '10px', textAlign: 'center' }} />
                    <button onClick={() => removeRequiredItem(idx)} style={{ background: 'rgba(231, 76, 60, 0.08)', color: '#e74c3c', border: 'none', borderRadius: '10px', width: '38px', height: '38px', cursor: 'pointer', flexShrink: 0 }}>
                      <Icon icon="lucide:x" />
                    </button>
                  </div>
                ))}
                <button onClick={addRequiredItem} style={{ padding: '10px', borderRadius: '10px', border: '1px dashed var(--border)', background: 'transparent', color: 'var(--brand-color)', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <Icon icon="lucide:plus" /> {t('disc.addRequiredItem')}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={labelStyle}>{t('disc.minSubtotal')}</label>
                <input type="number" min="0" step="0.01" placeholder={t('disc.minSubtotalPlaceholder')} value={newRule.minSubtotal} onChange={(e) => patch({ minSubtotal: e.target.value })} style={inputStyle} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '6px' }}><Icon icon="lucide:heart-handshake" /> {t('disc.customerLabel')}</label>
                <select value={newRule.customer || 'any'} onChange={(e) => patch({ customer: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="any">{t('disc.customerAny')}</option>
                  <option value="member">{t('disc.customerMember')}</option>
                  <option value="nonmember">{t('disc.customerNonmember')}</option>
                </select>
              </div>
            </div>

            {/* SCHEDULE */}
            <div style={sectionStyle}>
              <h4 style={sectionTitleStyle}><Icon icon="lucide:calendar-clock" /> {t('disc.scheduleTitle')}</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={labelStyle}>{t('disc.days')}</label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {DOW.map(d => {
                    const on = (newRule.days || []).includes(d);
                    return (
                      <button key={d} onClick={() => toggleDay(d)}
                        style={{ flex: '1 1 auto', minWidth: '42px', padding: '9px 4px', borderRadius: '10px', fontWeight: 'bold', fontSize: '0.8rem', cursor: 'pointer', border: `2px solid ${on ? 'var(--brand-color)' : 'var(--border)'}`, background: on ? 'var(--brand-color)' : 'var(--bg-main)', color: on ? 'white' : 'var(--text-muted)' }}>
                        {t(`disc.dow${d}`)}
                      </button>
                    );
                  })}
                </div>
                {(newRule.days || []).length === 0 && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('disc.anyDay')}</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={labelStyle}>{t('disc.dateFrom')}</label>
                  <input type="date" value={newRule.startDate} onChange={(e) => patch({ startDate: e.target.value })} style={inputStyle} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={labelStyle}>{t('disc.dateTo')}</label>
                  <input type="date" value={newRule.endDate} onChange={(e) => patch({ endDate: e.target.value })} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={labelStyle}>{t('disc.timeFrom')}</label>
                  <input type="time" value={newRule.startTime} onChange={(e) => patch({ startTime: e.target.value })} style={inputStyle} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={labelStyle}>{t('disc.timeTo')}</label>
                  <input type="time" value={newRule.endTime} onChange={(e) => patch({ endTime: e.target.value })} style={inputStyle} />
                </div>
              </div>
            </div>

            {/* LIMITS (usage caps & budget) */}
            <div style={sectionStyle}>
              <h4 style={sectionTitleStyle}><Icon icon="lucide:gauge" /> {t('disc.limitsTitle')}</h4>
              <p style={{ margin: '-6px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t('disc.limitsHint')}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={labelStyle}>{t('disc.maxRedemptions')}</label>
                  <input type="number" min="1" placeholder="∞" value={newRule.maxRedemptions} onChange={(e) => patch({ maxRedemptions: e.target.value })} style={inputStyle} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={labelStyle}>{t('disc.maxPerDay')}</label>
                  <input type="number" min="1" placeholder="∞" value={newRule.maxPerDay} onChange={(e) => patch({ maxPerDay: e.target.value })} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={labelStyle}>{t('disc.maxBudget')}</label>
                <input type="number" min="0" step="0.01" placeholder={t('disc.minSubtotalPlaceholder')} value={newRule.maxBudget} onChange={(e) => patch({ maxBudget: e.target.value })} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={labelStyle}>{t('disc.maxDiscount')}</label>
                <input type="number" min="0" step="0.01" placeholder={t('disc.minSubtotalPlaceholder')} value={newRule.maxDiscount} onChange={(e) => patch({ maxDiscount: e.target.value })} style={inputStyle} />
              </div>
            </div>

            {/* COMBINATION + RECURRENCE */}
            <div style={sectionStyle}>
              <h4 style={sectionTitleStyle}><Icon icon="lucide:layers" /> {t('disc.combinationTitle')}</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={labelStyle}>{t('disc.priority')}</label>
                <input type="number" value={newRule.priority} onChange={(e) => patch({ priority: e.target.value })} style={inputStyle} />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('disc.priorityHint')}</span>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>
                <input type="checkbox" checked={!!newRule.allowStack} onChange={(e) => patch({ allowStack: e.target.checked })} style={{ width: '18px', height: '18px', accentColor: 'var(--brand-color)' }} />
                {t('disc.allowStack')}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>
                <input type="checkbox" checked={!!newRule.requireApproval} onChange={(e) => patch({ requireApproval: e.target.checked })} style={{ width: '18px', height: '18px', accentColor: 'var(--brand-color)' }} />
                {t('disc.requireApproval')}
              </label>
              {newRule.requireApproval && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('disc.requireApprovalHint')}</span>}

              <h4 style={{ ...sectionTitleStyle, marginTop: '6px' }}><Icon icon="lucide:repeat" /> {t('disc.recurrenceTitle')}</h4>
              <div style={{ display: 'flex', gap: '10px' }}>
                {[{ v: 'recurring', label: t('disc.recurring'), icon: 'lucide:infinity' }, { v: 'once', label: t('disc.once'), icon: 'lucide:ticket' }].map(opt => (
                  <button key={opt.v} onClick={() => patch({ usage: opt.v })}
                    style={{ flex: 1, padding: '12px', borderRadius: '12px', fontWeight: 'bold', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', border: `2px solid ${(newRule.usage || 'recurring') === opt.v ? 'var(--brand-color)' : 'var(--border)'}`, background: (newRule.usage || 'recurring') === opt.v ? 'rgba(52, 152, 219, 0.08)' : 'var(--bg-main)', color: (newRule.usage || 'recurring') === opt.v ? 'var(--brand-color)' : 'var(--text-main)' }}>
                    <Icon icon={opt.icon} /> {opt.label}
                  </button>
                ))}
              </div>
              {(newRule.usage === 'once') && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('disc.onceHint')}</span>}
            </div>

            <button onClick={handleSubmit}
              style={{ padding: '16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '16px', cursor: 'pointer', fontWeight: '900', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginTop: '4px', boxShadow: '0 8px 20px rgba(39, 174, 96, 0.2)' }}>
              <Icon icon="lucide:plus-circle" />
              {t('disc.btnAdd')}
            </button>
          </div>
        </div>

        {/* ACTIVE RULES LIST */}
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', height: 'fit-content' }}>
          <h3 style={{ marginTop: 0, marginBottom: '24px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: '800' }}>
            <Icon icon="lucide:tags" style={{ color: 'var(--brand-color)' }} />
            {t('disc.activeTitle')}
          </h3>
          {(!menuData.discountRules || menuData.discountRules.length === 0) ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', background: 'var(--bg-main)', borderRadius: '20px', border: '2px dashed var(--border)' }}>
              <Icon icon="lucide:ticket" style={{ fontSize: '3rem', color: 'var(--text-muted)', opacity: 0.2, marginBottom: '16px' }} />
              <p style={{ color: 'var(--text-muted)', margin: 0, fontWeight: 'bold' }}>{t('disc.noRules')}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {menuData.discountRules.map(rule => (
                <RuleCard key={rule.id} rule={rule} t={t}
                  onToggle={() => handleToggleDiscountRule(rule)}
                  onDelete={() => showConfirm(t('disc.confirmDelete'), t('disc.confirmDeleteDesc'), () => handleDeleteDiscountRule(rule))} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Human-readable badges describing a rule's conditions / behavior.
function ruleBadges(rule, t) {
  const badges = [];
  const cond = rule.conditions || {};
  if (Array.isArray(cond.days) && cond.days.length) {
    badges.push({ icon: 'lucide:calendar', text: cond.days.map(d => t(`disc.dow${d}`)).join(', ') });
  }
  if (cond.startDate || cond.endDate) {
    badges.push({ icon: 'lucide:calendar-range', text: `${cond.startDate || '…'} → ${cond.endDate || '…'}` });
  }
  if (cond.startTime || cond.endTime) {
    badges.push({ icon: 'lucide:clock', text: `${cond.startTime || '…'} – ${cond.endTime || '…'}` });
  }
  if (Array.isArray(cond.requiredItems) && cond.requiredItems.length) {
    badges.push({ icon: 'lucide:shopping-basket', text: `${t('disc.requiresLabel')} ${cond.requiredItems.map(r => (r.minQty > 1 ? `${r.minQty}× ${r.name}` : r.name)).join(' + ')}` });
  }
  if (cond.minSubtotal) {
    badges.push({ icon: 'lucide:receipt', text: `≥ ${formatForDisplay(cond.minSubtotal)}` });
  }
  if (cond.customer === 'member') badges.push({ icon: 'lucide:heart-handshake', text: t('disc.badgeMembers') });
  if (cond.customer === 'nonmember') badges.push({ icon: 'lucide:user-plus', text: t('disc.badgeNonmembers') });
  if (rule.code) badges.push({ icon: 'lucide:tag', text: rule.code });
  else if (rule.trigger === 'manual') badges.push({ icon: 'lucide:hand', text: t('disc.badgeManual') });
  if (rule.usage === 'once') badges.push({ icon: 'lucide:ticket', text: t('disc.badgeOnce') });
  if (rule.caps) {
    const c = rule.caps;
    if (c.maxRedemptions) badges.push({ icon: 'lucide:hash', text: `${rule.redemptions || 0}/${c.maxRedemptions}` });
    if (c.maxPerDay) badges.push({ icon: 'lucide:calendar-check', text: `${c.maxPerDay}/${t('disc.capPerDay')}` });
    if (c.maxBudget) badges.push({ icon: 'lucide:piggy-bank', text: `${formatForDisplay(rule.spent || 0)} / ${formatForDisplay(c.maxBudget)}` });
  }
  if (rule.maxDiscount) badges.push({ icon: 'lucide:arrow-down-to-line', text: `${t('disc.capMax')} ${formatForDisplay(rule.maxDiscount)}` });
  if (rule.allowStack) badges.push({ icon: 'lucide:layers', text: t('disc.badgeStack') });
  if (rule.requireApproval) badges.push({ icon: 'lucide:shield-check', text: t('disc.badgeApproval') });
  if (rule.priority) badges.push({ icon: 'lucide:flag', text: `${t('disc.badgePriority')} ${rule.priority}` });
  return badges;
}

function RuleCard({ rule, t, onToggle, onDelete }) {
  const isBogo = rule.kind === 'buyXgetY';
  const capReached = rule.caps && (
    (rule.caps.maxRedemptions && (rule.redemptions || 0) >= rule.caps.maxRedemptions) ||
    (rule.caps.maxBudget && (rule.spent || 0) >= rule.caps.maxBudget)
  );
  const consumed = (rule.usage === 'once' && rule.consumedAt) || capReached;

  const isCombo = rule.kind === 'comboPrice';
  const rewardLabel = isBogo
    ? `${rule.buyQty}×${rule.payQty}`
    : isCombo
      ? formatForDisplay(rule.comboPrice)
      : (rule.type === 'percentage' ? `${rule.value}% ${t('disc.off')}` : `${formatForDisplay(rule.value)} ${t('disc.off')}`);
  const targetLabel = isBogo
    ? rule.bogoItem
    : isCombo
      ? (rule.comboItems || []).map(c => (c.qty > 1 ? `${c.qty}× ${c.name}` : c.name)).join(' + ')
      : (rule.targetType === 'cart' ? t('disc.entireOrder') : `${t('disc.itemLabel')} ${rule.targetValue}`);
  const icon = isBogo ? 'lucide:gift' : isCombo ? 'lucide:package' : (rule.type === 'percentage' ? 'lucide:percent' : 'lucide:banknote');
  const badges = ruleBadges(rule, t);

  return (
    <div className="mobile-flex-stack" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', padding: '20px', background: 'var(--bg-main)', borderRadius: '20px', border: rule.isActive ? '1px solid var(--brand-color)' : '1px solid var(--border)', opacity: rule.isActive && !consumed ? 1 : 0.6, transition: 'all 0.3s', boxShadow: rule.isActive ? '0 4px 12px rgba(52, 152, 219, 0.1)' : 'none' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', minWidth: 0 }}>
        <div style={{ height: '48px', width: '48px', flexShrink: 0, borderRadius: '14px', background: rule.isActive ? 'rgba(52, 152, 219, 0.1)' : 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: rule.isActive ? 'var(--brand-color)' : 'var(--text-muted)' }}>
          <Icon icon={icon} style={{ fontSize: '1.4rem' }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: '900', color: 'var(--text-main)', fontSize: '1.1rem' }}>{rule.name}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--brand-color)', fontWeight: 'bold' }}>{rewardLabel}</span>
            <span style={{ height: '3px', width: '3px', background: 'var(--border)', borderRadius: '50%' }} className="desktop-only" />
            <span>{targetLabel}</span>
          </div>
          {badges.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
              {badges.map((b, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border)', fontSize: '0.72rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                  <Icon icon={b.icon} style={{ fontSize: '0.85rem' }} /> {b.text}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        <button onClick={onToggle} style={{ height: '40px', width: '40px', background: rule.isActive ? 'rgba(241, 196, 15, 0.1)' : 'rgba(46, 204, 113, 0.1)', color: rule.isActive ? '#f1c40f' : '#27ae60', border: 'none', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title={rule.isActive ? t('disc.btnPause') : t('disc.btnActivate')}>
          <Icon icon={rule.isActive ? 'lucide:pause' : 'lucide:play'} style={{ fontSize: '1.2rem' }} />
        </button>
        <button onClick={onDelete} style={{ height: '40px', width: '40px', background: 'rgba(231, 76, 60, 0.05)', color: '#e74c3c', border: 'none', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title={t('disc.btnDelete')}>
          <Icon icon="lucide:trash-2" style={{ fontSize: '1.2rem' }} />
        </button>
      </div>
    </div>
  );
}

export default DiscountsTab;
