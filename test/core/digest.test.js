import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digestFor } from '../../src/core/digest.js';
import { createEmptyDoc } from '../../src/core/schema.js';
import { createRoutine } from '../../src/core/routines.js';
import { createEvent } from '../../src/core/events.js';

const clock = () => new Date(2026, 7, 31, 9, 0).getTime();

function docWith(tasks) {
  return { ...createEmptyDoc({ now: clock }), tasks };
}

const task = (over) => ({
  id: 't', name: 'x', status: 'todo', priority: 'normal', project: null,
  detail: '', doneAt: null, archived: false, dueKey: null, ...over,
});

test('an empty document yields an empty digest of the right shape', () => {
  const d = digestFor(docWith([]), clock());
  assert.deepEqual(d, { overdue: [], dueToday: [], routines: [], events: [] });
});

test('tasks are split into overdue and due today', () => {
  const d = digestFor(docWith([
    task({ id: 'a', dueKey: '2026-08-29' }),
    task({ id: 'b', dueKey: '2026-08-31' }),
    task({ id: 'c', dueKey: '2026-09-04' }),
    task({ id: 'd', dueKey: null }),
  ]), clock());
  assert.deepEqual(d.overdue.map((t) => t.id), ['a']);
  assert.deepEqual(d.dueToday.map((t) => t.id), ['b']);
});

test('done and archived work never reaches the digest', () => {
  const d = digestFor(docWith([
    task({ id: 'a', dueKey: '2026-08-01', status: 'done', doneAt: 1 }),
    task({ id: 'b', dueKey: '2026-08-01', archived: true }),
  ]), clock());
  assert.deepEqual(d.overdue, []);
});

test('overdue is ordered oldest first', () => {
  const d = digestFor(docWith([
    task({ id: 'newer', dueKey: '2026-08-30' }),
    task({ id: 'older', dueKey: '2026-08-01' }),
  ]), clock());
  assert.deepEqual(d.overdue.map((t) => t.id), ['older', 'newer']);
});

test('the digest carries the routines that are due now', () => {
  const routine = createRoutine({ seq: {} }, {
    name: 'Meds', rule: { kind: 'daily', from: '2026-08-01', every: 1 }, timeMin: 7 * 60,
  }, { now: clock });
  const doc = { ...docWith([]), routines: [routine] };
  assert.equal(digestFor(doc, clock()).routines.length, 1);
  // 06:00 — before it is due.
  assert.equal(digestFor(doc, new Date(2026, 7, 31, 6).getTime()).routines.length, 0);
});

test('the digest carries today\'s events, including mid-span days', () => {
  const event = createEvent({ seq: {} }, {
    name: 'Peter visiting', rule: { kind: 'once', date: '2026-08-30' }, spanDays: 3,
  }, { now: clock });
  const doc = { ...docWith([]), events: [event] };
  const d = digestFor(doc, clock());
  assert.equal(d.events.length, 1);
  assert.equal(d.events[0].dayIndex, 1, 'day two of a visit that began yesterday');
});
