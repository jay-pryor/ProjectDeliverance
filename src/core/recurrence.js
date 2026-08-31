/**
 * Recurrence rules, shared by routines and calendar events.
 *
 * Pure and clock-free: every function takes date keys, so there is no hidden
 * "now" to freeze in a test and nothing that drifts between calls.
 *
 * Awkward dates SKIP rather than clamp. "Day 31" does not occur in February,
 * and "fifth Thursday" does not occur in most months. Clamping to the 28th or
 * to the fourth Thursday would silently move a date the user pinned, and the
 * only way to notice would be to check by hand — which is exactly the work the
 * feature exists to remove.
 */

import { dateKey, parseDateKey, addDays, DAY_NAMES } from './time.js';

export const RULE_KINDS = ['once', 'daily', 'weekly', 'monthly'];

/** Monday-first weekday index. `getDay()` is Sunday-first, so shift it. */
export function weekdayOf(key) {
  const d = parseDateKey(key);
  return d ? (d.getDay() + 6) % 7 : null;
}

export function defaultRule(todayKey) {
  const day = weekdayOf(todayKey);
  return { kind: 'weekly', days: day === null ? [] : [day] };
}

function withinBounds(rule, key) {
  if (rule.from && key < rule.from) return false;
  if (rule.until && key > rule.until) return false;
  return true;
}

/** Date key of the `nth` `weekday` of the month containing `key`, or null. */
function nthWeekdayOfMonth(key, nth, weekday) {
  const d = parseDateKey(key);
  if (!d) return null;
  const year = d.getFullYear();
  const month = d.getMonth();

  const hits = [];
  const walk = new Date(year, month, 1);
  while (walk.getMonth() === month) {
    if ((walk.getDay() + 6) % 7 === weekday) hits.push(dateKey(walk));
    walk.setDate(walk.getDate() + 1);
  }
  if (!hits.length) return null;
  // -1 is "last", which always exists. A positive nth beyond the end does not.
  return nth < 0 ? hits[hits.length + nth] || null : hits[nth - 1] || null;
}

/**
 * Does `rule` fire on `key`?
 * @param {object|null} rule
 * @param {string} key  "YYYY-MM-DD"
 */
export function occursOn(rule, key) {
  if (!rule || typeof rule !== 'object') return false;
  const date = parseDateKey(key);
  if (!date) return false;
  if (!withinBounds(rule, key)) return false;

  if (rule.kind === 'once') return !!rule.date && rule.date === key;

  if (rule.kind === 'daily') {
    const every = Math.max(1, Math.round(Number(rule.every) || 1));
    const anchor = parseDateKey(rule.from);
    if (!anchor) return false;
    if (key < rule.from) return false;
    // Whole days between two local midnights. Both ends are midnight, so no
    // DST shift can push this off an integer.
    const days = Math.round((date - anchor) / 86400000);
    return days >= 0 && days % every === 0;
  }

  if (rule.kind === 'weekly') {
    const days = Array.isArray(rule.days) ? rule.days : [];
    return days.includes(weekdayOf(key));
  }

  if (rule.kind === 'monthly') {
    // `every` counts whole months from `from`. Absent, 1, or anchorless all mean
    // "every month" — which is exactly what every rule written before this
    // existed means, so no saved rule changes behaviour. An anchorless `every`
    // degrades to 1 rather than never firing: silently switching a rule off is
    // the worse failure of the two.
    const every = Math.max(1, Math.round(Number(rule.every) || 1));
    if (every > 1 && rule.from) {
      const anchor = parseDateKey(rule.from);
      if (!anchor) return false;
      const months = (date.getFullYear() - anchor.getFullYear()) * 12
                   + (date.getMonth() - anchor.getMonth());
      if (months < 0 || months % every !== 0) return false;
    }
    if (Number.isFinite(rule.day)) return date.getDate() === Math.round(rule.day);
    if (!Number.isFinite(rule.nth) || !Number.isFinite(rule.weekday)) return false;
    return nthWeekdayOfMonth(key, Math.round(rule.nth), Math.round(rule.weekday)) === key;
  }

  return false;
}

const ORDINALS = { 1: 'First', 2: 'Second', 3: 'Third', 4: 'Fourth', 5: 'Fifth', '-1': 'Last' };

/** The rule in words, for a card, a tooltip or a list row. */
export function describeRule(rule) {
  if (!rule || typeof rule !== 'object') return 'No schedule';

  if (rule.kind === 'once') return rule.date ? `Once on ${rule.date}` : 'No date set';

  if (rule.kind === 'daily') {
    if (!rule.from) return 'Never — no start date set';
    const every = Math.max(1, Math.round(Number(rule.every) || 1));
    return every === 1 ? 'Every day' : `Every ${every} days`;
  }

  if (rule.kind === 'weekly') {
    const days = (Array.isArray(rule.days) ? rule.days : []).slice().sort((a, b) => a - b);
    if (!days.length) return 'Never — no days chosen';
    return `Every ${days.map((d) => DAY_NAMES[d]).join(', ')}`;
  }

  if (rule.kind === 'monthly') {
    const every = Math.max(1, Math.round(Number(rule.every) || 1));
    const day = DAY_NAMES[rule.weekday] || 'Mon';
    const ordinal = ORDINALS[String(Math.round(rule.nth))] || 'First';
    if (every > 1) {
      return Number.isFinite(rule.day)
        ? `Every ${every} months on day ${Math.round(rule.day)}`
        : `Every ${every} months on the ${ordinal.toLowerCase()} ${day}`;
    }
    if (Number.isFinite(rule.day)) return `Day ${Math.round(rule.day)} of the month`;
    return `${ordinal} ${day} of the month`;
  }

  return 'No schedule';
}

/**
 * The first date strictly after `afterKey` on which `rule` fires, or null.
 *
 * A forward scan, the same technique `nextRoutineDue` already uses. The bound is
 * generous enough for every rule this module can express — the longest gap a
 * monthly rule can produce is "day 31, every 12 months", comfortably under 400
 * days — and returning null past it is the honest answer for a rule that can
 * never fire at all, such as "day 32". Looping until it found one would hang.
 */
export function nextOccurrence(rule, afterKey) {
  if (!rule || typeof rule !== 'object') return null;
  let key = addDays(afterKey, 1);
  for (let i = 0; i < 400; i++) {
    if (occursOn(rule, key)) return key;
    key = addDays(key, 1);
  }
  return null;
}
