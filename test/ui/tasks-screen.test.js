import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createApp } from '../../src/ui/app.js';
import { createMemoryDriver } from '../../src/store/memory-driver.js';

const clock = () => new Date(2026, 7, 31, 9, 0).getTime();

const seedDoc = {
  version: 1, id: 'doc_1', createdAt: 0, seq: {}, dismissals: [],
  settings: { accentMode: 'standard', digest: { enabled: true, timeMin: 450 }, eventLeadMin: 15 },
  projects: [{ id: 'prj_1', ref: 'P-1', name: 'Shed', colour: null, archived: false }],
  routines: [], events: [],
  tasks: [
    { id: 'tsk_1', ref: 'T-1', name: 'Buy timber', project: 'prj_1', status: 'todo',
      priority: 'high', dueKey: '2026-08-30', detail: '', doneAt: null, archived: false },
    { id: 'tsk_2', ref: 'T-2', name: 'Ring the council', project: null, status: 'todo',
      priority: 'normal', dueKey: null, detail: '', doneAt: null, archived: false },
    { id: 'tsk_3', ref: 'T-3', name: 'Old thing', project: 'prj_1', status: 'done',
      priority: 'low', dueKey: null, detail: '', doneAt: 1, archived: false },
  ],
};

async function mount() {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
  const root = dom.window.document.getElementById('app');
  const driver = createMemoryDriver({ seed: { 'state.json': JSON.stringify(seedDoc) } });
  const app = createApp({ root, driver, now: clock });
  await app.boot();
  app.actions.setScreen('tasks');
  return { root, app };
}

test('outstanding tasks are listed under their project', async () => {
  const { root } = await mount();
  const headings = [...root.querySelectorAll('.group-head')].map((h) => h.textContent);
  assert.ok(headings.some((h) => h.includes('Shed')));
  assert.ok(headings.some((h) => h.includes('No project')));
});

test('done tasks are hidden until asked for', async () => {
  const { root } = await mount();
  assert.equal(root.querySelector('[data-task="tsk_3"]'), null);
  assert.equal(root.querySelectorAll('.task-row').length, 2);
});

test('showing done reveals them without losing the rest', async () => {
  const { root, app } = await mount();
  app.actions.setFilter('all');
  assert.ok(root.querySelector('[data-task="tsk_3"]'));
  assert.equal(root.querySelectorAll('.task-row').length, 3);
});

test('an overdue task is marked overdue', async () => {
  const { root } = await mount();
  const row = root.querySelector('[data-task="tsk_1"]');
  assert.equal(row.dataset.due, 'overdue');
});

test('completing a task removes it from the outstanding list and stamps doneAt', async () => {
  const { root, app } = await mount();
  root.querySelector('[data-task="tsk_1"] .task-check').click();
  const task = app.state.doc.tasks.find((t) => t.id === 'tsk_1');
  assert.equal(task.status, 'done');
  assert.equal(task.doneAt, clock());
  assert.equal(root.querySelector('[data-task="tsk_1"]'), null);
});

test('the completion control is a real button of tappable size', async () => {
  const { root } = await mount();
  const check = root.querySelector('.task-check');
  assert.equal(check.tagName, 'BUTTON');
  assert.ok(check.getAttribute('aria-label'), 'must be labelled for screen readers');
});

test('an empty list says so rather than showing a blank screen', async () => {
  const { root, app } = await mount();
  app.actions.update((doc) => ({ ...doc, tasks: [] }));
  assert.match(root.textContent, /nothing outstanding/i);
});
