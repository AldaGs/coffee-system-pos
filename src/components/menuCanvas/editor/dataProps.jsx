import ColorPicker from '../ColorPicker';
import { FontPicker } from './styleProps';
import { Icon } from '@iconify/react';
import { NumInput, Row } from './fields';
import { panelTitle, selectStyle, smallBtn, textInputStyle } from './styles';
import { useMemo } from 'react';
import { useTranslation } from '../../../hooks/useTranslation';

export function BindingProps({ node, onUpdate, onSetFont, openItemPicker, menuData }) {
  const { t } = useTranslation();
  const fields = node.fields || ['name', 'price'];
  function toggle(f) {
    const next = fields.includes(f) ? fields.filter(x => x !== f) : [...fields, f];
    onUpdate({ fields: next });
  }
  const itemIndex = useMemo(() => {
    const m = new Map();
    Object.values(menuData?.categories || {}).flat().forEach(it => m.set(it.id, it));
    return m;
  }, [menuData]);
  const item = itemIndex.get(node.item_id);
  return (
    <>
      <Row label={t('canvas.product')}>
        <button
          onClick={() => openItemPicker?.(ids => { if (ids[0]) onUpdate({ item_id: ids[0] }); })}
          style={{ ...smallBtn, flex: 1, justifyContent: 'flex-start', background: '#0d1117' }}
        >
          <Icon icon={item ? 'lucide:check-circle' : 'lucide:alert-circle'} style={{ color: item ? '#3fb950' : '#f0883e' }} />
          <span style={{ flex: 1, textAlign: 'left' }}>
            {item ? `${item.emoji ? item.emoji + ' ' : ''}${item.name}` : t('canvas.unlinked').replace('{id}', node.item_id || '—')}
          </span>
          <Icon icon="lucide:repeat" />
        </button>
      </Row>
      <Row label={t('canvas.fields')}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {['emoji', 'image', 'name', 'price'].map(f => (
            <button key={f} onClick={() => toggle(f)} style={{
              ...smallBtn,
              background: fields.includes(f) ? '#1f6feb' : 'transparent',
              color: fields.includes(f) ? 'white' : '#ddd'
            }}>{f}</button>
          ))}
        </div>
      </Row>
      <Row label={t('canvas.layout')}>
        <select value={node.layout || 'inline'} onChange={e => onUpdate({ layout: e.target.value })} style={selectStyle}>
          <option value="inline">{t('canvas.inline')}</option>
          <option value="stacked">{t('canvas.stacked')}</option>
        </select>
      </Row>
      {node.layout !== 'stacked' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#ddd', cursor: 'pointer' }}>
          <input type="checkbox" checked={!!node.autoWidth} onChange={e => onUpdate({ autoWidth: e.target.checked })} />
          {t('canvas.autoWidth')}
          <span style={{ color: '#8b949e', fontSize: '0.72rem' }}>{t('canvas.autoWidthHint')}</span>
        </label>
      )}
      <FontPicker value={node.style?.fontFamily} onSetFont={onSetFont} />
      <Row label={t('canvas.textSize')}><NumInput value={node.style?.fontSize || 48} onChange={v => onUpdate({ style: { fontSize: v } })} /></Row>
      <Row label={t('canvas.textColor')}><ColorPicker value={node.style?.color || '#111111'} onChange={c => onUpdate({ style: { color: c } })} /></Row>

      <div style={{ borderTop: '1px solid #30363d', paddingTop: 10, marginTop: 4 }}>
        <p style={{ ...panelTitle, marginBottom: 8, fontSize: '0.75rem' }}>{t('canvas.background')}</p>
      </div>
      <Row label={t('canvas.bgColor')}>
        <ColorPicker value={node.style?.fill || '#ffffff'} onChange={c => onUpdate({ style: { fill: c } })} />
        {node.style?.fill && (
          <button onClick={() => onUpdate({ style: { fill: '' } })} style={smallBtn} title={t('canvas.noBackground')}>
            <Icon icon="lucide:x" />
          </button>
        )}
      </Row>
      <Row label={t('canvas.border')}><ColorPicker value={node.style?.stroke || '#000000'} onChange={c => onUpdate({ style: { stroke: c } })} /></Row>
      <Row label={t('canvas.borderWidth')}><NumInput value={node.style?.strokeWidth || 0} onChange={v => onUpdate({ style: { strokeWidth: v } })} /></Row>
      <Row label={t('canvas.cornerRadius')}><NumInput value={node.style?.borderRadius || 0} onChange={v => onUpdate({ style: { borderRadius: v } })} /></Row>
      <Row label={t('canvas.padding')}><NumInput value={node.style?.padding ?? 8} onChange={v => onUpdate({ style: { padding: v } })} /></Row>

      <div style={{ borderTop: '1px solid #30363d', paddingTop: 10, marginTop: 4 }}>
        <p style={{ ...panelTitle, marginBottom: 8, fontSize: '0.75rem' }}>{t('canvas.inventory')}</p>
      </div>
      <Row label={t('canvas.whenSoldOut')}>
        <select
          value={node.hide_when_out_of_stock ? 'hide' : 'strikethrough'}
          onChange={e => onUpdate({ hide_when_out_of_stock: e.target.value === 'hide' })}
          style={selectStyle}
        >
          <option value="strikethrough">{t('canvas.strikethrough')}</option>
          <option value="hide">{t('canvas.hideFromMenu')}</option>
        </select>
      </Row>
    </>
  );
}

