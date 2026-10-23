import { Icon } from '@iconify/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDialog } from './hooks/useDialog';
import { useMenuStore } from './store/useMenuStore';
import { useTranslation } from './hooks/useTranslation';
import { usePreventAccidentalExit } from './hooks/usePreventAccidentalExit';
import { isLocalMode } from './utils/appMode';
import { HelpLinkContext } from './contexts/help-link-context';
import BootScreen from './components/register/BootScreen';
import SharedPinPad from './components/shared/SharedPinPad';

import AnalyticsTab from './components/admin/AnalyticsTab';
import OrdersTab from './components/admin/OrdersTab';
import MenuEditorTab from './components/admin/MenuEditorTab';
import MenusTab from './components/admin/MenusTab';
import PublicMenusLocked from './components/admin/PublicMenusLocked';
import ModifierLibraryTab from './components/admin/ModifierLibraryTab';
import ReceiptSettingsTab from './components/admin/ReceiptSettingsTab';
import LoyaltyTab from './components/admin/LoyaltyTab';
import DiscountsTab from './components/admin/DiscountsTab';
import TeamTab from './components/admin/TeamTab';
import VendorsTab from './components/admin/VendorsTab';
import TablesTab from './components/admin/TablesTab';
import GeneralSettingsTab from './components/admin/GeneralSettingsTab';
import RecipeBuilderTab from './components/admin/RecipeBuilderTab';
import EditDrinkModal from './components/admin/EditDrinkModal';
import InventoryTab from './components/admin/InventoryTab.jsx';
import CfdiTab from './components/admin/CfdiTab';
import ActivityTab from './components/admin/ActivityTab';
import TipsTab from './components/admin/TipsTab';
import OnlineOrdersTab from './components/admin/OnlineOrdersTab';
import DevicesTab from './components/admin/DevicesTab';
import HelpTab from './components/admin/HelpTab';

import { addVendor, updateVendor, deleteVendor } from './api/vendors';
import AdminLogin from './components/admin/shell/AdminLogin';
import AdminSidebar from './components/admin/shell/AdminSidebar';
import StaleBanner from './components/admin/shell/StaleBanner';
import { getAdminTabs } from './components/admin/shell/adminTabs';
import { useAdminSession } from './components/admin/shell/useAdminSession';
import { useAdminData } from './components/admin/shell/useAdminData';
import { useMenuWrite } from './components/admin/shell/useMenuWrite';
import { useCatalogActions } from './components/admin/shell/useCatalogActions';
import { useModifierActions } from './components/admin/shell/useModifierActions';
import { useDiscountActions } from './components/admin/shell/useDiscountActions';
import { useMenuAssets } from './components/admin/shell/useMenuAssets';
import { useSettingsActions } from './components/admin/shell/useSettingsActions';
import { useAdminAnalytics } from './components/admin/shell/useAdminAnalytics';
import { useRecipeActions } from './components/admin/shell/useRecipeActions';

const urlParam = (name) => {
  try { return new URLSearchParams(window.location.search).get(name); } catch { return null; }
};

