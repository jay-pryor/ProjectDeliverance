import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createApp } from '../../src/ui/app.js';
import { createMemoryDriver } from '../../src/store/memory-driver.js';
import { occursOn } from '../../src/core/recurrence.js';

const clock = () => new Date(2026, 7, 31, 9, 0).getTime();  // Monday 09:00
const doc = {
  version: 1, id: 'doc_1', createdAt: 0, seq: {}, dismissals: [],
  settings: { accentMode: 'standard', digest: { enabled: true, timeMin: 450 }, eventLeadMin: 15 },
  projects: [], tasks: [], events: [],
  routines: [
    { id: 'rtn_1', ref: 'R-1', name: 'Morning meds', timeMin: 420,
      rule: { kind: 'daily', from: '2026-08-01', every: 1 },
      steps: ['Blue one', 'White one'], archived: false },
    { id: 'rtn_2', ref: 'R-2', name: 'Evening walk', timeMin: 1080,
      rule: { kind: 'daily', from: '2026-08-01', every: 1 }, steps: [], archived: false },
  ],
};

async function mount(seed = doc) {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
  const root = dom.window.document.getElementById('app');
  const app = createApp({ root, now: clock,
    driver: createMemoryDriver({ seed: { 'state.json': JSON.stringify(seed) } }) });
  await app.boot();
  return { root, app };
}

test('only routines already due appear', async () => {
  const { root } = await mount();
  assert.ok(root.querySelector('[data-routine="rtn_1"]'), '07:00 has passed');
  assert.equal(root.querySelector('[data-routine="rtn_2"]'), null, '18:00 has not');
});

test('a routine shows its steps', async () => {
  const { root } = await mount();
  const steps = root.querySelectorAll('[data-routine="rtn_1"] .routine-step');
  assert.deepEqual([...steps].map((s) => s.textContent), ['Blue one', 'White one']);
});

test('dismissing clears it for today and is recorded', async () => {
  const { root, app } = await mount();
  root.querySelector('[data-routine="rtn_1"] .routine-dismiss').click();
  assert.ok(app.state.doc.dismissals.includes('rtn_1:2026-08-31'));
  assert.equal(root.querySelector('[data-routine="rtn_1"]'), null);
});

test('with nothing due, the screen says when the next one is', async () => {
  const { root } = await mount({ ...doc, routines: [doc.routines[1]] });
  assert.match(root.textContent, /Evening walk/);
  assert.match(root.textContent, /18:00/);
});

test('saving a new routine stores its steps as a list', async () => {
  const { root, app } = await mount();
  app.actions.openRoutine(null);
  root.querySelector('[name="name"]').value = 'Lock up';
  root.querySelector('[name="steps"]').value = 'Back door\nWindows\n\nAlarm';
  root.querySelector('[name="timeMin"]').value = '22:00';
  root.querySelector('.editor-save').click();
  const added = app.state.doc.routines.at(-1);
  assert.equal(added.name, 'Lock up');
  assert.deepEqual(added.steps, ['Back door', 'Windows', 'Alarm'], 'blank lines dropped');
  assert.equal(added.timeMin, 1320);
});

test('a new routine saved without touching Repeats still fires', async () => {
  // An invisible routine is unrecoverable: with no ROUTINES screen, it can only
  // be reached through activeRoutines or nextRoutineDue, both of which need
  // occursOn to be true for some day.
  const { root, app } = await mount();
  app.actions.openRoutine(null);
  root.querySelector('[name="name"]').value = 'Lock up';
  root.querySelector('.editor-save').click();
  const saved = app.state.doc.routines.at(-1);
  assert.ok(occursOn(saved.rule, '2026-08-31'), 'fires on the day it was made');
});

test('the next-routine line opens that routine for editing', async () => {
  // Once a card is dismissed there is no other route to a routine: there is no
  // ROUTINES screen, and the card does not come back until tomorrow. If this
  // line is a caption rather than a control, a routine with the wrong time or
  // the wrong rule can never be corrected.
  const { root, app } = await mount({ ...doc, routines: [doc.routines[1]] });
  const line = root.querySelector('.routine-next');
  assert.ok(line, 'the upcoming line must exist');
  assert.equal(line.tagName, 'BUTTON', 'it must be a real button, not a <p>');
  line.click();
  assert.deepEqual(app.state.editing, { kind: 'routine', id: 'rtn_2' });
  assert.equal(root.querySelector('[name="name"]').value, 'Evening walk');
});
