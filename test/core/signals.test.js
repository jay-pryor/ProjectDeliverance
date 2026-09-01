import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pruneDismissals, attention } from '../../src/core/signals.js';
import { createEmptyDoc } from '../../src/core/schema.js';

const clock = () => new Date(2026, 7, 31, 9, 0).getTime();

test('dismissals for past days are dropped', () => {
  const doc = {
    ...createEmptyDoc({ now: clock }),
    dismissals: [
      'rtn_1:2026-08-30',              // yesterday — provably dead
      'rtn_2:2026-08-31',              // today — still live
      'evt_1:2026-09-01:tomorrow',     // future — still live
      'junk-with-no-date',             // cannot match anything we generate
    ],
  };
  assert.deepEqual(pruneDismissals(doc, clock()),
    ['rtn_2:2026-08-31', 'evt_1:2026-09-01:tomorrow']);
});

test('pruning an empty list is safe', () => {
  assert.deepEqual(pruneDismissals({ }, clock()), []);
});

test('attention counts what each tab is holding', () => {
  const doc = {
    ...createEmptyDoc({ now: clock }),
    tasks: [{ id: 't1', name: 'x', status: 'todo', priority: 'normal', project: null,
              detail: '', doneAt: null, archived: false, dueKey: '2026-08-20' }],
  };
  assert.equal(attention(doc, clock()).today, 1);
  assert.equal(attention(doc, clock()).calendar, 0);
});
