import { useState, useEffect, useRef } from 'react';
import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';
import { useDialog } from '../../hooks/useDialog';
import ExportKeysButton from '../ExportKeysButton';
import DisconnectButton from '../DisconnectButton';
import SignOutButton from '../SignOutButton';
import SharedPinPad from '../shared/SharedPinPad';
import { supabase } from '../../supabaseClient';
import { updateItem, updateModifierOption, updateDiscountRule } from '../../api/menu';
import { useMenuStore } from '../../store/useMenuStore';
import { db } from '../../db';
import { isLocalMode, beginCloudUpgrade } from '../../utils/appMode';
import { isCloudReachable } from '../../utils/network';
import { formatForDisplay } from '../../utils/moneyUtils';
import { APP_SCHEMA_VERSION } from '../../utils/schemaVersion';
import { getBusinessProfile } from '../../utils/businessProfile';

// Session keys used by the schema-update OAuth round-trip. Mirror the
// burn-after-reading pattern from DevicesTab — the PAT only exists between
// callback and install-POST, then it's wiped.
const SS_SCHEMA_OAUTH_FLAG = 'tinypos_schema_oauth_pending';
const SS_SCHEMA_PAT = 'tinypos_schema_pat';
// The DB version at click time, stashed before the OAuth redirect so the
// post-callback install POST can request just the delta (the async
// fetchSchemaVersion may not have re-resolved by the time the resume effect
// runs). Empty/absent → server runs the full script.
const SS_SCHEMA_FROM = 'tinypos_schema_from_version';

function projectRefFromUrl(url) {
  try { return new URL(url).hostname.split('.')[0] || null; }
  catch { return null; }
}

