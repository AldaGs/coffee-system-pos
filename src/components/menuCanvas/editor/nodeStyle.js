// Konva drop-shadow attrs for a node's `shadow` model, or null when disabled.
// Applies to leaf shapes (Text, Path, and a shape node's inner Rect/Circle) —
// a Group doesn't paint its own shadow, so shape/image wrappers push it inward.
export function shadowKonvaProps(shadow) {
  if (!shadow || !shadow.enabled) return null;
  return {
    shadowColor: shadow.color || '#000000',
    shadowBlur: shadow.blur ?? 8,
    shadowOffsetX: shadow.offsetX ?? 4,
    shadowOffsetY: shadow.offsetY ?? 4,
    shadowOpacity: shadow.opacity ?? 0.5,
  };
}

// Sorted [offset, 'color', …] color-stop array shared by the Konva gradient
// props and the CSS preview. Returns null when there's nothing to render.
function gradientStops(g) {
  if (!g || !Array.isArray(g.stops) || g.stops.length === 0) return null;
  return [...g.stops].sort((a, b) => (a.offset ?? 0) - (b.offset ?? 0));
}

// CSS gradient string for the editor's preview swatch (kept in sync with the
// public renderer's gradientCss).
export function gradientToCss(g) {
  const stops = gradientStops(g);
  if (!stops) return null;
  const parts = stops.map(s => `${s.color} ${Math.round((s.offset ?? 0) * 100)}%`).join(', ');
  return g.type === 'radial' ? `radial-gradient(circle at center, ${parts})` : `linear-gradient(${g.angle ?? 0}deg, ${parts})`;
}

// Konva fill props for a shape node: a gradient when style.gradient is set,
// else a flat color. Linear angle follows the CSS convention (0° = bottom→top)
// so the editor preview and the public CSS match. Circle geometry is centered
// on its own origin; rect geometry spans its top-left box.
export function shapeFillProps(node, s) {
  const stops = gradientStops(s.gradient);
  if (!stops) return { fill: s.fill || '#ccc' };
  const g = s.gradient;
  const isCircle = node.shape === 'circle';
  const w = node.w, h = node.h;
  const colorStops = stops.flatMap(st => [st.offset ?? 0, st.color]);
  if (g.type === 'radial') {
    const cx = isCircle ? 0 : w / 2, cy = isCircle ? 0 : h / 2;
    const r = isCircle ? Math.min(w, h) / 2 : Math.max(w, h) / 2;
    return {
      fillPriority: 'radial-gradient',
      fillRadialGradientStartPoint: { x: cx, y: cy },
      fillRadialGradientEndPoint: { x: cx, y: cy },
      fillRadialGradientStartRadius: 0,
      fillRadialGradientEndRadius: r,
      fillRadialGradientColorStops: colorStops,
    };
  }
  const rad = (g.angle ?? 0) * Math.PI / 180;
  const dx = Math.sin(rad), dy = -Math.cos(rad);
  const cx = isCircle ? 0 : w / 2, cy = isCircle ? 0 : h / 2;
  const len = isCircle ? Math.min(w, h) : Math.abs(w * dx) + Math.abs(h * dy);
  return {
    fillPriority: 'linear-gradient',
    fillLinearGradientStartPoint: { x: cx - dx * len / 2, y: cy - dy * len / 2 },
    fillLinearGradientEndPoint: { x: cx + dx * len / 2, y: cy + dy * len / 2 },
    fillLinearGradientColorStops: colorStops,
  };
}

