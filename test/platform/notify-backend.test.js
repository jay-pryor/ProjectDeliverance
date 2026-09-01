import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareNotifications } from '../../src/platform/notify-backend.js';
import { fakePlugin } from './fake-plugin.js';

/**
 * The startup sequence, which had no tests at all.
 *
 * It is the one piece of the notification path with no second chance: it runs
 * once per launch, before anything is scheduled, and every branch of it decides
 * what — if anything — the user is told about why their reminders are silent.
 */

test('a browser does no setup and reports nothing wrong', async () => {
  // The development loop. There are no channels and no runtime permission off
  // the device, and pretending otherwise would put a dialog in the way of a
  // desktop refresh.
  const plugin = fakePlugin();
  assert.deepEqual(await prepareNotifications({ plugin, native: false }),
    { ready: true, reason: null });
  assert.deepEqual(plugin.calls.channels, [], 'and it touched the plugin not at all');
});

test('a granted device registers its channels and says nothing', async () => {
  const plugin = fakePlugin({ permission: 'granted' });
  assert.deepEqual(await prepareNotifications({ plugin, native: true }),
    { ready: true, reason: null });
  assert.deepEqual(plugin.calls.channels.map((c) => c.id), ['routines', 'events', 'digest'],
    'channels first — a notification posted to an unregistered channel is dropped');
});

test('an undecided permission is asked for, and a yes needs no explanation', async () => {
  const plugin = fakePlugin({ permission: 'prompt', afterPrompt: 'granted' });
  assert.deepEqual(await prepareNotifications({ plugin, native: true }),
    { ready: true, reason: null });
  assert.equal(plugin.calls.requested, 1);
});

test('a declined prompt is explained without sending the user to Settings', async () => {
  // Not permanent: the dialog can be shown again on a later launch, so the
  // message must not tell them to go digging in Android's settings.
  const plugin = fakePlugin({ permission: 'prompt', afterPrompt: 'prompt' });
  const result = await prepareNotifications({ plugin, native: true });
  assert.equal(result.ready, false);
  assert.match(result.reason, /not allowed/);
  assert.doesNotMatch(result.reason, /Settings/);
});

test('a permanent denial names the only route back', async () => {
  // Re-requesting a permanently denied POST_NOTIFICATIONS returns immediately
  // and shows nothing, so a message that just said "not allowed" would leave
  // the user waiting for a dialog that is never coming again.
  const plugin = fakePlugin({ permission: 'denied' });
  const result = await prepareNotifications({ plugin, native: true });
  assert.equal(result.ready, false);
  assert.match(result.reason, /Android Settings/);
  assert.equal(plugin.calls.requested, 0, 'and it did not waste a prompt finding out');
});

test('exact alarms off is a warning, not a failure', async () => {
  // The notifications still arrive; the OS just batches them, which can move a
  // 09:00 routine by a quarter of an hour. Refusing to be ready over that would
  // be worse than being late.
  const plugin = fakePlugin({ permission: 'granted', exact: 'denied' });
  const result = await prepareNotifications({ plugin, native: true });
  assert.equal(result.ready, true, 'still ready — inexact reminders beat none');
  assert.match(result.reason, /may arrive late/);
});

test('a plugin that throws is reported, never propagated', async () => {
  // This runs unawaited at startup beside boot(). A rejection here would be an
  // unhandled one, and the reason — the only thing that explains the silence —
  // would go nowhere.
  const plugin = fakePlugin();
  plugin.createChannel = async () => { throw new Error('bridge not ready'); };
  assert.deepEqual(await prepareNotifications({ plugin, native: true }),
    { ready: false, reason: 'bridge not ready' });
});

test('a plugin that rejects with nothing at all still yields a reason', async () => {
  // `err.message` on a nullish rejection throws inside the catch, which would
  // turn a handled failure into the unhandled rejection this promises to avoid.
  const plugin = fakePlugin();
  plugin.checkPermissions = async () => { throw null; };
  const result = await prepareNotifications({ plugin, native: true });
  assert.equal(result.ready, false);
  assert.ok(result.reason, 'something is said, rather than crashing while saying it');
});