export function WhatsAppProps({ node, onUpdate, onSetFont }) {
  const { t } = useTranslation();
  const s = node.style || {};
  return (
    <>
      <Row label={t('canvas.waLink')}>
        <input
          type="url"
          inputMode="url"
          value={node.url || ''}
          onChange={e => onUpdate({ url: e.target.value })}
          placeholder="https://wa.me/52..."
          style={textInputStyle}
        />
      </Row>
      <Row label={t('canvas.buttonText')}>
        <input value={node.label || ''} onChange={e => onUpdate({ label: e.target.value })} placeholder={t('canvas.orderWhatsApp')} style={textInputStyle} />
      </Row>
      <FontPicker value={s.fontFamily} onSetFont={onSetFont} />
      <Row label={t('canvas.textSize')}><NumInput value={s.fontSize || 28} onChange={v => onUpdate({ style: { fontSize: v } })} /></Row>
      <Row label={t('canvas.bgColor')}><ColorPicker value={s.fill || '#25D366'} onChange={c => onUpdate({ style: { fill: c } })} /></Row>
      <Row label={t('canvas.textColor')}><ColorPicker value={s.color || '#ffffff'} onChange={c => onUpdate({ style: { color: c } })} /></Row>
      <Row label={t('canvas.cornerRadius')}><NumInput value={s.borderRadius ?? 999} onChange={v => onUpdate({ style: { borderRadius: Math.max(0, v) } })} suffix="px" /></Row>
      <p style={{ margin: 0, fontSize: '0.72rem', color: '#8b949e' }}>
        {t('canvas.waHint')}
      </p>
    </>
  );
}

