import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createApp } from '../../src/ui/app.js';
import { createMemoryDriver } from '../../src/store/memory-driver.js';

const clock = () => new Date(2026, 7, 31, 9, 0).getTime();

const seedDoc = {
  version: 1, id: 'doc_1', createdAt: 0, seq: { task: 2 }, dismissals: [],
  settings: { accentMode: 'standard', digest: { enabled: true, timeMin: 450 }, eventLeadMin: 15 },
  projects: [{ id: 'prj_1', ref: 'P-1', name: 'Shed', colour: null, archived: false }],
  routines: [], events: [],
  tasks: [
    { id: 'tsk_1', ref: 'T-1', name: 'Buy timber', project: 'prj_1', status: 'todo',
      priority: 'high', dueKey: '2026-08-30', detail: '', doneAt: null, archived: false },
  ],
};

async function mount() {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
  const root = dom.window.document.getElementById('app');
  const app = createApp({
    root, now: clock,
    driver: createMemoryDriver({ seed: { 'state.json': JSON.stringify(seedDoc) } }),
  });
  await app.boot();
  app.actions.setScreen('tasks');
  return { root, app };
}

test('tapping a task row opens the editor on that task', async () => {
  const { root, app } = await mount();
  root.querySelector('[data-task="tsk_1"] .task-name').click();
  assert.deepEqual(app.state.editing, { kind: 'task', id: 'tsk_1' });
  assert.equal(root.querySelector('[name="name"]').value, 'Buy timber');
});

test('the "+" control opens an empty editor without creating a record yet', async () => {
  const { root, app } = await mount();
  root.querySelector('.add-task').click();
  assert.equal(app.state.editing.id, null);
  assert.equal(app.state.doc.tasks.length, 1, 'nothing is written until save');
});

test('saving a new task appends it', async () => {
  const { root, app } = await mount();
  root.querySelector('.add-task').click();
  root.querySelector('[name="name"]').value = 'Hire a skip';
  root.querySelector('.editor-save').click();
  assert.equal(app.state.doc.tasks.length, 2);
  const added = app.state.doc.tasks.at(-1);
  assert.equal(added.name, 'Hire a skip');
  assert.equal(added.ref, 'T-3', 'refs continue from the document sequence');
  assert.equal(app.state.editing, null, 'saving closes the editor');
});

test('saving an existing task edits in place rather than appending', async () => {
  const { root, app } = await mount();
  root.querySelector('[data-task="tsk_1"] .task-name').click();
  root.querySelector('[name="name"]').value = 'Buy oak';
  root.querySelector('[name="priority"]').value = 'low';
  root.querySelector('.editor-save').click();
  assert.equal(app.state.doc.tasks.length, 1);
  assert.equal(app.state.doc.tasks[0].name, 'Buy oak');
  assert.equal(app.state.doc.tasks[0].priority, 'low');
  assert.equal(app.state.doc.tasks[0].id, 'tsk_1', 'the id is stable across an edit');
});

test('a task saved with a blank name keeps a usable name', async () => {
  const { root, app } = await mount();
  root.querySelector('.add-task').click();
  root.querySelector('[name="name"]').value = '   ';
  root.querySelector('.editor-save').click();
  assert.equal(app.state.doc.tasks.at(-1).name, 'New task');
});

test('cancel discards every change', async () => {
  const { root, app } = await mount();
  root.querySelector('[data-task="tsk_1"] .task-name').click();
  root.querySelector('[name="name"]').value = 'Discarded';
  root.querySelector('.editor-cancel').click();
  assert.equal(app.state.doc.tasks[0].name, 'Buy timber');
  assert.equal(app.state.editing, null);
});

test('delete archives rather than destroying', async () => {
  const { root, app } = await mount();
  root.querySelector('[data-task="tsk_1"] .task-name').click();
  root.querySelector('.editor-delete').click();
  assert.equal(app.state.doc.tasks.length, 1, 'the record is kept');
  assert.equal(app.state.doc.tasks[0].archived, true);
  assert.equal(root.querySelector('[data-task="tsk_1"]'), null, 'and is out of the list');
});

