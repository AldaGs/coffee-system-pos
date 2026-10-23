import { AppearanceProps, ImageProps, PathProps, ShapeProps, TextProps } from './styleProps';
import { BindingProps, DateFieldProps, VisibilityLink, WhatsAppProps } from './dataProps';
import ColorPicker from '../ColorPicker';
import { Icon } from '@iconify/react';
import LayersPanel from '../LayersPanel';
import { NumInput, Row } from './fields';
import { PAGE_PRESETS, presetKeyFor } from '../../../utils/canvasDocument';
import { panelTitle, propsPanel, selectStyle, smallBtn } from './styles';
import { useState } from 'react';
import { useTranslation } from '../../../hooks/useTranslation';

export function PropertiesPanel({ doc, page, changePageBg, changePageSize, selected, multiCount, selectedIds, onSelectNode, onSelectGroup, groups, onRenameGroup, onBulkUpdate, onGroup, onUngroup, canUngroup, onAlign, onDistribute, onUpdate, onUpdateNode, onReorder, onSetFont, onDelete, onForward, onBack, openAssetPicker, openItemPicker, menuData, style }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('props');
  const baseStyle = style || propsPanel;

  return (
    <aside style={{ ...baseStyle, padding: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid #30363d' }}>
        <button
          onClick={() => setActiveTab('props')}
          style={{ flex: 1, padding: '12px 8px', background: 'transparent', border: 'none', borderBottom: activeTab === 'props' ? '2px solid #1f6feb' : '2px solid transparent', color: activeTab === 'props' ? '#fff' : '#8b949e', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}
        >
          {t('canvas.properties')}
        </button>
        <button
          onClick={() => setActiveTab('layers')}
          style={{ flex: 1, padding: '12px 8px', background: 'transparent', border: 'none', borderBottom: activeTab === 'layers' ? '2px solid #1f6feb' : '2px solid transparent', color: activeTab === 'layers' ? '#fff' : '#8b949e', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}
        >
          {t('canvas.layers')}
        </button>
      </div>

      <div style={{ padding: '16px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'layers' ? (
          <LayersPanel
            nodes={page?.nodes}
            groups={groups}
            selectedIds={selectedIds}
            onSelect={onSelectNode}
            onSelectGroup={onSelectGroup}
            onUpdate={onUpdateNode}
            onBulkUpdate={onBulkUpdate}
            onRenameGroup={onRenameGroup}
            onReorder={onReorder}
          />
        ) : (
          multiCount > 1 ? (
            <MultiSelectProps count={multiCount} canUngroup={canUngroup} onGroup={onGroup} onUngroup={onUngroup} onAlign={onAlign} onDistribute={onDistribute} />
          ) : !selected ? (
            <PageProperties doc={doc} page={page} changePageBg={changePageBg} changePageSize={changePageSize} />
          ) : selected.locked ? (
            <LockedNotice onUnlock={() => onUpdateNode(selected.id, { locked: false })} />
          ) : (
            <NodeProperties
              node={selected}
              onUpdate={onUpdate}
              onUngroup={onUngroup}
              onSetFont={onSetFont}
              onDelete={onDelete}
              onForward={() => onForward(selected.id)}
              onBack={() => onBack(selected.id)}
              openAssetPicker={openAssetPicker}
              openItemPicker={openItemPicker}
              menuData={menuData}
            />
          )
        )}
      </div>
    </aside>
  );
}

// Shown when 2+ nodes are selected: alignment + distribution tools. The
// target switch decides the reference frame — the selection bbox, the page,
// or the key object (the first node selected, which stays put).
function MultiSelectProps({ count, canUngroup, onGroup, onUngroup, onAlign, onDistribute }) {
  const { t } = useTranslation();
  const [target, setTarget] = useState('selection');
  const aligns = [
    { dir: 'left', icon: 'lucide:align-start-vertical', label: t('canvas.left') },
    { dir: 'hcenter', icon: 'lucide:align-center-vertical', label: t('canvas.hcenter') },
    { dir: 'right', icon: 'lucide:align-end-vertical', label: t('canvas.right') },
    { dir: 'top', icon: 'lucide:align-start-horizontal', label: t('canvas.top') },
    { dir: 'vcenter', icon: 'lucide:align-center-horizontal', label: t('canvas.vcenter') },
    { dir: 'bottom', icon: 'lucide:align-end-horizontal', label: t('canvas.bottom') }
  ];
  const targets = [
    { id: 'selection', label: t('canvas.selection') },
    { id: 'canvas', label: t('canvas.canvas') },
    { id: 'key', label: t('canvas.keyObject') }
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 style={panelTitle}>{count} seleccionados</h3>
      <p style={{ margin: 0, fontSize: '0.78rem', color: '#8b949e' }}>
        {t('canvas.multiHint')}
      </p>

      <Row label={t('canvas.group')}>
        <button onClick={onGroup} style={{ ...smallBtn, flex: 1, justifyContent: 'center' }}>
          <Icon icon="lucide:group" /> {t('canvas.groupAction')}
        </button>
        {canUngroup && (
          <button onClick={onUngroup} style={{ ...smallBtn, flex: 1, justifyContent: 'center' }}>
            <Icon icon="lucide:ungroup" /> {t('canvas.ungroup')}
          </button>
        )}
      </Row>

      <Row label={t('canvas.alignTo')}>
        <div style={{ display: 'flex', gap: 4, width: '100%' }}>
          {targets.map(tg => (
            <button key={tg.id} onClick={() => setTarget(tg.id)} style={{
              ...smallBtn, flex: 1, justifyContent: 'center', padding: '6px 2px', fontSize: '0.72rem',
              ...(target === tg.id ? { background: '#1f6feb', color: 'white', borderColor: '#1f6feb' } : null)
            }}>{tg.label}</button>
          ))}
        </div>
      </Row>
      {target === 'key' && (
        <p style={{ margin: '-6px 0 0', fontSize: '0.7rem', color: '#8b949e' }}>
          {t('canvas.keyObjectHint')}
        </p>
      )}

      <Row label={t('canvas.align')}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {aligns.map(a => (
            <button key={a.dir} onClick={() => onAlign(a.dir, target)} title={a.label} style={{ ...smallBtn, justifyContent: 'center', padding: '8px 4px' }}>
              <Icon icon={a.icon} />
            </button>
          ))}
        </div>
      </Row>

      <Row label={t('canvas.distribute')}>
        <div style={{ display: 'flex', gap: 6, width: '100%' }}>
          <button onClick={() => onDistribute('h')} disabled={count < 3} title={t('canvas.spaceH')} style={{ ...smallBtn, flex: 1, justifyContent: 'center', opacity: count < 3 ? 0.5 : 1 }}>
            <Icon icon="lucide:align-horizontal-distribute-center" /> H
          </button>
          <button onClick={() => onDistribute('v')} disabled={count < 3} title={t('canvas.spaceV')} style={{ ...smallBtn, flex: 1, justifyContent: 'center', opacity: count < 3 ? 0.5 : 1 }}>
            <Icon icon="lucide:align-vertical-distribute-center" /> V
          </button>
        </div>
      </Row>
    </div>
  );
}

// PAGE_PRESETS carries Spanish labels; map each preset to a translation key.
const PRESET_KEYS = { '16:9': 'preset16x9', '9:16': 'preset9x16', 'a4-p': 'presetA4p', 'a4-l': 'presetA4l', 'letter-p': 'presetLetterP', 'letter-l': 'presetLetterL' };

function PageProperties({ doc, page, changePageBg, changePageSize }) {
  const { t } = useTranslation();
  const presetLabel = (k, p) => PRESET_KEYS[k] ? t(`canvas.${PRESET_KEYS[k]}`) : p.label;
  const presetKey = presetKeyFor(doc.page_size) || '';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 style={panelTitle}>{t('canvas.document')}</h3>
      <Row label={t('canvas.pageSize')}>
        <select
          value={presetKey}
          onChange={e => changePageSize(e.target.value)}
          style={selectStyle}
        >
          {!presetKey && <option value="">{t('canvas.customSize').replace('{w}', doc.page_size?.w).replace('{h}', doc.page_size?.h)}</option>}
          <optgroup label={t('canvas.screen')}>
            {Object.entries(PAGE_PRESETS).filter(([, p]) => p.category === 'digital').map(([k, p]) => (
              <option key={k} value={k}>{presetLabel(k, p)}</option>
            ))}
          </optgroup>
          <optgroup label={t('canvas.printGroup')}>
            {Object.entries(PAGE_PRESETS).filter(([, p]) => p.category === 'print').map(([k, p]) => (
              <option key={k} value={k}>{presetLabel(k, p)}</option>
            ))}
          </optgroup>
        </select>
      </Row>
      <p style={{ margin: 0, fontSize: '0.72rem', color: '#777' }}>
        {t('canvas.pageSizeHint')}
      </p>

      <h3 style={{ ...panelTitle, marginTop: 10 }}>{t('canvas.currentPage')}</h3>
      <Row label={t('canvas.background')}>
        <ColorPicker value={page.background || '#ffffff'} onChange={changePageBg} />
        <code style={{ fontSize: '0.78rem', color: '#aaa' }}>{page.background || '#ffffff'}</code>
      </Row>
      <p style={{ margin: 0, fontSize: '0.78rem', color: '#aaa' }}>
        {t('canvas.selectHint')}
      </p>
    </div>
  );
}

// Shown instead of the editable properties when a locked node is selected
// (e.g. picked from the Layers panel). Editing stays blocked until unlocked —
// matching Illustrator, where a locked item can't be modified.
function LockedNotice({ onUnlock }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}>
      <h3 style={panelTitle}>{t('canvas.lockedTitle')}</h3>
      <p style={{ margin: 0, fontSize: '0.82rem', color: '#8b949e', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <Icon icon="lucide:lock" style={{ flexShrink: 0, marginTop: 2 }} />
        {t('canvas.lockedDesc')}
      </p>
      <button onClick={onUnlock} style={{ ...smallBtn, background: '#1f6feb', color: 'white', borderColor: '#1f6feb', justifyContent: 'center', alignSelf: 'stretch' }}>
        <Icon icon="lucide:unlock" /> Desbloquear
      </button>
    </div>
  );
}

function NodeProperties({ node, onUpdate, onUngroup, onSetFont, onDelete, onForward, onBack, openAssetPicker, openItemPicker, menuData }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 style={panelTitle}>{labelForNode(node, t)}</h3>

      <Row label={t('canvas.layer')}>
        <button onClick={onBack} style={smallBtn}><Icon icon="lucide:chevron-down" /> {t('canvas.back')}</button>
        <button onClick={onForward} style={smallBtn}><Icon icon="lucide:chevron-up" /> {t('canvas.forward')}</button>
      </Row>

      {node.groupId && (
        <button onClick={onUngroup} style={smallBtn}>
          <Icon icon="lucide:ungroup" /> {t('canvas.ungroup')}
        </button>
      )}

      {/* Paths are absolute point geometry — numeric x/y/w/h editing would
          desync them, so those rows are hidden for paths (drag to move). */}
      {node.type !== 'path' && (
        <>
          <Row label={t('canvas.position')}>
            <NumInput value={node.x} onChange={v => onUpdate({ x: v })} suffix="X" />
            <NumInput value={node.y} onChange={v => onUpdate({ y: v })} suffix="Y" />
          </Row>
          <Row label={t('canvas.size')}>
            <NumInput value={node.w} onChange={v => onUpdate({ w: Math.max(10, v) })} suffix="W" />
            <NumInput value={node.h} onChange={v => onUpdate({ h: Math.max(10, v) })} suffix="H" />
          </Row>
          <Row label={t('canvas.rotation')}>
            <NumInput value={node.rotation || 0} onChange={v => onUpdate({ rotation: v })} suffix="°" />
          </Row>
        </>
      )}

      {node.type === 'text' && <TextProps node={node} onUpdate={onUpdate} onSetFont={onSetFont} />}
      {node.type === 'shape' && <ShapeProps node={node} onUpdate={onUpdate} />}
      {node.type === 'path' && <PathProps node={node} onUpdate={onUpdate} />}
      {node.type === 'image' && <ImageProps node={node} onUpdate={onUpdate} openAssetPicker={openAssetPicker} />}
      {node.type === 'item-binding' && <BindingProps node={node} onUpdate={onUpdate} onSetFont={onSetFont} openItemPicker={openItemPicker} menuData={menuData} />}
      {node.type === 'whatsapp-button' && <WhatsAppProps node={node} onUpdate={onUpdate} onSetFont={onSetFont} />}
      {node.type === 'date-field' && <DateFieldProps node={node} onUpdate={onUpdate} onSetFont={onSetFont} openItemPicker={openItemPicker} menuData={menuData} />}

      {/* Opacity (all nodes) + drop shadow (leaf shapes we can render it on). */}
      <AppearanceProps node={node} onUpdate={onUpdate} />

      {/* Item-bindings own their availability behavior; every other node type
          can borrow a product's stock to auto-hide. */}
      {node.type !== 'item-binding' && (
        <VisibilityLink node={node} onUpdate={onUpdate} openItemPicker={openItemPicker} menuData={menuData} />
      )}

      <button onClick={onDelete} style={{ ...smallBtn, color: '#ff7e7e', borderColor: '#ff7e7e' }}>
        <Icon icon="lucide:trash-2" /> {t('canvas.delete')}
      </button>
    </div>
  );
}

function labelForNode(n, t) {
  if (n.type === 'text') return t('canvas.text');
  if (n.type === 'shape') return n.shape === 'circle' ? t('canvas.circle') : t('canvas.rectangle');
  if (n.type === 'image') return t('canvas.image');
  if (n.type === 'item-binding') return t('canvas.linkedProduct');
  if (n.type === 'whatsapp-button') return t('canvas.whatsappButton');
  if (n.type === 'date-field') return t('canvas.date');
  if (n.type === 'path') return t('canvas.path');
  return n.type;
}

