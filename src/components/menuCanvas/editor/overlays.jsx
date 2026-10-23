import { Line } from 'react-konva';

export const RULER = 22; // px gutter for the on-screen rulers

// Pick a "nice" tick spacing (in page px) so labels stay readable at the
// current zoom — aim for ticks ~80px apart on screen.
function tickStep(scale) {
  const target = 80 / (scale || 1);
  const steps = [50, 100, 200, 250, 500, 1000];
  return steps.find(s => s >= target) || 1000;
}

// SVG ruler along the top (x) or left (y) of the stage, labelled in page px.
// Pressing on it starts pulling a guide (onStart).
export function Ruler({ axis, pageSize, scale, onStart }) {
  const px = pageSize * scale;
  const step = tickStep(scale);
  const ticks = [];
  for (let v = 0; v <= pageSize; v += step) ticks.push(v);
  const isX = axis === 'x';
  return (
    <svg
      width={isX ? px : RULER}
      height={isX ? RULER : px}
      onMouseDown={onStart}
      style={{ background: '#161b22', display: 'block', cursor: isX ? 'row-resize' : 'col-resize', borderRight: isX ? 'none' : '1px solid #30363d', borderBottom: isX ? '1px solid #30363d' : 'none' }}
    >
      {ticks.map(v => {
        const p = v * scale;
        return isX ? (
          <g key={v}>
            <line x1={p} y1={RULER - 6} x2={p} y2={RULER} stroke="#586069" strokeWidth={1} />
            <text x={p + 2} y={10} fill="#8b949e" fontSize={9} fontFamily="system-ui">{v}</text>
          </g>
        ) : (
          <g key={v}>
            <line x1={RULER - 6} y1={p} x2={RULER} y2={p} stroke="#586069" strokeWidth={1} />
            <text x={2} y={p + 9} fill="#8b949e" fontSize={9} fontFamily="system-ui">{v}</text>
          </g>
        );
      })}
    </svg>
  );
}

// Faint full-page grid drawn inside the (scaled) stage. Page coordinates, so
// the lines track the document, not the screen.
export function GridOverlay({ pageW, pageH, step = 120 }) {
  const lines = [];
  for (let x = step; x < pageW; x += step) lines.push(<Line key={'gx' + x} points={[x, 0, x, pageH]} stroke="rgba(127,127,127,0.18)" strokeWidth={1} />);
  for (let y = step; y < pageH; y += step) lines.push(<Line key={'gy' + y} points={[0, y, pageW, y]} stroke="rgba(127,127,127,0.18)" strokeWidth={1} />);
  return <>{lines}</>;
}

// DOM overlay (above the Konva stage) that draws the persistent ruler guides
// in page coords scaled to screen, plus the in-flight guide preview. Only the
// thin grab strips capture pointer events; everything else stays click-through
// so node interaction is unaffected. Drawn in DOM rather than Konva to keep
// the screen-space hit math simple under the stage's scale transform.
const GUIDE_COLOR = '#19c3d6';

export function GuidesOverlay({ guides, scale, activeGuide, onStartDragGuide }) {
  const dragging = activeGuide; // { axis, index, pos } or null
  function lineStyle(axis, pos) {
    return axis === 'v'
      ? { position: 'absolute', left: pos * scale, top: 0, width: 1, height: '100%', background: GUIDE_COLOR, pointerEvents: 'none' }
      : { position: 'absolute', top: pos * scale, left: 0, height: 1, width: '100%', background: GUIDE_COLOR, pointerEvents: 'none' };
  }
  function hitStyle(axis, pos) {
    return axis === 'v'
      ? { position: 'absolute', left: pos * scale - 4, top: 0, width: 9, height: '100%', cursor: 'col-resize', pointerEvents: 'auto' }
      : { position: 'absolute', top: pos * scale - 4, left: 0, height: 9, width: '100%', cursor: 'row-resize', pointerEvents: 'auto' };
  }
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {['v', 'h'].flatMap(axis => (guides[axis] || []).map((pos, i) => {
        // Hide the guide that's currently being dragged; the preview shows it.
        if (dragging && dragging.index === i && dragging.axis === axis) return null;
        return (
          <div key={axis + i}>
            <div style={lineStyle(axis, pos)} />
            <div style={hitStyle(axis, pos)} onMouseDown={e => onStartDragGuide(axis, i, e)} />
          </div>
        );
      }))}
      {dragging && (
        <>
          <div style={{ ...lineStyle(dragging.axis, dragging.pos), background: GUIDE_COLOR, boxShadow: `0 0 0 1px ${GUIDE_COLOR}` }} />
          <div style={dragging.axis === 'v'
            ? { position: 'absolute', left: dragging.pos * scale + 4, top: 4, padding: '1px 5px', background: GUIDE_COLOR, color: '#06222a', fontSize: 10, fontWeight: 800, borderRadius: 3, pointerEvents: 'none' }
            : { position: 'absolute', top: dragging.pos * scale + 4, left: 4, padding: '1px 5px', background: GUIDE_COLOR, color: '#06222a', fontSize: 10, fontWeight: 800, borderRadius: 3, pointerEvents: 'none' }}>
            {dragging.pos}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Konva node renderers
// ============================================================================

