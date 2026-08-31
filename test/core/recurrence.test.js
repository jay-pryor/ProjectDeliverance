import { test } from 'node:test';
import assert from 'node:assert/strict';
import { occursOn, nextOccurrence, describeRule, weekdayOf } from '../../src/core/recurrence.js';

test('weekdayOf is Monday-first', () => {
  assert.equal(weekdayOf('2026-08-31'), 0);  // Monday
  assert.equal(weekdayOf('2026-08-30'), 6);  // Sunday
});

test('once fires on exactly one day', () => {
  const rule = { kind: 'once', date: '2026-08-31' };
  assert.equal(occursOn(rule, '2026-08-31'), true);
  assert.equal(occursOn(rule, '2026-09-01'), false);
});

test('weekly fires on its chosen days only', () => {
  const rule = { kind: 'weekly', days: [0, 2] };  // Mon, Wed
  assert.equal(occursOn(rule, '2026-08-31'), true);   // Mon
  assert.equal(occursOn(rule, '2026-09-01'), false);  // Tue
  assert.equal(occursOn(rule, '2026-09-02'), true);   // Wed
});

test('daily honours its interval and its anchor', () => {
  const rule = { kind: 'daily', from: '2026-08-31', every: 3 };
  assert.equal(occursOn(rule, '2026-08-31'), true);
  assert.equal(occursOn(rule, '2026-09-01'), false);
  assert.equal(occursOn(rule, '2026-09-03'), true);
  assert.equal(occursOn(rule, '2026-08-30'), false, 'never before the anchor');
});

test('monthly day-of-month SKIPS an absent date rather than clamping', () => {
  // The whole point: "day 31" does not occur in September. Clamping it to the
  // 30th would silently move a date the user pinned.
  const rule = { kind: 'monthly', day: 31 };
  assert.equal(occursOn(rule, '2026-08-31'), true);
  assert.equal(occursOn(rule, '2026-09-30'), false);
  assert.equal(occursOn(rule, '2026-10-31'), true);
});

test('monthly nth-weekday supports "last"', () => {
  const last = { kind: 'monthly', nth: -1, weekday: 0 };  // last Monday
  assert.equal(occursOn(last, '2026-08-31'), true);
  assert.equal(occursOn(last, '2026-08-24'), false);
});

test('from and until bound every rule kind', () => {
  const rule = { kind: 'weekly', days: [0], from: '2026-09-01', until: '2026-09-30' };
  assert.equal(occursOn(rule, '2026-08-31'), false, 'before from');
  assert.equal(occursOn(rule, '2026-09-07'), true);
  assert.equal(occursOn(rule, '2026-10-05'), false, 'after until');
});

test('nextOccurrence is strictly after the given day', () => {
  const rule = { kind: 'weekly', days: [0] };
  assert.equal(nextOccurrence(rule, '2026-08-31'), '2026-09-07');
});

test('nextOccurrence returns null for a rule that can never fire', () => {
  // Day 32 exists in no month. Scanning forever would hang; null is honest.
  assert.equal(nextOccurrence({ kind: 'monthly', day: 32 }, '2026-08-31'), null);
});

test('malformed rules are false, never thrown', () => {
  for (const bad of [null, undefined, {}, 'weekly', 42, { kind: 'yearly' }]) {
    assert.equal(occursOn(bad, '2026-08-31'), false);
  }
});

test('describeRule produces readable text', () => {
  assert.equal(describeRule({ kind: 'weekly', days: [0, 2] }), 'Every Mon, Wed');
  assert.equal(describeRule({ kind: 'daily', from: '2026-08-31', every: 1 }), 'Every day');
  assert.equal(describeRule({ kind: 'monthly', day: 15 }), 'Day 15 of the month');
  assert.equal(describeRule(null), 'No schedule');
});
