import { CANVAS_FONTS, fontIdForStack, googleUrlForToken, parseGoogleFontUrl } from '../../../utils/canvasFonts';
import ColorPicker from '../ColorPicker';
import { Icon } from '@iconify/react';
import { NumInput, Row } from './fields';
import { flipPathPoints } from '../../../utils/canvasDocument';
import { gradientToCss } from './nodeStyle';
import { panelTitle, selectStyle, smallBtn, textInputStyle, textareaStyle } from './styles';
import { useState } from 'react';
import { useTranslation } from '../../../hooks/useTranslation';

// Shared appearance controls: per-node opacity (every type) and a drop shadow
// for the leaf-shape types the renderers can actually paint one on (text,
// shape, path). Both keys live on the node root — updateNode shallow-merges
// them — so they survive alongside the type-specific `style` block.
export function AppearanceProps({ node, onUpdate }) {
  const { t } = useTranslation();
  const supportsShadow = ['text', 'shape', 'path', 'image', 'item-binding'].includes(node.type);
  const sh = node.shadow || {};
  const opacity = node.opacity ?? 1;
  return (
    <div style={{ borderTop: '1px solid #30363d', paddingTop: 10, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ ...panelTitle, margin: 0, fontSize: '0.75rem' }}>{t('canvas.appearance')}</p>
      <Row label={t('canvas.opacity')}>
        <input
          type="range" min={0} max={100} value={Math.round(opacity * 100)}
          onChange={e => onUpdate({ opacity: Number(e.target.value) / 100 })}
          style={{ flex: 1, accentColor: '#1f6feb' }}
        />
        <span style={{ color: '#8b949e', fontSize: '0.72rem', width: 36, textAlign: 'right' }}>{Math.round(opacity * 100)}%</span>
      </Row>
      {supportsShadow && (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#ddd', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!sh.enabled} onChange={e => onUpdate({ shadow: { ...sh, enabled: e.target.checked } })} />
            {t('canvas.shadow')}
          </label>
          {sh.enabled && (
            <>
              <Row label={t('canvas.color')}><ColorPicker value={sh.color || '#000000'} onChange={c => onUpdate({ shadow: { ...sh, color: c } })} /></Row>
              <Row label={t('canvas.blur')}><NumInput value={sh.blur ?? 8} onChange={v => onUpdate({ shadow: { ...sh, blur: Math.max(0, v) } })} suffix="px" /></Row>
              <Row label={t('canvas.offset')}>
                <NumInput value={sh.offsetX ?? 4} onChange={v => onUpdate({ shadow: { ...sh, offsetX: v } })} suffix="X" />
                <NumInput value={sh.offsetY ?? 4} onChange={v => onUpdate({ shadow: { ...sh, offsetY: v } })} suffix="Y" />
              </Row>
              <Row label={t('canvas.shadowOpacity')}>
                <input
                  type="range" min={0} max={100} value={Math.round((sh.opacity ?? 0.5) * 100)}
                  onChange={e => onUpdate({ shadow: { ...sh, opacity: Number(e.target.value) / 100 } })}
                  style={{ flex: 1, accentColor: '#1f6feb' }}
                />
                <span style={{ color: '#8b949e', fontSize: '0.72rem', width: 36, textAlign: 'right' }}>{Math.round((sh.opacity ?? 0.5) * 100)}%</span>
              </Row>
            </>
          )}
        </>
      )}
    </div>
  );
}

export function PathProps({ node, onUpdate }) {
  const { t } = useTranslation();
  const s = node.style || {};
  return (
    <>
      <Row label={t('canvas.stroke')}><ColorPicker value={s.stroke || '#111111'} onChange={c => onUpdate({ style: { stroke: c } })} /></Row>
      <Row label={t('canvas.thickness')}><NumInput value={s.strokeWidth ?? 6} onChange={v => onUpdate({ style: { strokeWidth: Math.max(0, v) } })} /></Row>
      <Row label={t('canvas.fill')}>
        <ColorPicker value={s.fill && s.fill !== 'transparent' ? s.fill : '#000000'} onChange={c => onUpdate({ style: { fill: c } })} />
        {s.fill && s.fill !== 'transparent' && (
          <button onClick={() => onUpdate({ style: { fill: 'transparent' } })} style={smallBtn} title={t('canvas.noFill')}><Icon icon="lucide:x" /></button>
        )}
      </Row>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#ddd', cursor: 'pointer' }}>
        <input type="checkbox" checked={!!node.closed} onChange={e => onUpdate({ closed: e.target.checked })} />
        {t('canvas.closePath')}
      </label>
      {/* Paths mirror their actual points (bbox unchanged), so this is a one-shot
          geometry flip rather than a persisted flag — clicking twice restores. */}
      <Row label={t('canvas.flip')}>
        <button onClick={() => onUpdate({ points: flipPathPoints(node.points, 'h') })} style={{ ...smallBtn, flex: 1, justifyContent: 'center' }} title={t('canvas.flipH')}>
          <Icon icon="lucide:flip-horizontal-2" /> H
        </button>
        <button onClick={() => onUpdate({ points: flipPathPoints(node.points, 'v') })} style={{ ...smallBtn, flex: 1, justifyContent: 'center' }} title={t('canvas.flipV')}>
          <Icon icon="lucide:flip-vertical-2" /> V
        </button>
      </Row>
    </>
  );
}

