import { BindingPlaceholder, DateFieldKonva, KonvaImageNode, WhatsAppButtonKonva } from './nodeKinds';
import { Circle, Group, Path, Rect, Text } from 'react-konva';
import { fitTextFontSize, pathToSvgD } from '../../../utils/canvasDocument';
import { shadowKonvaProps, shapeFillProps } from './nodeStyle';
import { useEffect, useRef } from 'react';

export function NodeKonva({ node, menuData, fontEpoch = 0, ghost = false, dim = false, onSelect, onDblClick, onMeasure, onDragStart, onDragMove, onNodeDragEnd, onNodeTransformStart, onNodeTransform, onNodeTransformEnd, onContextMenu }) {
  const shapeRef = useRef(null);
  // Convergence guard for the auto-measure loop: each measured size is
  // persisted back into node.w/h (a dep of this effect), which re-runs it. If
  // Konva's measurement oscillates by >1px (sub-pixel/ceil interaction, a
  // pending font, etc.) the persist→re-measure→persist cycle never settles and
  // React allocates fiber/update objects until the tab OOM-crashes. We bound it
  // to a few attempts per *real* input change (text/font/epoch), keyed below;
  // w/h are deliberately excluded from the key so normal editing still re-fits.
  const measureGuard = useRef({ key: '', count: 0 });

  // Auto-width text: after each render, read the konva-measured size and
  // persist it (silently) so the doc box matches the glyphs everywhere.
  useEffect(() => {
    if (node.type !== 'text' || !node.autoWidth) return;
    const n = shapeRef.current;
    if (!n) return;
    const key = `${node.text}|${node.style?.fontFamily}|${node.style?.fontSize}|${node.style?.fontWeight}|${fontEpoch}`;
    const g = measureGuard.current;
    if (g.key !== key) { g.key = key; g.count = 0; }
    if (g.count >= 4) return; // settled or oscillating — stop feeding the loop
    const w = Math.ceil(n.width());
    const h = Math.ceil(n.height());
    if (w > 0 && (Math.abs(w - node.w) > 1 || Math.abs(h - node.h) > 1)) {
      g.count += 1;
      onMeasure?.(node.id, { w, h });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.type, node.autoWidth, node.text, node.w, node.h, node.style?.fontFamily, node.style?.fontSize, node.style?.fontWeight, fontEpoch]);

  // Drag end and transform end are baked into the document by the parent (so
  // group gestures land in a single, undoable commit). See handleNodeDragEnd
  // / handleNodeTransformEnd in CanvasEditor.
  const common = {
    ref: shapeRef,
    id: node.id,
    x: node.x, y: node.y, rotation: node.rotation || 0,
    // Sold-out preview: ghost the elements that would hide, dim the bindings
    // that stay but show as unavailable. The per-node opacity multiplies into
    // whichever preview state applies, so a half-transparent node still reads
    // as half-transparent (and ghosting/dimming layer on top).
    opacity: node.hidden ? 0 : (ghost ? 0.15 : (node.opacity ?? 1) * (dim ? 0.5 : 1)),
    draggable: !node.locked,
    listening: !node.locked,
    onClick: onSelect, onTap: onSelect,
    onDblClick: () => onDblClick?.(node), onDblTap: () => onDblClick?.(node),
    onDragStart,
    onDragMove,
    onDragEnd: () => onNodeDragEnd?.(node),
    onTransformStart: () => onNodeTransformStart?.(node),
    onTransform: (e) => onNodeTransform?.(e, node),
    onTransformEnd: () => onNodeTransformEnd?.(node),
    onContextMenu: (e) => onContextMenu?.(e, node)
  };

  if (node.type === 'text') {
    const s = node.style || {};
    // Auto-width text hugs its glyphs: render with no fixed width so Konva
    // measures it, then persist the measured w/h back (silently, no undo
    // entry) so snapping/transform/public render all agree. Fixed text keeps
    // its authored box. The font key forces a remount so stale glyph metrics
    // don't linger when the font/size/weight changes.
    const auto = !!node.autoWidth;
    // Auto-fit: shrink the font (down from the authored size, which acts as the
    // cap) so the text fits the fixed box instead of overflowing. Computed from
    // the box + text, so resizing the box refits. The KEY keeps the authored
    // s.fontSize — not the fitted size — so a box-resize drag doesn't remount
    // the transform target every frame.
    const cap = s.fontSize || 24;
    const renderSize = (!auto && node.autoFit)
      ? fitTextFontSize({
          text: node.text || '', width: node.w, height: node.h,
          fontFamily: s.fontFamily || 'Georgia, serif', fontWeight: s.fontWeight || 400,
          fontStyle: s.fontStyle || 'normal', lineHeight: s.lineHeight || 1.15,
          letterSpacing: s.letterSpacing || 0, maxSize: cap,
        })
      : cap;
    return (
      <Text
        key={`${s.fontFamily}-${s.fontSize}-${s.fontWeight}-${s.fontStyle}-${s.letterSpacing}-${s.lineHeight}-${fontEpoch}-${auto}`}
        {...common}
        text={node.text || ''}
        width={auto ? undefined : node.w}
        height={auto ? undefined : node.h}
        wrap={auto ? 'none' : 'word'}
        fontFamily={s.fontFamily || 'Georgia, serif'}
        fontSize={renderSize}
        fontStyle={`${s.fontStyle || 'normal'} ${s.fontWeight || 400}`.trim()}
        letterSpacing={s.letterSpacing || 0}
        lineHeight={s.lineHeight || 1.15}
        fill={s.color || '#111'}
        align={s.align || 'left'}
        verticalAlign={auto ? 'top' : 'middle'}
        {...shadowKonvaProps(node.shadow)}
      />
    );
  }

  if (node.type === 'shape') {
    const s = node.style || {};
    // Both shapes render inside a Group at (node.x, node.y) with a node.w×node.h
    // box, so drag/transform are uniform (no circle center special-casing) and
    // an optional centered label can ride along. The shadow rides on the inner
    // fill shape — a Group paints no shadow of its own.
    const shadow = shadowKonvaProps(node.shadow);
    return (
      <Group {...common}>
        {node.shape === 'circle' ? (
          <Circle
            x={node.w / 2} y={node.h / 2}
            radius={Math.min(node.w, node.h) / 2}
            {...shapeFillProps(node, s)}
            stroke={s.stroke || undefined}
            strokeWidth={s.strokeWidth || 0}
            {...shadow}
          />
        ) : (
          <Rect
            width={node.w} height={node.h}
            {...shapeFillProps(node, s)}
            stroke={s.stroke || undefined}
            strokeWidth={s.strokeWidth || 0}
            cornerRadius={s.borderRadius || 0}
            {...shadow}
          />
        )}
        {node.label ? (
          <Text
            key={`lbl-${node.label.length}-${node.labelStyle?.fontSize}-${fontEpoch}`}
            x={8} y={0} width={Math.max(0, node.w - 16)} height={node.h}
            text={node.label}
            fontFamily={node.labelStyle?.fontFamily || 'Georgia, serif'}
            fontSize={node.labelStyle?.fontSize || 32}
            fontStyle={`${node.labelStyle?.fontWeight || 700}`}
            fill={node.labelStyle?.color || '#ffffff'}
            align="center" verticalAlign="middle"
            listening={false}
          />
        ) : null}
      </Group>
    );
  }

  if (node.type === 'path') {
    const s = node.style || {};
    // Points are absolute, so pin the konva node at (0,0). `name` flags it so
    // the Transformer skips it (freeform paths aren't box-resized).
    return (
      <Path
        {...common}
        name="pathnode"
        x={0} y={0}
        data={pathToSvgD(node.points, node.closed)}
        stroke={s.stroke || '#111'}
        strokeWidth={s.strokeWidth ?? 6}
        fill={s.fill && s.fill !== 'transparent' ? s.fill : undefined}
        lineCap="round"
        lineJoin="round"
        hitStrokeWidth={Math.max(14, (s.strokeWidth ?? 6) + 8)}
        {...shadowKonvaProps(node.shadow)}
      />
    );
  }

  if (node.type === 'image') {
    return <KonvaImageNode node={node} common={common} fit={node.fit || 'cover'} />;
  }

  if (node.type === 'item-binding') {
    return <BindingPlaceholder node={node} common={common} menuData={menuData} fontEpoch={fontEpoch} onMeasure={onMeasure} strike={dim} />;
  }

  if (node.type === 'whatsapp-button') {
    return <WhatsAppButtonKonva node={node} common={common} fontEpoch={fontEpoch} />;
  }

  if (node.type === 'date-field') {
    return <DateFieldKonva node={node} common={common} menuData={menuData} fontEpoch={fontEpoch} />;
  }

  // Unknown — render a dashed outline so the user can see + delete it.
  return (
    <Rect {...common} width={node.w} height={node.h} stroke="#888" strokeWidth={1} dash={[6, 4]} fill="rgba(0,0,0,0.04)" />
  );
}

