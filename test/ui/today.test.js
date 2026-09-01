import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createApp } from '../../src/ui/app.js';
import { createMemoryDriver } from '../../src/store/memory-driver.js';

const clock = () => new Date(2026, 7, 31, 9, 0).getTime();

const doc = {
  version: 1, id: 'doc_1', createdAt: 0, seq: {}, dismissals: [],
  settings: { accentMode: 'standard', digest: { enabled: true, timeMin: 450 }, eventLeadMin: 15 },
  projects: [], routines: [], events: [],
  tasks: [
    { id: 'tsk_1', ref: 'T-1', name: 'Late thing', project: null, status: 'todo',
      priority: 'high', dueKey: '2026-08-20', detail: '', doneAt: null, archived: false },
    { id: 'tsk_2', ref: 'T-2', name: 'Today thing', project: null, status: 'todo',
      priority: 'normal', dueKey: '2026-08-31', detail: '', doneAt: null, archived: false },
  ],
};

async function mount(seed = doc) {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
  const root = dom.window.document.getElementById('app');
  const app = createApp({
    root, now: clock,
    driver: createMemoryDriver({ seed: { 'state.json': JSON.stringify(seed) } }),
  });
  await app.boot();
  return { root, app };
}

test('overdue and due-today appear under separate headings', async () => {
  const { root } = await mount();
  const heads = [...root.querySelectorAll('.group-head')].map((h) => h.textContent.toLowerCase());
  assert.ok(heads.some((h) => h.includes('overdue')));
  assert.ok(heads.some((h) => h.includes('today')));
  assert.ok(root.textContent.includes('Late thing'));
  assert.ok(root.textContent.includes('Today thing'));
});

test('a clear day says so rather than showing empty headings', async () => {
  const { root } = await mount({ ...doc, tasks: [] });
  assert.match(root.textContent, /nothing due/i);
  assert.equal(root.querySelectorAll('.group-head').length, 0);
});

test('completing from TODAY removes the row', async () => {
  const { root, app } = await mount();
  root.querySelector('[data-task="tsk_2"] .task-check').click();
  assert.equal(app.state.doc.tasks.find((t) => t.id === 'tsk_2').status, 'done');
  assert.equal(root.querySelector('[data-task="tsk_2"]'), null);
});

test("today's events appear on TODAY and open for editing", async () => {
  // `digestFor` already computes them and the digest notification counts them,
  // so a TODAY that does not render them makes that notification a dead end:
  // it says "1 event", you tap through, and the screen shows nothing.
  const { root, app } = await mount({ ...doc, events: [
    { id: 'evt_1', ref: 'C-1', name: 'Peter visiting', detail: '',
      // Started yesterday, runs three days — so it is covered by eventsOnDay
      // rather than by occursOn on today alone.
      rule: { kind: 'once', date: '2026-08-30' },
      startMin: null, endMin: null, spanDays: 2, leadMin: null, archived: false },
  ] });
  const entry = root.querySelector('.cal-entry[data-event="evt_1"]');
  assert.ok(entry, 'an event covering today belongs on TODAY');
  assert.match(entry.textContent, /Peter visiting/);
  assert.match(entry.textContent, /All day/);
  assert.match(entry.textContent, /Day 2 of 3/);
  entry.click();
  assert.deepEqual(app.state.editing, { kind: 'event', id: 'evt_1' });
  assert.equal(root.querySelector('[name="name"]').value, 'Peter visiting');
});

test('a day with no events grows no events heading', async () => {
  const { root } = await mount({ ...doc, events: [] });
  assert.equal(root.querySelector('.cal-entry'), null);
  const heads = [...root.querySelectorAll('.group-head')].map((h) => h.textContent.toLowerCase());
  assert.ok(!heads.some((h) => h.includes('event')));
});