// Font dropdown (curated system + Google families) with a custom Google
// Fonts URL override. Picking a Google family or applying a valid link
// registers the stylesheet on the document via onSetFont(stack, url) so both
// renderers load it; system fonts pass a null url.
export function FontPicker({ value, onSetFont }) {
  const { t } = useTranslation();
  const currentId = fontIdForStack(value);
  const [customOpen, setCustomOpen] = useState(currentId === 'custom');
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');

  function onSelect(e) {
    const id = e.target.value;
    if (id === 'custom') { setCustomOpen(true); return; }
    setCustomOpen(false);
    const f = CANVAS_FONTS.find(x => x.id === id);
    if (f) onSetFont?.(f.stack, f.google ? googleUrlForToken(f.google) : null);
  }
  function applyCustom() {
    const parsed = parseGoogleFontUrl(url);
    if (!parsed) { setErr(t('canvas.badFontUrl')); return; }
    setErr('');
    onSetFont?.(parsed.stack, parsed.url);
  }

  return (
    <>
      <Row label={t('canvas.font')}>
        <select value={currentId} onChange={onSelect} style={selectStyle}>
          <optgroup label={t('canvas.system')}>
            {CANVAS_FONTS.filter(f => !f.google).map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
          </optgroup>
          <optgroup label="Google Fonts">
            {CANVAS_FONTS.filter(f => f.google).map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
          </optgroup>
          <option value="custom">{t('canvas.customFont')}</option>
        </select>
      </Row>
      {customOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://fonts.googleapis.com/css2?family=…"
            style={textInputStyle}
          />
          <button onClick={applyCustom} style={{ ...smallBtn, background: '#1f6feb', color: 'white', borderColor: '#1f6feb', justifyContent: 'center' }}>
            <Icon icon="lucide:check" /> Aplicar enlace
          </button>
          {err && <span style={{ color: '#ff7e7e', fontSize: '0.72rem' }}>{err}</span>}
          <span style={{ color: '#d8a657', fontSize: '0.7rem', lineHeight: 1.35, display: 'flex', gap: 4 }}>
            <Icon icon="lucide:alert-triangle" style={{ flexShrink: 0, marginTop: 2 }} />
            Los enlaces externos cargan recursos de terceros; pueden tardar o no mostrarse en todos los dispositivos. Usa solo enlaces de Google Fonts.
          </span>
        </div>
      )}
    </>
  );
}

export function TextProps({ node, onUpdate, onSetFont }) {
  const { t } = useTranslation();
  const s = node.style || {};
  return (
    <>
      <Row label={t('canvas.text')}><textarea value={node.text || ''} onChange={e => onUpdate({ text: e.target.value })} rows={3} style={textareaStyle} /></Row>
      <Row label={t('canvas.size')}><NumInput value={s.fontSize || 24} onChange={v => onUpdate({ style: { fontSize: v } })} /></Row>
      <Row label={t('canvas.weight')}>
        <select value={s.fontWeight || 400} onChange={e => onUpdate({ style: { fontWeight: Number(e.target.value) } })} style={selectStyle}>
          {[300, 400, 500, 600, 700, 800, 900].map(w => <option key={w} value={w}>{w}</option>)}
        </select>
      </Row>
      <FontPicker value={s.fontFamily} onSetFont={onSetFont} />
      <Row label={t('canvas.color')}>
        <ColorPicker value={s.color || '#111111'} onChange={c => onUpdate({ style: { color: c } })} />
      </Row>
      <Row label={t('canvas.alignment')}>
        <select value={s.align || 'left'} onChange={e => onUpdate({ style: { align: e.target.value } })} style={selectStyle} disabled={!!node.autoWidth}>
          <option value="left">{t('canvas.left')}</option>
          <option value="center">{t('canvas.center')}</option>
          <option value="right">{t('canvas.right')}</option>
        </select>
      </Row>

      <div style={{ borderTop: '1px solid #30363d', paddingTop: 10, marginTop: 4 }}>
        <p style={{ ...panelTitle, marginBottom: 8, fontSize: '0.75rem' }}>{t('canvas.font')}</p>
      </div>
      <Row label={t('canvas.style')}>
        <button
          onClick={() => onUpdate({ style: { fontStyle: s.fontStyle === 'italic' ? 'normal' : 'italic' } })}
          style={{ ...smallBtn, fontStyle: 'italic', ...(s.fontStyle === 'italic' ? { background: '#1f6feb', color: 'white', borderColor: '#1f6feb' } : null) }}
          title={t('canvas.italic')}
        >
          <Icon icon="lucide:italic" /> {t('canvas.italic')}
        </button>
      </Row>
      <Row label={t('canvas.lineHeight')}>
        <NumInput value={s.lineHeight ?? 1.15} step={0.05} onChange={v => onUpdate({ style: { lineHeight: Math.max(0.5, v) } })} suffix="×" />
      </Row>
      <Row label={t('canvas.letterSpacing')}>
        <NumInput value={s.letterSpacing || 0} onChange={v => onUpdate({ style: { letterSpacing: v } })} suffix="px" />
      </Row>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#ddd', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={!!node.autoWidth}
          onChange={e => onUpdate({ autoWidth: e.target.checked, ...(e.target.checked ? { autoFit: false } : {}) })}
        />
        {t('canvas.autoWidth')}
        <span style={{ color: '#8b949e', fontSize: '0.72rem' }}>{t('canvas.autoWidthHint')}</span>
      </label>
      {!node.autoWidth && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#ddd', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!node.autoFit}
            onChange={e => onUpdate({ autoFit: e.target.checked })}
          />
          {t('canvas.fitBox')}
          <span style={{ color: '#8b949e', fontSize: '0.72rem' }}>{t('canvas.fitBoxHint')}</span>
        </label>
      )}
    </>
  );
}

