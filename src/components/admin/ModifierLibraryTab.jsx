import { useState } from 'react';
import { Icon } from '@iconify/react';
import { useTranslation } from '../../hooks/useTranslation';
import { formatForDisplay, fromCents } from '../../utils/moneyUtils';

function ModifierLibraryTab({
  menuData,
  inventoryItems = [],
  newModGroupName,
  setNewModGroupName,
  handleAddModifierGroup,
  newModOption,
  setNewModOption,
  handleAddModifierOption,
  handleDeleteModifierGroup,
  handleDeleteModifierOption,
  handleRenameModifierGroup,
  handleUpdateModifierOption
}) {
  const { t } = useTranslation();

  const [editingModGroup, setEditingModGroup] = useState(null);
  const [modGroupEditValue, setModGroupEditValue] = useState("");

  const [editingModOption, setEditingModOption] = useState(null);

  const startEditOption = (groupKey, opt) => {
    setEditingModOption({ groupKey, optionData: opt });
    setNewModOption({
      groupKey: groupKey,
      name: opt.name,
      price: opt.isTextInput ? "0" : fromCents(opt.price),
      isTextInput: opt.isTextInput || false,
      deductionTarget: opt.deductionTarget || "",
      substitutionTarget: opt.substitutionTarget || ""
    });
  };

  const cancelEditOption = () => {
    setEditingModOption(null);
    setNewModOption({ groupKey: "", name: "", price: "0", isTextInput: false, deductionTarget: "", substitutionTarget: "" });
  };

  return (
    <div className="admin-section fade-in">
      <div className="admin-section-header" style={{ marginBottom: '40px' }}>
        <h1 style={{ margin: 0, color: 'var(--text-main)', fontSize: '2rem', fontWeight: '800' }}>{t('mods.title')}</h1>
        <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0', fontSize: '1.1rem' }}>{t('mods.subtitle')}</p>
      </div>

      <div className="admin-grid-responsive" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '32px', alignItems: 'flex-start' }}>

        {/* LEFT COLUMN - CREATION FORMS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

          <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '24px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: '800' }}>
              <Icon icon="lucide:layers" style={{ color: 'var(--brand-color)' }} />
              {t('mods.createGroup')}
            </h3>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder={t('mods.placeholderGroup')}
                value={newModGroupName}
                onChange={(e) => setNewModGroupName(e.target.value)}
                style={{ flex: 1, minWidth: '200px', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold' }}
              />
              <button onClick={handleAddModifierGroup} style={{ flex: '1 0 auto', padding: '14px 24px', background: 'var(--brand-color)', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(52, 152, 219, 0.2)' }}>
                <Icon icon="lucide:plus" />
                {t('mods.btnCreate')}
              </button>
            </div>
          </div>

          <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '24px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: '800' }}>
              <Icon icon="lucide:list-plus" style={{ color: 'var(--brand-color)' }} />
              {t('mods.addOption')}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('mods.labelGroup') || 'Modifier Group'}</label>
                <select
                  value={newModOption.groupKey}
                  onChange={(e) => setNewModOption({ ...newModOption, groupKey: e.target.value })}
                  style={{ padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  <option value="">{t('mods.selectGroup')}</option>
                  {Object.keys(menuData.modifierGroups).map(key => <option key={key} value={key}>{key.replace('_', ' ').toUpperCase()}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('mods.labelOption') || 'Option Name'}</label>
                <input
                  type="text"
                  placeholder={t('mods.placeholderOption')}
                  value={newModOption.name}
                  onChange={(e) => setNewModOption({ ...newModOption, name: e.target.value })}
                  style={{ padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold' }}
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s' }}>
                <input type="checkbox" checked={newModOption.isTextInput} onChange={(e) => setNewModOption({ ...newModOption, isTextInput: e.target.checked })} style={{ width: '20px', height: '20px', accentColor: 'var(--brand-color)' }} />
                <span style={{ color: 'var(--text-main)', fontWeight: 'bold' }}>{t('mods.isTextField')}</span>
              </label>

              {!newModOption.isTextInput && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('mods.labelPrice') || 'Extra Cost'}</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', fontWeight: 'bold', color: 'var(--text-muted)' }}>$</span>
                      <input
                        type="number"
                        placeholder={t('mods.placeholderPrice')}
                        value={newModOption.price}
                        onChange={(e) => setNewModOption({ ...newModOption, price: e.target.value })}
                        style={{ width: '100%', padding: '14px 14px 14px 32px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: '900', fontSize: '1.2rem' }}
                      />
                    </div>
                  </div>

                  {/* INVENTORY LINKING UI */}
                  <div style={{ padding: '24px', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <h4 style={{ margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', fontWeight: '800' }}>
                      <Icon icon="lucide:package-check" style={{ color: 'var(--brand-color)' }} />
                      {t('mods.invActions')}
                    </h4>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('mods.itemToDeduct')}</label>
                      <select value={newModOption.deductionTarget || ""} onChange={(e) => setNewModOption({ ...newModOption, deductionTarget: e.target.value })} style={{ padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold', cursor: 'pointer' }}>
                        <option value="">{t('mods.noDeduction')}</option>
                        {inventoryItems.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
                      </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{t('mods.itemToReplace')}</label>
                      <select value={newModOption.substitutionTarget || ""} onChange={(e) => setNewModOption({ ...newModOption, substitutionTarget: e.target.value })} style={{ padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold', cursor: 'pointer' }}>
                        <option value="">{t('mods.noSubstitution')}</option>
                        {inventoryItems.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button
                  onClick={editingModOption ? () => {
                    handleUpdateModifierOption(editingModOption.groupKey, editingModOption.optionData.id, newModOption);
                    setEditingModOption(null);
                  } : handleAddModifierOption}
                  style={{ flex: 1, padding: '16px', background: editingModOption ? '#f39c12' : '#27ae60', color: 'white', border: 'none', borderRadius: '16px', cursor: 'pointer', fontWeight: '900', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: editingModOption ? '0 8px 20px rgba(243, 156, 18, 0.2)' : '0 8px 20px rgba(39, 174, 96, 0.2)' }}
                >
                  <Icon icon="lucide:save" />
                  {editingModOption ? t('common.saveChanges') : t('mods.btnAddOption')}
                </button>

                {editingModOption && (
                  <button onClick={cancelEditOption} style={{ padding: '16px', background: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '16px', cursor: 'pointer', fontWeight: '900', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Cancel Edit">
                    <Icon icon="lucide:x" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN - RENDERED GROUPS */}
        <div style={{ background: 'var(--bg-surface)', padding: 'var(--admin-padding)', borderRadius: 'var(--admin-card-radius)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid var(--border)', height: 'fit-content' }}>
          <h3 style={{ marginTop: 0, marginBottom: '24px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: '800' }}>
            <Icon icon="lucide:layout-grid" style={{ color: 'var(--brand-color)' }} />
            {t('mods.globalGroups')}
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {Object.keys(menuData.modifierGroups).map(groupKey => (
              <div key={groupKey} style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '20px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.02)', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                  {editingModGroup === groupKey ? (
                    <div style={{ display: 'flex', gap: '8px', flex: 1, marginRight: '16px' }}>
                      <input
                        type="text"
                        value={modGroupEditValue}
                        onChange={(e) => setModGroupEditValue(e.target.value)}
                        style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none', fontWeight: 'bold' }}
                        autoFocus
                      />
                      <button onClick={() => { handleRenameModifierGroup(groupKey, modGroupEditValue); setEditingModGroup(null); }} style={{ background: '#27ae60', border: 'none', color: 'white', cursor: 'pointer', padding: '0 12px', borderRadius: '8px', fontWeight: 'bold' }}>
                        {t('common.save')}
                      </button>
                      <button onClick={() => setEditingModGroup(null)} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 12px', borderRadius: '8px' }}>
                        {t('common.cancel')}
                      </button>
                    </div>
                  ) : (
                    <span style={{ fontWeight: '900', textTransform: 'capitalize', color: 'var(--text-main)', fontSize: '1.1rem' }}>{groupKey.replace('_', ' ')}</span>
                  )}

                  {!editingModGroup || editingModGroup !== groupKey ? (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => { setEditingModGroup(groupKey); setModGroupEditValue(groupKey.replace('_', ' ')); }} style={{ background: 'rgba(52, 152, 219, 0.1)', border: 'none', color: '#3498db', cursor: 'pointer', height: '32px', width: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Rename Group">
                        <Icon icon="lucide:edit-3" style={{ fontSize: '1.1rem' }} />
                      </button>
                      <button onClick={() => handleDeleteModifierGroup(groupKey)} style={{ background: 'rgba(231, 76, 60, 0.05)', border: 'none', color: '#e74c3c', cursor: 'pointer', height: '32px', width: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Delete Entire Group">
                        <Icon icon="lucide:trash-2" style={{ fontSize: '1.1rem' }} />
                      </button>
                    </div>
                  ) : null}
                </div>

                <div style={{ padding: '8px' }}>
                  {menuData.modifierGroups[groupKey].length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.9rem' }}>
                      {t('mods.noOptions')}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {menuData.modifierGroups[groupKey].map(opt => (
                        <div key={opt.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border)', flexWrap: 'wrap', gap: '8px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '150px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{opt.name}</span>
                              {opt.isTextInput ? (
                                <span style={{ background: 'rgba(52, 152, 219, 0.1)', color: '#3498db', padding: '4px 10px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase', border: '1px solid rgba(52, 152, 219, 0.2)' }}>
                                  {t('mods.badgeText')}
                                </span>
                              ) : (
                                <span style={{ color: '#27ae60', fontWeight: '900', fontSize: '0.9rem' }}>+{formatForDisplay(opt.price)}</span>
                              )}
                            </div>

                            {/* INVENTORY BADGE UI */}
                            {(opt.deductionTarget || opt.substitutionTarget) && (
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                <Icon icon="lucide:refresh-cw" style={{ fontSize: '0.9rem' }} />
                                <span>
                                  {opt.substitutionTarget ? `${t('mods.swaps')} [${opt.substitutionTarget}] ${t('mods.for')} ` : `${t('mods.consumes')} `}
                                  <strong style={{ color: 'var(--brand-color)' }}>{opt.deductionTarget}</strong>
                                </span>
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => startEditOption(groupKey, opt)} style={{ background: 'rgba(52, 152, 219, 0.1)', border: 'none', color: '#3498db', cursor: 'pointer', height: '32px', width: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Icon icon="lucide:edit-3" style={{ fontSize: '1.1rem' }} />
                            </button>
                            <button onClick={() => handleDeleteModifierOption(groupKey, opt.id, opt.name)} style={{ background: 'rgba(231, 76, 60, 0.05)', border: 'none', color: '#e74c3c', cursor: 'pointer', height: '32px', width: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Icon icon="lucide:x" style={{ fontSize: '1.1rem' }} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

export default ModifierLibraryTab;