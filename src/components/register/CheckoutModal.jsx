import { useEffect } from 'react';
import { usePos } from '../../utils/PosContext';
import { useTranslation } from '../../hooks/useTranslation';

function CheckoutModal({ 
  isCheckoutModalOpen, splitPayments, splitMode, setSplitMode, 
  nWays, setNWays, customVal, setCustomVal, paidProductIds, 
  handlePartialPayment, handleSavePartialPayments, 
  handleVoidPartialPayments, handleCancelCheckout,
  tipAmount, setTipAmount, tipPercentage, setTipPercentage
}) {
  const { t } = useTranslation();
  const { cartTotal, activeTicket } = usePos();

  useEffect(() => {
    if (isCheckoutModalOpen) {
      if (tipAmount === 0 && cartTotal > 0 && tipPercentage > 0) {
        setTipAmount(cartTotal * (tipPercentage / 100));
      }
    }
  }, [isCheckoutModalOpen, cartTotal, tipPercentage, tipAmount, setTipAmount]);

  if (!isCheckoutModalOpen) return null;

  const totalDue = cartTotal + (Number(tipAmount) || 0);
  const totalPaid = splitPayments.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, totalDue - totalPaid);

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ textAlign: 'center', maxWidth: '600px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ marginBottom: '10px', color: 'var(--text-main)' }}>{t('check.title')}</h2>
        
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '20px', background: 'var(--bg-main)', padding: '15px', borderRadius: '8px' }}>
          <div>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase' }}>{t('check.totalDue')}</span>
            <p style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: '5px 0 0 0', color: 'var(--brand-color)' }}>${totalDue.toFixed(2)}</p>
          </div>
          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '20px' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase' }}>{t('check.paid')}</span>
            <p style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: '5px 0 0 0', color: '#27ae60' }}>${totalPaid.toFixed(2)}</p>
          </div>
          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '20px' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase' }}>{t('check.remaining')}</span>
            <p style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: '5px 0 0 0', color: '#e74c3c' }}>${remaining.toFixed(2)}</p>
          </div>
        </div>

        {/* Tip Input Section */}
        <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
          <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '1rem' }}>Propina (Tip):</label>
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', padding: '4px 12px' }}>
            <input 
              type="number" 
              min="0" 
              step="1" 
              value={tipPercentage === '' ? '' : tipPercentage} 
              onChange={(e) => {
                const val = e.target.value;
                if (val === '') {
                  setTipPercentage('');
                  setTipAmount(0);
                } else {
                  const num = parseFloat(val);
                  setTipPercentage(num);
                  setTipAmount(cartTotal * (num / 100));
                }
              }} 
              style={{ border: 'none', background: 'transparent', color: 'var(--text-main)', fontSize: '1.2rem', fontWeight: 'bold', width: '50px', outline: 'none', textAlign: 'right' }} 
            />
            <span style={{ color: 'var(--text-muted)', fontSize: '1.2rem', marginLeft: '2px', marginRight: '8px' }}>%</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '1rem', borderLeft: '1px solid var(--border)', paddingLeft: '8px' }}>
              ( ${(Number(tipAmount) || 0).toFixed(2)} )
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px' }}>
          {['full', 'even', 'product', 'custom'].map(mode => (
            <button 
              key={mode} 
              onClick={() => setSplitMode(mode)} 
              style={{ flex: '1 1 45%', padding: '12px 8px', background: splitMode === mode ? 'var(--brand-color)' : 'var(--bg-main)', color: splitMode === mode ? 'white' : 'var(--text-main)', borderRadius: '8px', border: splitMode === mode ? 'none' : '2px solid var(--border)', fontWeight: 'bold' }}
            >
              {mode === 'full' ? t('check.modeRemaining') : mode === 'even' ? t('check.modeEven') : mode === 'product' ? t('check.modeProduct') : t('check.modeCustom')}
            </button>
          ))}
        </div>

        <div style={{ textAlign: 'left', minHeight: '150px' }}>
          {splitMode === 'full' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button onClick={() => handlePartialPayment(remaining, 'Cash')} style={{ padding: '20px', fontSize: '1.2rem', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>{t('check.cash')}</button>
              <button onClick={() => handlePartialPayment(remaining, 'Card')} style={{ padding: '20px', fontSize: '1.2rem', background: '#2980b9', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>{t('check.card')}</button>
              <button onClick={() => handlePartialPayment(remaining, 'Transfer')} style={{ padding: '20px', fontSize: '1.2rem', background: '#8e44ad', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>{t('check.transfer')}</button>
            </div>
          )}

          {splitMode === 'even' && (
            <div style={{ background: 'var(--bg-main)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <p style={{ color: 'var(--text-muted)', marginBottom: '16px', textAlign: 'center' }}>{t('check.evenSubtitle')}</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px', marginBottom: '20px' }}>
                <span style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '1.2rem' }}>{t('check.people')}</span>
                <button onClick={() => setNWays(Math.max(1, nWays - 1))} style={{ padding: '10px 20px', borderRadius: '8px', border: '2px solid var(--border)', background: 'transparent', color: 'var(--text-main)', fontSize: '1.2rem', cursor: 'pointer' }}>-</button>
                <span style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{nWays}</span>
                <button onClick={() => setNWays(nWays + 1)} style={{ padding: '10px 20px', borderRadius: '8px', border: '2px solid var(--border)', background: 'transparent', color: 'var(--text-main)', fontSize: '1.2rem', cursor: 'pointer' }}>+</button>
              </div>
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <span style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--brand-color)' }}>${(remaining / nWays).toFixed(2)}</span>
                <span style={{ color: 'var(--text-muted)', display: 'block', marginTop: '5px' }}>{t('check.perPerson')}</span>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => { handlePartialPayment(remaining / nWays, 'Cash'); setNWays(Math.max(1, nWays - 1)); }} style={{ flex: 1, padding: '16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '1.2rem', cursor: 'pointer' }}>{t('check.cash')}</button>
                <button onClick={() => { handlePartialPayment(remaining / nWays, 'Card'); setNWays(Math.max(1, nWays - 1)); }} style={{ flex: 1, padding: '16px', background: '#2980b9', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '1.2rem', cursor: 'pointer' }}>{t('check.card')}</button>
              </div>
            </div>
          )}

          {splitMode === 'product' && (
            <div>
              <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>{t('check.prodSubtitle')}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto', padding: '4px' }}>
                {activeTicket.items.map(item => {
                  const isPaid = paidProductIds.includes(item.id);
                  let itemTotal = item.basePrice;
                  if (item.selectedModifiers) {
                    itemTotal += Object.values(item.selectedModifiers).reduce((s, m) => s + (m.price || 0), 0);
                  }
                  
                  // Apply proportional tip to this specific product
                  const itemTip = itemTotal * ((Number(tipPercentage) || 0) / 100);
                  const finalItemTotal = itemTotal + itemTip;

                  return (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: isPaid ? 'rgba(0,0,0,0.05)' : 'var(--bg-main)', opacity: isPaid ? 0.6 : 1, borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '1.1rem' }}>{item.name}</div>
                        <div style={{ color: 'var(--brand-color)' }}>${finalItemTotal.toFixed(2)} {itemTip > 0 && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>(+${itemTip.toFixed(2)} propina)</span>}</div>
                      </div>
                      {isPaid ? (
                        <span>{t('check.prodPaid')}</span>
                      ) : (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => handlePartialPayment(finalItemTotal, 'Cash', [item.id])} style={{ padding: '8px 12px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>{t('check.cash')}</button>
                          <button onClick={() => handlePartialPayment(finalItemTotal, 'Card', [item.id])} style={{ padding: '8px 12px', background: '#2980b9', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>{t('check.card')}</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {splitMode === 'custom' && (
            <div>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <div style={{ flex: 2 }}>
                  <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-muted)' }}>{t('check.customSubtitle')}</label>
                  <input type="number" placeholder="0.00" step="0.01" value={customVal} onChange={(e) => setCustomVal(e.target.value)} style={{ width: '100%', padding: '16px', fontSize: '1.5rem', borderRadius: '8px', border: '2px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', boxSizing: 'border-box' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, justifyContent: 'flex-end' }}>
                  <button onClick={() => { const amt = parseFloat(customVal); if (amt > 0 && amt <= remaining + 0.01) { handlePartialPayment(amt, 'Cash'); setCustomVal(''); } else alert(t('check.alertInvalid')); }} style={{ padding: '10px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>{t('check.cash')}</button>
                  <button onClick={() => { const amt = parseFloat(customVal); if (amt > 0 && amt <= remaining + 0.01) { handlePartialPayment(amt, 'Card'); setCustomVal(''); } else alert(t('check.alertInvalid')); }} style={{ padding: '10px', background: '#2980b9', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>{t('check.card')}</button>
                </div>
              </div>
              {splitPayments.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: 'var(--text-main)' }}>{t('check.paymentLog')}</h4>
                  {splitPayments.map((p, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed var(--border)', color: 'var(--text-muted)' }}>
                      <span>✅ {p.method}</span>
                      <span>${p.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {splitPayments.length > 0 ? (
          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button onClick={handleSavePartialPayments} style={{ flex: 2, padding: '16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}>{t('check.btnSave')}</button>
            <button onClick={handleVoidPartialPayments} style={{ flex: 1, padding: '16px', background: 'transparent', color: '#e74c3c', border: '2px solid #e74c3c', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}>{t('check.btnVoid')}</button>
          </div>
        ) : (
          <button onClick={handleCancelCheckout} style={{ width: '100%', marginTop: '24px', padding: '16px', background: 'transparent', color: '#e74c3c', border: '2px solid #e74c3c', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}>{t('check.btnClose')}</button>
        )}
      </div>
    </div>
  );
}

export default CheckoutModal;