import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNotifier, createLogBackend, androidId } from '../../src/platform/notifier.js';
import { createEmptyDoc } from '../../src/core/schema.js';

const NOW = new Date(2026, 7, 31, 9, 0).getTime();
const clock = () => NOW;

const routine = (over = {}) => ({
  id: 'rtn_1', ref: 'R-1', name: 'Meds', timeMin: 18 * 60, steps: [],
  rule: { kind: 'daily', from: '2026-08-01', every: 1 }, archived: false, ...over,
});

function docWith(over = {}) {
  const base = createEmptyDoc({ now: clock });
  return { ...base, settings: { ...base.settings, digest: { enabled: false, timeMin: 450 } }, ...over };
}

test('androidId is stable, positive and fits a 32-bit signed int', () => {
  const a = androidId('rtn:rtn_1:2026-08-31');
  assert.equal(a, androidId('rtn:rtn_1:2026-08-31'), 'stable across calls');
  assert.ok(Number.isInteger(a) && a > 0 && a < 2 ** 31);
});

test('different keys get different ids', () => {
  const keys = ['rtn:a:2026-08-31', 'rtn:a:2026-09-01', 'evt:a:2026-08-31', 'dig:2026-08-31'];
  const ids = new Set(keys.map(androidId));
  assert.equal(ids.size, keys.length);
});

test('the first sync creates everything and cancels nothing', async () => {
  const backend = createLogBackend();
  const notifier = createNotifier({ backend });
  const result = await notifier.sync(docWith({ routines: [routine()] }), NOW);
  assert.equal(result.cancelled.length, 0);
  assert.equal(result.created.length, 14);
  assert.equal(result.kept, 0);
});

test('an unchanged second sync creates nothing — the whole point of diffing', async () => {
  // Cancel-and-recreate would make every pending notification briefly vanish
  // from the shade on each app open.
  const backend = createLogBackend();
  const notifier = createNotifier({ backend });
  const doc = docWith({ routines: [routine()] });
  await notifier.sync(doc, NOW);
  const second = await notifier.sync(doc, NOW);
  assert.deepEqual(second.created, []);
  assert.deepEqual(second.cancelled, []);
  assert.equal(second.kept, 14);
});

test('deleting a routine cancels exactly its notifications', async () => {
  const backend = createLogBackend();
  const notifier = createNotifier({ backend });
  const doc = docWith({ routines: [routine(), routine({ id: 'rtn_2', name: 'Walk' })] });
  await notifier.sync(doc, NOW);

  const fewer = { ...doc, routines: [doc.routines[0]] };
  const result = await notifier.sync(fewer, NOW);
  assert.equal(result.cancelled.length, 14);
  assert.equal(result.created.length, 0);
  assert.equal(result.kept, 14);
});

test('changing a time cancels the old instants and creates the new ones', async () => {
  const backend = createLogBackend();
  const notifier = createNotifier({ backend });
  await notifier.sync(docWith({ routines: [routine()] }), NOW);
  const moved = docWith({ routines: [routine({ timeMin: 20 * 60 })] });
  const result = await notifier.sync(moved, NOW);
  // Same ids — the key is routine + day, not the time — so this is a rewrite
  // rather than a cancel/create pair.
  assert.equal(result.created.length, 0);
  assert.equal(result.cancelled.length, 0);
  assert.equal(result.rescheduled.length, 14);
});

test('the backend receives real integer ids and the key alongside', async () => {
  const backend = createLogBackend();
  const notifier = createNotifier({ backend });
  await notifier.sync(docWith({ routines: [routine()] }), NOW);
  const first = backend.scheduled[0];
  assert.equal(typeof first.id, 'number');
  assert.equal(typeof first.key, 'string');
  assert.equal(first.channel, 'routines');
  assert.ok(first.fireAt > NOW);
});

test('a backend failure surfaces rather than being swallowed', async () => {
  const backend = createLogBackend();
  backend.schedule = async () => { throw new Error('permission denied'); };
  const notifier = createNotifier({ backend });
  await assert.rejects(
    () => notifier.sync(docWith({ routines: [routine()] }), NOW),
    /permission denied/,
  );
});
