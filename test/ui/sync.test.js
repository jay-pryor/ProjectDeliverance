import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createApp } from '../../src/ui/app.js';
import { createMemoryDriver } from '../../src/store/memory-driver.js';
import { createLogBackend } from '../../src/platform/notifier.js';

const clock = () => new Date(2026, 7, 31, 9, 0).getTime();
const doc = {
  version: 1, id: 'doc_1', createdAt: 0, seq: {}, dismissals: [],
  settings: { accentMode: 'standard', digest: { enabled: false, timeMin: 450 }, eventLeadMin: 15 },
  projects: [], tasks: [], events: [],
  routines: [{ id: 'rtn_1', ref: 'R-1', name: 'Meds', timeMin: 1080, steps: [],
               rule: { kind: 'daily', from: '2026-08-01', every: 1 }, archived: false }],
};

async function mount() {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
  const backend = createLogBackend();
  const app = createApp({
    root: dom.window.document.getElementById('app'), now: clock, backend,
    driver: createMemoryDriver({ seed: { 'state.json': JSON.stringify(doc) } }),
  });
  await app.boot();
  return { app, backend, dom };
}

test('booting schedules the window', async () => {
  const { backend } = await mount();
  assert.equal(backend.scheduled.length, 14);
});

test('adding a routine schedules its occurrences without touching the others', async () => {
  const { app, backend } = await mount();
  const before = backend.scheduled.length;
  app.actions.openRoutine(null);
  app.actions.saveRoutine({
    name: 'Walk', timeMin: 1200, steps: [],
    rule: { kind: 'daily', from: '2026-08-01', every: 1 },
  });
  await app.syncNotifications();
  assert.equal(backend.scheduled.length, before + 14);
});

test('archiving a routine cancels its notifications', async () => {
  const { app, backend } = await mount();
  // archiveRoutine() itself already fires a sync (actions.update does this on
  // every document change, unawaited), and it is queued on the same serialised
  // chain ahead of the explicit call below — so by the time this awaited call's
  // own diff runs, the cancellation has already happened and it has nothing
  // left to report. That is the serialisation working as intended (Detail #2),
  // not a missed cancellation, so the assertion checks the backend's actual
  // state rather than which link in the chain happened to report the diff.
  app.actions.archiveRoutine('rtn_1');
  await app.syncNotifications();
  assert.equal((await backend.list()).length, 0);
});

test('a sync failure does not take the app down', async () => {
  const { app, backend } = await mount();
  backend.schedule = async () => { throw new Error('no permission'); };
  app.actions.openRoutine(null);
  app.actions.saveRoutine({ name: 'x', timeMin: 1300, steps: [],
                            rule: { kind: 'daily', from: '2026-08-01', every: 1 } });
  await assert.doesNotReject(() => app.syncNotifications());
  assert.ok(app.state.notifyError, 'but it is recorded so SETTINGS can report it');
});
