/**
 * The TASKS screen: everything outstanding, grouped by project.
 *
 * No saved views, filters, sorts or colour rules — the reference app's whole
 * property system. On a phone, configuring a view costs more than scrolling
 * past what it would have hidden.
 */

import { el } from './dom.js';
import { liveTasks, groupByProject, dueState } from '../core/tasks.js';
import { todayKey, formatDayLabel } from '../core/time.js';

const FILTERS = [
  ['open', 'Open'],
  ['all', 'All'],
];

function filterChips(ctx) {
  return el('div', { class: 'chips' }, FILTERS.map(([id, label]) => el('button', {
    class: 'chip',
    attrs: { type: 'button', 'aria-pressed': (ctx.filter || 'open') === id },
    text: label,
    on: { click: () => ctx.actions.setFilter(id) },
  })));
}

function taskRow(ctx, task, today) {
  const done = task.status === 'done';
  return el('div', {
    class: `task-row${done ? ' is-done' : ''}`,
    attrs: { 'data-task': task.id, 'data-due': dueState(task, today), 'data-priority': task.priority },
  }, [
    el('button', {
      class: 'task-check',
      attrs: {
        type: 'button',
        'aria-label': done ? `Reopen ${task.name}` : `Complete ${task.name}`,
        'aria-pressed': done,
      },
      on: { click: () => ctx.actions.toggleDone(task.id) },
    }, [el('span', { class: 'mark' })]),
    el('button', {
      class: 'task-name',
      attrs: { type: 'button' },
      text: task.name,
      on: { click: () => ctx.actions.openTask(task.id) },
    }),
    task.dueKey
      ? el('span', { class: 'task-due mono', text: formatDayLabel(task.dueKey) })
      : null,
  ]);
}

export function renderTasks(ctx) {
  const today = todayKey(ctx.now);
  const all = liveTasks(ctx.doc);
  const shown = (ctx.filter || 'open') === 'all' ? all : all.filter((t) => t.status !== 'done');
  const groups = groupByProject(ctx.doc, shown);

  return el('div', { class: 'screen' }, [
    el('div', { class: 'screen-head' }, [
      el('span', { class: shown.length ? 'mark live' : 'mark' }),
      el('span', { class: 'screen-title', text: 'Tasks' }),
      el('span', { style: { flex: '1' } }),
      filterChips(ctx),
      el('button', {
        class: 'btn sq add-task',
        attrs: { type: 'button', 'aria-label': 'New task' },
        text: '+',
        on: { click: () => ctx.actions.openTask(null) },
      }),
    ]),
    ...(groups.length
      ? groups.flatMap((group) => [
          el('div', { class: 'group-head label bracket', text: group.name }),
          el('div', { class: 'stack' }, group.tasks.map((t) => taskRow(ctx, t, today))),
        ])
      : [el('p', { class: 'empty label', text: 'Nothing outstanding' })]),
  ]);
}
