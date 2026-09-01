/**
 * TODAY — the app's centre of gravity, and the screen the daily digest
 * notification points at. Routines and events are added in Phase 2.
 */

import { el } from './dom.js';
import { digestFor } from '../core/digest.js';
import { todayKey } from '../core/time.js';
import { taskRow } from './task-row.js';

function section(title, tasks, ctx, today) {
  if (!tasks.length) return null;
  return el('div', {}, [
    el('div', { class: 'group-head label bracket', text: title }),
    el('div', { class: 'stack' }, tasks.map((t) => taskRow(ctx, t, today))),
  ]);
}

export function renderToday(ctx) {
  // Today's key comes from the clock, never from the data. Deriving it from the
  // first due task would be undefined on an empty list and wrong on a stale one.
  const today = todayKey(ctx.now);
  const digest = digestFor(ctx.doc, ctx.now);

  const sections = [
    section('Overdue', digest.overdue, ctx, today),
    section('Due today', digest.dueToday, ctx, today),
  ].filter(Boolean);

  return el('div', { class: 'screen' }, [
    el('div', { class: 'screen-head' }, [
      el('span', { class: sections.length ? 'mark live' : 'mark' }),
      el('span', { class: 'screen-title', text: 'Today' }),
    ]),
    ...(sections.length ? sections : [el('p', { class: 'empty label', text: 'Nothing due' })]),
  ]);
}
