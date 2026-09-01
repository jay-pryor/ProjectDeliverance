import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createApp } from '../../src/ui/app.js';
import { createMemoryDriver } from '../../src/store/memory-driver.js';
import { occursOn } from '../../src/core/recurrence.js';

const clock = () => new Date(2026, 7, 31, 9, 0).getTime();
const doc = {
  version: 1, id: 'doc_1', createdAt: 0, seq: { event: 1 }, dismissals: [],
  settings: { accentMode: 'standard', digest: { enabled: true, timeMin: 450 }, eventLeadMin: 15 },
  projects: [], tasks: [], routines: [],
  events: [{ id: 'evt_1', ref: 'C-1', name: 'Dentist', detail: '',
             rule: { kind: 'once', date: '2026-08-12' },
             startMin: 540, endMin: 600, spanDays: 0, leadMin: null, archived: false }],
};

async function mount() {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
  const root = dom.window.document.getElementById('app');
  const app = createApp({ root, now: clock,
    driver: createMemoryDriver({ seed: { 'state.json': JSON.stringify(doc) } }) });
  await app.boot();
  app.actions.setScreen('calendar');
  return { root, app };
}

test('opening an event fills the form from the record', async () => {
  const { root, app } = await mount();
  app.actions.openEvent('evt_1');
  assert.equal(root.querySelector('[name="name"]').value, 'Dentist');
  assert.equal(root.querySelector('[name="startMin"]').value, '09:00');
  assert.equal(root.querySelector('[name="endMin"]').value, '10:00');
});

test('an all-day event leaves the times blank', async () => {
  const { root, app } = await mount();
  app.actions.update((d) => ({ ...d,
    events: d.events.map((e) => ({ ...e, startMin: null, endMin: null })) }));
  app.actions.openEvent('evt_1');
  assert.equal(root.querySelector('[name="startMin"]').value, '');
});

test('saving writes minutes, not strings', async () => {
  const { root, app } = await mount();
  app.actions.openEvent('evt_1');
  root.querySelector('[name="startMin"]').value = '14:30';
  root.querySelector('.editor-save').click();
  assert.equal(app.state.doc.events[0].startMin, 870);
});

test('clearing the time makes it an all-day event', async () => {
  const { root, app } = await mount();
  app.actions.openEvent('evt_1');
  root.querySelector('[name="startMin"]').value = '';
  root.querySelector('.editor-save').click();
  assert.equal(app.state.doc.events[0].startMin, null);
});

test('a new event is appended with a continuing ref', async () => {
  const { root, app } = await mount();
  app.actions.openEvent(null);
  root.querySelector('[name="name"]').value = 'MOT';
  root.querySelector('.editor-save').click();
  assert.equal(app.state.doc.events.length, 2);
  assert.equal(app.state.doc.events[1].ref, 'C-2');
});

test('a new event lands on the day you had selected, not today', async () => {
  // You tapped a day on the calendar and then tapped +. That day is what you
  // meant — defaulting to today would silently file it somewhere else, and the
  // only clue would be the event failing to appear where you were looking.
  const { root, app } = await mount();
  app.actions.setScreen('calendar');
  app.actions.selectDay('2026-09-17');
  app.actions.openEvent(null);
  root.querySelector('[name="name"]').value = 'MOT';
  root.querySelector('.editor-save').click();
  const saved = app.state.doc.events.at(-1);
  assert.equal(saved.rule.date, '2026-09-17');
  assert.ok(occursOn(saved.rule, '2026-09-17'), 'and occurs on that day');
  assert.ok(!occursOn(saved.rule, '2026-08-31'), 'not on today');
});

test('switching the repeat kind seeds from the selected day too', async () => {
  // Picking "monthly" after selecting the 17th should mean day 17, not the
  // 31st. seedRule reads the same day the date default came from.
  const { root, app } = await mount();
  app.actions.setScreen('calendar');
  app.actions.selectDay('2026-09-17');
  app.actions.openEvent(null);
  const kind = root.querySelector('[name="kind"]');
  kind.value = 'monthly';
  kind.dispatchEvent(new window.Event('change'));
  root.querySelector('[name="name"]').value = 'Rent';
  root.querySelector('.editor-save').click();
  assert.equal(app.state.doc.events.at(-1).rule.day, 17);
});

test('a new event saved without touching Repeats still fires', async () => {
  // The failure this guards: {kind:'once', date:null} is stored happily and
  // occursOn rejects it for every date, so the event exists in the document and
  // appears nowhere at all. Permanently invisible, with no error.
  const { root, app } = await mount();
  app.actions.openEvent(null);
  root.querySelector('[name="name"]').value = 'MOT';
  root.querySelector('.editor-save').click();
  const saved = app.state.doc.events.at(-1);
  assert.equal(saved.rule.date, '2026-08-31', 'defaults to today, not null');
  assert.ok(occursOn(saved.rule, '2026-08-31'), 'and actually occurs');
});

test('delete archives the event', async () => {
  const { root, app } = await mount();
  app.actions.openEvent('evt_1');
  root.querySelector('.editor-delete').click();
  assert.equal(app.state.doc.events[0].archived, true);
});

test('the per-event lead time is optional and stored as a number', async () => {
  const { root, app } = await mount();
  app.actions.openEvent('evt_1');
  root.querySelector('[name="leadMin"]').value = '30';
  root.querySelector('.editor-save').click();
  assert.equal(app.state.doc.events[0].leadMin, 30);
});
