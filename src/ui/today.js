/**
 * TODAY — the app's centre of gravity, and the screen the daily digest
 * notification points at. Routines and events are added in Phase 2.
 */

import { el } from './dom.js';
import { digestFor } from '../core/digest.js';
import { todayKey, minutesToLabel } from '../core/time.js';
import { taskRow } from './task-row.js';
import { describeRoutine, nextRoutineDue } from '../core/routines.js';

function section(title, tasks, ctx, today) {
  if (!tasks.length) return null;
  return el('div', {}, [
    el('div', { class: 'group-head label bracket', text: title }),
    el('div', { class: 'stack' }, tasks.map((t) => taskRow(ctx, t, today))),
  ]);
}

function routineCard(ctx, { routine, key }) {
  return el('div', { class: 'routine-card bracket', attrs: { 'data-routine': routine.id } }, [
    el('div', { class: 'routine-head' }, [
      el('span', { class: 'mark live' }),
      el('button', {
        class: 'routine-name', attrs: { type: 'button' }, text: routine.name,
        on: { click: () => ctx.actions.openRoutine(routine.id) },
      }),
      el('span', { class: 'mono routine-time', text: minutesToLabel(routine.timeMin) }),
      el('button', {
        class: 'btn sq routine-dismiss',
        attrs: { type: 'button', 'aria-label': `Dismiss ${routine.name}` },
        text: '×',
        on: { click: () => ctx.actions.dismissRoutine(key) },
      }),
    ]),
    routine.steps.length
      ? el('ol', { class: 'routine-steps' },
          routine.steps.map((s) => el('li', { class: 'routine-step', text: s })))
      : null,
  ]);
}

/** With nothing due, say when rather than showing a blank box. */
function upcomingRoutine(ctx) {
  const next = nextRoutineDue(ctx.doc, ctx.now);
  if (!next) return null;
  return el('p', {
    class: 'empty label',
    text: `Next: ${next.routine.name} — ${describeRoutine(next.routine)}`,
  });
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

  const routines = digest.routines.length
    ? el('div', {}, [
        el('div', { class: 'group-head label bracket', text: 'Routines' }),
        el('div', { class: 'stack' }, digest.routines.map((r) => routineCard(ctx, r))),
      ])
    : upcomingRoutine(ctx);

  const body = [routines, ...sections].filter(Boolean);

  return el('div', { class: 'screen' }, [
    el('div', { class: 'screen-head' }, [
      el('span', { class: (sections.length || digest.routines.length) ? 'mark live' : 'mark' }),
      el('span', { class: 'screen-title', text: 'Today' }),
      el('span', { style: { flex: '1' } }),
      el('button', {
        class: 'btn sq add-routine', attrs: { type: 'button', 'aria-label': 'New routine' },
        text: '+', on: { click: () => ctx.actions.openRoutine(null) },
      }),
    ]),
    ...(body.length ? body : [el('p', { class: 'empty label', text: 'Nothing due' })]),
  ]);
}
