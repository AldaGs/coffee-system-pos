// Pickup/delivery time slots, computed in the SHOP timezone (not the browser's).
// Mirrors the server check in public_place_order (schema 2.4): same days bitmask
// (mon = bit 0), same start <= t < end window (overnight wraps), same interval.
export const SLOT_DEFAULTS = { interval: 30, daysAhead: 3, leadMinutes: 30 };
const FALLBACK_HOURS = { start: '09:00', end: '21:00' };

const fmt = {};
function parts(ms, tz) {
  fmt[tz] ||= new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  const p = Object.fromEntries(fmt[tz].formatToParts(ms).map((x) => [x.type, +x.value]));
  return { y: p.year, m: p.month, d: p.day, h: p.hour, mi: p.minute, s: p.second };
}
// Wall-clock time in `tz` -> UTC ms. Two passes settle DST edges.
function zonedToUtc(y, m, d, h, mi, tz) {
  const want = Date.UTC(y, m - 1, d, h, mi);
  let t = want;
  for (let i = 0; i < 2; i++) { const p = parts(t, tz); t -= Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - want; }
  return t;
}
const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':'); return +h * 60 + +m; };

// <input type="datetime-local"> values ("YYYY-MM-DDTHH:mm") are wall-clock in the shop tz.
const p2 = (n) => String(n).padStart(2, '0');
export function toLocalInput(ms, tz) {
  const p = parts(ms, tz);
  return `${p.y}-${p2(p.m)}-${p2(p.d)}T${p2(p.h)}:${p2(p.mi)}`;
}
export function fromLocalInput(str, tz) {
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(str || '');
  return m ? zonedToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], tz) : NaN;
}

// Effective rules (slots.enabled only). hours falls back to the online-order schedule, then 09:00-21:00 daily.
export function slotRules(slots, schedule) {
  const r = { ...SLOT_DEFAULTS, ...(slots || {}) };
  const h = slots?.hours || schedule || {};
  return { interval: r.interval, daysAhead: r.daysAhead, leadMinutes: r.leadMinutes,
    days: h.days || 0, start: h.start || FALLBACK_HOURS.start, end: h.end || FALLBACK_HOURS.end };
}

// Same checks as public_place_order: lead, range, day bitmask, start <= t < end (overnight wraps), interval.
export function slotValid(ms, { now = Date.now(), tz, slots, schedule }) {
  const r = slotRules(slots, schedule);
  if (!(ms >= now + r.leadMinutes * 60000 && ms <= now + r.daysAhead * 86400000)) return false;
  const p = parts(ms, tz);
  if (r.days && !(r.days & (1 << ((new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() + 6) % 7)))) return false;
  const t = p.h * 60 + p.mi, a = toMin(r.start), b = toMin(r.end);
  return (a <= b ? t >= a && t < b : t >= a || t < b) && p.s === 0 && t % r.interval === 0;
}

// Times ('HH:MM') a customer may pick on `date` ('YYYY-MM-DD', shop tz). With rules: every
// interval inside the hours that passes slotValid. Without: every 15 min that is still ahead.
export function timesFor(date, { now = Date.now(), tz, slots, schedule }) {
  const step = slots?.enabled ? slotRules(slots, schedule).interval : 15;
  const out = [];
  for (let t = 0; t < 1440; t += step) {
    const hhmm = `${p2(Math.floor(t / 60))}:${p2(t % 60)}`;
    const ms = fromLocalInput(`${date}T${hhmm}`, tz);
    if (slots?.enabled ? slotValid(ms, { now, tz, slots, schedule }) : ms > now && ms <= now + 14 * 86400000) out.push(hhmm);
  }
  return out;
}

// Earliest bookable slot (UTC ms) scanning today + daysAhead days in the shop tz, or null.
export function firstSlot(ctx) {
  const now = ctx.now ?? Date.now();
  const days = slotRules(ctx.slots, ctx.schedule).daysAhead;
  for (let i = 0; i <= days; i++) {
    const date = toLocalInput(now + i * 86400000, ctx.tz).slice(0, 10);
    const t = timesFor(date, { ...ctx, now })[0];
    if (t) return fromLocalInput(`${date}T${t}`, ctx.tz);
  }
  return null;
}

