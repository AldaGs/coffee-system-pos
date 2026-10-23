import { Icon } from '@iconify/react';
import { ghostBtn, pageTabs, primaryBtn, toolBtnStyle, toolbar, toolbarNarrow, topbar } from './styles';
import { useTranslation } from '../../../hooks/useTranslation';

export function Topbar({ menuName, dirty, saving, onUndo, onRedo, canUndo, canRedo, onSave, onClose, onPrint, onExportPng, showRulers, onToggleRulers, showGrid, onToggleGrid, snapEnabled, onToggleSnap, previewOOS, onTogglePreviewOOS }) {
  const { t } = useTranslation();
  const toggle = on => ({ ...ghostBtn, background: on ? 'rgba(31,111,235,0.35)' : 'transparent' });
  return (
    <div style={topbar}>
      <button onClick={onClose} style={ghostBtn} title={t('canvas.closeEditor')}>
        <Icon icon="lucide:x" /> Cerrar
      </button>
      <div style={{ flex: 1, color: 'rgba(255,255,255,0.85)', fontWeight: 800 }}>
        Editor de lienzo — {menuName} {dirty && <span style={{ color: '#ffb84d', fontWeight: 700, marginLeft: 6 }}>•</span>}
      </div>
      <button onClick={onTogglePreviewOOS} style={{ ...toggle(previewOOS), background: previewOOS ? 'rgba(210,120,30,0.45)' : 'transparent' }} title={t('canvas.simulateOos')}><Icon icon="lucide:package-x" /></button>
      <button onClick={onToggleSnap} style={toggle(snapEnabled)} title={t('canvas.snap')}><Icon icon="lucide:magnet" /></button>
      <button onClick={onToggleRulers} style={toggle(showRulers)} title={t('canvas.rulers')}><Icon icon="lucide:ruler" /></button>
      <button onClick={onToggleGrid} style={toggle(showGrid)} title={t('canvas.grid')}><Icon icon="lucide:grid-3x3" /></button>
      <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />
      <button onClick={onUndo} disabled={!canUndo} style={ghostBtn} title={t('canvas.undo')}><Icon icon="lucide:undo-2" /></button>
      <button onClick={onRedo} disabled={!canRedo} style={ghostBtn} title={t('canvas.redo')}><Icon icon="lucide:redo-2" /></button>
      <button onClick={onExportPng} style={ghostBtn} title={t('canvas.exportPng')}><Icon icon="lucide:image-down" /> PNG</button>
      <button onClick={onPrint} style={ghostBtn} title={t('canvas.printPreview')}><Icon icon="lucide:printer" /> {t('canvas.print')}</button>
      <button onClick={onSave} disabled={saving} style={primaryBtn}>
        <Icon icon={saving ? 'lucide:loader' : 'lucide:save'} /> {saving ? 'Guardando…' : 'Guardar'}
      </button>
    </div>
  );
}

export function PageTabs({ doc, pageIndex, onSelect, onAdd, onDelete }) {
  const { t } = useTranslation();
  return (
    <div style={pageTabs}>
      {doc.pages.map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => onSelect(i)} style={{
            ...ghostBtn,
            background: i === pageIndex ? 'rgba(255,255,255,0.18)' : 'transparent',
            color: 'white', fontWeight: 800
          }}>
            {t('canvas.pageN').replace('{n}', i + 1)}
          </button>
          {doc.pages.length > 1 && (
            <button onClick={() => onDelete(i)} style={{ ...ghostBtn, padding: '6px', color: '#ff9595' }} title={t('canvas.deletePage')}>
              <Icon icon="lucide:trash-2" />
            </button>
          )}
        </div>
      ))}
      <button onClick={onAdd} style={ghostBtn}><Icon icon="lucide:plus" /> {t('canvas.page')}</button>
    </div>
  );
}

export function Toolbar({ onAddText, onAddRect, onAddCircle, onAddImage, onAddBinding, onAddWhatsApp, onAddDate, onTogglePen, penActive, isNarrow }) {
  const { t } = useTranslation();
  // Narrow: horizontal, horizontally-scrollable strip above the stage instead
  // of the 80px left rail (which would leave a phone almost no canvas width).
  const sep = isNarrow
    ? <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.15)', margin: '0 2px' }} />
    : <div style={{ height: 1, background: 'rgba(255,255,255,0.15)', margin: '4px 0' }} />;
  return (
    <div style={isNarrow ? toolbarNarrow : toolbar}>
      <ToolBtn icon="lucide:type" label={t('canvas.text')} onClick={onAddText} isNarrow={isNarrow} />
      <ToolBtn icon="lucide:square" label={t('canvas.rect')} onClick={onAddRect} isNarrow={isNarrow} />
      <ToolBtn icon="lucide:circle" label={t('canvas.circle')} onClick={onAddCircle} isNarrow={isNarrow} />
      <ToolBtn icon="lucide:pen-tool" label={t('canvas.pen')} onClick={onTogglePen} active={penActive} isNarrow={isNarrow} />
      <ToolBtn icon="lucide:image" label={t('canvas.image')} onClick={onAddImage} isNarrow={isNarrow} />
      {sep}
      <ToolBtn icon="lucide:link" label={t('canvas.product')} onClick={onAddBinding} isNarrow={isNarrow} />
      <ToolBtn icon="mdi:whatsapp" label="WhatsApp" onClick={onAddWhatsApp} isNarrow={isNarrow} />
      <ToolBtn icon="lucide:calendar-days" label={t('canvas.date')} onClick={onAddDate} isNarrow={isNarrow} />
    </div>
  );
}

function ToolBtn({ icon, label, onClick, active, isNarrow }) {
  return (
    <button
      onClick={onClick}
      style={{ ...toolBtnStyle, ...(isNarrow ? { minWidth: 58, flexShrink: 0 } : null), ...(active ? { background: '#1f6feb', borderColor: '#1f6feb' } : null) }}
    >
      <Icon icon={icon} style={{ fontSize: '1.3rem' }} />
      <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.02em' }}>{label}</span>
    </button>
  );
}

