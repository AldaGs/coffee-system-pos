function LoyaltyModal({ loyaltyModal, setLoyaltyModal, menuData, handleCheckLoyalty, handleGuestReceipt, phoneError, sendFinalMessage }) {
  if (!loyaltyModal.isOpen) return null;
  const isLoyaltyActive = menuData?.loyaltySettings?.isActive === true || menuData?.loyaltySettings?.isActive === "true";

  // --- NEW: Smart Enter Key Listener ---
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (isLoyaltyActive) {
        handleCheckLoyalty();
      } else {
        handleGuestReceipt();
      }
    }
  };

  return (
    <div className="modal-overlay"><div className="modal-content" style={{ maxWidth: '400px', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}><h2 style={{ margin: 0, color: 'var(--text-main)' }}>Loyalty Rewards</h2><button onClick={() => setLoyaltyModal({ isOpen: false, step: 'phone', phone: '', data: null })} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button></div>
      {loyaltyModal.step === 'phone' && (<div>
        <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>{isLoyaltyActive ? "Enter customer's WhatsApp number to check their status." : "Enter customer's WhatsApp number to send receipt."}</p>
        
        {/* ADDED onKeyDown LISTENER HERE */}
        <input 
          type="tel" 
          maxLength="10" 
          placeholder="222 123 4567" 
          value={loyaltyModal.phone} 
          onChange={(e) => setLoyaltyModal({ ...loyaltyModal, phone: e.target.value })} 
          onKeyDown={handleKeyDown} 
          className={phoneError ? 'input-error-shake' : ''} 
          style={{ width: '100%', padding: '15px', fontSize: '1.5rem', letterSpacing: '2px', textAlign: 'center', marginBottom: '20px', borderRadius: '8px', border: '2px solid var(--brand-color)', background: 'var(--bg-main)', color: 'var(--text-main)', boxSizing: 'border-box', outline: 'none' }} 
        />
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {isLoyaltyActive && (<button onClick={handleCheckLoyalty} style={{ width: '100%', padding: '15px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}>Check Loyalty Status</button>)}
          <button onClick={handleGuestReceipt} style={{ width: '100%', padding: '15px', background: isLoyaltyActive ? 'transparent' : '#25D366', color: isLoyaltyActive ? 'var(--text-muted)' : 'white', border: isLoyaltyActive ? '1px solid var(--border)' : 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}>{isLoyaltyActive ? "Send Receipt Only (Do Not Track)" : "Send Receipt"}</button>
        </div>
      </div>)}
      {loyaltyModal.step === 'result' && loyaltyModal.data && (<div>
        {loyaltyModal.data.isRewardReady ? (
          <div style={{ background: '#fff0f5', border: '2px solid #ff69b4', padding: '20px', borderRadius: '12px', marginBottom: '20px' }}><h1 style={{ margin: '0 0 10px 0', fontSize: '3rem' }}>🎉</h1><h2 style={{ color: '#ff1493', margin: '0 0 10px 0' }}>REWARD READY!</h2><p style={{ fontSize: '1.1rem', color: '#333', margin: 0 }}><strong>Tell the customer:</strong><br />"This is your {loyaltyModal.data.visits}th visit! You get {loyaltyModal.data.reward} today!"</p></div>
        ) : (
          <div style={{ background: 'var(--bg-main)', border: '2px solid var(--border)', padding: '20px', borderRadius: '12px', marginBottom: '20px' }}><h2 style={{ color: 'var(--brand-color)', margin: '0 0 10px 0' }}>Visit #{loyaltyModal.data.visits}</h2><div style={{ fontSize: '1.5rem', margin: '10px 0' }}>{"⭐".repeat(loyaltyModal.data.visits % loyaltyModal.data.target || loyaltyModal.data.target)}</div><p style={{ fontSize: '1.1rem', color: 'var(--text-main)', margin: 0 }}><strong>Tell the customer:</strong><br />"You have {loyaltyModal.data.visits} visits! You only need {loyaltyModal.data.target - (loyaltyModal.data.visits % loyaltyModal.data.target)} more for {loyaltyModal.data.reward}."</p></div>
        )}
        <button onClick={() => sendFinalMessage(loyaltyModal.phone.replace(/\D/g, ''), loyaltyModal.data)} style={{ width: '100%', padding: '15px', background: '#25D366', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>📱 Send WhatsApp Receipt</button>
      </div>)}
    </div></div>
  );
}
export default LoyaltyModal;