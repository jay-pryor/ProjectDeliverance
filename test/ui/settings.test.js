import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createApp } from '../../src/ui/app.js';
import { createMemoryDriver } from '../../src/store/memory-driver.js';

const clock = () => new Date(2026, 7, 31, 9, 0).getTime();
const doc = {
  version: 1, id: 'doc_1', createdAt: 0, seq: {}, dismissals: [],
  settings: { accentMode: 'standard', digest: { enabled: true, timeMin: 450 }, eventLeadMin: 15 },
  projects: [], tasks: [], routines: [], events: [],
};

async function mount() {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
  const root = dom.window.document.getElementById('app');
  const app = createApp({ root, now: clock,
    driver: createMemoryDriver({ seed: { 'state.json': JSON.stringify(doc) } }) });
  await app.boot();
  app.actions.setScreen('settings');
  return { dom, root, app };
}

test('the accent toggle flips the mode and the document element', async () => {
  const { dom, root, app } = await mount();
  root.querySelector('.accent-toggle').click();
  assert.equal(app.state.doc.settings.accentMode, 'alert');
  assert.equal(dom.window.document.documentElement.dataset.accent, 'alert');
  root.querySelector('.accent-toggle').click();
  assert.equal(app.state.doc.settings.accentMode, 'standard');
});

test('the digest time is stored as minutes', async () => {
  const { root, app } = await mount();
  const input = root.querySelector('[name="digestTime"]');
  input.value = '06:15';
  input.dispatchEvent(new window.Event('change'));
  assert.equal(app.state.doc.settings.digest.timeMin, 375);
});

test('the digest can be switched off and stays off', async () => {
  const { root, app } = await mount();
  root.querySelector('[name="digestEnabled"]').click();
  assert.equal(app.state.doc.settings.digest.enabled, false);
});

test('the default event lead time is stored as a number', async () => {
  const { root, app } = await mount();
  const input = root.querySelector('[name="eventLeadMin"]');
  input.value = '45';
  input.dispatchEvent(new window.Event('change'));
  assert.equal(app.state.doc.settings.eventLeadMin, 45);
});

test('a degraded store is reported, not hidden', async () => {
  // Silently not saving is the worst failure this app has. The warning
  // platform/storage.js computes must reach the screen.
  const { root, app } = await mount();
  app.state.storage = { degraded: true, reason: 'Storage is blocked here.', label: null };
  app.render();
  assert.match(root.textContent, /NOT SAVED/);
  assert.match(root.textContent, /Storage is blocked here/);
});

test('a healthy store does not shout about it', async () => {
  const { root } = await mount();
  assert.doesNotMatch(root.textContent, /NOT SAVED/);
});

test('export produces the document as JSON', async () => {
  const { app } = await mount();
  const text = app.actions.exportDoc();
  assert.deepEqual(JSON.parse(text).settings.digest.timeMin, 450);
});

test('import replaces the document, but refuses junk', async () => {
  const { app } = await mount();
  assert.equal(app.actions.importDoc('{ not json'), false);
  assert.equal(app.actions.importDoc(JSON.stringify({ tasks: 'nope' })), false);
  assert.equal(app.state.doc.id, 'doc_1', 'a refused import changes nothing');

  assert.equal(app.actions.importDoc(JSON.stringify({ ...doc, id: 'doc_2' })), true);
  assert.equal(app.state.doc.id, 'doc_2');
});
