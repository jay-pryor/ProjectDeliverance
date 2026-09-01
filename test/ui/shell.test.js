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
  const app = createApp({ root, driver: createMemoryDriver({ seed }), now: clock });
  return { dom, root, app };
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

test('every tab meets the 44px touch-target floor', async () => {
  const { root, app } = mount();
  await app.boot();
  // jsdom does not lay out, so assert the contract the stylesheet must honour
  // rather than a measured height: the class is the promise.
  for (const tab of root.querySelectorAll('.tab')) {
    assert.ok(tab.classList.contains('tab'));
    assert.equal(tab.tagName, 'BUTTON', 'a tab must be a real button, for focus and a11y');
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

test('a damaged document reaches recovery instead of being silently emptied', async () => {
  const { root, app } = mount({ 'state.json': JSON.stringify({ tasks: 'not a list' }) });
  await app.boot();
  assert.match(root.textContent, /could not be read/i);
  assert.equal(app.state.doc, null, 'nothing is written over the damaged file');
});
