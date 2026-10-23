import { Circle, Group, Line, Path, Transformer } from 'react-konva';
import { pathToSvgD } from '../../../utils/canvasDocument';
import { useEffect, useRef, useState } from 'react';

// Anchor/handle editing overlay for one selected path (entered via
// double-click). Dragging an anchor moves it + its handles; dragging a handle
// moves just that handle. Updates are silent per-move; the parent records a
// single undo step on drag end.
export function PathEditor({ node, scale, onStart, onAnchor, onHandle, onEnd }) {
  const k = n => n / (scale || 1);
  const pts = node.points || [];
  return (
    <>
      {pts.map((p, i) => (
        <Group key={i}>
          {p.hIn && <Line points={[p.x, p.y, p.hIn.x, p.hIn.y]} stroke="#1f6feb" strokeWidth={k(1)} />}
          {p.hOut && <Line points={[p.x, p.y, p.hOut.x, p.hOut.y]} stroke="#1f6feb" strokeWidth={k(1)} />}
          {p.hIn && (
            <Circle x={p.hIn.x} y={p.hIn.y} radius={k(4)} fill="#fff" stroke="#1f6feb" strokeWidth={k(1.5)} draggable
              onDragStart={onStart} onDragMove={e => onHandle(i, 'hIn', { x: e.target.x(), y: e.target.y() })} onDragEnd={onEnd} />
          )}
          {p.hOut && (
            <Circle x={p.hOut.x} y={p.hOut.y} radius={k(4)} fill="#fff" stroke="#1f6feb" strokeWidth={k(1.5)} draggable
              onDragStart={onStart} onDragMove={e => onHandle(i, 'hOut', { x: e.target.x(), y: e.target.y() })} onDragEnd={onEnd} />
          )}
          <Circle x={p.x} y={p.y} radius={k(5.5)} fill="#1f6feb" stroke="#fff" strokeWidth={k(1.5)} draggable
            onDragStart={onStart} onDragMove={e => onAnchor(i, { x: e.target.x(), y: e.target.y() })} onDragEnd={onEnd} />
        </Group>
      ))}
    </>
  );
}

// DOM <textarea> overlay for inline text editing (text node content or a
// shape's centered label). Positioned over the node in screen space.
export function InlineTextEditor({ node, kind, scale, onCommit, onCancel }) {
  const initial = kind === 'label' ? (node.label || '') : (node.text || '');
  const [val, setVal] = useState(initial);
  const ref = useRef(null);
  useEffect(() => { const t = ref.current; if (t) { t.focus(); t.select(); } }, []);
  const s = (kind === 'label' ? node.labelStyle : node.style) || {};
  const style = {
    position: 'absolute',
    left: node.x * scale, top: node.y * scale,
    width: Math.max(40, node.w * scale), height: Math.max(24, node.h * scale),
    fontFamily: s.fontFamily || 'Georgia, serif',
    fontSize: (s.fontSize || (kind === 'label' ? 32 : 24)) * scale,
    fontWeight: s.fontWeight || (kind === 'label' ? 700 : 400),
    color: s.color || (kind === 'label' ? '#ffffff' : '#111111'),
    textAlign: kind === 'label' ? 'center' : (s.align || 'left'),
    lineHeight: 1.15, background: 'rgba(13,17,23,0.35)', border: '1.5px solid #1f6feb',
    outline: 'none', resize: 'none', padding: 0, margin: 0, overflow: 'hidden', boxSizing: 'border-box', zIndex: 5
  };
  return (
    <textarea
      ref={ref}
      value={val}
      style={style}
      onChange={e => setVal(e.target.value)}
      onBlur={() => onCommit(val)}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onCommit(val); }
      }}
    />
  );
}

// Live preview of the in-progress pen path: the committed segments (dashed),
// a rubber-band to the cursor, anchor dots, and any bézier handles being
// pulled. Rendered in a non-listening overlay layer.
export function PenPreview({ draft, cursor, scale }) {
  const pts = draft.points || [];
  const k = n => n / (scale || 1);
  if (pts.length === 0) {
    return cursor ? <Circle x={cursor.x} y={cursor.y} radius={k(4)} stroke="#1f6feb" strokeWidth={k(1)} /> : null;
  }
  const last = pts[pts.length - 1];
  return (
    <>
      <Path data={pathToSvgD(pts, false)} stroke="#1f6feb" strokeWidth={k(2)} dash={[k(5), k(4)]} />
      {cursor && <Line points={[last.x, last.y, cursor.x, cursor.y]} stroke="#1f6feb" strokeWidth={k(1)} dash={[k(3), k(3)]} />}
      {pts.map((p, i) => (
        <Group key={i}>
          {p.hOut && <Line points={[p.x, p.y, p.hOut.x, p.hOut.y]} stroke="#1f6feb" strokeWidth={k(1)} />}
          {p.hIn && <Line points={[p.x, p.y, p.hIn.x, p.hIn.y]} stroke="#1f6feb" strokeWidth={k(1)} />}
          {p.hOut && <Circle x={p.hOut.x} y={p.hOut.y} radius={k(3)} fill="#1f6feb" />}
          {p.hIn && <Circle x={p.hIn.x} y={p.hIn.y} radius={k(3)} fill="#1f6feb" />}
          <Circle x={p.x} y={p.y} radius={k(i === 0 ? 5 : 4)} fill={i === 0 ? '#ffffff' : '#1f6feb'} stroke="#1f6feb" strokeWidth={k(1.5)} />
        </Group>
      ))}
    </>
  );
}

// Transformer follows whichever node is currently selected. The attach runs
// on EVERY render (no dep array) on purpose: text/binding nodes remount when
// their font key changes and image nodes resolve async, so the konva instance
// behind a given id can be replaced — re-finding it each render keeps the
// transformer on the live node and prevents a detached "ghost" box.
export function SelectionTransformer({ selectedIds }) {
  const trRef = useRef(null);
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const stage = tr.getStage();
    // Paths opt out of the box transformer (name="pathnode").
    // Skip paths (freeform) and locked nodes (draggable:false) so the
    // transformer never offers resize/rotate handles on a locked element.
    const nodes = (selectedIds || []).map(id => stage.findOne(`#${id}`)).filter(Boolean).filter(n => n.name() !== 'pathnode' && n.draggable());
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  });
  return (
    <Transformer
      ref={trRef}
      rotateEnabled={true}
      ignoreStroke={true}
      padding={0}
      anchorSize={10}
      borderStroke="#1f6feb"
      anchorStroke="#1f6feb"
      anchorFill="white"
    />
  );
}

// ============================================================================
// Chrome
// ============================================================================

