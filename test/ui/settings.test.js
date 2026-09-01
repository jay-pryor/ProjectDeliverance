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

async function mount(at = clock) {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
  const root = dom.window.document.getElementById('app');
  const driver = createMemoryDriver({ seed: { 'state.json': JSON.stringify(doc) } });
  const app = createApp({ root, now: at, driver });
  await app.boot();
  app.actions.setScreen('settings');
  return { dom, root, app, driver };
}

/** Press Export and report the filename the anchor was given. */
function exportFilename(dom, root) {
  const real = dom.window.document.createElement.bind(dom.window.document);
  let name = null;
  dom.window.document.createElement = (tag) => {
    const node = real(tag);
    if (tag === 'a') node.click = () => { name = node.download; };
    return node;
  };
  try {
    root.querySelector('.export-doc').click();
  } finally {
    dom.window.document.createElement = real;
  }
  return name;
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

test('exporting names the backup for the local day', async () => {
  // 00:30 on 1 July in London (BST) is 23:30 on 30 June UTC, so
  // toISOString().slice(0, 10) names the file for the wrong day — and the whole
  // codebase's rule is that a date key comes from local components. The date is
  // also nowhere near the real one, so a filename read off `new Date()` instead
  // of the app's clock cannot pass by coincidence.
  const at = () => new Date(2026, 6, 1, 0, 30).getTime();
  assert.equal(new Date(at()).toISOString().slice(0, 10), '2026-06-30',
    'the fixture must actually straddle the UTC boundary');

  const { dom, root } = await mount(at);
  assert.equal(exportFilename(dom, root), 'tracker-2026-07-01.json');
});

test('a save that actually fails is reported, not swallowed', async () => {
  // The app reported degraded storage only when IndexedDB was absent entirely.
  // A write that is accepted and then rejects — quota exceeded, storage
  // eviction, a full device — left the user believing everything was saved,
  // which is the worst failure this app has.
  const { root, app, driver } = await mount();
  driver.setFault((op) => (op === 'putText' ? new Error('quota exceeded') : null));
  app.actions.setSetting('eventLeadMin', 30);
  await app.flush();
  assert.match(root.textContent, /quota exceeded/, 'the failure reaches SETTINGS');

  driver.setFault(null);
  app.actions.setSetting('eventLeadMin', 45);
  await app.flush();
  assert.doesNotMatch(root.textContent, /quota exceeded/, 'and clears once a save lands');
});
