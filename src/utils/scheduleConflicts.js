// Detect overlapping schedules between active non-live menus. The resolver
// resolves overlaps by priority + created_at, so an overlap is never an
// error — it's an administrative decision worth flagging so the owner
// double-checks which menu wins.
//
// A no-schedule menu is treated as "always on" (matches every weekday + the
// full day + an open date range), mirroring the SQL resolver in
// get_active_menu().

const FULL_DAY = 24 * 60;
const ALL_DAYS = (1 << 7) - 1;     // 0b1111111

// Parse 'HH:MM' or 'HH:MM:SS' → minutes since midnight. null/empty → null.
function toMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

// Returns the time window as one or two [start, end) intervals in minutes.
// null/null → the full day. Wraparound (start > end) splits into two.
function timeIntervals(start, end) {
  const a = toMinutes(start);
  const b = toMinutes(end);
  if (a == null && b == null) return [[0, FULL_DAY]];
  if (a == null) return [[0, b]];
  if (b == null) return [[a, FULL_DAY]];
  if (a < b) return [[a, b]];
  if (a > b) return [[a, FULL_DAY], [0, b]];
  return []; // a === b ≠ null — empty window
}

function intervalsOverlap(aList, bList) {
  for (const [as, ae] of aList) {
    for (const [bs, be] of bList) {
      if (as < be && bs < ae) return true;
    }
  }
  return false;
}

function dayMask(days) {
  return (days == null || days === 0) ? ALL_DAYS : (days & ALL_DAYS);
}

function dateRangesOverlap(a, b) {
  // a.start <= b.end AND b.start <= a.end, treating nulls as infinity.
  const aStart = a.start_date || null;
  const aEnd   = a.end_date   || null;
  const bStart = b.start_date || null;
  const bEnd   = b.end_date   || null;
  if (aEnd != null && bStart != null && aEnd < bStart) return false;
  if (bEnd != null && aStart != null && bEnd < aStart) return false;
  return true;
}

function schedulesOverlap(s1, s2) {
  if ((dayMask(s1.days_of_week) & dayMask(s2.days_of_week)) === 0) return false;
  if (!dateRangesOverlap(s1, s2)) return false;
  return intervalsOverlap(
    timeIntervals(s1.start_time, s1.end_time),
    timeIntervals(s2.start_time, s2.end_time)
  );
}

// Synthesize an "always-on" schedule for menus that have none — matches the
// SQL behavior where a menu with zero schedule rows is treated as always on.
function effectiveSchedules(menu) {
  return menu.schedules.length === 0
    ? [{ days_of_week: 0, start_time: null, end_time: null, start_date: null, end_date: null }]
    : menu.schedules;
}

// Returns pairs of menus that overlap. Only considers active, non-live
// menus — the catalog is the always-on fallback at priority 0, so it
// "overlapping" with anything is expected and not worth flagging.
//
// Result: [{ a, b, winner, sharedPriority }]
//   winner: the menu the resolver would pick (higher priority, then newer
//   created_at). null when both are the same — not currently possible since
//   priority ties break by created_at.
export function findScheduleConflicts(menus) {
  const candidates = menus.filter(m => m.is_active && m.kind !== 'live');
  const conflicts = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      const aSchedules = effectiveSchedules(a);
      const bSchedules = effectiveSchedules(b);
      let overlap = false;
      outer: for (const s1 of aSchedules) {
        for (const s2 of bSchedules) {
          if (schedulesOverlap(s1, s2)) { overlap = true; break outer; }
        }
      }
      if (!overlap) continue;
      const winner = resolveWinner(a, b);
      conflicts.push({ a, b, winner, sharedPriority: a.priority === b.priority });
    }
  }
  return conflicts;
}

function resolveWinner(a, b) {
  if (a.priority !== b.priority) return a.priority > b.priority ? a : b;
  // Same priority — newer wins (matches ORDER BY created_at DESC in SQL).
  return (a.created_at || '') >= (b.created_at || '') ? a : b;
}