// An automatic slot later on the shop's current calendar day is upcoming,
// even when the browser (or UTC) is already on a different date.
export function autoSlotIsToday(slotMs, now, tz) {
  return toLocalInput(slotMs, tz).slice(0, 10) === toLocalInput(now, tz).slice(0, 10);
}

// "As soon as possible" only makes sense if a slot opens within lead + interval minutes.
// With no slot at all it stays true so the server (hours check) decides.
export function asapOk(ctx) {
  if (!ctx.slots?.enabled) return true;
  const now = ctx.now ?? Date.now();
  const r = slotRules(ctx.slots, ctx.schedule);
  const f = firstSlot({ ...ctx, now });
  return f == null || f <= now + (r.leadMinutes + r.interval) * 60000;
}

// Checkout gate for both wizard navigation and final submission. A chosen day
// without a time is not ASAP; ASAP only applies when no day was selected.
export function checkoutSlotStatus({ value, selectedDate = '', now, tz, slots, schedule }) {
  if (!value) return selectedDate ? 'missing-time' : asapOk({ now, tz, slots, schedule }) ? 'valid' : 'asap-unavailable';
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || selectedDate && toLocalInput(ms, tz).slice(0, 10) !== selectedDate) return 'invalid-time';
  if (slots?.enabled) return slotValid(ms, { now, tz, slots, schedule }) ? 'valid' : 'invalid-time';
  return ms > now && ms <= now + 14 * 86400000 ? 'valid' : 'invalid-time';
}

// ---- Store hours (onlineOrders.openHours): when orders are accepted. Mirrors the server gate in
// public_place_order (schema 2.9): open = always OR any rule matches the shop-tz wall clock
// (rule.days bitmask, mon = bit 0, 0 = every day; same start/end semantics incl. overnight wrap).
// Absent openHours = always open.
const ruleOpen = (r, dow, t) => {
  const a = toMin(r.start), b = toMin(r.end);
  if (r.days && !(r.days & (1 << dow))) return false;
  return a <= b ? t >= a && t < b : t >= a || t < b;
};
const wallNow = (now, tz) => {
  const p = parts(now, tz);
  return { dow: (new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() + 6) % 7, t: p.h * 60 + p.mi };
};
export const alwaysOpen = (oh) => !oh || oh.always === true || !Array.isArray(oh.rules);

export function isOpenNow(oh, { now = Date.now(), tz }) {
  if (alwaysOpen(oh)) return true;
  const { dow, t } = wallNow(now, tz);
  return oh.rules.some((r) => ruleOpen(r, dow, t));
}

// Next opening within 7 days: { dayOffset (0 = today), dow (0 = Mon), time: 'HH:MM' }, or null
// if always open / never opens. Walks wall-clock minutes (a DST shift can move it by an hour).
export function nextOpening(oh, { now = Date.now(), tz }) {
  if (alwaysOpen(oh)) return null;
  const { dow: d0, t: t0 } = wallNow(now, tz);
  for (let m = 1; m <= 7 * 1440; m++) {
    const abs = t0 + m, dayOffset = Math.floor(abs / 1440), t = abs % 1440, dow = (d0 + dayOffset) % 7;
    if (oh.rules.some((r) => ruleOpen(r, dow, t))) return { dayOffset, dow, time: `${Math.floor(t / 60)}:${p2(t % 60)}` };
  }
  return null;
}

// Human lines per rule, e.g. "Lun–Vie 9:00–14:00". dayNames = 7 labels starting Monday; allDays = label for bitmask 0/127.
export function formatHours(oh, dayNames, allDays) {
  if (alwaysOpen(oh)) return [];
  const hm = (x) => String(x).replace(/^0/, '');
  return oh.rules.map((r) => {
    const on = [0, 1, 2, 3, 4, 5, 6].filter((d) => !r.days || r.days & (1 << d));
    let label;
    if (on.length === 7) label = allDays;
    else {
      const runs = []; // contiguous runs: 3+ days collapse to "A–B"
      for (const d of on) { const l = runs[runs.length - 1]; if (l && l[1] === d - 1) l[1] = d; else runs.push([d, d]); }
      label = runs.map(([a, b]) => (b - a >= 2 ? `${dayNames[a]}–${dayNames[b]}` : a === b ? dayNames[a] : `${dayNames[a]}, ${dayNames[b]}`)).join(', ');
    }
    return `${label} ${hm(r.start)}–${hm(r.end)}`;
  });
}
