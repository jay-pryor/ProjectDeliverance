import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCapacitorBackend, registerChannels, ensurePermission, checkExactAlarms, CHANNEL_DEFS,
} from '../../src/platform/capacitor-notifier.js';
import { createNotifier } from '../../src/platform/notifier.js';
import { createEmptyDoc } from '../../src/core/schema.js';
import { CHANNELS } from '../../src/core/schedule.js';
import { fakePlugin } from './fake-plugin.js';

const NOW = new Date(2026, 7, 31, 9, 0).getTime();

// --- the dialect ------------------------------------------------------------

test('schedule speaks the plugin dialect: channel, Date, and the key in extra', async () => {
  const plugin = fakePlugin();
  await createCapacitorBackend({ plugin }).schedule([{
    id: 12345, key: 'rtn:rtn_1:2026-09-01', title: 'Meds', body: 'Due now',
    fireAt: new Date(2026, 8, 1, 7, 0).getTime(), channel: CHANNELS.ROUTINES,
  }]);
  // Inspected on the way IN. `channelId` and a real Date are things the plugin
  // consumes and never gives back — its pending projection carries neither —
  // so asserting them through getPending() would assert a fiction.
  const sent = plugin.sent(12345);
  assert.equal(sent.id, 12345);
  assert.equal(sent.channelId, 'routines');
  assert.equal(sent.extra.key, 'rtn:rtn_1:2026-09-01');
  assert.ok(sent.schedule.at instanceof Date, 'the plugin wants a Date, not epoch millis');
  assert.equal(sent.schedule.at.getHours(), 7);
});

test('the pending projection carries no channelId and no live Date', async () => {
  // Guards the fake itself. `buildLocalNotificationPendingList` emits id, title,
  // body, schedule and extra only, and its `at` crosses the bridge as a string.
  // A fake that echoed the scheduled object back would let `list()` read fields
  // that do not exist on a phone and still pass here.
  const plugin = fakePlugin();
  await createCapacitorBackend({ plugin }).schedule([{
    id: 5, key: 'k', title: 't', body: 'b', fireAt: NOW, channel: CHANNELS.ROUTINES,
  }]);
  const [pending] = (await plugin.getPending()).notifications;
  assert.equal(pending.channelId, undefined, 'the plugin never returns the channel');
  assert.equal(typeof pending.schedule.at, 'string', 'and never returns a JS Date');
  assert.deepEqual(Object.keys(pending).sort(), ['body', 'extra', 'id', 'schedule', 'title']);
});

test('schedule sets allowWhileIdle, or Doze defers it past its own time', async () => {
  const plugin = fakePlugin();
  await createCapacitorBackend({ plugin }).schedule([{
    id: 1, key: 'k', title: 't', body: 'b', fireAt: NOW + 60000, channel: CHANNELS.ROUTINES,
  }]);
  assert.equal(plugin.sent(1).schedule.allowWhileIdle, true);
});

test('list reads the key back out of extra', async () => {
  const plugin = fakePlugin();
  const backend = createCapacitorBackend({ plugin });
  await backend.schedule([
    { id: 1, key: 'rtn:a:2026-09-01', title: 't', body: 'b', fireAt: NOW, channel: CHANNELS.ROUTINES },
    { id: 2, key: 'dig:2026-09-01', title: 't', body: 'b', fireAt: NOW, channel: CHANNELS.DIGEST },
  ]);
  assert.deepEqual(await backend.list(), [
    { id: 1, key: 'rtn:a:2026-09-01' },
    { id: 2, key: 'dig:2026-09-01' },
  ]);
});

test('a notification with no extra yields a null key rather than throwing', async () => {
  // Something scheduled outside this app — a native boot receiver, say. It must
  // not crash adoption, and it must not be adopted either: we cannot name it,
  // so cancelling it would be guesswork.
  const plugin = fakePlugin();
  await plugin.schedule({ notifications: [{ id: 99, title: 'foreign', body: '' }] });
  assert.deepEqual(await createCapacitorBackend({ plugin }).list(), [{ id: 99, key: null }]);
});

