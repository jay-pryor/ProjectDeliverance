/**
 * The task editor — a full-height sheet over the screen.
 *
 * A sheet rather than a separate route: the list underneath stays where it was,
 * so closing the editor never costs a scroll position. Nothing is written to the
 * document until Save, which is what makes Cancel free rather than an undo.
 */

import { el } from './dom.js';
import { liveProjects, PRIORITIES, STATUSES, TASK_FIELDS } from '../core/tasks.js';

/** Sentence-case for the three status ids, which are stored lowercase. */
const STATUS_LABELS = { todo: 'To do', doing: 'Doing', done: 'Done' };

/**
 * The value of the trailing "make one" option.
 *
 * Real project ids are `prj_`-prefixed, so this can never collide with one —
 * which matters because the select's value is read straight into `task.project`
 * on save, and a sentinel that got through would be a dangling reference to a
 * project that does not exist.
 */
const NEW_PROJECT = '__new__';

function field(label, control) {
  return el('label', { class: 'field' }, [
    el('span', { class: 'label', text: label }),
    control,
  ]);
}

export function renderTaskEditor(ctx, task) {
  const form = el('form', { class: 'editor', attrs: { novalidate: true } });

  const name = el('input', {
    attrs: { name: 'name', type: 'text', value: task ? task.name : '',
             placeholder: 'What needs doing', autocomplete: 'off' },
  });

  const project = el('select', { attrs: { name: 'project' } }, [
    el('option', { attrs: { value: '', selected: !task?.project }, text: 'No project' }),
    ...liveProjects(ctx.doc).map((p) => el('option', {
      attrs: { value: p.id, selected: task?.project === p.id }, text: p.name,
    })),
    el('option', { attrs: { value: NEW_PROJECT }, text: '+ New project…' }),
  ]);

  // Inline rather than a separate screen: a project is worth creating at the
  // moment you are filing a task and realise it needs a home, and a detour to
  // make one first is how the thought gets lost. Nothing is created here — the
  // name rides along on the patch and `saveTask` makes the project in the same
  // document transform as the task, so neither can exist without the other.
  const newProject = el('input', {
    attrs: { name: 'newProject', type: 'text',
             placeholder: 'Project name', autocomplete: 'off' },
  });
  const newProjectField = field('New project', newProject);
  newProjectField.classList.add('new-project-field');
  // `hidden`, not display:none — it takes the field out of the accessibility
  // tree and out of tab order too, so a name box nobody asked for is not
  // something a keyboard or a screen reader can land in.
  newProjectField.hidden = true;
  project.addEventListener('change', () => {
    const wanted = project.value === NEW_PROJECT;
    newProjectField.hidden = !wanted;
    // Choosing the option IS the request to name one; making the user find and
    // tap the box as well would be a second tap for nothing.
    if (wanted) newProject.focus();
  });

  // A segmented control rather than a select: three options is few enough to
  // show at once, and status is the field most likely to be changed on the way
  // past — one tap beats open-pick-close. Squares, not pills, per the palette.
  let status = task?.status || 'todo';
  const statusControl = el('div', {
    class: 'seg', attrs: { role: 'group', 'aria-label': 'Status' },
  }, STATUSES.map((id) => el('button', {
    class: 'seg-btn',
    attrs: { type: 'button', name: 'status', 'data-status': id, 'aria-pressed': status === id },
    text: STATUS_LABELS[id],
    on: { click: () => { status = id; paintStatus(); } },
  })));

  /** Repaint in place: the editor is not re-rendered while it is open. */
  function paintStatus() {
    for (const button of statusControl.querySelectorAll('.seg-btn')) {
      button.setAttribute('aria-pressed', String(button.dataset.status === status));
    }
  }

  const priority = el('select', { attrs: { name: 'priority' } },
    PRIORITIES.map((p) => el('option', {
      attrs: { value: p, selected: (task?.priority || 'normal') === p }, text: p,
    })));

  // type="date" gets the platform picker for free, which beats anything a web
  // app can build and is what the user already knows.
  const due = el('input', {
    attrs: { name: 'dueKey', type: 'date', value: task?.dueKey || '' },
  });

  const detail = el('textarea', {
    attrs: { name: 'detail', rows: 3, placeholder: 'Notes' }, text: task?.detail || '',
  });

  function save() {
    const creating = project.value === NEW_PROJECT;
    ctx.actions.saveTask({
      name: name.value.trim() || TASK_FIELDS.name,
      status,
      // The sentinel is never written as an id. When a project is being made,
      // its id is not known until saveTask has created it, so the patch names
      // it instead and saveTask does the filing — including deciding that a
      // blank name is not a project, which is its rule to keep, not this one's.
      project: creating ? null : (project.value || null),
      newProject: creating ? newProject.value : '',
      priority: priority.value,
      dueKey: due.value || null,
      detail: detail.value,
    });
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); save(); });

  form.append(
    el('div', { class: 'editor-head' }, [
      el('span', { class: 'label', text: task ? `Task ${task.ref}` : 'New task' }),
    ]),
    field('Name', name),
    field('Project', project),
    newProjectField,
    field('Status', statusControl),
    field('Priority', priority),
    field('Due', due),
    field('Notes', detail),
    el('div', { class: 'editor-actions' }, [
      task
        ? el('button', {
            class: 'btn danger editor-delete', attrs: { type: 'button' }, text: 'Delete',
            on: { click: () => ctx.actions.archiveTask(task.id) },
          })
        : null,
      el('span', { style: { flex: '1' } }),
      el('button', {
        class: 'btn editor-cancel', attrs: { type: 'button' }, text: 'Cancel',
        on: { click: () => ctx.actions.closeEditor() },
      }),
      el('button', {
        class: 'btn primary editor-save', attrs: { type: 'button' }, text: 'Save',
        on: { click: save },
      }),
    ]),
  );

  return form;
}