// Gradient fill editor: type (linear/radial), angle (linear only), and a list
// of color stops with per-stop position + color. A live CSS preview bar mirrors
// what the public page will paint. Always keeps ≥2 stops.
function GradientEditor({ gradient, onChange }) {
  const { t } = useTranslation();
  const g = gradient;
  const type = g.type || 'linear';
  const stops = g.stops || [];
  const preview = gradientToCss(g);
  const setStop = (i, patch) => onChange({ ...g, stops: stops.map((s, k) => k === i ? { ...s, ...patch } : s) });
  const addStop = () => onChange({ ...g, stops: [...stops, { offset: 0.5, color: '#888888' }].sort((a, b) => (a.offset ?? 0) - (b.offset ?? 0)) });
  const removeStop = (i) => { if (stops.length > 2) onChange({ ...g, stops: stops.filter((_, k) => k !== i) }); };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ height: 22, borderRadius: 6, border: '1px solid #30363d', background: preview || '#333' }} />
      <Row label={t('canvas.type')}>
        <select value={type} onChange={e => onChange({ ...g, type: e.target.value })} style={selectStyle}>
          <option value="linear">{t('canvas.linear')}</option>
          <option value="radial">{t('canvas.radial')}</option>
        </select>
      </Row>
      {type === 'linear' && (
        <Row label={t('canvas.angle')}>
          <NumInput value={g.angle ?? 0} onChange={v => onChange({ ...g, angle: ((Math.round(v) % 360) + 360) % 360 })} suffix="°" />
        </Row>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {stops.map((st, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ColorPicker value={st.color} onChange={c => setStop(i, { color: c })} />
            <input
              type="range" min={0} max={100} value={Math.round((st.offset ?? 0) * 100)}
              onChange={e => setStop(i, { offset: Number(e.target.value) / 100 })}
              style={{ flex: 1, accentColor: '#1f6feb' }}
            />
            <span style={{ fontSize: '0.68rem', color: '#8b949e', width: 28, textAlign: 'right' }}>{Math.round((st.offset ?? 0) * 100)}</span>
            <button
              onClick={() => removeStop(i)}
              disabled={stops.length <= 2}
              style={{ ...smallBtn, padding: '4px 6px', opacity: stops.length <= 2 ? 0.3 : 1 }}
              title={t('canvas.removeStop')}
            >
              <Icon icon="lucide:x" />
            </button>
          </div>
        ))}
      </div>
      <button onClick={addStop} style={{ ...smallBtn, justifyContent: 'center' }}><Icon icon="lucide:plus" /> {t('canvas.colorStop')}</button>
    </div>
  );
}

