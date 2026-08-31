import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dateKey, parseDateKey, addDays, todayKey,
  minutesToLabel, labelToMinutes, dayName, formatDayLabel, isWeekend,
} from '../../src/core/time.js';

test('dateKey uses local components, not UTC', () => {
  // 23:30 local on the 31st. toISOString() would report the 1st for anyone
  // east of Greenwich — this is the bug the local construction prevents.
  const d = new Date(2026, 7, 31, 23, 30);
  assert.equal(dateKey(d), '2026-08-31');
});

test('parseDateKey round-trips', () => {
  assert.equal(dateKey(parseDateKey('2026-08-31')), '2026-08-31');
  assert.equal(parseDateKey('nonsense'), null);
});

test('addDays crosses month and year boundaries', () => {
  assert.equal(addDays('2026-08-31', 1), '2026-09-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
});

test('addDays crosses a DST boundary without losing a day', () => {
  // UK clocks go back on 2026-10-25. Naive +86400000ms arithmetic lands at
  // 23:00 the previous day; calendar arithmetic does not.
  assert.equal(addDays('2026-10-24', 1), '2026-10-25');
  assert.equal(addDays('2026-10-25', 1), '2026-10-26');
});

test('minute labels round-trip', () => {
  assert.equal(minutesToLabel(435), '07:15');
  assert.equal(minutesToLabel(0), '00:00');
  assert.equal(labelToMinutes('07:15'), 435);
  assert.equal(labelToMinutes('25:00'), null);
  assert.equal(labelToMinutes('rubbish'), null);
});

test('day naming is Monday-first', () => {
  assert.equal(dayName('2026-08-31'), 'Mon');
  assert.equal(formatDayLabel('2026-08-31'), 'Mon 31 Aug');
  assert.equal(isWeekend('2026-08-31'), false);
  assert.equal(isWeekend('2026-08-30'), true);
});

test('todayKey accepts an injected clock', () => {
  assert.equal(todayKey(new Date(2026, 7, 31, 9, 0).getTime()), '2026-08-31');
});