export function DateFieldProps({ node, onUpdate, onSetFont, openItemPicker, menuData }) {
  const { t } = useTranslation();
  const s = node.style || {};
  const itemIndex = useMemo(() => {
    const m = new Map();
    Object.values(menuData?.categories || {}).flat().forEach(it => m.set(it.id, it));
    return m;
  }, [menuData]);
  const item = node.item_id ? itemIndex.get(node.item_id) : null;
  return (
    <>
      <Row label={t('canvas.emoji')}>
        <input
          value={node.emoji || ''}
          onChange={e => onUpdate({ emoji: e.target.value })}
          placeholder="🔥"
          maxLength={4}
          style={{ ...textInputStyle, width: 64, flex: '0 0 auto', textAlign: 'center', fontSize: '1.1rem' }}
        />
        <span style={{ color: '#8b949e', fontSize: '0.72rem' }}>{t('canvas.emojiHint')}</span>
      </Row>
      <Row label={t('canvas.label')}>
        <input value={node.label || ''} onChange={e => onUpdate({ label: e.target.value })} placeholder={t('canvas.datePlaceholder')} style={textInputStyle} />
      </Row>
      <Row label={t('canvas.dateSource')}>
        <button
          onClick={() => openItemPicker?.(ids => { if (ids[0]) onUpdate({ item_id: ids[0], value: '' }); })}
          style={{ ...smallBtn, flex: 1, justifyContent: 'flex-start', background: '#0d1117' }}
          title={t('canvas.linkDate')}
        >
          <Icon icon={item ? 'lucide:link' : 'lucide:calendar'} style={{ color: item ? '#3fb950' : '#8b949e' }} />
          <span style={{ flex: 1, textAlign: 'left' }}>{item ? `${item.name}` : t('canvas.manualDate')}</span>
        </button>
        {node.item_id && (
          <button onClick={() => onUpdate({ item_id: null })} style={smallBtn} title={t('canvas.unlink')}><Icon icon="lucide:x" /></button>
        )}
      </Row>
      {!node.item_id && (
        <Row label={t('canvas.date')}>
          <input
            type="date"
            value={node.value || ''}
            onChange={e => onUpdate({ value: e.target.value })}
            style={textInputStyle}
          />
        </Row>
      )}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#ddd', cursor: 'pointer' }}>
        <input type="checkbox" checked={node.relative !== false} onChange={e => onUpdate({ relative: e.target.checked })} />
        {t('canvas.relative')}
        <span style={{ color: '#8b949e', fontSize: '0.72rem' }}>{t('canvas.relativeHint')}</span>
      </label>
      <FontPicker value={s.fontFamily} onSetFont={onSetFont} />
      <Row label={t('canvas.textSize')}><NumInput value={s.fontSize || 32} onChange={v => onUpdate({ style: { fontSize: v } })} /></Row>
      <Row label={t('canvas.textColor')}><ColorPicker value={s.color || '#8a6d3b'} onChange={c => onUpdate({ style: { color: c } })} /></Row>
      <Row label={t('canvas.alignment')}>
        <select value={s.align || 'left'} onChange={e => onUpdate({ style: { align: e.target.value } })} style={selectStyle}>
          <option value="left">{t('canvas.left')}</option>
          <option value="center">{t('canvas.center')}</option>
          <option value="right">{t('canvas.right')}</option>
        </select>
      </Row>
    </>
  );
}

// Ties any node's visibility to a catalog item's stock: when the item sells
// out, the node hides on the public menu. Lets an owner wrap a badge, photo, or
// callout around a product and have the whole thing vanish together — the
// generic version of the item-binding's own hide-when-out-of-stock option.
export function VisibilityLink({ node, onUpdate, openItemPicker, menuData }) {
  const { t } = useTranslation();
  const itemIndex = useMemo(() => {
    const m = new Map();
    Object.values(menuData?.categories || {}).flat().forEach(it => m.set(it.id, it));
    return m;
  }, [menuData]);
  const link = node.link || null;
  const item = link?.itemId ? itemIndex.get(link.itemId) : null;
  return (
    <div style={{ borderTop: '1px solid #30363d', paddingTop: 10, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ ...panelTitle, margin: 0, fontSize: '0.75rem' }}>{t('canvas.visibility')}</p>
      <Row label={t('canvas.linkToProduct')}>
        <button
          onClick={() => openItemPicker?.(ids => { if (ids[0]) onUpdate({ link: { itemId: ids[0], hideWhenOOS: link?.hideWhenOOS ?? true } }); })}
          style={{ ...smallBtn, flex: 1, justifyContent: 'flex-start', background: '#0d1117' }}
          title={t('canvas.visibilityTitle')}
        >
          <Icon icon={item ? 'lucide:link' : 'lucide:link-2-off'} style={{ color: item ? '#3fb950' : '#8b949e' }} />
          <span style={{ flex: 1, textAlign: 'left' }}>
            {link?.itemId ? (item ? `${item.emoji ? item.emoji + ' ' : ''}${item.name}` : t('canvas.deletedProduct')) : t('canvas.noSelection')}
          </span>
        </button>
        {link?.itemId && (
          <button onClick={() => onUpdate({ link: null })} style={smallBtn} title={t('canvas.unlink')}><Icon icon="lucide:x" /></button>
        )}
      </Row>
      {link?.itemId ? (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#ddd', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={link.hideWhenOOS !== false}
            onChange={e => onUpdate({ link: { ...link, hideWhenOOS: e.target.checked } })}
          />
          {t('canvas.hideWhenSoldOut')}
        </label>
      ) : (
        <p style={{ margin: 0, fontSize: '0.72rem', color: '#8b949e' }}>
          {t('canvas.visibilityHint')}
        </p>
      )}
    </div>
  );
}

