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
  assert.deepEqual(options, ['', 'prj_1']);
});
