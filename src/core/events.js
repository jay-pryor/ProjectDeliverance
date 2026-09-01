/**
 * Calendar events: dated things that are not tasks.
 *
 * An event's rule gives its *start* days; `spanDays` carries it forward from
 * there, so "Peter visiting Tuesday to Thursday" is one record rather than
 * three, and stays one record if it ever becomes recurring.
 */

import { makeId, nextRef } from './ids.js';
import { todayKey, addDays, minutesToLabel } from './time.js';
import { occursOn } from './recurrence.js';

/** Defaults for a record read back from disk. Exported for migration. */
export const EVENT_FIELDS = {
  name: 'New event',
  detail: '',
  rule: null,
  /** null means all-day. */
  startMin: null,
  endMin: null,
  /** 0 is a single-day event; 2 means it ends two days after it starts. */
  spanDays: 0,
  /** Minutes before the start to notify. Null falls back to
   *  settings.eventLeadMin, so changing the default moves every event that
   *  never asked for something different. */
  leadMin: null,
  archived: false,
};

/** Longest span the month grid will trace back for. A quarter is plenty. */
export const MAX_SPAN = 92;

export function createEvent(doc, fields = {}, { now = Date.now } = {}) {
  return {
    ...EVENT_FIELDS,
    id: makeId('evt', now),
    ref: nextRef(doc, 'event', 'C'),
    createdAt: now(),
    ...fields,
  };
}

export const liveEvents = (doc) => (doc.events || []).filter((e) => e && !e.archived);

export const spanOf = (event) => Math.min(MAX_SPAN,
  Math.max(0, Math.round(Number(event.spanDays) || 0)));

/** The dismissal key for one notification about one occurrence. */
export const eventKey = (event, dateKey, when) => `${event.id}:${dateKey}:${when}`;

/**
 * Every event covering `dateKey`, whether it starts there or ran into it.
 *
 * `dayIndex` is how far into the span this day is, so the grid can draw a
 * three-day visit as a continuous bar rather than three unrelated entries.
 *
 * @returns {Array<{event: object, startKey: string, dayIndex: number, span: number}>}
 */
export function eventsOnDay(doc, dateKey) {
  const out = [];
  for (const event of liveEvents(doc)) {
    const span = spanOf(event);
    // Walk back over the span: a day is covered if any of the days it could
    // have started on is a start day.
    for (let back = 0; back <= span; back++) {
      const startKey = addDays(dateKey, -back);
      if (!startKey || !occursOn(event.rule, startKey)) continue;
      out.push({ event, startKey, dayIndex: back, span });
      break;
    }
  }
  return out;
}

/** "14:00–16:00", "14:00", or "All day". */
export function describeEventTime(event) {
  if (!Number.isFinite(event.startMin)) return 'All day';
  const start = minutesToLabel(event.startMin);
  return Number.isFinite(event.endMin) ? `${start}–${minutesToLabel(event.endMin)}` : start;
}

/**
 * What the notifications panel should be showing.
 *
 * Fires on an event's START day only — for today, and on the day before. A
 * visit that began yesterday is not news, and a three-day event that renewed
 * its own notification every morning would train you to ignore the panel.
 *
 * The key carries `today` or `tomorrow`, so dismissing the warning the day
 * before does not also suppress the reminder on the morning itself: they are
 * two different pieces of news about the same event.
 */
export function eventNotifications(doc, nowMs) {
  const dismissed = new Set(doc.dismissals || []);
  const today = todayKey(nowMs);
  const tomorrow = addDays(today, 1);
  const out = [];

  for (const [dateKey, when] of [[today, 'today'], [tomorrow, 'tomorrow']]) {
    for (const event of liveEvents(doc)) {
      if (!occursOn(event.rule, dateKey)) continue;
      const key = eventKey(event, dateKey, when);
      if (dismissed.has(key)) continue;
      out.push({ event, dateKey, when, key });
    }
  }
  return out;
}

/**
 * Repair a saved `events` array for `migrate`: drop anything unidentifiable,
 * fill in defaults for fields added after a record was first written. Mirrors
 * `repairHierarchy` and `upgradeProject` — the owning module carries its own
 * repair rules rather than `schema.js` reaching in and duplicating them.
 */
export function repairEvents(list) {
  return (Array.isArray(list) ? list : [])
    .filter((e) => e && e.id)
    .map((e) => ({
      ...EVENT_FIELDS,
      ...e,
      // Not String(e.name || ''): an object is truthy, so `|| ''` would not
      // catch it, and String({}) reads back as the literal "[object Object]".
      name: (typeof e.name === 'string' ? e.name.trim() : '') || EVENT_FIELDS.name,
      detail: typeof e.detail === 'string' ? e.detail
        : (e.detail && typeof e.detail === 'object' ? '' : String(e.detail ?? '')),
      spanDays: Math.min(MAX_SPAN, Math.max(0, Math.round(Number(e.spanDays) || 0))),
      leadMin: Number.isFinite(e.leadMin) ? Math.max(0, Math.round(e.leadMin)) : null,
      archived: !!e.archived,
    }));
}
