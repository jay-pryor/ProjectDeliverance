/**
 * What wants attention right now, in one place.
 *
 * Both the tab bar and the two screens read this, which is what stops a lit tab
 * and the screen behind it from disagreeing about whether anything is there.
 */

import { todayKey } from './time.js';
import { eventNotifications } from './events.js';
import { digestFor } from './digest.js';

/**
 * @returns {{today: number, calendar: number}} how many items each tab has
 */
export function attention(doc, nowMs) {
  const digest = digestFor(doc, nowMs);
  return {
    today: digest.overdue.length + digest.dueToday.length + digest.routines.length,
    calendar: eventNotifications(doc, nowMs).length,
  };
}

/** A dismissal key is `<id>:<dateKey>` or `<id>:<dateKey>:<when>`. */
const DATE_IN_KEY = /:(\d{4}-\d{2}-\d{2})(?::|$)/;

/**
 * Drop every dismissal that can no longer suppress anything.
 *
 * Routines only ever consider today, and event notifications only today and
 * tomorrow, so a key naming an earlier date is provably dead. Pruning it is
 * what keeps the list from growing for the life of the document.
 *
 * A key with no recognisable date is also dropped: it cannot match anything the
 * app generates, so keeping it would only ever be carrying junk forward.
 */
export function pruneDismissals(doc, nowMs) {
  const today = todayKey(nowMs);
  return (doc.dismissals || []).filter((key) => {
    const m = DATE_IN_KEY.exec(String(key));
    return !!m && m[1] >= today;
  });
}
