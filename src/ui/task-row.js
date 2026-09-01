import { el } from './dom.js';
import { dueState } from '../core/tasks.js';
import { formatDayLabel } from '../core/time.js';

/** One task, as it appears on both TASKS and TODAY. Shared so the two screens
 *  cannot drift into rendering the same record two different ways. */
export function taskRow(ctx, task, today) {
  const done = task.status === 'done';
  return el('div', {
    class: `task-row${done ? ' is-done' : ''}`,
    attrs: {
      'data-task': task.id,
      'data-due': dueState(task, today),
      'data-priority': task.priority,
      // Carried so the list can show an in-progress task as in-progress.
      // Without it, DOING is settable in the editor and invisible everywhere else.
      'data-status': task.status,
    },
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
      class: 'task-name', attrs: { type: 'button' }, text: task.name,
      on: { click: () => ctx.actions.openTask(task.id) },
    }),
    task.dueKey ? el('span', { class: 'task-due mono', text: formatDayLabel(task.dueKey) }) : null,
  ]);
}
