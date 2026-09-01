/**
 * CALENDAR — a month at a glance, then one day's detail.
 *
 * The grid always draws whole weeks including the days either side of the
 * month. A ragged grid changes height as you page, which makes the control you
 * just tapped move out from under your thumb.
 */

import { el } from './dom.js';
import { eventsOnDay } from '../core/events.js';
import { eventEntry } from './event-entry.js';
import { parseDateKey, addDays, todayKey, MONTH_NAMES, DAY_NAMES } from '../core/time.js';

/** Every day the grid draws: whole weeks, Monday first, covering the month. */
function gridDays(monthKey) {
  const first = parseDateKey(monthKey);
  const lead = (first.getDay() + 6) % 7;             // Monday-first offset
  let cursor = addDays(monthKey, -lead);
  const days = [];
  // Six weeks covers every month layout; trim the trailing week if unused.
  for (let i = 0; i < 42; i++) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  const month = monthKey.slice(0, 7);
  const lastUsed = days.findLastIndex((k) => k.slice(0, 7) === month);
  return days.slice(0, Math.ceil((lastUsed + 1) / 7) * 7);
}

function dayCell(ctx, key, month, today) {
  const has = eventsOnDay(ctx.doc, key).length > 0;
  return el('button', {
    class: 'cal-day',
    attrs: {
      type: 'button',
      'data-day': key,
      'data-outside': key.slice(0, 7) !== month ? 'true' : null,
      'data-today': key === today ? 'true' : null,
      'aria-pressed': key === ctx.selectedDay,
    },
    on: { click: () => ctx.actions.selectDay(key) },
  }, [
    el('span', { class: 'cal-num mono', text: String(parseDateKey(key).getDate()) }),
    has ? el('span', { class: 'mark live' }) : null,
  ]);
}

function dayDetail(ctx) {
  const key = ctx.selectedDay;
  const entries = key ? eventsOnDay(ctx.doc, key) : [];
  return el('div', { class: 'cal-day-detail' }, [
    el('div', { class: 'group-head label bracket', text: key || '' }),
    entries.length
      ? el('div', { class: 'stack' }, entries.map((entry) => eventEntry(ctx, entry)))
      : el('p', { class: 'empty label', text: 'Nothing on' }),
  ]);
}

export function renderCalendar(ctx) {
  const month = ctx.month.slice(0, 7);
  const today = todayKey(ctx.now);
  const first = parseDateKey(ctx.month);

  return el('div', { class: 'screen' }, [
    el('div', { class: 'screen-head' }, [
      el('button', {
        class: 'btn sq cal-prev', attrs: { type: 'button', 'aria-label': 'Previous month' },
        text: '‹', on: { click: () => ctx.actions.stepMonth(-1) },
      }),
      el('span', {
        class: 'screen-title cal-title',
        text: `${MONTH_NAMES[first.getMonth()]} ${first.getFullYear()}`,
      }),
      el('span', { style: { flex: '1' } }),
      el('button', {
        class: 'btn sq cal-next', attrs: { type: 'button', 'aria-label': 'Next month' },
        text: '›', on: { click: () => ctx.actions.stepMonth(1) },
      }),
      el('button', {
        class: 'btn sq add-event', attrs: { type: 'button', 'aria-label': 'New event' },
        text: '+', on: { click: () => ctx.actions.openEvent(null) },
      }),
    ]),
    el('div', { class: 'cal-grid' }, [
      ...DAY_NAMES.map((d) => el('span', { class: 'cal-dow label', text: d })),
      ...gridDays(ctx.month).map((key) => dayCell(ctx, key, month, today)),
    ]),
    dayDetail(ctx),
  ]);
}