test('cancel maps bare ids into the plugin shape, and skips an empty list', async () => {
  const plugin = fakePlugin();
  let called = 0;
  const realCancel = plugin.cancel.bind(plugin);
  plugin.cancel = async (opts) => { called++; return realCancel(opts); };
  const backend = createCapacitorBackend({ plugin });

  await backend.schedule([{ id: 7, key: 'k', title: 't', body: 'b', fireAt: NOW, channel: CHANNELS.EVENTS }]);
  await backend.cancel([]);
  assert.equal(called, 0, 'an empty cancel must not cost an IPC round trip');

  await backend.cancel([7]);
  assert.equal(called, 1);
  assert.deepEqual((await plugin.getPending()).notifications, []);
});

test('list asks for SCHEDULED only, so a delivered occurrence is not re-adopted', async () => {
  // `getPending()` returns every SAVED record, delivered ones included, and a
  // delivered record survives cancel() as a cancelled record. Adopting one
  // makes a cold start cancel something that already fired, then adopt it again
  // next launch — churn forever, and `sync().cancelled` lying about it.
  const plugin = fakePlugin();
  const backend = createCapacitorBackend({ plugin });
  await backend.schedule([
    { id: 1, key: 'rtn:a:2026-08-31', title: 't', body: 'b', fireAt: NOW, channel: CHANNELS.ROUTINES },
    { id: 2, key: 'rtn:a:2026-09-01', title: 't', body: 'b', fireAt: NOW, channel: CHANNELS.ROUTINES },
  ]);
  plugin.deliver(1);   // yesterday's 09:00 has been and gone

  assert.deepEqual(await backend.list(), [{ id: 2, key: 'rtn:a:2026-09-01' }]);
  assert.deepEqual(plugin.calls.getAll.at(-1), { state: 'SCHEDULED' },
    'asked for the scheduled ones by name');
  assert.equal((await plugin.getPending()).notifications.length, 2,
    'the delivered record is still there — list() is filtering, not the fake');
});

test('a plugin too old for getAll still adopts, rather than orphaning everything', async () => {
  // getAll arrived in 8.3.0. Falling back to nothing would leave a previous
  // session's alarms unnameable and therefore uncancellable.
  const plugin = fakePlugin();
  await plugin.schedule({ notifications: [
    { id: 3, title: 't', body: 'b', extra: { key: 'dig:2026-09-01' } },
  ] });
  delete plugin.getAll;
  assert.deepEqual(await createCapacitorBackend({ plugin }).list(), [{ id: 3, key: 'dig:2026-09-01' }]);
});

test('a downgraded alarm is reported, not swallowed and not raised', async () => {
  // `ScheduleResult.warning` is the authoritative per-call signal that these
  // notifications will drift — set whenever an exact-wanting alarm was silently
  // made inexact. Discarding it left only the one-shot startup check, which
  // cannot see a permission revoked between launches. It is not a failure: the
  // alarms exist and will fire.
  const plugin = fakePlugin({ inexact: true });
  const item = { id: 1, key: 'k', title: 't', body: 'b', fireAt: NOW, channel: CHANNELS.ROUTINES };
  const result = await createCapacitorBackend({ plugin }).schedule([item]);
  assert.match(result.warning, /may arrive late/);
  assert.match(result.warning, /Alarms & reminders/, 'and says where to fix it');
  assert.equal(plugin.sent(1).id, 1, 'the notification was scheduled all the same');
});

test('an ordinary schedule reports no warning', async () => {
  const plugin = fakePlugin();
  const result = await createCapacitorBackend({ plugin }).schedule([
    { id: 1, key: 'k', title: 't', body: 'b', fireAt: NOW, channel: CHANNELS.ROUTINES },
  ]);
  assert.equal(result.warning, null);
});

// --- channels and permissions ----------------------------------------------

test('three channels are registered, digest quieter than the other two', async () => {
  const plugin = fakePlugin();
  await registerChannels({ plugin });
  const byId = Object.fromEntries(plugin.calls.channels.map((c) => [c.id, c]));
  assert.deepEqual(Object.keys(byId).sort(), ['digest', 'events', 'routines']);
  assert.equal(byId.routines.importance, 4, 'routines interrupt');
  assert.equal(byId.digest.importance, 3, 'the morning summary does not');
});