export function ShapeProps({ node, onUpdate }) {
  const { t } = useTranslation();
  const s = node.style || {};
  const ls = node.labelStyle || {};
  const g = s.gradient;
  return (
    <>
      <Row label={t('canvas.fill')}>
        <select
          value={g ? 'gradient' : 'solid'}
          onChange={e => {
            if (e.target.value === 'gradient') {
              onUpdate({ style: { gradient: { type: 'linear', angle: 0, stops: [{ offset: 0, color: s.fill || '#cccccc' }, { offset: 1, color: '#ffffff' }] } } });
            } else {
              onUpdate({ style: { gradient: null } });
            }
          }}
          style={selectStyle}
        >
          <option value="solid">{t('canvas.solid')}</option>
          <option value="gradient">{t('canvas.gradient')}</option>
        </select>
      </Row>
      {g ? (
        <GradientEditor gradient={g} onChange={ng => onUpdate({ style: { gradient: ng } })} />
      ) : (
        <Row label={t('canvas.color')}><ColorPicker value={s.fill || '#cccccc'} onChange={c => onUpdate({ style: { fill: c } })} /></Row>
      )}
      <Row label={t('canvas.border')}><ColorPicker value={s.stroke || '#000000'} onChange={c => onUpdate({ style: { stroke: c } })} /></Row>
      <Row label={t('canvas.thickness')}><NumInput value={s.strokeWidth || 0} onChange={v => onUpdate({ style: { strokeWidth: v } })} /></Row>
      {node.shape !== 'circle' && (
        <Row label={t('canvas.radius')}><NumInput value={s.borderRadius || 0} onChange={v => onUpdate({ style: { borderRadius: v } })} /></Row>
      )}
      <Row label={t('canvas.label')}>
        <input value={node.label || ''} onChange={e => onUpdate({ label: e.target.value })} placeholder={t('canvas.dblClickEdit')} style={textInputStyle} />
      </Row>
      {node.label ? (
        <>
          <Row label={t('canvas.labelSize')}><NumInput value={ls.fontSize || 32} onChange={v => onUpdate({ labelStyle: { ...ls, fontSize: v } })} /></Row>
          <Row label={t('canvas.labelColor')}><ColorPicker value={ls.color || '#ffffff'} onChange={c => onUpdate({ labelStyle: { ...ls, color: c } })} /></Row>
        </>
      ) : null}
    </>
  );
}

export function ImageProps({ node, onUpdate, openAssetPicker }) {
  const { t } = useTranslation();
  return (
    <>
      <Row label={t('canvas.image')}>
        <button onClick={() => openAssetPicker?.(url => onUpdate({ src: url }))} style={{ ...smallBtn, background: '#1f6feb', color: 'white', borderColor: '#1f6feb' }}>
          <Icon icon="lucide:image-plus" /> Cambiar imagen
        </button>
      </Row>
      {node.src && (
        <div style={{ marginTop: -4 }}>
          <img src={node.src} alt="" style={{ width: '100%', maxHeight: 120, objectFit: 'contain', borderRadius: 6, background: '#0d1117' }} />
        </div>
      )}
      <Row label={t('canvas.fit')}>
        <select value={node.fit || 'cover'} onChange={e => onUpdate({ fit: e.target.value })} style={selectStyle}>
          <option value="cover">{t('canvas.cover')}</option>
          <option value="contain">{t('canvas.contain')}</option>
        </select>
      </Row>
      <Row label={t('canvas.cornerRadius')}>
        <NumInput value={node.style?.borderRadius || 0} onChange={v => onUpdate({ style: { borderRadius: Math.max(0, v) } })} suffix="px" />
      </Row>
      <FlipRow flipH={node.flipH} flipV={node.flipV} onFlip={axis => onUpdate(axis === 'h' ? { flipH: !node.flipH } : { flipV: !node.flipV })} />
    </>
  );
}

// Flip toggles shared by nodes that support mirroring. Horizontal/vertical are
// independent, so the buttons show a pressed state per axis.
function FlipRow({ flipH, flipV, onFlip }) {
  const { t } = useTranslation();
  const btn = (on) => ({ ...smallBtn, flex: 1, justifyContent: 'center', ...(on ? { background: '#1f6feb', color: 'white', borderColor: '#1f6feb' } : null) });
  return (
    <Row label={t('canvas.flip')}>
      <button onClick={() => onFlip('h')} style={btn(flipH)} title={t('canvas.flipH')}>
        <Icon icon="lucide:flip-horizontal-2" /> H
      </button>
      <button onClick={() => onFlip('v')} style={btn(flipV)} title={t('canvas.flipV')}>
        <Icon icon="lucide:flip-vertical-2" /> V
      </button>
    </Row>
  );
}