test('an in-progress task is visibly in progress in the list', async () => {
  // DOING must not be settable-but-invisible.
  const { root, app } = await mount();
  app.actions.update((d) => ({ ...d, tasks: d.tasks.map((t) => ({ ...t, status: 'doing' })) }));
  assert.equal(root.querySelector('[data-task="tsk_1"]').dataset.status, 'doing');
});

test('the editor shows the task\'s current status as pressed', async () => {
  const { root, app } = await mount();
  app.actions.update((d) => ({ ...d, tasks: d.tasks.map((t) => ({ ...t, status: 'doing' })) }));
  root.querySelector('[data-task="tsk_1"] .task-name').click();
  const pressed = root.querySelectorAll('.seg-btn[aria-pressed="true"]');
  assert.equal(pressed.length, 1, 'exactly one status is ever current');
  assert.equal(pressed[0].dataset.status, 'doing');
});

test('a new task defaults to todo', async () => {
  const { root, app } = await mount();
  root.querySelector('.add-task').click();
  assert.equal(root.querySelector('.seg-btn[aria-pressed="true"]').dataset.status, 'todo');
  root.querySelector('[name="name"]').value = 'Fresh';
  root.querySelector('.editor-save').click();
  assert.equal(app.state.doc.tasks.at(-1).status, 'todo');
});

test('setting status to doing saves it', async () => {
  const { root, app } = await mount();
  root.querySelector('[data-task="tsk_1"] .task-name').click();
  root.querySelector('.seg-btn[data-status="doing"]').click();
  root.querySelector('.editor-save').click();
  assert.equal(app.state.doc.tasks[0].status, 'doing');
  assert.equal(app.state.doc.tasks[0].doneAt, null);
});

test('setting status to done through the editor stamps doneAt', async () => {
  // Spreading {status:'done'} straight onto the record would mark it done with
  // no completion time. saveTask routes status through setStatus for exactly
  // this reason.
  const { root, app } = await mount();
  root.querySelector('[data-task="tsk_1"] .task-name').click();
  root.querySelector('.seg-btn[data-status="done"]').click();
  root.querySelector('.editor-save').click();
  assert.equal(app.state.doc.tasks[0].status, 'done');
  assert.equal(app.state.doc.tasks[0].doneAt, clock());
});

test('clearing done through the editor clears doneAt', async () => {
  const { root, app } = await mount();
  app.actions.update((d) => ({ ...d,
    tasks: d.tasks.map((t) => ({ ...t, status: 'done', doneAt: 123 })) }));
  // The default filter is 'open', which hides done tasks — without this the
  // row is not in the DOM at all and the click below throws on null.
  app.actions.setFilter('all');
  root.querySelector('[data-task="tsk_1"] .task-name').click();
  root.querySelector('.seg-btn[data-status="doing"]').click();
  root.querySelector('.editor-save').click();
  assert.equal(app.state.doc.tasks[0].doneAt, null);
});

test('the project select offers every live project plus unfiled', async () => {
  const { root } = await mount();
  root.querySelector('.add-task').click();
  const options = [...root.querySelectorAll('[name="project"] option')].map((o) => o.value);
  assert.deepEqual(options, ['', 'prj_1', '__new__'], 'unfiled, the live projects, then "make one"');
});

// --- creating a project inline ----------------------------------------------
//
// Projects existed in the data model with no way to make one, so the select
// only ever offered "No project". These tests pin the one route that now
// exists: name a project while filing the task that needed it.

/**
 * Pick the trailing "+ New project…" option and type a name into the input it
 * reveals. Found by its label rather than by the sentinel value, so a test that
 * runs against an editor with no such option fails on the missing option rather
 * than on a null dereference three lines later.
 */
function chooseNewProject(root, name) {
  const select = root.querySelector('[name="project"]');
  const option = [...select.querySelectorAll('option')].at(-1);
  assert.equal(option.textContent, '+ New project…', 'the last option offers a new project');
  select.value = option.value;
  select.dispatchEvent(new window.Event('change'));
  const input = root.querySelector('[name="newProject"]');
  assert.ok(input, 'choosing it reveals a name input');
  if (name != null) input.value = name;
  return input;
}

