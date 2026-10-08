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
