import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digestFor } from '../../src/core/digest.js';
import { createEmptyDoc } from '../../src/core/schema.js';

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
