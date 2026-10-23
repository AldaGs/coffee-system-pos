import { Group, Path, Rect, Text } from 'react-konva';
import { formatDateField } from '../../../utils/canvasDocument';
import { shadowKonvaProps } from './nodeStyle';
import { useCanvasImage } from '../../../utils/canvasImageCache';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from '../../../hooks/useTranslation';

// Image node. Rendered as a stable Group (the draggable/transform target) with
// a transparent box Rect defining the bounds and the bitmap inside it, so the
// konva node identity never swaps as the image loads — that swap was leaving a
// detached transformer ghost behind. `fit` honours the Ajuste control:
//   cover   → fill the box, centre-crop (no distortion)
//   contain → fit inside the box, letterboxed + centred (no distortion)
export function KonvaImageNode({ node, common, fit }) {
  // Shared, downscaled cache: one decoded (and size-capped) bitmap per unique
  // src, reused across every node instance and remount. `img` is the cached
  // canvas; imgW/imgH are its intrinsic (downscaled) dimensions for crop math.
  const { image: img, width: imgW, height: imgH, failed } = useCanvasImage(node.src);

  const w = node.w, h = node.h;
  let inner = null;
  if (img) {
    if (fit === 'contain') {
      const s = Math.min(w / imgW, h / imgH);
      const dw = imgW * s, dh = imgH * s;
      inner = <KImage image={img} x={(w - dw) / 2} y={(h - dh) / 2} width={dw} height={dh} listening={false} />;
    } else {
      // cover: crop the source to the box's aspect ratio.
      const ar = w / h, iar = imgW / imgH;
      let cw, ch, cx, cy;
      if (iar > ar) { ch = imgH; cw = imgH * ar; cx = (imgW - cw) / 2; cy = 0; }
      else { cw = imgW; ch = imgW / ar; cx = 0; cy = (imgH - ch) / 2; }
      inner = <KImage image={img} width={w} height={h} crop={{ x: cx, y: cy, width: cw, height: ch }} listening={false} />;
    }
  }

  // Rounded mask: clip the bitmap (and placeholder fill) to a rounded rect so
  // the editor preview matches the public renderer's border-radius. The failed
  // outline rides outside the clip so it stays fully visible.
  const radius = node.style?.borderRadius || 0;
  const clip = radius > 0
    ? (ctx) => roundRectPath(ctx, 0, 0, w, h, Math.min(radius, w / 2, h / 2))
    : undefined;

  // Flip mirrors the bitmap inside the box (scale on an INNER group), so the
  // outer transform-target Group keeps scaleX/scaleY = 1 and the resize
  // pipeline never sees a negative scale. The offset keeps the mirror centered.
  const fh = node.flipH ? -1 : 1, fv = node.flipV ? -1 : 1;
  // A shadow can't ride on the clip group (the clip would swallow it) or the
  // transparent box rect, so cast it from a matching rounded rect behind the
  // bitmap. For the common opaque/cover image this reads as a clean card
  // shadow; the public renderer uses filter:drop-shadow for a pixel-exact one.
  const shadow = shadowKonvaProps(node.shadow);
  return (
    <Group {...common}>
      {shadow && <Rect width={w} height={h} cornerRadius={radius} fill="#ffffff" listening={false} {...shadow} />}
      <Group clipFunc={clip} scaleX={fh} scaleY={fv} x={node.flipH ? w : 0} y={node.flipV ? h : 0}>
        <Rect
          width={w} height={h}
          fill={img ? 'transparent' : 'rgba(120,120,120,0.12)'}
        />
        {inner}
      </Group>
      {failed && (
        <Rect width={w} height={h} stroke="#c33" strokeWidth={2} dash={[4, 4]} cornerRadius={radius} listening={false} />
      )}
    </Group>
  );
}