function GeneralSettingsTab({
  generalSettings,
  setGeneralSettings,
  handleAppLogoUpload,
  handleSaveGeneralSettings,
  menuData,
  saveSettingsToCloud,
  setLoyaltyForm,
  setInventoryItems,
  dexieSales = []
}) {

  const { t } = useTranslation();
  const { showAlert, showConfirm } = useDialog();

  const [pinChallenge, setPinChallenge] = useState({ isOpen: false, onAuthorized: null });
  const [pinAttempt, setPinAttempt] = useState('');
  const [pinError, setPinError] = useState(false);

  const [brandColorInput, setBrandColorInput] = useState(generalSettings.brandColor || '#000000');
  const [brandColorInvalid, setBrandColorInvalid] = useState(false);

  // --- DEVICE-LOCAL: register layout mode -----------------------------------
  // CRITICAL: this preference is strictly per-physical-device. It lives ONLY in
  // localStorage under `tinypos_layout_mode` and is intentionally kept out of
  // `generalSettings` so the cloud-sync save path never touches it. Different
  // stations (counter vs. floor) can therefore run different layouts against
  // the same store account.
  const LAYOUT_MODE_KEY = 'tinypos_layout_mode';
  const [layoutMode, setLayoutMode] = useState(() => {
    if (typeof window === 'undefined') return 'cafe';
    const stored = localStorage.getItem(LAYOUT_MODE_KEY);
    if (stored) return stored;
    // No per-device choice yet — seed from the store-wide business type.
    return getBusinessProfile(generalSettings.businessType).defaultLayout;
  });
  const handleLayoutModeChange = (mode) => {
    setLayoutMode(mode);
    try { localStorage.setItem(LAYOUT_MODE_KEY, mode); } catch { /* storage unavailable — keep in-memory only */ }
  };

  // --- Schema update state ---------------------------------------------------
  // dbVersion stays null while we're still loading the installed version.
  // 'unknown' is the explicit value we surface when schema_meta doesn't exist
  // yet (older installs that predate the table).
  const [dbVersion, setDbVersion] = useState(null);
  const [schemaUpdating, setSchemaUpdating] = useState(false);
  const [schemaUpdateError, setSchemaUpdateError] = useState('');
  const schemaResumedRef = useRef(false);

  const fetchSchemaVersion = async () => {
    // Local ('guest') mode has no cloud schema to report.
    if (isLocalMode()) { setDbVersion('local'); return; }
    try {
      const { data, error } = await supabase
        .from('schema_meta')
        .select('value')
        .eq('key', 'schema_version')
        .maybeSingle();
      if (error) {
        // 42P01 = relation does not exist → pre-schema_meta install.
        if (error.code === '42P01') { setDbVersion('unknown'); return; }
        console.warn('schema_meta read failed:', error);
        setDbVersion('unknown');
        return;
      }
      setDbVersion(data?.value || 'unknown');
    } catch (e) {
      console.warn('schema_meta read threw:', e);
      setDbVersion('unknown');
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSchemaVersion();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Post-OAuth resume: if we just came back with a PAT in sessionStorage,
  // POST it (plus projectRef) to /api/install which runs the latest SQL.
  useEffect(() => {
    if (schemaResumedRef.current) return;
    const pat = typeof window !== 'undefined' ? sessionStorage.getItem(SS_SCHEMA_PAT) : null;
    if (!pat) return;
    schemaResumedRef.current = true;

    const supabaseUrl = typeof window !== 'undefined' ? localStorage.getItem('tinypos_supabase_url') : null;
    const projectRef = projectRefFromUrl(supabaseUrl);
    if (!projectRef) {
      setTimeout(() => setSchemaUpdateError(t('settings.schemaUpdateMissingProject')), 0);
      try { sessionStorage.removeItem(SS_SCHEMA_PAT); } catch { /* noop */ }
      try { sessionStorage.removeItem(SS_SCHEMA_FROM); } catch { /* noop */ }
      return;
    }

    (async () => {
      setSchemaUpdateError('');
      setSchemaUpdating(true);
      try {
        const fromVersion = (() => {
          try { return sessionStorage.getItem(SS_SCHEMA_FROM) || undefined; } catch { return undefined; }
        })();
        const res = await fetch('/api/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: pat, projectRef, fromVersion }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) {
          throw new Error(data?.error || t('settings.schemaUpdateFailed'));
        }
        await fetchSchemaVersion();
        showAlert(t('common.success'), t('settings.schemaUpdateOk'));
      } catch (err) {
        setSchemaUpdateError(err.message);
      } finally {
        try { sessionStorage.removeItem(SS_SCHEMA_PAT); } catch { /* noop */ }
        try { sessionStorage.removeItem(SS_SCHEMA_FROM); } catch { /* noop */ }
        setSchemaUpdating(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startSchemaUpdate = () => {
    const supabaseUrl = typeof window !== 'undefined' ? localStorage.getItem('tinypos_supabase_url') : null;
    if (!supabaseUrl) {
      showAlert(t('common.error'), t('settings.schemaUpdateMissingProject'));
      return;
    }
    showConfirm(
      t('settings.schemaUpdateConfirmTitle'),
      t('settings.schemaUpdateConfirmDesc'),
      () => {
        try { sessionStorage.setItem(SS_SCHEMA_OAUTH_FLAG, '1'); } catch { /* noop */ }
        // Stash the installed version so the resume POST can request just the
        // delta. '' when unknown → server falls back to the full script.
        try { sessionStorage.setItem(SS_SCHEMA_FROM, (dbVersion && dbVersion !== 'unknown') ? dbVersion : ''); } catch { /* noop */ }
        const clientId = import.meta.env.VITE_SUPABASE_MANAGEMENT_CLIENT_ID;
        const redirectUri = `${window.location.origin}/api/auth/callback`;
        const scopes = 'database_read database_write';
        window.location.href = `https://api.supabase.com/v1/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=schema&scope=${encodeURIComponent(scopes)}`;
      }
    );
  };

  const isUpToDate = dbVersion && dbVersion !== 'unknown' && dbVersion === APP_SCHEMA_VERSION;
  const isUnknown = dbVersion === 'unknown';

  const parseColorToHex = (value) => {
    if (!value) return null;
    const v = value.trim();
    let m = v.match(/^#?([0-9a-fA-F]{6})$/);
    if (m) return `#${m[1].toLowerCase()}`;
    m = v.match(/^#?([0-9a-fA-F]{3})$/);
    if (m) {
      const [r, g, b] = m[1];
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    m = v.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/i);
    if (m) {
      const [r, g, b] = [m[1], m[2], m[3]].map(Number);
      if ([r, g, b].every((n) => n >= 0 && n <= 255)) {
        const toHex = (n) => n.toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
      }
    }
    return null;
  };

  const commitBrandColor = (raw) => {
    const hex = parseColorToHex(raw);
    if (hex) {
      setGeneralSettings({ ...generalSettings, brandColor: hex });
      setBrandColorInput(hex);
      setBrandColorInvalid(false);
    } else {
      setBrandColorInvalid(true);
    }
  };
  const [isRepairModalOpen, setIsRepairModalOpen] = useState(false);
  const [repairList, setRepairList] = useState([]);
  const [isRepairing, setIsRepairing] = useState(false);

  const closePinChallenge = () => {
    setPinChallenge({ isOpen: false, onAuthorized: null });
    setPinAttempt('');
    setPinError(false);
  };

  // PIN check is async because cashier PINs aren't in memory (useMenuStore
  // scrubs them) — we go through the verify_pin RPC. Master pinCode is still
  // checked locally as a fast path.
  const handlePinSubmit = async () => {
    const isMasterPin = pinAttempt === generalSettings.pinCode;
    let authorized = isMasterPin;
    if (!authorized) {
      const { verifyAuthorizerPin } = useMenuStore.getState();
      const result = await verifyAuthorizerPin(pinAttempt, 'admin');
      authorized = !!result;
    }
    if (authorized) {
      const action = pinChallenge.onAuthorized;
      closePinChallenge();
      if (action) action();
    } else {
      setPinError(true);
      setTimeout(() => setPinError(false), 500);
      setPinAttempt('');
    }
  };

  const handleAdvancedModeToggle = () => {
    const next = !generalSettings.isAdvancedMode;

    const applyChange = (alsoDeactivate) => {
      setPinChallenge({
        isOpen: true,
        onAuthorized: async () => {
          setGeneralSettings({ ...generalSettings, isAdvancedMode: next });
          if (alsoDeactivate && menuData) {
            // Loyalty is settings → goes to shop_settings.menu_data.
            // Discount rules are menu → one updateDiscountRule per rule.
            const updatedMenu = {
              ...menuData,
              loyaltySettings: { ...(menuData.loyaltySettings || {}), isActive: false },
              discountRules: (menuData.discountRules || []).map(r => ({ ...r, isActive: false })),
            };
            saveSettingsToCloud(updatedMenu);
            await Promise.all((menuData.discountRules || [])
              .filter(r => r._id && r.isActive)
              .map(r => updateDiscountRule(r._id, { ...r, isActive: false }))
            );
            if (setLoyaltyForm) setLoyaltyForm(prev => ({ ...prev, isActive: false }));
          }
        },
      });
    };

    if (next === false) {
      const loyaltyOn = !!menuData?.loyaltySettings?.isActive;
      const activeRules = (menuData?.discountRules || []).filter(r => r.isActive);
      if (loyaltyOn || activeRules.length > 0) {
        const lines = [];
        if (loyaltyOn) lines.push('• ' + t('settings.willDisableLoyalty'));
        if (activeRules.length > 0) lines.push('• ' + t('settings.willDisableRules').replace('{{n}}', activeRules.length));
        showConfirm(
          t('settings.liteWarnTitle'),
          t('settings.liteWarnDesc') + '\n\n' + lines.join('\n'),
          () => applyChange(true)
        );
        return;
      }
    }
    applyChange(false);
  };

  /*
  // HANDLE FOR LEGACY CODE
  const handleScanForRepairs = () => {
    const findings = [];

    // 1. Scan Drinks
    Object.keys(menuData.categories).forEach(cat => {
      menuData.categories[cat].forEach(item => {
        if (item.basePrice > 0 && item.basePrice < 500) {
          findings.push({ id: `drink_${item.id}`, type: 'drink', category: cat, itemId: item.id, name: item.name, oldVal: item.basePrice, newVal: item.basePrice * 100, checked: true });
        }
      });
    });

    // 2. Scan Modifiers
    Object.keys(menuData.modifierGroups).forEach(group => {
      menuData.modifierGroups[group].forEach(opt => {
        if (!opt.isTextInput && opt.price > 0 && opt.price < 500) {
          findings.push({ id: `mod_${opt.id}`, type: 'modifier', group, itemId: opt.id, name: opt.name, oldVal: opt.price, newVal: opt.price * 100, checked: true });
        }
      });
    });

    // 3. Scan Inventory
    (menuData.inventory || []).forEach(item => {
      if (item.unit_cost > 0 && item.unit_cost < 500) {
        findings.push({ id: `inv_${item.id}`, type: 'inventory', itemId: item.id, name: item.name, oldVal: item.unit_cost, newVal: item.unit_cost * 100, checked: true });
      }
    });

    // 4. Scan Sales History (DexieSales passed from Admin)
  dexieSales.forEach(sale => {
    if (sale.total_amount > 0 && sale.total_amount < 500) {
      findings.push({ id: `sale_${sale.id}`, type: 'sale', itemId: sale.id, name: `Order #${sale.id}`, oldVal: sale.total_amount, newVal: sale.total_amount * 100, checked: true });
    }
  });

  if (findings.length === 0) {
    return showAlert('No Repairs Needed', 'All prices appear to be in the new integer format.');
  }

  setRepairList(findings);
  setIsRepairModalOpen(true);
};*/

  const handleExecuteRepairs = async () => {
    setIsRepairing(true);
    try {
      const selected = repairList.filter(r => r.checked);
      const menuItemUpdates = []; // collected here, flushed below as per-row writes
      const modifierUpdates = [];
      const invToUpdate = [];

      for (const repair of selected) {
        if (repair.type === 'drink') {
          const cat = menuData.categories[repair.category];
          const item = cat.find(i => i.id === repair.itemId);
          if (item) menuItemUpdates.push({ ...item, basePrice: repair.newVal });
        } else if (repair.type === 'modifier') {
          const group = menuData.modifierGroups[repair.group];
          const opt = group.find(o => o.id === repair.itemId);
          if (opt) modifierUpdates.push({ groupId: repair.group, opt: { ...opt, price: repair.newVal } });
        } else if (repair.type === 'inventory') {
          invToUpdate.push({ id: repair.itemId, unit_cost: repair.newVal });
        } else if (repair.type === 'sale') {
          const sale = dexieSales.find(s => s.id === repair.itemId);
          if (sale) {
            const updatedSale = { ...sale };
            updatedSale.total_amount *= 100;
            if (updatedSale.refund_amount) updatedSale.refund_amount *= 100;
            if (updatedSale.tip_amount) updatedSale.tip_amount *= 100;
            if (updatedSale.cash_tendered) updatedSale.cash_tendered *= 100;

            // Fix internal item prices for receipt re-printing
            if (updatedSale.items && Array.isArray(updatedSale.items)) {
              updatedSale.items = updatedSale.items.map(item => ({
                ...item,
                basePrice: (item.basePrice || 0) * 100,
                selectedModifiers: (item.selectedModifiers || []).map(mod => ({
                  ...mod,
                  price: (mod.price || 0) * 100
                }))
              }));
            }

            // Persist Sale
            await db.sales.put(updatedSale);
            if (isCloudReachable()) {
              await supabase.from('sales').update(updatedSale).eq('id', updatedSale.id);
            }
          }
        }
      }

      // Save Menu — per-row writes against the dedicated tables. UI won't
      // reflect the new prices until the admin re-opens; this is a legacy
      // recovery flow that's rarely (if ever) hit on modern installs.
      await Promise.all(menuItemUpdates.map(item => updateItem(item.id, item)));
      await Promise.all(modifierUpdates.map(({ groupId, opt }) =>
        updateModifierOption(opt.id, groupId, opt)
      ));

      // Save Inventory
      for (const inv of invToUpdate) {
        const { data, error } = await supabase.from('inventory').update({ unit_cost: inv.unit_cost }).eq('id', inv.id).select();
        if (!error && data) {
          await db.inventory.put(data[0]);
        }
      }

      // Refresh Local Inventory State
      if (invToUpdate.length > 0) {
        const { data: freshInv } = await supabase.from('inventory').select('*');
        if (freshInv) setInventoryItems(freshInv);
      }

      setIsRepairModalOpen(false);
      showAlert('Success', `${selected.length} items repaired successfully.`);
    } catch (err) {
      console.error(err);
      showAlert('Error', 'Failed to apply some repairs. Check console.');
    } finally {
      setIsRepairing(false);
    }
  };

  const isAdvancedOn = generalSettings.isAdvancedMode === true;

  // overflowX visible overrides .admin-section's `overflow-x: auto`, which would
  // otherwise make this element its own scroll container and stop the sticky
  // header from ever sticking to .admin-main's scrollport.
  return (
    <div className="admin-section fade-in" style={{ overflowX: 'visible' }}>
      {/* Sticky so Save stays reachable without scrolling back down — this page
          is long. Negative margins + matching padding let the background span
          .admin-main's 40px padding, so content scrolls under it cleanly. */}
      <div
        className="admin-section-header settings-sticky-header"
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: '20px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ color: 'var(--text-main)', fontSize: '2rem', marginBottom: '8px', fontWeight: '800' }}>{t('settings.title')}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>{t('settings.subtitle')}</p>
        </div>
        <button onClick={handleSaveGeneralSettings} style={{ flexShrink: 0, padding: '14px 28px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '16px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.05rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: '0 10px 20px rgba(0,0,0,0.1)' }}>
          <Icon icon="lucide:save" />
          {t('settings.btnSave')}
        </button>
      </div>

      <div className="admin-grid-responsive" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '32px', alignItems: 'start' }}>

        {/* --- LEFT COLUMN: CORE SETTINGS --- */}
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon icon="lucide:terminal" style={{ color: 'var(--brand-color)' }} />
              {t('settings.registerName')}
            </label>
            <input type="text" value={generalSettings.name} onChange={(e) => setGeneralSettings({ ...generalSettings, name: e.target.value })} placeholder="e.g., Front Counter iPad" style={{ width: '100%', boxSizing: 'border-box', padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} />
          </div>

          {/* Store-wide business type. Synced (lives in generalSettings →
              shop_settings), unlike the per-device layout mode below. Sets
              defaults + vocabulary across the app and is read by sibling apps. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon icon="lucide:store" style={{ color: 'var(--brand-color)' }} />
              {t('settings.businessType')}
            </label>
            <small style={{ color: 'var(--text-muted)', marginTop: '-2px' }}>{t('settings.businessTypeDesc')}</small>
            <select
              value={generalSettings.businessType || 'restaurant'}
              onChange={(e) => setGeneralSettings({ ...generalSettings, businessType: e.target.value })}
              style={{ width: '100%', boxSizing: 'border-box', padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}
            >
              <option value="restaurant">{t('settings.bizRestaurant')}</option>
              <option value="quickservice">{t('settings.bizQuickService')}</option>
              <option value="store">{t('settings.bizStore')}</option>
              <option value="ecommerce">{t('settings.bizEcommerce')}</option>
            </select>
          </div>

          {/* FIX: Changed from Grid to Flex + mobile-flex-stack class */}
          <div className="mobile-flex-stack" style={{ display: 'flex', gap: '20px' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon icon="lucide:palette" style={{ color: 'var(--brand-color)' }} />
                {t('settings.brandColor')}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-main)', padding: '8px', borderRadius: '12px', border: `1px solid ${brandColorInvalid ? 'var(--danger, #e53935)' : 'var(--border)'}`, width: '100%', boxSizing: 'border-box' }}>
                <input
                  type="color"
                  value={generalSettings.brandColor}
                  onChange={(e) => {
                    setGeneralSettings({ ...generalSettings, brandColor: e.target.value });
                    setBrandColorInput(e.target.value);
                    setBrandColorInvalid(false);
                  }}
                  style={{ width: '40px', height: '40px', border: 'none', cursor: 'pointer', padding: 0, borderRadius: '8px', overflow: 'hidden', background: 'none', flexShrink: 0 }}
                />
                <input
                  type="text"
                  value={brandColorInput}
                  onChange={(e) => {
                    setBrandColorInput(e.target.value);
                    const hex = parseColorToHex(e.target.value);
                    if (hex) {
                      setGeneralSettings({ ...generalSettings, brandColor: hex });
                      setBrandColorInvalid(false);
                    } else {
                      setBrandColorInvalid(true);
                    }
                  }}
                  onBlur={(e) => commitBrandColor(e.target.value)}
                  placeholder="#RRGGBB or rgb(r,g,b)"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  style={{ fontFamily: 'monospace', color: 'var(--text-main)', fontSize: '0.9rem', fontWeight: 'bold', flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', padding: '4px 0' }}
                />
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon icon="lucide:languages" style={{ color: 'var(--brand-color)' }} />
                {t('settings.language')}
              </label>
              <select
                value={generalSettings.language || 'en'}
                onChange={(e) => setGeneralSettings({ ...generalSettings, language: e.target.value })}
                style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1rem', cursor: 'pointer', outline: 'none' }}
              >
                <option value="en">English (US)</option>
                <option value="es">Español (MX)</option>
              </select>
            </div>
          </div>

          {/* Timezone — used by the menu scheduler (migration 015) to resolve
              brunch/winter/etc. windows in the shop's wall clock instead of UTC. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon icon="lucide:clock" style={{ color: 'var(--brand-color)' }} />
              Zona horaria
              <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                — horarios de menú se resuelven en esta zona
              </span>
            </label>
            <TimezonePicker
              value={generalSettings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}
              onChange={tz => setGeneralSettings({ ...generalSettings, timezone: tz })}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: 'bold', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon icon="lucide:monitor" style={{ color: 'var(--brand-color)' }} />
              {t('settings.colorTheme')}
            </label>
            <select value={generalSettings.isDarkMode} onChange={(e) => setGeneralSettings({ ...generalSettings, isDarkMode: e.target.value === 'true' })} style={{ width: '100%', boxSizing: 'border-box', padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '1rem', cursor: 'pointer', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }}>
              <option value={false}>☀️ {t('settings.lightMode')}</option>
              <option value={true}>🌙 {t('settings.darkMode')}</option>
            </select>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Icon icon="lucide:image" style={{ color: 'var(--brand-color)' }} />
              {t('settings.appBranding')}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>{t('settings.appLogo')}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <label style={{ padding: '10px 20px', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-main)', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Icon icon="lucide:upload" />
                  {t('common.upload')}
                  <input type="file" accept="image/*" onChange={handleAppLogoUpload} style={{ display: 'none' }} />
                </label>
                {generalSettings.appBootLogo && (
                  <button
                    onClick={() => setGeneralSettings({ ...generalSettings, appBootLogo: null })}
                    style={{ background: 'rgba(231, 76, 60, 0.1)', border: 'none', color: '#e74c3c', padding: '10px 15px', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Icon icon="lucide:trash-2" />
                    {t('settings.removeLogo')}
                  </button>
                )}
              </div>

              {generalSettings.appBootLogo ? (
                <div style={{ padding: '15px', background: 'var(--bg-main)', borderRadius: '16px', border: '1px dashed var(--border)', textAlign: 'center' }}>
                  <img
                    src={generalSettings.appBootLogo}
                    alt="App Boot Logo"
                    style={{ maxHeight: '80px', maxWidth: '100%', objectFit: 'contain' }}
                  />
                </div>
              ) : (
                <div style={{ padding: '30px', background: 'var(--bg-main)', borderRadius: '16px', border: '1px dashed var(--border)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  <Icon icon="lucide:image-plus" style={{ fontSize: '2rem', marginBottom: '8px', opacity: 0.3 }} />
                  <div>No logo uploaded</div>
                </div>
              )}
              <small style={{ color: 'var(--text-muted)', lineHeight: '1.4' }}>{t('settings.appLogoDesc')}</small>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Icon icon="lucide:shield" style={{ color: 'var(--brand-color)' }} />
              {t('settings.security')}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>{t('settings.autoLock')}</label>
              <div style={{ position: 'relative' }}>
                <Icon icon="lucide:clock" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input type="number" min="0" value={generalSettings.autoLockMinutes} onChange={(e) => setGeneralSettings({ ...generalSettings, autoLockMinutes: parseInt(e.target.value) || 0 })} style={{ width: '100%', padding: '12px 12px 12px 38px', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <small style={{ color: 'var(--text-muted)' }}>{t('settings.autoLockDesc')}</small>
            </div>
          </div>

          {/* --- ACCESS RESTRICTIONS: opt-in RBAC. Off by default so existing
              shops that share PINs keep working unchanged. --- */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Icon icon="lucide:lock-keyhole" style={{ color: 'var(--brand-color)' }} />
              {t('settings.accessGroupTitle')}
            </h3>
            <small style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '14px' }}>
              {t('settings.accessGroupDesc')}
            </small>

            <SettingToggle
              icon="lucide:user-cog"
              label={t('settings.strictAdminAccess')}
              desc={t('settings.strictAdminAccessDesc')}
              checked={!!generalSettings.strictAdminAccess}
              onChange={(v) => setGeneralSettings({ ...generalSettings, strictAdminAccess: v })}
            />

            <SettingToggle
              icon="lucide:receipt-text"
              label={t('settings.strictRegisterOverrides')}
              desc={t('settings.strictRegisterOverridesDesc')}
              checked={!!generalSettings.strictRegisterOverrides}
              onChange={(v) => setGeneralSettings({ ...generalSettings, strictRegisterOverrides: v })}
            />
          </div>

          {/* --- SCHEMA MAINTENANCE: brings the tenant's Supabase project up to
              the schema version this build of the app expects. Idempotent and
              safe to re-run. Cloud-only — hidden in local ('guest') mode. --- */}
          {!isLocalMode() && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Icon icon="lucide:database-zap" style={{ color: 'var(--brand-color)' }} />
              {t('settings.schemaUpdateTitle')}
            </h3>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '12px 14px', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--bg-surface)', color: 'var(--brand-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon icon={isUpToDate ? 'lucide:check-circle-2' : 'lucide:arrow-up-circle'} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '0.95rem' }}>
                  {dbVersion === null
                    ? t('settings.schemaUpdateChecking')
                    : isUnknown
                      ? t('settings.schemaUpdateUnknown')
                      : isUpToDate
                        ? t('settings.schemaUpdateUpToDate')
                        : t('settings.schemaUpdateAvailable')}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '2px', lineHeight: 1.4 }}>
                  {t('settings.schemaUpdateVersions')
                    .replace('{installed}', dbVersion === null ? '…' : dbVersion)
                    .replace('{latest}', APP_SCHEMA_VERSION)}
                </div>
                {schemaUpdateError && (
                  <div style={{ marginTop: '8px', color: '#c0392b', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon icon="lucide:alert-circle" />
                    <span>{schemaUpdateError}</span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={startSchemaUpdate}
                disabled={schemaUpdating || dbVersion === null}
                style={{
                  flexShrink: 0,
                  padding: '10px 14px',
                  background: 'var(--brand-color)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: (schemaUpdating || dbVersion === null) ? 'not-allowed' : 'pointer',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  opacity: (schemaUpdating || dbVersion === null) ? 0.6 : 1,
                }}
              >
                <Icon
                  icon={schemaUpdating ? 'lucide:loader-2' : 'lucide:database-zap'}
                  style={{ animation: schemaUpdating ? 'spin 1s linear infinite' : 'none' }}
                />
                {schemaUpdating ? t('settings.schemaUpdating') : t('settings.schemaUpdateBtn')}
              </button>
            </div>
          </div>
          )}
        </div>

        {/* --- RIGHT COLUMN: WORKFLOW & HARDWARE --- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

          <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <h3 style={{ margin: '0', fontSize: '1.2rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Icon icon="lucide:users" style={{ color: 'var(--brand-color)' }} />
              {t('settings.workflow')}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>{t('settings.visibility')}</label>
              <select
                value={generalSettings.ticketVisibility || 'open'}
                onChange={(e) => setGeneralSettings({ ...generalSettings, ticketVisibility: e.target.value })}
                style={{ width: '100%', boxSizing: 'border-box', padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}
              >
                <option value="open">{t('settings.visibilityOpen')}</option>
                <option value="isolated">{t('settings.visibilityIsolated')}</option>
              </select>
              <small style={{ color: 'var(--text-muted)' }}>{t('settings.visibilityDesc')}</small>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon icon="lucide:zap" style={{ color: 'var(--brand-color)' }} />
                {t('settings.advancedMode')}
              </label>
              <button
                type="button"
                onClick={handleAdvancedModeToggle}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  background: 'var(--bg-main)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  color: 'var(--text-main)',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                }}
              >
                <span>{isAdvancedOn ? 'ON' : 'OFF'}</span>
                <span
                  aria-hidden
                  style={{
                    width: '44px',
                    height: '24px',
                    borderRadius: '12px',
                    background: isAdvancedOn ? 'var(--brand-color)' : 'var(--border)',
                    position: 'relative',
                    transition: 'background 0.2s',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: '2px',
                      left: isAdvancedOn ? '22px' : '2px',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: 'white',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                      transition: 'left 0.2s',
                    }}
                  />
                </span>
              </button>
              <small style={{ color: 'var(--text-muted)' }}>{t('settings.advancedModeDesc')}</small>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Icon icon="lucide:monitor-play" style={{ color: 'var(--brand-color)' }} />
                Kitchen Display System (KDS)
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Habilitar KDS
                </label>
                <select
                  value={generalSettings.kdsEnabled === true}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, kdsEnabled: e.target.value === 'true' })}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}
                >
                  <option value={false}>No (Desactivado)</option>
                  <option value={true}>Sí (Activado)</option>
                </select>
                <small style={{ color: 'var(--text-muted)' }}>Muestra opciones para interactuar con la pantalla de cocina.</small>

                {generalSettings.kdsEnabled && (
                  <>
                    <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem', marginTop: '12px' }}>Modo de Envío a KDS</label>
                    <select
                      value={generalSettings.kdsMode || 'immediate'}
                      onChange={(e) => setGeneralSettings({ ...generalSettings, kdsMode: e.target.value })}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}
                    >
                      <option value="immediate">Inmediato (Al abrir ticket)</option>
                      <option value="manual">Manual (Botón "Enviar a Cocina")</option>
                    </select>
                    <small style={{ color: 'var(--text-muted)' }}>Define cuándo aparecen los pedidos en la pantalla de cocina.</small>
                  </>
                )}
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Icon icon="lucide:hash" style={{ color: 'var(--brand-color)' }} />
                {t('settings.orderNums')}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>{t('settings.resetPolicy')}</label>
                <select
                  value={generalSettings.orderResetPolicy || 'daily'}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, orderResetPolicy: e.target.value })}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}
                >
                  <option value="never">{t('settings.resetNever')}</option>
                  <option value="daily">{t('settings.resetDaily')}</option>
                  <option value="weekly">{t('settings.resetWeekly')}</option>
                  <option value="monthly">{t('settings.resetMonthly')}</option>
                  <option value="yearly">{t('settings.resetYearly')}</option>
                </select>
                <small style={{ color: 'var(--text-muted)' }}>{t('settings.resetFreqDesc')}</small>

                <button
                  onClick={() => {
                    showConfirm(
                      t('settings.resetTitle'),
                      t('settings.resetConfirm'),
                      async () => {
                        const { db } = await import('../../db');
                        await db.shift_state.put({ key: 'nextOrderNum', value: 1 });
                        showAlert(t('settings.resetSuccess'), t('settings.resetSuccessDesc'));
                      }
                    );
                  }}
                  style={{
                    padding: '12px 20px',
                    background: 'transparent',
                    color: '#e74c3c',
                    border: '2px solid rgba(231, 76, 60, 0.3)',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: 'fit-content',
                    marginTop: '8px',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(231, 76, 60, 0.05)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <Icon icon="lucide:rotate-ccw" />
                  {t('settings.btnReset')}
                </button>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Icon icon="lucide:clipboard-check" style={{ color: 'var(--brand-color)' }} />
                {t('settings.shiftMgmt')}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>{t('settings.enableCorte')}</label>
                <select
                  value={generalSettings.enableCorte !== false}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, enableCorte: e.target.value === 'true' })}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}
                >
                  <option value={true}>{t('settings.corteYes')}</option>
                  <option value={false}>{t('settings.corteNo')}</option>
                </select>
                <small style={{ color: 'var(--text-muted)' }}>{t('settings.corteDesc')}</small>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Icon icon="lucide:alert-circle" style={{ color: 'var(--brand-color)' }} />
                {t('settings.lowStockThreshold')}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>{t('settings.lowStockThreshold')}</label>
                <input
                  type="number"
                  min="0"
                  value={generalSettings.lowStockThreshold !== undefined ? generalSettings.lowStockThreshold : 0}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, lowStockThreshold: parseInt(e.target.value) || 0 })}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }}
                />
                <small style={{ color: 'var(--text-muted)' }}>{t('settings.lowStockThresholdDesc')}</small>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Icon icon="lucide:printer" style={{ color: 'var(--brand-color)' }} />
                {t('settings.hardware')}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>{t('settings.printerSize')}</label>
                <select
                  value={generalSettings.printerSize || '80mm'}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, printerSize: e.target.value })}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '1rem', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}
                >
                  <option value="80mm">{t('settings.printer80')}</option>
                  <option value="58mm">{t('settings.printer58')}</option>
                </select>
                <small style={{ color: 'var(--text-muted)' }}>{t('settings.printerDesc')}</small>
              </div>
            </div>
          </div>

          {/* --- DEVICE SETTINGS (LOCAL-ONLY, NOT SYNCED) --- */}
          <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '1.2rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Icon icon="lucide:smartphone" style={{ color: 'var(--brand-color)' }} />
                {t('settings.deviceTitle')}
              </h3>
              <small style={{ color: 'var(--text-muted)', display: 'block', lineHeight: 1.4 }}>
                {t('settings.deviceDesc')}
              </small>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ fontWeight: 'bold', color: 'var(--text-main)', fontSize: '0.9rem' }}>{t('settings.layoutMode')}</label>
              <small style={{ color: 'var(--text-muted)', marginTop: '-4px' }}>{t('settings.layoutModeDesc')}</small>

              <div role="radiogroup" aria-label={t('settings.layoutMode')} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                {[
                  { value: 'cafe', icon: 'lucide:zap', label: t('settings.layoutCafe'), desc: t('settings.layoutCafeDesc') },
                  { value: 'orders', icon: 'lucide:layout-list', label: t('settings.layoutOrders'), desc: t('settings.layoutOrdersDesc') },
                  { value: 'tables', icon: 'lucide:armchair', label: t('settings.layoutTables'), desc: t('settings.layoutTablesDesc') },
                ].map(opt => {
                  const selected = layoutMode === opt.value;
                  return (
                    <label
                      key={opt.value}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: '14px',
                        padding: '14px', borderRadius: '12px', cursor: 'pointer',
                        background: 'var(--bg-main)',
                        border: selected ? '2px solid var(--brand-color)' : '1px solid var(--border)',
                        boxShadow: selected ? '0 0 0 1px var(--brand-color)' : 'none',
                        transition: 'border 0.15s ease',
                      }}
                    >
                      <input
                        type="radio"
                        name="layoutMode"
                        value={opt.value}
                        checked={selected}
                        onChange={() => handleLayoutModeChange(opt.value)}
                        style={{ width: '20px', height: '20px', accentColor: 'var(--brand-color)', flexShrink: 0, marginTop: '2px' }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Icon icon={opt.icon} style={{ color: 'var(--brand-color)' }} />
                          {opt.label}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '2px', lineHeight: 1.4 }}>{opt.desc}</div>
                      </div>
                    </label>
                  );
                })}
              </div>

              <small style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                <Icon icon="lucide:hard-drive" style={{ fontSize: '0.95rem' }} />
                {t('settings.layoutLocalNote')}
              </small>
            </div>
          </div>

          {/* --- BOTTOM ACTIONS --- (Save moved to the sticky header above) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Legacy tool: <ExportKeysButton /> */}

            {/*
            <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '24px', border: '1px solid var(--border)' }}>
              <h3 style={{ marginTop: 0, color: 'var(--text-main)', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon icon="lucide:refresh-cw" style={{ color: '#f39c12' }} />
                {t('settings.signOutTitle', 'Authorization')}
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px', lineHeight: '1.4' }}>
                {t('settings.signOutConfirm', 'Use this to fix sync issues or switch to a different store account without losing your local tickets.')}
              </p>
              <SignOutButton />
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '24px', border: '1px solid var(--border)' }}>
              <h3 style={{ marginTop: 0, color: 'var(--text-main)', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon icon="lucide:wrench" style={{ color: 'var(--brand-color)' }} />
                Financial Data Repair
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px', lineHeight: '1.4' }}>
                If you see items with prices like $0.70 instead of $70.00, use this tool to scan and fix your legacy data.
              </p>
              <button 
                onClick={handleScanForRepairs}
                style={{ width: '100%', padding: '12px', background: 'var(--bg-main)', color: 'var(--brand-color)', border: '1px solid var(--brand-color)', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <Icon icon="lucide:search" />
                Scan for Legacy Prices
              </button>
            </div>
            */}

            {isLocalMode() ? (
              /* Local mode: no cloud connection to disconnect. Offer the upgrade
                 to a free cloud backup instead. */
              <div style={{
                border: '2px solid rgba(52, 152, 219, 0.25)',
                padding: '24px',
                borderRadius: '24px',
                backgroundColor: 'rgba(52, 152, 219, 0.06)'
              }}>
                <h3 style={{ marginTop: 0, color: 'var(--text-main)', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Icon icon="lucide:cloud-upload" style={{ color: '#3498db' }} />
                  Respaldo en la nube
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px', lineHeight: '1.4' }}>
                  Tus datos viven solo en este dispositivo. Crea una cuenta gratuita
                  de Supabase para respaldarlos y usarlos en otros dispositivos.
                </p>
                <button
                  onClick={beginCloudUpgrade}
                  style={{ width: '100%', padding: '14px', background: '#099b46', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <Icon icon="lucide:cloud-upload" />
                  Crear respaldo gratis
                </button>
                <button
                  onClick={() => { window.location.href = '/upgrade-guide'; }}
                  style={{ width: '100%', marginTop: '10px', padding: '10px', background: 'transparent', color: 'var(--text-muted)', border: 'none', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline', textUnderlineOffset: '3px' }}
                >
                  ¿Cómo funciona?
                </button>
              </div>
            ) : (
              <div style={{
                border: '2px solid rgba(231, 76, 60, 0.2)',
                padding: '24px',
                borderRadius: '24px',
                backgroundColor: 'rgba(231, 76, 60, 0.05)'
              }}>
                <h3 style={{ marginTop: 0, color: '#d63031', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Icon icon="lucide:alert-triangle" />
                  {t('settings.dangerZone')}
                </h3>
                <p style={{ color: '#d63031', fontSize: '0.85rem', marginBottom: '20px', lineHeight: '1.4' }}>
                  {t('settings.disconnectDesc')}
                </p>

                <DisconnectButton />
              </div>
            )}
          </div>
        </div>

      </div>

      {pinChallenge.isOpen && (
        <SharedPinPad
          variant="modal"
          icon="lucide:shield-alert"
          title={t('settings.advancedPinTitle')}
          subtitle={t('pin.managerReq')}
          pin={pinAttempt}
          setPin={setPinAttempt}
          error={pinError}
          setError={setPinError}
          onSubmit={handlePinSubmit}
          onCancel={closePinChallenge}
          submitText={t('pin.btnVerify')}
          submitIcon="lucide:check-circle"
        />
      )}

      {/* --- REPAIR MODAL --- */}
      {isRepairModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="fade-in" style={{ background: 'var(--bg-surface)', width: '100%', maxWidth: '600px', borderRadius: '32px', padding: '40px', border: '1px solid var(--border)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
              <div>
                <h2 style={{ margin: 0, color: 'var(--brand-color)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.8rem', fontWeight: '900' }}>
                  <Icon icon="lucide:stethoscope" />
                  Repair Legacy Prices
                </h2>
                <p style={{ margin: '8px 0 0 0', color: 'var(--text-muted)' }}>The items below look like they are using the old price format ($0.70 instead of $70.00).</p>
              </div>
              <button onClick={() => setIsRepairModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.5rem' }}><Icon icon="lucide:x" /></button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '24px', paddingRight: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {repairList.map((item, idx) => (
                  <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', background: 'var(--bg-main)', borderRadius: '16px', border: item.checked ? '1px solid var(--brand-color)' : '1px solid var(--border)', cursor: 'pointer', opacity: item.checked ? 1 : 0.6 }}>
                    <input type="checkbox" checked={item.checked} onChange={e => {
                      const next = [...repairList];
                      next[idx].checked = e.target.checked;
                      setRepairList(next);
                    }} style={{ width: '22px', height: '22px', accentColor: 'var(--brand-color)' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '900', color: 'var(--text-main)' }}>{item.name}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Current: <span style={{ textDecoration: 'line-through' }}>{formatForDisplay(item.oldVal)}</span> → <span style={{ color: '#27ae60', fontWeight: 'bold' }}>{formatForDisplay(item.newVal)}</span>
                      </div>
                    </div>
                    <span style={{ fontSize: '0.7rem', fontWeight: 'bold', background: 'rgba(52, 152, 219, 0.1)', color: 'var(--brand-color)', padding: '4px 8px', borderRadius: '6px', textTransform: 'uppercase' }}>{item.type}</span>
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={handleExecuteRepairs}
              disabled={isRepairing || !repairList.some(r => r.checked)}
              style={{ width: '100%', padding: '20px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '18px', fontWeight: '900', fontSize: '1.2rem', cursor: 'pointer', boxShadow: '0 10px 25px rgba(52, 152, 219, 0.3)', opacity: (isRepairing || !repairList.some(r => r.checked)) ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
            >
              <Icon icon={isRepairing ? "lucide:loader" : "lucide:check-circle"} className={isRepairing ? "spin" : ""} />
              {isRepairing ? "Applying Repairs..." : `Repair ${repairList.filter(r => r.checked).length} Items`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Reusable toggle row for boolean settings. Used by the access-restrictions
// group; lifting it to a shared component is fine if other tabs need it.
function SettingToggle({ icon, label, desc, checked, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '12px 14px', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '12px', marginBottom: '10px' }}>
      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--bg-surface)', color: 'var(--brand-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon icon={icon} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '0.95rem' }}>{label}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '2px', lineHeight: 1.4 }}>{desc}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          flexShrink: 0,
          width: '44px',
          height: '26px',
          // Off-state is a softened var(--text-muted) so the track adapts to
          // light/dark mode automatically. color-mix at 55% gives a clearly
          // gray-but-not-harsh track in both themes; brand color stays solid
          // when on.
          background: checked
            ? 'var(--brand-color)'
            : 'color-mix(in srgb, var(--text-muted) 55%, transparent)',
          borderRadius: '999px',
          border: 'none',
          position: 'relative',     // ← critical: anchor for the thumb
          padding: 0,                // some browsers add default button padding
          cursor: 'pointer',
          transition: 'background 0.2s ease',
          marginTop: '4px',
          boxSizing: 'border-box',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '2px',
            left: checked ? '20px' : '2px',
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: 'white',
            transition: 'left 0.2s ease',
            boxShadow: '0 2px 4px rgba(0,0,0,0.25)',
            display: 'block',
          }}
        />
      </button>
    </div>
  );
}

// Native datalist-backed combo. Lists IANA zones from Intl.supportedValuesOf
// where available (Node 18+/modern browsers), with a small fallback for older
// runtimes. Free typing is allowed so unusual zones still work.
function TimezonePicker({ value, onChange }) {
  const zones = (typeof Intl.supportedValuesOf === 'function')
    ? Intl.supportedValuesOf('timeZone')
    : ['UTC','America/Mexico_City','America/Tijuana','America/Cancun','America/Monterrey','America/Chicago','America/New_York','America/Los_Angeles','America/Bogota','America/Lima','America/Santiago','America/Argentina/Buenos_Aires','Europe/Madrid','Europe/London'];
  return (
    <>
      <input
        list="tinypos-tz-list"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="America/Mexico_City"
        style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: '1rem', outline: 'none' }}
      />
      <datalist id="tinypos-tz-list">
        {zones.map(z => <option key={z} value={z} />)}
      </datalist>
    </>
  );
}

export default GeneralSettingsTab;