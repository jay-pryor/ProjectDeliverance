import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createApp } from '../../src/ui/app.js';
import { createMemoryDriver } from '../../src/store/memory-driver.js';

const clock = () => new Date(2026, 7, 31, 9, 0).getTime();

const doc = {
  version: 1, id: 'doc_1', createdAt: 0, seq: {}, dismissals: [],
  settings: { accentMode: 'standard', digest: { enabled: true, timeMin: 450 }, eventLeadMin: 15 },
  projects: [], tasks: [], routines: [],
  events: [
    { id: 'evt_1', ref: 'C-1', name: 'Dentist', detail: '',
      rule: { kind: 'once', date: '2026-08-12' },
      startMin: 540, endMin: 600, spanDays: 0, leadMin: null, archived: false },
    { id: 'evt_2', ref: 'C-2', name: 'Peter visiting', detail: '',
      rule: { kind: 'once', date: '2026-08-20' },
      startMin: null, endMin: null, spanDays: 2, leadMin: null, archived: false },
  ],
};

async function mount() {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
  const root = dom.window.document.getElementById('app');
  const app = createApp({
    root, now: clock,
    driver: createMemoryDriver({ seed: { 'state.json': JSON.stringify(doc) } }),
  });
  await app.boot();
  app.actions.setScreen('calendar');
  return { root, app };
}

test('the grid opens on the current month and is a whole number of weeks', async () => {
  const { root } = await mount();
  assert.match(root.querySelector('.cal-title').textContent, /Aug 2026/);
  const cells = root.querySelectorAll('[data-day]');
  assert.equal(cells.length % 7, 0, 'always full weeks — a ragged grid reflows as you page');
  assert.ok(cells.length >= 28 && cells.length <= 42);
});

test('the grid starts on a Monday', async () => {
  const { root } = await mount();
  const labels = [...root.querySelectorAll('.cal-dow')].map((n) => n.textContent);
  assert.equal(labels[0], 'Mon');
  assert.equal(labels[6], 'Sun');
});

test('today is marked', async () => {
  const { root } = await mount();
  assert.equal(root.querySelector('[data-day="2026-08-31"]').dataset.today, 'true');
});

test('days outside the month are marked so, but still rendered', async () => {
  const { root } = await mount();
  // August 2026 starts on a Saturday, so the grid opens with July days.
  const first = root.querySelector('[data-day]');
  assert.equal(first.dataset.outside, 'true');
});

test('a day carrying events shows a marker', async () => {
  const { root } = await mount();
  assert.ok(root.querySelector('[data-day="2026-08-12"] .mark'));
  assert.equal(root.querySelector('[data-day="2026-08-13"] .mark'), null);
});

test('a multi-day event marks every day of its span', async () => {
  const { root } = await mount();
  for (const key of ['2026-08-20', '2026-08-21', '2026-08-22']) {
    assert.ok(root.querySelector(`[data-day="${key}"] .mark`), `${key} is within the span`);
  }
  assert.equal(root.querySelector('[data-day="2026-08-23"] .mark'), null);
});

test('selecting a day lists its events with their times', async () => {
  const { root, app } = await mount();
  root.querySelector('[data-day="2026-08-12"]').click();
  assert.equal(app.state.selectedDay, '2026-08-12');
  const detail = root.querySelector('.cal-day-detail');
  assert.match(detail.textContent, /Dentist/);
  assert.match(detail.textContent, /09:00–10:00/);
});

test('paging months moves the grid and survives a year boundary', async () => {
  const { root, app } = await mount();
  root.querySelector('.cal-next').click();
  assert.match(root.querySelector('.cal-title').textContent, /Sep 2026/);
  for (let i = 0; i < 4; i++) root.querySelector('.cal-next').click();
  assert.match(root.querySelector('.cal-title').textContent, /Jan 2027/);
  assert.equal(app.state.month, '2027-01-01');
});
