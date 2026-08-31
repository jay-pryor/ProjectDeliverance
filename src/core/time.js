/**
 * Time and date arithmetic.
 *
 * Everything here is pure and local-timezone. Date keys are "YYYY-MM-DD" strings
 * built from *local* calendar components — never `toISOString()`, which silently
 * shifts the day across a UTC boundary.
 *
 * Minutes are always minutes-from-local-midnight.
 */

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                             'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

// --- formatting ------------------------------------------------------------

/** 435 → "07:15" */
export function minutesToLabel(minutes) {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** "07:15" → 435 */
export function labelToMinutes(label) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(label).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mins = Number(m[2]);
  if (h > 23 || mins > 59) return null;
  return h * 60 + mins;
}

// --- date keys -------------------------------------------------------------

/** Local calendar date → "YYYY-MM-DD". */
export function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "YYYY-MM-DD" → local Date at midnight. */
export function parseDateKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function addDays(key, n) {
  const d = parseDateKey(key);
  if (!d) return null;
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

export function isWeekend(key) {
  const d = parseDateKey(key);
  if (!d) return false;
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function dayName(key) {
  const d = parseDateKey(key);
  return d ? DAY_NAMES[(d.getDay() + 6) % 7] : '';
}

/** "Mon 16 Aug" — the compact, year-less label used in schedule chrome
 *  (transcript day headers, gantt tooltips, notifications). A year is never
 *  worth the width it costs here. */
export function formatDayLabel(key) {
  const d = parseDateKey(key);
  if (!d) return key;
  return `${dayName(key)} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

export function todayKey(now = Date.now()) {
  return dateKey(new Date(now));
}
