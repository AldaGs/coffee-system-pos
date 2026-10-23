export const overlay = { position: 'fixed', inset: 0, zIndex: 2000, background: '#0d1117', display: 'flex', flexDirection: 'column', color: 'white' };
export const topbar  = { display: 'flex', alignItems: 'center', gap: 8, rowGap: 6, padding: '10px 16px', background: '#161b22', borderBottom: '1px solid #30363d', flexWrap: 'wrap' };
export const pageTabs = { display: 'flex', gap: 8, alignItems: 'center', padding: '6px 16px', background: '#0d1117', borderBottom: '1px solid #30363d', overflowX: 'auto' };
export const mainRow  = { display: 'flex', flex: 1, minHeight: 0 };
// Narrow (phone/tablet): stack toolbar → stage → bottom sheet vertically.
export const mainRowNarrow = { ...mainRow, flexDirection: 'column' };
export const toolbar  = { width: 80, padding: 12, background: '#161b22', borderRight: '1px solid #30363d', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' };
export const toolbarNarrow = { display: 'flex', flexDirection: 'row', gap: 8, alignItems: 'stretch', padding: '8px 12px', background: '#161b22', borderBottom: '1px solid #30363d', overflowX: 'auto', WebkitOverflowScrolling: 'touch', flexShrink: 0 };
// `safe center` keeps the page centered when it fits but stops the flexbox
// from clipping the top/left once the zoomed canvas overflows, so every edge
// stays reachable by scrolling/panning.
export const stageArea = { flex: 1, display: 'flex', alignItems: 'safe center', justifyContent: 'safe center', padding: 20, background: '#0d1117', overflow: 'auto' };
export const stageAreaNarrow = { ...stageArea, padding: 8, minHeight: 0 };
export const propsPanel = { width: 300, padding: 16, background: '#161b22', borderLeft: '1px solid #30363d', overflowY: 'auto' };

export const zoomWidget = { position: 'absolute', bottom: 16, left: 96, zIndex: 1500, display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(22,27,34,0.92)', border: '1px solid #30363d', borderRadius: 10, padding: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' };
export const zoomBtn = { background: 'transparent', border: 'none', color: '#e6edf3', cursor: 'pointer', padding: '6px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' };
// Bottom sheet on narrow: full width, capped height, its own scroll.
export const propsPanelNarrow = { width: '100%', padding: 16, background: '#161b22', borderTop: '1px solid #30363d', overflowY: 'auto', maxHeight: '46vh', flexShrink: 0 };
export const sheetHandle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 12px', background: '#161b22', borderTop: '1px solid #30363d', flexShrink: 0, cursor: 'pointer', userSelect: 'none' };

export const ghostBtn   = { background: 'transparent', border: '1px solid transparent', color: 'white', padding: '6px 10px', borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 };
export const primaryBtn = { background: '#238636', border: 'none', color: 'white', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 800 };
export const toolBtnStyle = { background: '#22272e', border: '1px solid #30363d', color: 'white', borderRadius: 8, padding: '8px 4px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 };
export const panelTitle = { margin: 0, fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8b949e' };
export const smallBtn  = { background: 'transparent', border: '1px solid #30363d', color: '#ddd', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' };

export const textInputStyle = { flex: 1, background: '#22272e', border: '1px solid #30363d', color: 'white', borderRadius: 6, padding: '6px 8px', fontSize: '0.85rem', outline: 'none' };
export const textareaStyle  = { ...textInputStyle, width: '100%', resize: 'vertical', fontFamily: 'inherit' };
export const selectStyle    = { ...textInputStyle, cursor: 'pointer' };
