/**
 * What today holds — one answer, read by both the TODAY screen and the daily
 * digest notification.
 *
 * Sharing it is the point. If the screen and the notification each worked out
 * "what is due" for themselves they would eventually disagree, and the one you
 * would trust is the one you could see, which is the wrong one to be wrong.
 *
 * Pure. Routines and events are filled in during Phase 2; the shape is fixed
 * now so Phase 3 can be written against a stable contract.
 *
 * @returns {{overdue: object[], dueToday: object[], routines: object[], events: object[]}}
 */

import { liveTasks, dueState } from './tasks.js';
import { todayKey } from './time.js';
import { activeRoutines } from './routines.js';
import { eventsOnDay } from './events.js';

export function digestFor(doc, nowMs) {
  const today = todayKey(nowMs);
  const tasks = liveTasks(doc);

  const overdue = tasks
    .filter((t) => dueState(t, today) === 'overdue')
    // Oldest first: the thing that has been waiting longest is the thing most
    // likely to have been forgotten.
    .sort((a, b) => a.dueKey.localeCompare(b.dueKey));

  const dueToday = tasks.filter((t) => dueState(t, today) === 'today');

  return {
    overdue,
    dueToday,
    // Only what is due *now* — the routine module's own definition, which is
    // why a routine you have not reached yet does not clutter the screen.
    routines: activeRoutines(doc, nowMs),
    // Every event covering today, including one that started earlier in its span.
    events: eventsOnDay(doc, today),
  };
}
