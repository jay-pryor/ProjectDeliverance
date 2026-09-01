import { el } from './dom.js';
import { describeEventTime } from '../core/events.js';

/**
 * One event, as it appears on both CALENDAR's day panel and TODAY. Shared so
 * the two screens cannot drift into rendering the same record two different
 * ways — the same reason `taskRow` exists.
 *
 * @param {object} ctx
 * @param {{event: object, dayIndex: number, span: number}} entry  from `eventsOnDay`
 */
export function eventEntry(ctx, { event, dayIndex, span }) {
  return el('button', {
    class: 'cal-entry', attrs: { type: 'button', 'data-event': event.id },
    on: { click: () => ctx.actions.openEvent(event.id) },
  }, [
    el('span', { class: 'cal-entry-name', text: event.name }),
    // Only for a span: "Day 1 of 1" on every single-day event would be noise.
    span > 0
      ? el('span', { class: 'label', text: `Day ${dayIndex + 1} of ${span + 1}` })
      : null,
    el('span', { class: 'cal-entry-time mono', text: describeEventTime(event) }),
  ]);
}