test('routines and events vibrate; the digest deliberately does not', async () => {
  // `enableVibration(channel.getBool("vibration") ?: false)` — omitting the flag
  // creates a channel that never vibrates, and channel settings are frozen at
  // first creation, so a wrong value here cannot be fixed by any later release.
  const plugin = fakePlugin();
  await registerChannels({ plugin });
  const byId = Object.fromEntries(plugin.calls.channels.map((c) => [c.id, c]));
  assert.equal(byId.routines.vibration, true, 'a routine you are about to miss must be felt');
  assert.equal(byId.events.vibration, true);
  assert.equal(byId.digest.vibration, false, 'a morning summary should not buzz a pocket');
});

test('every channel in CHANNEL_DEFS matches a channel core actually emits', () => {
  // A channel id that does not match what `scheduleFor` puts on its payloads
  // means notifications posted to a channel Android never registered.
  const emitted = new Set(Object.values(CHANNELS));
  for (const def of CHANNEL_DEFS) {
    assert.ok(emitted.has(def.id), `${def.id} is not a channel core emits`);
  }
  assert.equal(CHANNEL_DEFS.length, emitted.size, 'every emitted channel is registered');
});

test('permission is not re-requested when already granted', async () => {
  const plugin = fakePlugin({ permission: 'granted' });
  assert.deepEqual(await ensurePermission({ plugin }), { granted: true, state: 'granted' });
  assert.equal(plugin.calls.requested, 0);
});

test('a permanent denial is reported without prompting again', async () => {
  const plugin = fakePlugin({ permission: 'denied' });
  assert.deepEqual(await ensurePermission({ plugin }), { granted: false, state: 'denied' });
  assert.equal(plugin.calls.requested, 0, 'asking again would do nothing');
});

test('an undecided permission is requested once', async () => {
  const plugin = fakePlugin({ permission: 'prompt' });
  assert.equal((await ensurePermission({ plugin })).granted, true);
  assert.equal(plugin.calls.requested, 1);
});

test('a prompt the user declines is reported as not granted', async () => {
  // The answer to the dialog decides this, not the fact that a dialog was
  // shown. A fake that always granted made the decline path unreachable — and
  // an implementation that ignored `asked.display` outright still passed.
  const plugin = fakePlugin({ permission: 'prompt', afterPrompt: 'denied' });
  assert.deepEqual(await ensurePermission({ plugin }), { granted: false, state: 'denied' });
  assert.equal(plugin.calls.requested, 1, 'it did ask — the user said no');
});

test('exact alarms are reported, and an older plugin is not treated as denied', async () => {
  assert.deepEqual(await checkExactAlarms({ plugin: fakePlugin({ exact: 'granted' }) }),
    { exact: true, state: 'granted' });
  assert.deepEqual(await checkExactAlarms({ plugin: fakePlugin({ exact: 'denied' }) }),
    { exact: false, state: 'denied' });

  const old = fakePlugin();
  delete old.checkExactNotificationSetting;
  assert.deepEqual(await checkExactAlarms({ plugin: old }), { exact: true, state: 'unsupported' });
});

// --- the property the whole seam exists for --------------------------------

test('a restart adopts and cancels through the REAL plugin shapes', async () => {
  // The end-to-end property: the notifier's cold-start adoption depends on the
  // occurrence key surviving a round trip through the platform, and `extra` is
  // the only field that carries it. Proven here over the plugin's actual
  // getPending/schedule/cancel shapes rather than over the log backend.
  const plugin = fakePlugin();
  const backend = createCapacitorBackend({ plugin });
  const base = createEmptyDoc({ now: () => NOW });
  const settings = { ...base.settings, digest: { enabled: false, timeMin: 450 } };
  const routine = {
    id: 'rtn_1', ref: 'R-1', name: 'Meds', timeMin: 18 * 60, steps: [],
    rule: { kind: 'daily', from: '2026-08-01', every: 1 }, archived: false,
  };

  await createNotifier({ backend }).sync({ ...base, settings, routines: [routine] }, NOW);
  assert.equal((await plugin.getPending()).notifications.length, 14);

  // A brand-new session over the same platform state, routine since deleted.
  const result = await createNotifier({ backend }).sync({ ...base, settings, routines: [] }, NOW);
  assert.equal(result.cancelled.length, 14, 'adopted what the last session left');
  assert.equal((await plugin.getPending()).notifications.length, 0, 'nothing orphaned');
});