// Trace a rounded-rectangle sub-path on a Konva/canvas 2D context — used as a
// Group clipFunc so images get the same rounded mask the DOM renderer applies
// via border-radius.
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Editor preview for item-binding nodes. Renders the same fields the
// public ItemBindingView does — emoji + name + price respecting the
// `fields` array and `layout` — so the user sees toggle effects live.
// Background/stroke/borderRadius come from node.style so visual edits
// match what customers will see. Unbound nodes get a faint dashed
// outline so they're discoverable.
export function BindingPlaceholder({ node, common, menuData, fontEpoch = 0, onMeasure, strike = false }) {
  const idx = useMemo(() => {
    const m = new Map();
    Object.values(menuData?.categories || {}).flat().forEach(it => m.set(it.id, it));
    return m;
  }, [menuData]);
  const item = idx.get(node.item_id);
  const s = node.style || {};
  const fields = node.fields && node.fields.length > 0 ? node.fields : ['name', 'price'];
  const stacked = node.layout === 'stacked';
  const auto = !!node.autoWidth && !stacked;
  const inlineRef = useRef(null);
  const fontSize = s.fontSize || 48;
  const color = s.color || '#111';
  const fontFamily = s.fontFamily || 'Georgia, serif';
  const align = s.align || 'left';
  const fontStyleStr = `${s.fontWeight || 400}`;
  const pad = s.padding ?? 8;

  // Build the parts in the order specified by `fields`.
  const showEmoji = fields.includes('emoji') && item?.emoji;
  const showImage = fields.includes('image') && item?.image_url;
  const showName  = fields.includes('name');
  const showPrice = fields.includes('price');

  const nameText = item ? item.name : `(item ${node.item_id || '—'})`;
  const priceText = item
    ? (item.basePrice != null ? formatPrice(item.basePrice) : '')
    : '';

  // For inline layout we paint everything in one Text node with separators
  // so Konva measures the line as a single unit (no Flexbox in Konva). For
  // stacked we stack two Texts: name row + price row.
  const inlineParts = [];
  if (showEmoji) inlineParts.push(item.emoji);
  if (showName)  inlineParts.push(nameText);
  if (showPrice && priceText) inlineParts.push(priceText);
  const inlineText = inlineParts.join('   ');

  // Auto-box (inline only): let Konva measure the line and persist the box back
  // silently, so the binding hugs its dynamic text like a free-text autoWidth
  // node — matching the public renderer.
  //
  // Same convergence guard as NodeKonva's auto-width text (see there): the
  // persisted w/h re-trigger this effect, so a >1px measurement oscillation
  // would loop forever and leak React internals until OOM. Bound it to a few
  // attempts per real input change; w/h are excluded from the key.
  const measureGuard = useRef({ key: '', count: 0 });
  useEffect(() => {
    if (!auto) return;
    const n = inlineRef.current;
    if (!n) return;
    const key = `${inlineText}|${fontFamily}|${fontSize}|${fontStyleStr}|${pad}|${fontEpoch}`;
    const g = measureGuard.current;
    if (g.key !== key) { g.key = key; g.count = 0; }
    if (g.count >= 4) return;
    const w = Math.ceil(n.width()) + pad * 2;
    const h = Math.ceil(n.height());
    if (w > 0 && (Math.abs(w - node.w) > 1 || Math.abs(h - node.h) > 1)) {
      g.count += 1;
      onMeasure?.(node.id, { w, h });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, inlineText, fontFamily, fontSize, fontStyleStr, pad, node.w, node.h, fontEpoch]);

  const bg = s.fill || 'transparent';
  const stroke = s.stroke && (s.strokeWidth || 0) > 0 ? s.stroke : (item ? undefined : '#f28b05');
  const strokeWidth = stroke ? (s.strokeWidth || (item ? 0 : 2)) : 0;
  const dash = item ? undefined : [6, 6];

  return (
    <Group {...common}>
      <Rect
        width={node.w} height={node.h}
        fill={bg}
        stroke={stroke}
        strokeWidth={strokeWidth}
        dash={dash}
        cornerRadius={s.borderRadius || 0}
        {...shadowKonvaProps(node.shadow)}
      />
      {showImage && (
        // Use a placeholder rect for the image area in the editor — Konva
        // image loading is expensive when many bindings exist. Public
        // renderer shows the actual photo.
        <Rect
          x={pad} y={pad}
          width={Math.max(0, Math.min(node.h - pad * 2, node.w * 0.25))}
          height={Math.max(0, node.h - pad * 2)}
          fill="rgba(0,0,0,0.08)"
          cornerRadius={6}
        />
      )}
      {/* Same metric-cache workaround as text nodes — see comment above. */}
      {!stacked && (
        <Text
          ref={inlineRef}
          key={`${fontFamily}-${fontSize}-${fontStyleStr}-${fontEpoch}-${auto}`}
          x={pad} y={0}
          width={auto ? undefined : Math.max(0, node.w - pad * 2)}
          height={auto ? undefined : node.h}
          wrap={auto ? 'none' : 'word'}
          text={inlineText}
          fontFamily={fontFamily}
          fontSize={fontSize}
          fontStyle={fontStyleStr}
          fill={color}
          align={align}
          textDecoration={strike ? 'line-through' : undefined}
          verticalAlign={auto ? 'top' : 'middle'}
        />
      )}
      {stacked && (
        <>
          <Text
            key={`name-${fontFamily}-${fontSize}-${fontStyleStr}-${fontEpoch}`}
            x={pad} y={pad}
            width={Math.max(0, node.w - pad * 2)}
            height={node.h - pad * 2}
            text={[showEmoji ? item.emoji : '', showName ? nameText : ''].filter(Boolean).join(' ')}
            fontFamily={fontFamily}
            fontSize={fontSize}
            fontStyle={fontStyleStr}
            fill={color}
            align={align}
            textDecoration={strike ? 'line-through' : undefined}
            verticalAlign="top"
          />
          {showPrice && priceText && (
            <Text
              key={`price-${fontFamily}-${fontSize}-${fontStyleStr}-${fontEpoch}`}
              x={pad} y={node.h - fontSize * 0.9 - pad}
              width={Math.max(0, node.w - pad * 2)}
              text={priceText}
              fontFamily={fontFamily}
              fontSize={fontSize * 0.9}
              fontStyle={fontStyleStr}
              fill={color}
              align={align}
              textDecoration={strike ? 'line-through' : undefined}
            />
          )}
        </>
      )}
    </Group>
  );
}

// WhatsApp button node preview. A rounded pill with the WhatsApp mark drawn as
// a Konva Path plus the label, matching the public renderer's styled anchor.
export function WhatsAppButtonKonva({ node, common, fontEpoch = 0 }) {
  const { t } = useTranslation();
  const s = node.style || {};
  const label = node.label || t('canvas.orderWhatsApp');
  const bg = s.fill || '#25D366';
  const color = s.color || '#ffffff';
  const fontSize = s.fontSize || 28;
  const radius = s.borderRadius ?? Math.min(node.h / 2, 999);
  const glyph = Math.min(node.h * 0.5, fontSize);
  const gap = glyph * 0.4;
  const pad = s.padding ?? 12;
  return (
    <Group {...common}>
      <Rect width={node.w} height={node.h} fill={bg} cornerRadius={Math.min(radius, node.h / 2)} />
      <Group x={0} y={0} clipFunc={(ctx) => roundRectPath(ctx, 0, 0, node.w, node.h, Math.min(radius, node.h / 2))}>
        {/* Center the glyph + label as a unit. */}
        <Path
          x={node.w / 2 - (glyph + gap + label.length * fontSize * 0.28) / 2}
          y={node.h / 2 - glyph / 2}
          data="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.76.46 3.45 1.34 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.16c-.24.68-1.4 1.3-1.94 1.35-.5.05-.98.23-3.3-.69-2.78-1.1-4.56-3.94-4.7-4.13-.14-.19-1.13-1.5-1.13-2.86 0-1.36.71-2.03.97-2.31.24-.26.53-.32.7-.32.18 0 .35 0 .5.01.16.01.38-.06.59.45.24.58.81 2 .88 2.15.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.16-.29.36-.42.48-.14.14-.28.29-.12.57.16.28.72 1.19 1.55 1.93 1.06.95 1.96 1.24 2.24 1.38.28.14.44.12.6-.07.16-.19.69-.81.88-1.09.18-.28.37-.23.62-.14.25.09 1.61.76 1.89.9.28.14.46.21.53.32.07.12.07.66-.17 1.34Z"
          fill={color}
          scaleX={glyph / 24}
          scaleY={glyph / 24}
          listening={false}
        />
        <Text
          key={`wa-${fontSize}-${fontEpoch}`}
          x={pad} y={0}
          width={Math.max(0, node.w - pad * 2)}
          height={node.h}
          text={label}
          fontFamily={s.fontFamily || 'system-ui, sans-serif'}
          fontSize={fontSize}
          fontStyle={`${s.fontWeight || 800}`}
          fill={color}
          align="center"
          verticalAlign="middle"
          listening={false}
        />
      </Group>
    </Group>
  );
}

// Date-field node preview. Emoji + label + formatted date on one line — the
// businessless replacement for the coffee-only roast line. Binds to an item's
// roast_date when linked, else shows the node's own value.
export function DateFieldKonva({ node, common, menuData, fontEpoch = 0 }) {
  const { t, lang } = useTranslation();
  const idx = useMemo(() => {
    const m = new Map();
    Object.values(menuData?.categories || {}).flat().forEach(it => m.set(it.id, it));
    return m;
  }, [menuData]);
  const s = node.style || {};
  const bound = node.item_id ? idx.get(node.item_id) : null;
  const value = node.value || bound?.roastDate || bound?.roast_date || null;
  const dateStr = formatDateField(value, { lang, relative: node.relative !== false });
  const text = [node.emoji || '', node.label || '', dateStr || (value ? '' : t('canvas.datePh'))].filter(Boolean).join(' ');
  return (
    <Group {...common}>
      <Text
        key={`date-${s.fontSize}-${fontEpoch}`}
        width={node.w} height={node.h}
        text={text}
        fontFamily={s.fontFamily || 'system-ui, sans-serif'}
        fontSize={s.fontSize || 32}
        fontStyle={`${s.fontWeight || 600}`}
        fill={s.color || '#8a6d3b'}
        align={s.align || 'left'}
        verticalAlign="middle"
      />
    </Group>
  );
}

// Editor-only price helper — menuData prices are in cents on `basePrice`.
// We can't read the shop's locale here, so just render with two decimals
// and a dollar sign as a visual proxy; the public renderer uses the real
// formatForDisplay() utility.
function formatPrice(cents) {
  const n = Math.round(cents || 0) / 100;
  return `$${n.toFixed(2)}`;
}

