/**
 * Routines — the things you do on a schedule, and whether one wants you now.
 *
 * Nothing here is stored when a routine fires. A routine is active because the
 * clock says so, not because anything was written at 07:00, which is what makes
 * "active" survive the app not having been open at the time.
 */

import { makeId, nextRef } from './ids.js';
import { todayKey, addDays, minutesToLabel } from './time.js';
import { occursOn, describeRule } from './recurrence.js';

/** Defaults for a record read back from disk. Exported for migration. */
export const ROUTINE_FIELDS = {
  name: 'New routine',
  steps: [],
  rule: null,
  timeMin: 7 * 60,
  archived: false,
};

export function createRoutine(doc, fields = {}, { now = Date.now } = {}) {
  return {
    ...ROUTINE_FIELDS,
    id: makeId('rtn', now),
    ref: nextRef(doc, 'routine', 'R'),
    createdAt: now(),
    ...fields,
  };
}

export const liveRoutines = (doc) => (doc.routines || []).filter((r) => r && !r.archived);

/** The dismissal key for one routine on one day. */
export const routineKey = (routine, dateKey) => `${routine.id}:${dateKey}`;

/**
 * Which routines want attention right now.
 *
 * Only *today's* occurrence is ever considered, which is what makes "expires at
 * the end of its own day" a property of the model rather than a rule somebody
 * has to remember to enforce: yesterday's routine cannot be active, because
 * yesterday is not today.
 */
export function activeRoutines(doc, nowMs) {
  const key = todayKey(nowMs);
  const at = new Date(nowMs);
  const minutes = at.getHours() * 60 + at.getMinutes();
  const dismissed = new Set(doc.dismissals || []);

  return liveRoutines(doc)
    .filter((r) => occursOn(r.rule, key))
    .filter((r) => minutes >= (Number(r.timeMin) || 0))
    .filter((r) => !dismissed.has(routineKey(r, key)))
    .map((routine) => ({ routine, key: routineKey(routine, key) }));
}

/**
 * The soonest routine still to come, so an empty screen can say when rather
 * than showing a blank box. Looks 60 days ahead and then gives up.
 */
export function nextRoutineDue(doc, nowMs) {
  const at = new Date(nowMs);
  const minutes = at.getHours() * 60 + at.getMinutes();
  let key = todayKey(nowMs);

  for (let i = 0; i < 60; i++) {
    const due = liveRoutines(doc)
      .filter((r) => occursOn(r.rule, key))
      // Today, only what has not already gone past counts as still to come.
      .filter((r) => i > 0 || (Number(r.timeMin) || 0) > minutes)
      .sort((a, b) => (a.timeMin || 0) - (b.timeMin || 0))[0];
    if (due) return { routine: due, dateKey: key };
    key = addDays(key, 1);
  }
  return null;
}

/** "07:00 · Every Mon, Wed" — the whole schedule on one line. */
export function describeRoutine(routine) {
  return `${minutesToLabel(routine.timeMin || 0)} · ${describeRule(routine.rule)}`;
}

/**
 * Repair a saved `routines` array for `migrate`: drop anything unidentifiable,
 * fill in defaults for fields added after a record was first written. Mirrors
 * `repairHierarchy` and `upgradeProject` — the owning module carries its own
 * repair rules rather than `schema.js` reaching in and duplicating them.
 */
export function repairRoutines(list) {
  return (Array.isArray(list) ? list : [])
    .filter((r) => r && r.id)
    .map((r) => ({
      ...ROUTINE_FIELDS,
      ...r,
      // Not String(r.name || ''): an object is truthy, so `|| ''` would not
      // catch it, and String({}) reads back as the literal "[object Object]".
      name: (typeof r.name === 'string' ? r.name.trim() : '') || ROUTINE_FIELDS.name,
      steps: Array.isArray(r.steps) ? r.steps.map((s) => String(s)) : [],
      timeMin: Number.isFinite(r.timeMin) ? r.timeMin : ROUTINE_FIELDS.timeMin,
      archived: !!r.archived,
    }));
}