function Admin() {
  usePreventAccidentalExit();
  const navigate = useNavigate();
  const { showAlert, showConfirm } = useDialog();
  const { t } = useTranslation();
  const menuData = useMenuStore((s) => s.menuData);
  const lastSyncedAt = useMenuStore((s) => s.lastSyncedAt);

  // ?tab= and ?section= deep-link here (e.g. back from the Devices OAuth round-trip).
  const [activeTab, setActiveTab] = useState(() => urlParam('tab') || 'analytics');
  const [helpSection, setHelpSection] = useState(() => urlParam('section'));
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Drop the deep-link params once read, so a reload doesn't pin that tab.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('tab') || url.searchParams.has('section')) {
      url.searchParams.delete('tab');
      url.searchParams.delete('section');
      window.history.replaceState({}, document.title, url.pathname + (url.search || ''));
    }
  }, []);

  const session = useAdminSession();
  const runMenuWrite = useMenuWrite(setIsSaving);
  const data = useAdminData({ isAuthenticated: session.isAuthenticated });
  const catalog = useCatalogActions({ runMenuWrite, vendors: data.vendors });
  const modifiers = useModifierActions({ runMenuWrite });
  const discounts = useDiscountActions({ runMenuWrite, setIsSaving });
  const assets = useMenuAssets({ runMenuWrite });
  const settings = useSettingsActions({ setIsSaving, ...data });
  const analytics = useAdminAnalytics(data);
  const recipes = useRecipeActions({
    setIsSaving,
    goToTab: setActiveTab,
    linkRecipeToProductForm: (recipeId) => catalog.setNewItemForm((prev) => ({ ...prev, inventoryMode: 'recipe', linkedRecipeId: recipeId, linkedWarehouseId: '' })),
  });

  const { generalSettings } = data;
  const isAdvanced = generalSettings.isAdvancedMode === true;
  const withVendorRefresh = (fn) => async (...args) => { await fn(...args); await data.refreshVendors(); };

  if (session.isCheckingSession || (session.isAuthenticated && data.isLoading)) {
    return <BootScreen posSettings={generalSettings} logo={generalSettings.appBootLogo} loadingText={t('admin.loading')} />;
  }

  if (!session.isAuthenticated) {
    return <AdminLogin loginForm={session.loginForm} setLoginForm={session.setLoginForm} onSubmit={session.handleLogin} onBack={() => navigate('/')} />;
  }

  if (!session.isAdminUnlocked) {
    return (
      <SharedPinPad
        variant="fullscreen"
        icon="lucide:lock"
        title={t('admin.lockedTitle')}
        subtitle={t('admin.lockedSubtitle')}
        pin={session.adminPinInput}
        setPin={session.setAdminPinInput}
        error={session.pinError}
        setError={session.setPinError}
        onCancel={session.handleBackToRegister}
        submitText={t('admin.unlockBtn')}
        submitIcon="lucide:unlock"
        onSubmit={session.handleUnlock}
      />
    );
  }

  const tabs = getAdminTabs(t);
  const switchTab = (tab) => {
    setActiveTab(tab);
    setHelpSection(null);
    setIsMobileMenuOpen(false);
  };
  const openTab = (tab) => {
    if (tab.advancedOnly && !isAdvanced) {
      showConfirm(t('settings.advancedLockedTitle'), t('settings.advancedLockedDesc'), () => switchTab('settings'));
    } else {
      switchTab(tab.id);
    }
  };
  const openHelp = (section) => {
    setHelpSection(section);
    setActiveTab('help');
  };

  return (
    <div className="admin-layout">
      <AdminSidebar
        tabs={tabs}
        activeTab={activeTab}
        isAdvanced={isAdvanced}
        shopName={generalSettings.name}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        onOpenTab={openTab}
        onGoToSettings={() => switchTab('settings')}
        onLogout={session.handleLogout}
        onBackToRegister={session.handleBackToRegister}
      />

      <HelpLinkContext.Provider value={openHelp}>
      <main className="admin-main">
        <div className="desktop-hidden" style={{ display: 'flex', alignItems: 'center', marginBottom: '24px', gap: '16px' }}>
          <button className="mobile-hamburger" onClick={() => setIsMobileMenuOpen(true)} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: '10px', borderRadius: '10px', display: 'flex' }}>
            <Icon icon="lucide:menu" style={{ fontSize: '1.5rem', color: 'var(--text-main)' }} />
          </button>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '800', color: 'var(--text-main)' }}>{t('admin.title')}</h2>
        </div>

        {(data.cloudSync === 'stale' || data.cloudSync === 'checking') && !isLocalMode() && (
          <StaleBanner cloudSync={data.cloudSync} lastSyncedAt={lastSyncedAt} onRetry={data.recheckCloud} />
        )}

        {isSaving && (
          <div style={{ position: 'fixed', top: 20, right: 20, background: '#27ae60', color: 'white', padding: '12px 24px', borderRadius: '12px', fontWeight: 'bold', zIndex: 100, boxShadow: '0 10px 25px rgba(39, 174, 96, 0.4)', display: 'flex', alignItems: 'center', gap: '10px', animation: 'slideInRight 0.3s ease' }}>
            <Icon icon="lucide:check-circle" />
            <span>{t('admin.saving')}</span>
          </div>
        )}

        {activeTab === 'analytics' && (
          <AnalyticsTab
            {...analytics}
            inventoryLogs={data.inventoryLogs}
            inventoryItems={data.inventoryItems}
          />
        )}

        {activeTab === 'activity' && <ActivityTab />}

        {activeTab === 'onlineOrders' && (
          <OnlineOrdersTab menuData={menuData} saveSettingsToCloud={settings.saveSettingsToCloud} showAlert={showAlert} />
        )}

        {activeTab === 'tips' && <TipsTab />}

        {activeTab === 'orders' && (
          <OrdersTab
            dexieSales={analytics.filteredSales}
            generalSettings={generalSettings}
            menuData={menuData}
            timeFilter={analytics.timeFilter}
            setTimeFilter={analytics.setTimeFilter}
            dateRange={analytics.dateRange}
            setDateRange={analytics.setDateRange}
          />
        )}

        {activeTab === 'menu' && (
          <MenuEditorTab
            {...catalog}
            {...assets}
            isAdvancedMode={isAdvanced}
            onGoToTab={switchTab}
            onNewRecipe={recipes.handleNewRecipeForProduct}
            menuData={menuData}
            setEditingDrink={modifiers.setEditingDrink}
            recipes={recipes.recipes}
            inventoryItems={data.inventoryItems}
            vendors={data.vendors}
          />
        )}

        {activeTab === 'vendors' && (
          <VendorsTab
            vendors={data.vendors}
            sales={analytics.allSales}
            menuData={menuData}
            payouts={analytics.vendorPayouts}
            taxRate={menuData?.receiptSettings?.taxRate || 16}
            branding={menuData?.receiptSettings || {}}
            brandColor={menuData?.posSettings?.brandColor || '#f28b05'}
            onAddVendor={withVendorRefresh(addVendor)}
            onUpdateVendor={withVendorRefresh(updateVendor)}
            onDeleteVendor={withVendorRefresh(deleteVendor)}
          />
        )}

        {activeTab === 'menus' && isLocalMode() && <PublicMenusLocked />}
        {activeTab === 'menus' && !isLocalMode() && (
          <MenusTab showAlert={showAlert} showConfirm={showConfirm} menuData={menuData} onSetItemPublicFields={catalog.handleSetItemPublicFields} />
        )}

        {activeTab === 'tables' && <TablesTab showAlert={showAlert} showConfirm={showConfirm} />}

        {activeTab === 'modifiers' && (
          <ModifierLibraryTab {...modifiers} menuData={menuData} inventoryItems={data.inventoryItems} />
        )}

        {activeTab === 'receipt' && (
          <ReceiptSettingsTab receiptForm={data.receiptForm} setReceiptForm={data.setReceiptForm} handleLogoUpload={settings.handleLogoUpload} handleSaveReceipt={settings.handleSaveReceipt} />
        )}

        {activeTab === 'cfdi' && <CfdiTab showAlert={showAlert} showConfirm={showConfirm} />}

        {activeTab === 'loyalty' && (
          <LoyaltyTab loyaltyForm={data.loyaltyForm} setLoyaltyForm={data.setLoyaltyForm} menuData={menuData} saveSettingsToCloud={settings.saveSettingsToCloud} handleSaveLoyalty={settings.handleSaveLoyalty} handleResetLoyaltyData={settings.handleResetLoyaltyData} showAlert={showAlert} />
        )}

        {activeTab === 'discounts' && (
          <DiscountsTab {...discounts} menuData={menuData} showAlert={showAlert} showConfirm={showConfirm} />
        )}

        {activeTab === 'team' && (
          <TeamTab newCashier={settings.newCashier} setNewCashier={settings.setNewCashier} handleAddCashier={settings.handleAddCashier} cashiers={settings.cashiers} handleDeleteCashier={settings.handleDeleteCashier} />
        )}

        {activeTab === 'devices' && <DevicesTab showAlert={showAlert} showConfirm={showConfirm} />}

        {activeTab === 'settings' && (
          <GeneralSettingsTab
            generalSettings={generalSettings}
            setGeneralSettings={data.setGeneralSettings}
            handleAppLogoUpload={settings.handleAppLogoUpload}
            handleSaveGeneralSettings={settings.handleSaveGeneralSettings}
            menuData={menuData}
            saveSettingsToCloud={settings.saveSettingsToCloud}
            setLoyaltyForm={data.setLoyaltyForm}
            inventoryItems={data.inventoryItems}
          />
        )}

        {activeTab === 'calculator' && (
          <RecipeBuilderTab {...recipes} menuData={menuData} inventoryItems={data.inventoryItems} handleAddItemDirect={catalog.handleAddItemDirect} showAlert={showAlert} />
        )}

        {activeTab === 'inventory' && (
          <InventoryTab inventoryItems={data.inventoryItems} setInventoryItems={data.setInventoryItems} showAlert={showAlert} showConfirm={showConfirm} />
        )}

        {activeTab === 'help' && <HelpTab initialSection={helpSection} />}

        <EditDrinkModal editingDrink={modifiers.editingDrink} setEditingDrink={modifiers.setEditingDrink} menuData={menuData} toggleModifierForDrink={modifiers.toggleModifierForDrink} />
      </main>
      </HelpLinkContext.Provider>
    </div>
  );
}

export default Admin;
