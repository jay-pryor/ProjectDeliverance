import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRoutine, activeRoutines, nextRoutineDue, describeRoutine,
  routineKey, repairRoutines,
} from '../../src/core/routines.js';
import { createEmptyDoc } from '../../src/core/schema.js';

// Monday 2026-08-31, 09:00 local.
const at = (h, m = 0) => new Date(2026, 7, 31, h, m).getTime();
const clock = () => at(9);

function docWith(routines) {
  return { ...createEmptyDoc({ now: clock }), routines };
}

const weekdayMorning = { kind: 'weekly', days: [0, 1, 2, 3, 4] };

test('a routine is not active before its time', () => {
  const doc = docWith([createRoutine({ seq: {} }, {
    name: 'Meds', rule: weekdayMorning, timeMin: 7 * 60,
  }, { now: clock })]);
  assert.equal(activeRoutines(doc, at(6, 30)).length, 0);
  assert.equal(activeRoutines(doc, at(7, 0)).length, 1);
  assert.equal(activeRoutines(doc, at(23, 0)).length, 1, 'and stays active all day');
});

test('a routine is not active on a day its rule does not fire', () => {
  const doc = docWith([createRoutine({ seq: {} }, {
    name: 'Bins', rule: { kind: 'weekly', days: [2] }, timeMin: 7 * 60,
  }, { now: clock })]);
  assert.equal(activeRoutines(doc, at(9)).length, 0, 'Monday is not Wednesday');
});

test('yesterday cannot be active — expiry is a property of the model', () => {
  // Only *today's* occurrence is ever considered, so "clears at end of day"
  // needs no cleanup job and cannot be forgotten.
  const doc = docWith([createRoutine({ seq: {} }, {
    rule: { kind: 'once', date: '2026-08-30' }, timeMin: 0,
  }, { now: clock })]);
  assert.equal(activeRoutines(doc, at(9)).length, 0);
});

test('a dismissal suppresses today only', () => {
  const routine = createRoutine({ seq: {} }, {
    rule: weekdayMorning, timeMin: 7 * 60,
  }, { now: clock });
  const doc = { ...docWith([routine]), dismissals: [routineKey(routine, '2026-08-31')] };
  assert.equal(activeRoutines(doc, at(9)).length, 0);
  // Tuesday's occurrence has its own key, so it is untouched.
  assert.equal(activeRoutines(doc, new Date(2026, 8, 1, 9).getTime()).length, 1);
});

test('archived routines never fire', () => {
  const doc = docWith([{
    ...createRoutine({ seq: {} }, { rule: weekdayMorning, timeMin: 0 }, { now: clock }),
    archived: true,
  }]);
  assert.equal(activeRoutines(doc, at(9)).length, 0);
});

test('nextRoutineDue finds the soonest still to come', () => {
  const doc = docWith([
    createRoutine({ seq: {} }, { name: 'Evening', rule: weekdayMorning, timeMin: 18 * 60 }, { now: clock }),
    createRoutine({ seq: {} }, { name: 'Morning', rule: weekdayMorning, timeMin: 7 * 60 }, { now: clock }),
  ]);
  const next = nextRoutineDue(doc, at(9));
  assert.equal(next.routine.name, 'Evening', "07:00 has already gone past");
  assert.equal(next.dateKey, '2026-08-31');
});

test('describeRoutine states time and schedule on one line', () => {
  const routine = createRoutine({ seq: {} }, {
    rule: { kind: 'weekly', days: [0, 2] }, timeMin: 7 * 60,
  }, { now: clock });
  assert.equal(describeRoutine(routine), '07:00 · Every Mon, Wed');
});

test('repairRoutines defends against junk', () => {
  const out = repairRoutines([
    { id: 'rtn_1' },
    { id: 'rtn_2', name: {}, steps: 'not a list', timeMin: 'noon' },
    { name: 'no id' },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].timeMin, 7 * 60);
  assert.equal(out[1].name, 'New routine');
  assert.deepEqual(out[1].steps, []);
  assert.equal(out[1].timeMin, 7 * 60);
});
