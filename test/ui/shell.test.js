import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createApp, SCREENS } from '../../src/ui/app.js';
import { createMemoryDriver } from '../../src/store/memory-driver.js';

const clock = () => new Date(2026, 7, 31, 9, 0).getTime();

function mount(seed) {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
  const root = dom.window.document.getElementById('app');
  const driver = createMemoryDriver({ seed });
  const app = createApp({ root, driver, now: clock });
  return { dom, root, app, driver };
}

test('boot renders a tab bar with one tab per screen', async () => {
  const { root, app } = mount();
  await app.boot();
  const tabs = root.querySelectorAll('.tab');
  assert.equal(tabs.length, SCREENS.length);
  assert.deepEqual([...tabs].map((t) => t.dataset.screen), [...SCREENS]);
});

test('boot on an empty driver creates a document', async () => {
  const { app } = mount();
  await app.boot();
  assert.ok(app.state.doc.id);
  assert.deepEqual(app.state.doc.tasks, []);
});

test('the app opens on TODAY', async () => {
  const { root, app } = mount();
  await app.boot();
  assert.equal(app.state.screen, 'today');
  assert.equal(root.querySelector('[aria-current="page"]').dataset.screen, 'today');
});

test('tapping a tab changes screen and moves the current marker', async () => {
  const { root, app } = mount();
  await app.boot();
  root.querySelector('.tab[data-screen="calendar"]').click();
  assert.equal(app.state.screen, 'calendar');
  const current = root.querySelectorAll('[aria-current="page"]');
  assert.equal(current.length, 1, 'exactly one tab is ever current');
  assert.equal(current[0].dataset.screen, 'calendar');
});

test('every tab is a real button', async () => {
  // Named for what it can actually check. The 44px floor is a stylesheet fact
  // and jsdom does not lay out, so it is asserted against www/app.css in
  // test/tokens.test.js; claiming it here only ever restated the selector.
  const { root, app } = mount();
  await app.boot();
  const tabs = [...root.querySelectorAll('.tab')];
  assert.equal(tabs.length, SCREENS.length);
  for (const tab of tabs) {
    assert.equal(tab.tagName, 'BUTTON', 'a tab must be a real button, for focus and a11y');
    assert.equal(tab.getAttribute('type'), 'button', 'never a submit button');
  }
});

test('a saved document is loaded rather than replaced', async () => {
  const seed = { 'state.json': JSON.stringify({ tasks: [], settings: { accentMode: 'alert' } }) };
  const { app } = mount(seed);
  await app.boot();
  assert.equal(app.state.doc.settings.accentMode, 'alert');
});

test('accentMode is reflected onto the document element', async () => {
  const seed = { 'state.json': JSON.stringify({ tasks: [], settings: { accentMode: 'alert' } }) };
  const { dom, app } = mount(seed);
  await app.boot();
  assert.equal(dom.window.document.documentElement.dataset.accent, 'alert');
});

test('aria state attributes serialise as strings, not boolean attributes', async () => {
  // A boolean HTML attribute writes "", so [aria-pressed="true"] would never
  // match and every pressed style in the app would silently do nothing.
  const { dom } = mount();
  const { el } = await import('../../src/ui/dom.js');
  global.document = dom.window.document;
  const on = el('button', { attrs: { 'aria-pressed': true } });
  const off = el('button', { attrs: { 'aria-pressed': false } });
  assert.equal(on.getAttribute('aria-pressed'), 'true');
  assert.equal(off.getAttribute('aria-pressed'), 'false');
  assert.ok(on.matches('[aria-pressed="true"]'));
  // Non-aria booleans keep HTML boolean-attribute semantics.
  const plain = el('input', { attrs: { disabled: true, readonly: false } });
  assert.equal(plain.getAttribute('disabled'), '');
  assert.equal(plain.hasAttribute('readonly'), false);
});

test('a damaged document reaches recovery instead of being silently emptied', async () => {
  const { root, app } = mount({ 'state.json': JSON.stringify({ tasks: 'not a list' }) });
  await app.boot();
  assert.match(root.textContent, /could not be read/i);
  assert.equal(app.state.doc, null, 'nothing is written over the damaged file');
});

test('a storage failure at boot is not blamed on the JSON', async () => {
  // `store.read()` throws a SyntaxError for an unparseable file and whatever
  // the driver threw for everything else. Reporting "not valid JSON" for a
  // driver fault sends the user hunting through a file that is perfectly fine.
  const { root, app, driver } = mount({ 'state.json': '{"tasks":[]}' });
  driver.setFault((op) => (op === 'getText' ? new Error('database is closed') : null));
  await app.boot();
  assert.match(root.textContent, /could not be read/i);
  assert.match(root.textContent, /database is closed/);
  assert.doesNotMatch(root.textContent, /valid JSON/i);
});

test('an unparseable state file still says exactly that', async () => {
  const { root, app } = mount({ 'state.json': '{ not json' });
  await app.boot();
  assert.match(root.textContent, /not valid JSON/i);
});


test('a tab lights only while it is holding something', async () => {
  // The whole `attention` path — signals.js through to the mark on the tab —
  // had no test at all, so a badge that never lit, or one permanently lit,
  // would have looked exactly like this suite passing.
  const seed = { 'state.json': JSON.stringify({
    tasks: [{ id: 'tsk_1', ref: 'T-1', name: 'Late thing', project: null, status: 'todo',
              priority: 'normal', dueKey: '2026-08-20', detail: '', doneAt: null,
              archived: false }],
    projects: [], routines: [], events: [], dismissals: [],
    settings: { accentMode: 'standard', digest: { enabled: true, timeMin: 450 },
                eventLeadMin: 15 },
  }) };
  const { root, app } = mount(seed);
  await app.boot();
  const lit = (name) => root.querySelector(`.tab[data-screen="${name}"] .mark`)
    .classList.contains('live');

  assert.equal(lit('today'), true, 'an overdue task lights TODAY');
  assert.equal(lit('calendar'), false, 'nothing is on the calendar yet');

  app.actions.update((doc) => ({ ...doc, events: [
    { id: 'evt_1', ref: 'C-1', name: 'Dentist', detail: '',
      rule: { kind: 'once', date: '2026-08-31' },
      startMin: 540, endMin: 600, spanDays: 0, leadMin: null, archived: false },
  ] }));
  assert.equal(lit('calendar'), true, 'an event today lights CALENDAR');

  app.actions.update((doc) => ({
    ...doc,
    tasks: doc.tasks.map((t) => ({ ...t, status: 'done' })),
  }));
  assert.equal(lit('today'), false, 'and it goes out again when nothing is due');

  // Tabs with no count never light, whatever the document holds.
  assert.equal(lit('tasks'), false);
  assert.equal(lit('settings'), false);
});
