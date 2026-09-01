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

function build({ ready } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
  const backend = createLogBackend();
  const root = dom.window.document.getElementById('app');
  const app = createApp({
    root, now: clock, backend, ready,
    driver: createMemoryDriver({ seed: { 'state.json': JSON.stringify(doc) } }),
  });
  return { app, backend, dom, root };
}

async function mount() {
  const built = build();
  await built.app.boot();
  return built;
}

/** Let every pending microtask settle. Nothing here uses timers, so one turn
 *  of the macrotask queue drains the whole promise graph. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

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

test('a nullish rejection neither crashes nor poisons the chain', async () => {
  // Some native bridges reject with no value. `err.message` on that throws
  // inside the catch, which rejects the chain head — and a rejected head makes
  // every later .then(fn) skip fn entirely, silently killing notification
  // syncing for the rest of the session.
  const { app, backend } = await mount();
  // Nothing has changed since boot's own sync, so a bare syncNotifications()
  // call here would have nothing new to write and would never even reach
  // backend.schedule. A real change is needed first so there is something to
  // write, and hence something for the throwing stub to actually intercept.
  backend.schedule = async () => { throw null; };
  app.actions.openRoutine(null);
  app.actions.saveRoutine({ name: 'poison', timeMin: 1250, steps: [],
                            rule: { kind: 'daily', from: '2026-08-01', every: 1 } });
  await assert.doesNotReject(() => app.syncNotifications());
  assert.ok(app.state.notifyError, 'the failure is recorded, not swallowed');

  // The chain must still be usable afterwards.
  backend.schedule = async () => {};
  app.actions.openRoutine(null);
  app.actions.saveRoutine({ name: 'after', timeMin: 1300, steps: [],
                            rule: { kind: 'daily', from: '2026-08-01', every: 1 } });
  const after = await app.syncNotifications();
  assert.notEqual(after, null, 'sync still runs after a nullish failure');
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


// --- the setup gate ---------------------------------------------------------

test('the first sync waits for platform setup, and the UI does not', async () => {
  // Channels must exist and the permission dialog must be answered before the
  // first schedule(): a notification posted to an unregistered channel is
  // dropped, and the plugin requests POST_NOTIFICATIONS itself from inside
  // schedule() when it is not yet granted, so an overlapping request for the
  // same alias comes back cancelled. The gate orders them.
  let open;
  const ready = new Promise((resolve) => { open = resolve; });
  const { app, backend, root } = build({ ready });

  const booted = app.boot();
  await settle();
  assert.equal(backend.scheduled.length, 0, 'nothing scheduled while setup is outstanding');
  assert.ok(root.textContent.length > 0, 'but the UI has already painted — it never waits on the platform');

  open();
  await booted;
  assert.equal(backend.scheduled.length, 14, 'and the window is scheduled once setup lands');
});

test('a rejected gate does not wedge syncing forever', async () => {
  // main.js swallows a failed setup into a resolved gate, but the seam itself
  // must survive being handed a rejected one: awaiting it inside the try means
  // a failure is reported, not an unhandled rejection that kills the chain.
  const { app } = build({ ready: Promise.reject(new Error('channels failed')) });
  await assert.doesNotReject(() => app.boot());
  assert.equal(app.state.notifyError, 'channels failed');
});

// --- reporting a platform issue --------------------------------------------

test('a setup failure reported before boot is kept, not thrown away', async () => {
  // Setup can finish first — a permanently denied permission returns without a
  // dialog — while boot is still awaiting storage. Rendering then would take
  // the normal-screen branch with a null document and throw, and in main.js
  // that throw lands in a .then() with no rejection handler: the user loses the
  // one message explaining why nothing ever arrives.
  const { app, root } = build();
  assert.doesNotThrow(() => app.reportNotifyIssue('Notifications are blocked.'));
  assert.equal(app.state.notifySetup, 'Notifications are blocked.');
  assert.equal(root.textContent, '', 'nothing was painted before there was anything to paint');

  await app.boot();   // whose own sync succeeds — which must not erase it
  app.actions.setScreen('settings');
  assert.match(root.textContent, /Notifications are blocked\./,
    'the reason survives to the screen that reports it');
});

// --- clearing --------------------------------------------------------------

test('a later successful sync clears a failure that has since gone away', async () => {
  // Otherwise one transient bridge failure — a sync fired while the WebView was
  // still coming up, say — pins its message to SETTINGS for the rest of the
  // session, describing a problem that no longer exists.
  const { app, backend } = await mount();
  backend.schedule = async () => { throw new Error('bridge not ready'); };
  app.actions.openRoutine(null);
  app.actions.saveRoutine({ name: 'x', timeMin: 1300, steps: [],
                            rule: { kind: 'daily', from: '2026-08-01', every: 1 } });
  await app.syncNotifications();
  assert.equal(app.state.notifyError, 'bridge not ready');

  backend.schedule = async () => {};
  app.actions.openRoutine(null);
  app.actions.saveRoutine({ name: 'y', timeMin: 1310, steps: [],
                            rule: { kind: 'daily', from: '2026-08-01', every: 1 } });
  await app.syncNotifications();
  assert.equal(app.state.notifyError, null, 'the stale reason is withdrawn');
});
