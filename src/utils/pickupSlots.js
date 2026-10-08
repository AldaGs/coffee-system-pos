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

// hours: { days: bitmask, start, end } | null. Returns [{ key, ms: [utc ms...] }] per local day, empty days dropped.
export function buildSlots({ now = Date.now(), tz = 'America/Mexico_City', slots, schedule }) {
  const { interval, daysAhead, leadMinutes } = { ...SLOT_DEFAULTS, ...(slots || {}) };
  const hrs = slots?.hours || schedule || {};
  const days = hrs.days || 0;
  const start = toMin(hrs.start || FALLBACK_HOURS.start);
  const end = toMin(hrs.end || FALLBACK_HOURS.end);
  const min = now + leadMinutes * 60000;
  const max = now + daysAhead * 86400000;
  const base = parts(now, tz);
  const out = [];
  for (let i = 0; i <= daysAhead + 1; i++) {
    const day = new Date(Date.UTC(base.y, base.m - 1, base.d + i));
    const [y, m, d] = [day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate()];
    if (days && !(days & (1 << ((day.getUTCDay() + 6) % 7)))) continue;
    const ms = [];
    for (let t = 0; t < 1440; t += interval) {
      const inWin = start <= end ? t >= start && t < end : t >= start || t < end;
      if (!inWin) continue;
      const u = zonedToUtc(y, m, d, Math.floor(t / 60), t % 60, tz);
      if (u >= min && u <= max) ms.push(u);
    }
    if (ms.length) out.push({ key: `${y}-${m}-${d}`, ms, today: i === 0 });
  }
  return out;
}
