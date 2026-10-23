import { Icon } from '@iconify/react';
import { updateMenu } from '../../../api/menus';
import { FONT_PRESETS } from '../../../utils/menuTheme';
import { useTranslation } from '../../../hooks/useTranslation';
import Field from './Field';
import { inputStyle } from './menuShared';

// Phase 4b theme tokens. Writes onto menu.data.theme. Defaults (left empty)
// let the template fall back to its built-in look, so adopting themes is
// opt-in and reversible per token.
export function ThemeEditor({ menu, data, onChange, showAlert }) {
  const { t } = useTranslation();
  const theme = data.theme || {};

  async function patchTheme(patch) {
    try {
      const next = { ...theme, ...patch };
      // Strip empty strings so applyTheme() falls back cleanly.
      for (const k of Object.keys(patch)) {
        if (next[k] === '' || next[k] == null) delete next[k];
      }
      await updateMenu(menu.id, { data: { ...data, theme: next } });
      onChange();
    } catch (err) { showAlert?.('Error', err.message); }
  }

  return (
    <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('menusTab.style')}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Field label={t('menusTab.font')}>
          <select value={theme.font_preset || 'system'} onChange={e => patchTheme({ font_preset: e.target.value })} style={inputStyle}>
            {Object.entries(FONT_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label={t('menusTab.density')}>
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { id: 'compact', label: t('menusTab.densityCompact') },
              { id: 'cozy',    label: t('menusTab.densityCozy') },
              { id: 'roomy',   label: t('menusTab.densityRoomy') }
            ].map(d => {
              const on = (theme.density || 'cozy') === d.id;
              return (
                <button key={d.id} onClick={() => patchTheme({ density: d.id })} style={{
                  flex: 1, padding: '10px 6px', borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: on ? 'var(--brand-color)' : 'var(--bg-surface)',
                  color: on ? 'white' : 'var(--text-main)',
                  fontWeight: 700, cursor: 'pointer', fontSize: '0.78rem'
                }}>{d.label}</button>
              );
            })}
          </div>
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 12 }}>
        <ColorField label={t('menusTab.colorBackground')} value={theme.background} onClear={() => patchTheme({ background: '' })} onChange={v => patchTheme({ background: v })} />
        <ColorField label={t('menusTab.colorText')} value={theme.text}       onClear={() => patchTheme({ text: '' })}       onChange={v => patchTheme({ text: v })} />
        <ColorField label={t('menusTab.colorAccent')} value={theme.accent}     onClear={() => patchTheme({ accent: '' })}     onChange={v => patchTheme({ accent: v })} />
      </div>

      <Field label={t('menusTab.googleFont')}>
        <input
          type="url"
          placeholder="https://fonts.googleapis.com/css2?family=Playfair+Display&display=swap"
          defaultValue={theme.google_font_url || ''}
          onBlur={e => patchTheme({ google_font_url: e.target.value.trim() })}
          style={inputStyle}
        />
      </Field>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer' }}>
        <input type="checkbox" className="switch" checked={!!theme.hide_title} onChange={e => patchTheme({ hide_title: e.target.checked })} />
        {t('menusTab.hideTitle')}
      </label>

      <Field label={t('menusTab.orderLogo')}>
        <input
          type="url"
          placeholder={t('menusTab.orderLogoPlaceholder')}
          defaultValue={theme.logo_url || ''}
          onBlur={e => patchTheme({ logo_url: e.target.value.trim() })}
          style={inputStyle}
        />
      </Field>

      <Field label={t('menusTab.homeUrl')}>
        <input
          type="url"
          placeholder={t('menusTab.homeUrlPlaceholder')}
          defaultValue={theme.home_url || ''}
          onBlur={e => patchTheme({ home_url: e.target.value.trim() })}
          style={inputStyle}
        />
      </Field>

      <Field label={t('menusTab.customCss')}>
        <textarea
          rows={6}
          placeholder=".tp-order button { border-radius: 999px; }"
          defaultValue={theme.custom_css || ''}
          onBlur={e => patchTheme({ custom_css: e.target.value })}
          style={{ ...inputStyle, fontFamily: 'monospace', resize: 'vertical' }}
        />
      </Field>
    </div>
  );
}

function ColorField({ label, value, onChange, onClear }) {
  const { t } = useTranslation();
  return (
    <Field label={label}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="color"
          value={value || '#000000'}
          onChange={e => onChange(e.target.value)}
          style={{ width: 36, height: 32, border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', cursor: 'pointer', padding: 0 }}
        />
        <code style={{ flex: 1, fontSize: '0.72rem', color: 'var(--text-muted)' }}>{value || 'auto'}</code>
        {value && (
          <button onClick={onClear} title={t('menusTab.clear')} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
            <Icon icon="lucide:x" />
          </button>
        )}
      </div>
    </Field>
  );
}
