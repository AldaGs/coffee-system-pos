import { useMemo, useState, useEffect} from 'react';
import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';
import { supabase } from '../../supabaseClient';
import { formatForDisplay } from '../../utils/moneyUtils';

const RANGE_DAYS = { today: 1, week: 7, month: 30, all: null };

function LoyaltyTab({ loyaltyForm, setLoyaltyForm, menuData, saveMenuToCloud, handleSaveLoyalty, handleResetLoyaltyData }) {
  const { t } = useTranslation();

  const [customers, setCustomers] = useState([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);

  const [loyaltyEvents, setLoyaltyEvents] = useState([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [auditRange, setAuditRange] = useState('week');

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        // Fetch and sort by visits (highest first)
        const { data, error } = await supabase
          .from('customers')
          .select('*')
          .order('visits', { ascending: false });

        if (data && !error) setCustomers(data);
      } catch (err) {
        console.error("Could not load customers:", err);
      } finally {
        setIsLoadingCustomers(false);
      }
    };
    fetchCustomers();
  }, []);

  useEffect(() => {
    const fetchEvents = async () => {
      setIsLoadingEvents(true);
      try {
        let query = supabase
          .from('sales')
          .select('id, created_at, total_amount, loyalty_phone, loyalty_stars_awarded, loyalty_stars_redeemed, cashier_name')
          .not('loyalty_phone', 'is', null)
          .order('created_at', { ascending: false })
          .limit(500);

        const days = RANGE_DAYS[auditRange];
        if (days !== null) {
          const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
          query = query.gte('created_at', since);
        }

        const { data, error } = await query;
        if (data && !error) setLoyaltyEvents(data);
      } catch (err) {
        console.error("Could not load loyalty events:", err);
      } finally {
        setIsLoadingEvents(false);
      }
    };
    fetchEvents();
  }, [auditRange]);

  const auditStats = useMemo(() => {
    let awarded = 0, redeemed = 0, redeemCount = 0, freeValue = 0;
    const distinctPhones = new Set();
    loyaltyEvents.forEach(ev => {
      awarded += ev.loyalty_stars_awarded || 0;
      redeemed += ev.loyalty_stars_redeemed || 0;
      if ((ev.loyalty_stars_redeemed || 0) > 0) redeemCount++;
      if (ev.loyalty_phone) distinctPhones.add(ev.loyalty_phone);
    });
    return {
      awarded,
      redeemed,
      net: awarded - redeemed,
      redeemCount,
      members: distinctPhones.size,
      freeValue
    };
  }, [loyaltyEvents]);

  const formatPhone = (p) => (p || '').replace(/(\d{2})(\d{4})(\d{4})/, '$1 $2 $3');
  const formatDate = (iso) => {
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  };

  // Flatten all menu items into a single alphabetical list for the dropdown
  const allMenuItems = useMemo(() => {
    if (!menuData || !menuData.categories) return [];
    let items = [];
    Object.values(menuData.categories).forEach(categoryArray => {
      items = [...items, ...categoryArray.map(drink => drink.name)];
    });
    return items.sort();
  }, [menuData]);

  return (
    <div className="admin-section fade-in">
      <div className="admin-section-header" style={{ marginBottom: '40px' }}>
        <h1 style={{ margin: 0, color: 'var(--text-main)', fontSize: '2rem', fontWeight: '800' }}>{t('loyalty.title')}</h1>
        <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0', fontSize: '1.1rem' }}>{t('loyalty.subtitle')}</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        <div className="admin-grid-responsive" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))', gap: '32px', alignItems: 'flex-start' }}>
        
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', minWidth: 0, width: '100%' }}>
          
          {/* MASTER SWITCH */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px', paddingBottom: '24px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', display: 'inline-block', width: '56px', height: '28px', flexShrink: 0 }}>
              <input 
                type="checkbox" 
                checked={loyaltyForm.isActive || false}
                onChange={async (e) => {
                  const val = e.target.checked;
                  const updatedForm = { ...loyaltyForm, isActive: val };
                  setLoyaltyForm(updatedForm);
                  // Instant save for toggle
                  await saveMenuToCloud({ ...menuData, loyaltySettings: updatedForm });
                }}
                style={{ opacity: 0, width: 0, height: 0 }}
                id="loyalty-toggle"
              />
              <label 
                htmlFor="loyalty-toggle" 
                style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, background: loyaltyForm.isActive ? 'var(--brand-color)' : '#ccc', borderRadius: '34px', transition: '0.4s' }}
              >
                <span style={{ position: 'absolute', height: '20px', width: '20px', left: '4px', bottom: '4px', background: 'white', borderRadius: '50%', transition: '0.4s', transform: loyaltyForm.isActive ? 'translateX(28px)' : 'translateX(0)' }}></span>
              </label>
            </div>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: '900' }}>{t('loyalty.enableTracking')}</h3>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('loyalty.enableDesc')}</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', opacity: loyaltyForm.isActive ? 1 : 0.4, pointerEvents: loyaltyForm.isActive ? 'auto' : 'none', transition: 'opacity 0.3s' }}>

            {/* PROGRAM TYPE (recurring vs one-time) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon icon="lucide:repeat" style={{ color: 'var(--brand-color)' }} />
                {t('loyalty.programType') || 'Program type'}
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {['multiple', 'single'].map(mode => {
                  const active = (loyaltyForm.programType || 'multiple') === mode;
                  return (
                    <label
                      key={mode}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: '12px',
                        padding: '14px', borderRadius: '12px', cursor: 'pointer',
                        border: active ? '2px solid var(--brand-color)' : '1px solid var(--border)',
                        background: active ? 'rgba(242, 139, 5, 0.05)' : 'var(--bg-main)'
                      }}
                    >
                      <input
                        type="radio"
                        name="programType"
                        value={mode}
                        checked={active}
                        onChange={() => setLoyaltyForm({ ...loyaltyForm, programType: mode })}
                        style={{ marginTop: '4px' }}
                      />
                      <div>
                        <div style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>
                          {mode === 'multiple'
                            ? (t('loyalty.programMultiple') || 'Recurring')
                            : (t('loyalty.programSingle') || 'One-time')}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {mode === 'multiple'
                            ? (t('loyalty.programMultipleDesc') || 'Customers earn the reward every {N} visits, indefinitely.').replace('{N}', loyaltyForm.visitsRequired || 10)
                            : (t('loyalty.programSingleDesc') || 'Customers earn the reward once. After redeeming, they stop accumulating stars.')}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* TARGET ITEM DROPDOWN */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon icon="lucide:target" style={{ color: 'var(--brand-color)' }} />
                {t('loyalty.earnQuestion')}
              </label>
              <select 
                value={loyaltyForm.targetItem || 'any'} 
                onChange={(e) => setLoyaltyForm({ ...loyaltyForm, targetItem: e.target.value })}
                style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: 'bold', outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }}
              >
                <option value="any">{t('loyalty.anyVisit')}</option>
                <optgroup label={t('loyalty.specificItems')}>
                  {allMenuItems.map((itemName, idx) => (
                    <option key={idx} value={itemName}>{itemName}</option>
                  ))}
                </optgroup>
              </select>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                {(!loyaltyForm.targetItem || loyaltyForm.targetItem === 'any') 
                  ? t('loyalty.anyVisitDesc')
                  : t('loyalty.specificItemDesc')}
              </p>
            </div>

            {/* EARNING RULE DROPDOWN */}
            {loyaltyForm.targetItem !== 'any' && loyaltyForm.targetItem !== undefined && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px', background: 'rgba(52, 152, 219, 0.05)', borderRadius: '16px', border: '1px solid rgba(52, 152, 219, 0.2)' }} className="fade-in">
                <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Icon icon="lucide:settings-2" style={{ color: 'var(--brand-color)' }} />
                  {t('loyalty.earningRule')}
                </label>
                <select 
                  value={loyaltyForm.countMode || 'per_item'} 
                  onChange={(e) => setLoyaltyForm({ ...loyaltyForm, countMode: e.target.value })}
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-main)', fontSize: '1rem', fontWeight: 'bold', outline: 'none', boxSizing: 'border-box' }}
                >
                  <option value="per_item">{t('loyalty.ruleAccelerated')}</option>
                  <option value="per_ticket">{t('loyalty.ruleCapped')}</option>
                </select>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon icon="lucide:star" style={{ color: '#f1c40f' }} />
                {t('loyalty.starsRequired')}
              </label>
              <input 
                type="number" 
                min="1"
                value={loyaltyForm.visitsRequired} 
                onChange={(e) => setLoyaltyForm({ ...loyaltyForm, visitsRequired: parseInt(e.target.value) || 1 })}
                style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1.2rem', fontWeight: '900', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon icon="lucide:gift" style={{ color: '#e74c3c' }} />
                {t('loyalty.rewardQuestion')}
              </label>
              <input
                type="text"
                placeholder={t('loyalty.rewardPlaceholder')}
                value={loyaltyForm.rewardDescription}
                onChange={(e) => setLoyaltyForm({ ...loyaltyForm, rewardDescription: e.target.value })}
                style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: 'bold', outline: 'none', boxSizing: 'border-box' }}
              />
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>{t('loyalty.rewardDesc')}</p>
            </div>

            {/* OPTIONAL: link reward to a specific menu item for auto-redeem */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px', background: 'rgba(46, 204, 113, 0.05)', borderRadius: '16px', border: '1px solid rgba(46, 204, 113, 0.2)' }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon icon="lucide:link-2" style={{ color: '#27ae60' }} />
                {t('loyalty.rewardItemQuestion') || 'Link reward to a menu item (optional)'}
              </label>
              <select
                value={loyaltyForm.rewardMenuItem || ''}
                onChange={(e) => setLoyaltyForm({ ...loyaltyForm, rewardMenuItem: e.target.value || null })}
                style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-main)', fontSize: '1rem', fontWeight: 'bold', outline: 'none', boxSizing: 'border-box' }}
              >
                <option value="">{t('loyalty.rewardItemOffMenu') || 'Off-menu reward (cashier handles manually)'}</option>
                <optgroup label={t('loyalty.specificItems')}>
                  {allMenuItems.map((itemName, idx) => (
                    <option key={idx} value={itemName}>{itemName}</option>
                  ))}
                </optgroup>
              </select>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                {loyaltyForm.rewardMenuItem
                  ? (t('loyalty.rewardItemLinkedDesc') || 'When redeemed, the matching item in the cart is automatically set to free.')
                  : (t('loyalty.rewardItemUnlinkedDesc') || 'Reward is descriptive only; the cashier comps the item or hands over an off-menu gift.')}
              </p>
            </div>

            <button onClick={handleSaveLoyalty} style={{ width: '100%', padding: '16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '16px', cursor: 'pointer', fontWeight: '900', fontSize: '1.2rem', marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: '0 8px 20px rgba(39, 174, 96, 0.2)' }}>
              <Icon icon="lucide:save" />
              {t('settings.save')}
            </button>
          </div>
        </div>

        {/* --- CUSTOMER LEADERBOARD (paired with Settings on desktop) --- */}
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', minWidth: 0 }}>
          <h3 style={{ margin: '0 0 24px 0', color: 'var(--text-main)', fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon icon="lucide:users" style={{ color: 'var(--brand-color)' }} />
            {t('loyalty.customerList')}
          </h3>

          {isLoadingCustomers ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('loyalty.loading')}</div>
          ) : customers.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('loyalty.noCustomers')}</div>
          ) : (
            <div style={{ overflowX: 'auto', maxHeight: '500px', overflowY: 'auto' }}>
              <table className="card-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 1 }}>
                  <tr>
                    <th style={{ padding: '16px', borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '1px' }}>{t('loyalty.thPhone')}</th>
                    <th style={{ padding: '16px', borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '1px' }}>{t('loyalty.thStars')}</th>
                    <th style={{ padding: '16px', borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '1px' }}>{t('loyalty.thStatus')}</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((cust) => {
                    const target = loyaltyForm.visitsRequired || 1;
                    const isReady = cust.visits > 0 && (cust.visits % target === 0);
                    const progress = cust.visits % target;

                    return (
                      <tr key={cust.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}>
                        <td data-label={t('loyalty.thPhone')} style={{ padding: '16px', fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--text-main)' }}>
                          {cust.phone.replace(/(\d{2})(\d{4})(\d{4})/, '$1 $2 $3')}
                        </td>
                        <td data-label={t('loyalty.thStars')} style={{ padding: '16px', fontWeight: '900', color: '#f1c40f', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Icon icon="lucide:star" /> {cust.visits}
                        </td>
                        <td data-label={t('loyalty.thStatus')} style={{ padding: '16px' }}>
                          {isReady ? (
                            <span style={{ background: 'rgba(46, 204, 113, 0.1)', color: '#27ae60', padding: '6px 12px', borderRadius: '20px', fontWeight: 'bold', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', width: 'fit-content' }}>
                              <Icon icon="lucide:party-popper" /> {t('loyalty.rewardReadyBadge')}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                              {target - progress} {t('loyalty.moreToGo')}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        </div>{/* end top sub-grid */}

        {/* --- LOYALTY ACTIVITY / AUDIT (full width) --- */}
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
            <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon icon="lucide:activity" style={{ color: 'var(--brand-color)' }} />
              {t('loyalty.auditTitle') || 'Loyalty Activity'}
            </h3>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {['today', 'week', 'month', 'all'].map(r => (
                <button
                  key={r}
                  onClick={() => setAuditRange(r)}
                  style={{
                    padding: '8px 14px', borderRadius: '8px',
                    border: auditRange === r ? 'none' : '1px solid var(--border)',
                    background: auditRange === r ? 'var(--brand-color)' : 'var(--bg-main)',
                    color: auditRange === r ? 'white' : 'var(--text-main)',
                    fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem'
                  }}
                >
                  {t(`loyalty.range_${r}`) || r}
                </button>
              ))}
            </div>
          </div>

          {/* KPI ROW */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={{ padding: '16px', background: 'var(--bg-main)', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>{t('loyalty.kpiAwarded') || 'Stars Awarded'}</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#f1c40f', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Icon icon="lucide:star" /> +{auditStats.awarded}
              </div>
            </div>
            <div style={{ padding: '16px', background: 'var(--bg-main)', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>{t('loyalty.kpiRedeemed') || 'Stars Redeemed'}</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#ff1493', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Icon icon="lucide:gift" /> −{auditStats.redeemed}
              </div>
            </div>
            <div style={{ padding: '16px', background: 'var(--bg-main)', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>{t('loyalty.kpiNet') || 'Net Change'}</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: auditStats.net >= 0 ? '#27ae60' : '#e74c3c' }}>
                {auditStats.net >= 0 ? '+' : ''}{auditStats.net}
              </div>
            </div>
            <div style={{ padding: '16px', background: 'var(--bg-main)', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>{t('loyalty.kpiRedeemCount') || 'Rewards Given'}</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text-main)' }}>{auditStats.redeemCount}</div>
            </div>
            <div style={{ padding: '16px', background: 'var(--bg-main)', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>{t('loyalty.kpiMembers') || 'Active Members' }</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text-main)' }}>{auditStats.members}</div>
            </div>
          </div>

          {/* RECENT EVENTS LIST */}
          {isLoadingEvents ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('loyalty.loading')}</div>
          ) : loyaltyEvents.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('loyalty.auditEmpty') || 'No loyalty activity in this range.'}</div>
          ) : (
            <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
              <table className="card-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 1 }}>
                  <tr>
                    <th style={{ padding: '12px', borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '1px' }}>{t('loyalty.thWhen') || 'When'}</th>
                    <th style={{ padding: '12px', borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '1px' }}>{t('loyalty.thPhone')}</th>
                    <th style={{ padding: '12px', borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '1px' }}>{t('loyalty.thChange') || 'Change'}</th>
                    <th style={{ padding: '12px', borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '1px' }}>{t('loyalty.thSaleTotal') || 'Sale'}</th>
                    <th style={{ padding: '12px', borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '1px' }}>{t('loyalty.thCashier') || 'Cashier'}</th>
                  </tr>
                </thead>
                <tbody>
                  {loyaltyEvents.map(ev => {
                    const awarded = ev.loyalty_stars_awarded || 0;
                    const redeemed = ev.loyalty_stars_redeemed || 0;
                    return (
                      <tr key={ev.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td data-label={t('loyalty.thWhen') || 'When'} style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{formatDate(ev.created_at)}</td>
                        <td data-label={t('loyalty.thPhone')} style={{ padding: '12px', color: 'var(--text-main)', fontWeight: 'bold' }}>{formatPhone(ev.loyalty_phone)}</td>
                        <td data-label={t('loyalty.thChange') || 'Change'} style={{ padding: '12px' }}>
                          {awarded > 0 && (
                            <span style={{ color: '#f1c40f', fontWeight: 'bold', marginRight: '8px' }}>
                              <Icon icon="lucide:star" /> +{awarded}
                            </span>
                          )}
                          {redeemed > 0 && (
                            <span style={{ color: '#ff1493', fontWeight: 'bold' }}>
                              <Icon icon="lucide:gift" /> −{redeemed}
                            </span>
                          )}
                        </td>
                        <td data-label={t('loyalty.thSaleTotal') || 'Sale'} style={{ padding: '12px', color: 'var(--text-main)' }}>{formatForDisplay(ev.total_amount || 0)}</td>
                        <td data-label={t('loyalty.thCashier') || 'Cashier'} style={{ padding: '12px', color: 'var(--text-muted)' }}>{ev.cashier_name || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* DANGER ZONE (full width, bottom) */}
        <div style={{ background: 'rgba(231, 76, 60, 0.05)', padding: 'var(--admin-padding)', border: '2px dashed rgba(231, 76, 60, 0.3)', borderRadius: 'var(--admin-card-radius)', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '24px', minWidth: 0, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#e74c3c', flexShrink: 0 }}>
            <Icon icon="lucide:alert-triangle" style={{ fontSize: '2rem' }} />
            <h3 style={{ margin: 0, fontWeight: '900', textTransform: 'uppercase', letterSpacing: '1px' }}>{t('loyalty.dangerZone')}</h3>
          </div>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.95rem', lineHeight: '1.5', flex: 1, minWidth: '240px' }}>
            {t('loyalty.resetDesc')}
          </p>
          <button onClick={handleResetLoyaltyData} style={{ padding: '14px 24px', background: 'white', color: '#e74c3c', border: '2px solid #e74c3c', borderRadius: '12px', cursor: 'pointer', fontWeight: '900', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', transition: 'all 0.2s', flexShrink: 0 }}>
            <Icon icon="lucide:trash-2" />
            {t('loyalty.resetButton')}
          </button>
        </div>

      </div>
    </div>
  );
}

export default LoyaltyTab;