test('naming a new project on a new task creates it and files the task under it', async () => {
  const { root, app } = await mount();
  root.querySelector('.add-task').click();
  root.querySelector('[name="name"]').value = 'Fit the door';
  chooseNewProject(root, 'Garage');
  root.querySelector('.editor-save').click();

  assert.equal(app.state.doc.projects.length, 2, 'the project is created');
  const project = app.state.doc.projects.at(-1);
  assert.equal(project.name, 'Garage');
  assert.equal(project.archived, false);
  const task = app.state.doc.tasks.at(-1);
  assert.equal(task.name, 'Fit the door');
  assert.equal(task.project, project.id, 'and the task is filed under it, not left unfiled');
});

test('a new project can be added while editing a task that already exists', async () => {
  const { root, app } = await mount();
  root.querySelector('[data-task="tsk_1"] .task-name').click();
  chooseNewProject(root, 'Loft');
  root.querySelector('.editor-save').click();

  assert.equal(app.state.doc.tasks.length, 1, 'editing still edits in place');
  const project = app.state.doc.projects.at(-1);
  assert.equal(project.name, 'Loft');
  assert.equal(app.state.doc.tasks[0].project, project.id, 'the task moves to the new project');
});

test('a blank project name creates no project and leaves the task unfiled', async () => {
  // Otherwise a stray tap on the option quietly litters the list with a project
  // called "New project" that the user never asked for.
  const { root, app } = await mount();
  root.querySelector('.add-task').click();
  root.querySelector('[name="name"]').value = 'Unfiled work';
  chooseNewProject(root, '   ');
  root.querySelector('.editor-save').click();

  assert.equal(app.state.doc.projects.length, 1, 'no project is created');
  const task = app.state.doc.tasks.at(-1);
  assert.equal(task.name, 'Unfiled work');
  assert.equal(task.project, null, 'and the sentinel is never written as an id');
});

test('a project created inline is offered the next time the editor opens', async () => {
  const { root } = await mount();
  root.querySelector('.add-task').click();
  chooseNewProject(root, 'Garage');
  root.querySelector('.editor-save').click();

  root.querySelector('.add-task').click();
  const options = [...root.querySelectorAll('[name="project"] option')];
  assert.deepEqual(options.map((o) => o.textContent), ['No project', 'Shed', 'Garage', '+ New project…']);
});

test('a project and a task created in one save each get their own reference', async () => {
  // Both create* calls allocate from doc.seq, which nextRef mutates in place.
  // Run against separate copies and the project's increment is thrown away, so
  // the next project created is handed P-1 all over again.
  const { root, app } = await mount();
  root.querySelector('.add-task').click();
  chooseNewProject(root, 'Garage');
  root.querySelector('.editor-save').click();

  assert.equal(app.state.doc.projects.at(-1).ref, 'P-1');
  assert.equal(app.state.doc.tasks.at(-1).ref, 'T-3', 'the task ref still continues the sequence');
  assert.deepEqual(app.state.doc.seq, { task: 3, project: 1 });

  root.querySelector('.add-task').click();
  chooseNewProject(root, 'Cellar');
  root.querySelector('.editor-save').click();

  assert.equal(app.state.doc.projects.at(-1).ref, 'P-2', 'the second project does not reuse P-1');
  assert.equal(app.state.doc.tasks.at(-1).ref, 'T-4');
  assert.deepEqual(app.state.doc.seq, { task: 4, project: 2 });
});

test('the new-project name input stays out of the way until it is asked for', async () => {
  const { root } = await mount();
  root.querySelector('.add-task').click();
  const field = root.querySelector('.new-project-field');
  assert.ok(field, 'the field exists in the form');
  assert.equal(field.hidden, true, 'hidden until a new project is wanted');

  const input = chooseNewProject(root, null);
  assert.equal(field.hidden, false, 'revealed on choosing the option');
  assert.equal(document.activeElement, input, 'and focused, so typing can start straight away');

  const select = root.querySelector('[name="project"]');
  select.value = '';
  select.dispatchEvent(new window.Event('change'));
  assert.equal(field.hidden, true, 'hidden again on choosing a real project');
});
