/**
 * What notifications should exist — the single chokepoint.
 *
 * One pure function answers "given this document and this moment, what should
 * Android be holding?". The platform layer diffs that answer against what is
 * actually pending and cancels or creates the difference. Nothing else in the
 * app talks to the notification system, so routines, events and the digest
 * cannot end up disagreeing about what is scheduled.
 *
 * Being pure is the point: the whole notification design is testable in Node
 * with no phone, no emulator and no Capacitor.
 *
 * NOTE the difference from the panel functions. `activeRoutines()` and
 * `eventNotifications()` answer "what should be on screen now" — today, or today
 * and tomorrow. AlarmManager needs "at which future instants should something
 * fire", which is a different question, so this is built directly on
 * `occursOn()` rather than wrapping them.
 */

import { occursOn } from './recurrence.js';
import { liveRoutines, routineKey } from './routines.js';
import { liveEvents } from './events.js';
import { liveTasks, dueState } from './tasks.js';
import { todayKey, addDays, parseDateKey, minutesToLabel } from './time.js';

/**
 * How far ahead to schedule.
 *
 * A `daily` rule is an infinite series and Android caps pending alarms, so the
 * expansion has to stop somewhere. Fourteen days is far past any plausible gap
 * between app opens, and the window is recomputed on every open and once a day,
 * so it is self-healing: a missed recompute costs nothing until day 15.
 */
export const WINDOW_DAYS = 14;

/**
 * Separate Android channels, so the digest can be muted in the system settings
 * without also losing routine alerts. Free to do now, annoying to retrofit.
 */
export const CHANNELS = { ROUTINES: 'routines', EVENTS: 'events', DIGEST: 'digest' };

/**
 * Local epoch millis for `minutes` past midnight on `dateKey`.
 *
 * `setHours` rather than `midnight + minutes * 60000`: on a DST transition day
 * the arithmetic version is an hour out, which would send the morning routine
 * at 06:00 twice a year.
 */
export function instantAt(dateKey, minutes) {
  const d = parseDateKey(dateKey);
  if (!d) return NaN;
  d.setHours(0, Math.round(minutes), 0, 0);
  return d.getTime();
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The days the window covers, today first. */
function windowKeys(nowMs, windowDays) {
  const start = todayKey(nowMs);
  return Array.from({ length: windowDays }, (_, i) => addDays(start, i));
}

function routineNotifications(doc, key, dismissed) {
  const out = [];
  for (const routine of liveRoutines(doc)) {
    if (!occursOn(routine.rule, key)) continue;
    if (dismissed.has(routineKey(routine, key))) continue;
    out.push({
      id: `rtn:${routine.id}:${key}`,
      channel: CHANNELS.ROUTINES,
      fireAt: instantAt(key, Number(routine.timeMin) || 0),
      title: routine.name,
      body: routine.steps.length
        ? `${plural(routine.steps.length, 'step')} — ${routine.steps[0]}`
        : 'Due now',
    });
  }
  return out;
}

function eventNotificationsFor(doc, key, defaultLead) {
  const out = [];
  for (const event of liveEvents(doc)) {
    // Start days only. A multi-day visit that renewed its own alert every
    // morning would train you to ignore the channel.
    if (!occursOn(event.rule, key)) continue;
    // An all-day event has no time to fire at, and inventing one would be a
    // guess. The daily digest carries it instead.
    if (!Number.isFinite(event.startMin)) continue;

    const lead = Number.isFinite(event.leadMin) ? event.leadMin : defaultLead;
    out.push({
      id: `evt:${event.id}:${key}`,
      channel: CHANNELS.EVENTS,
      fireAt: instantAt(key, event.startMin - lead),
      title: event.name,
      body: lead > 0
        ? `Starts at ${minutesToLabel(event.startMin)}`
        : `Starting now — ${minutesToLabel(event.startMin)}`,
    });
  }
  return out;
}

/**
 * What that day is *known* to hold, at the time of scheduling.
 *
 * Necessarily a forecast: a local notification carries its text from the moment
 * it is scheduled, and something added tomorrow cannot be in a body written
 * today. Recomputing the window on every app open bounds the staleness to "since
 * you last opened the app", which is the best a local notification can do
 * without a server.
 */
function digestBody(doc, key, today) {
  const tasks = liveTasks(doc);
  const overdue = tasks.filter((t) => dueState(t, today) === 'overdue').length;
  const due = tasks.filter((t) => t.status !== 'done' && t.dueKey === key).length;
  const routines = liveRoutines(doc).filter((r) => occursOn(r.rule, key)).length;
  const events = liveEvents(doc).filter((e) => occursOn(e.rule, key)).length;

  const parts = [];
  if (due) parts.push(plural(due, 'task'));
  if (routines) parts.push(plural(routines, 'routine'));
  if (events) parts.push(plural(events, 'event'));
  if (overdue) parts.push(`${overdue} overdue`);

  return parts.length ? parts.join(', ') : 'Nothing due';
}

/**
 * Every notification that should be pending, soonest first.
 *
 * Ids are stable for the same occurrence across calls — that is what lets the
 * platform layer diff rather than cancel-and-recreate everything, which would
 * make a notification briefly disappear from the shade on every app open.
 *
 * @param {object} doc
 * @param {number} nowMs
 * @param {{windowDays?: number}} [opts]
 * @returns {Array<{id: string, channel: string, fireAt: number, title: string, body: string}>}
 */
export function scheduleFor(doc, nowMs, { windowDays = WINDOW_DAYS } = {}) {
  if (!doc) return [];
  const today = todayKey(nowMs);
  const dismissed = new Set(doc.dismissals || []);
  const settings = doc.settings || {};
  const defaultLead = Number.isFinite(settings.eventLeadMin) ? settings.eventLeadMin : 15;
  const digest = settings.digest || {};

  const out = [];
  for (const key of windowKeys(nowMs, windowDays)) {
    out.push(...routineNotifications(doc, key, dismissed));
    out.push(...eventNotificationsFor(doc, key, defaultLead));
    if (digest.enabled) {
      out.push({
        id: `dig:${key}`,
        channel: CHANNELS.DIGEST,
        fireAt: instantAt(key, Number(digest.timeMin) || 0),
        title: 'Today',
        body: digestBody(doc, key, today),
      });
    }
  }

  // Anything already past is dropped rather than fired late. A notification for
  // 07:00 delivered at 09:00 is worse than none: it reports a moment that has
  // gone, and teaches you the times cannot be trusted.
  return out
    .filter((n) => Number.isFinite(n.fireAt) && n.fireAt > nowMs)
    .sort((a, b) => a.fireAt - b.fireAt);
}
