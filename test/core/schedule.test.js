import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scheduleFor, instantAt, WINDOW_DAYS, CHANNELS } from '../../src/core/schedule.js';
import { createEmptyDoc } from '../../src/core/schema.js';

// Monday 2026-08-31, 09:00 local.
const NOW = new Date(2026, 7, 31, 9, 0).getTime();
const clock = () => NOW;

function docWith(over = {}) {
  return { ...createEmptyDoc({ now: clock }), ...over };
}

const routine = (over = {}) => ({
  id: 'rtn_1', ref: 'R-1', name: 'Morning meds', timeMin: 7 * 60, steps: [],
  rule: { kind: 'daily', from: '2026-08-01', every: 1 }, archived: false, ...over,
});

const event = (over = {}) => ({
  id: 'evt_1', ref: 'C-1', name: 'Dentist', detail: '', startMin: 14 * 60, endMin: 15 * 60,
  spanDays: 0, leadMin: null, rule: { kind: 'once', date: '2026-09-01' }, archived: false, ...over,
});

const task = (over = {}) => ({
  id: 'tsk_1', ref: 'T-1', name: 'Buy timber', project: null, status: 'todo',
  priority: 'normal', dueKey: null, detail: '', doneAt: null, archived: false, ...over,
});

// --- the helper -------------------------------------------------------------

test('instantAt builds a local instant, not a UTC one', () => {
  assert.equal(instantAt('2026-08-31', 7 * 60), new Date(2026, 7, 31, 7, 0).getTime());
  assert.equal(instantAt('2026-08-31', 0), new Date(2026, 7, 31, 0, 0).getTime());
});

test('instantAt is correct across a DST transition', () => {
  // UK clocks go back at 02:00 on 2026-10-25. 07:00 local must remain 07:00
  // local, which naive midnight + 7h arithmetic would get wrong by an hour.
  const t = instantAt('2026-10-25', 7 * 60);
  assert.equal(new Date(t).getHours(), 7);
});

// --- the window -------------------------------------------------------------

test('nothing scheduled for an empty document', () => {
  assert.deepEqual(scheduleFor(docWith({ settings: { ...createEmptyDoc({ now: clock }).settings,
    digest: { enabled: false, timeMin: 450 } } }), NOW), []);
});

test('a daily routine produces one notification per day in the window', () => {
  const out = scheduleFor(docWith({ routines: [routine()] }), NOW)
    .filter((n) => n.channel === CHANNELS.ROUTINES);
  // Today's 07:00 has already gone, so the window starts tomorrow.
  assert.equal(out.length, WINDOW_DAYS - 1);
  assert.equal(new Date(out[0].fireAt).getHours(), 7);
});

test('nothing is ever scheduled in the past', () => {
  const out = scheduleFor(docWith({ routines: [routine()], events: [event()] }), NOW);
  assert.ok(out.length > 0);
  for (const n of out) assert.ok(n.fireAt > NOW, `${n.id} fires at ${new Date(n.fireAt)}`);
});

test('today still counts when its time has not yet passed', () => {
  const out = scheduleFor(docWith({ routines: [routine({ timeMin: 18 * 60 })] }), NOW)
    .filter((n) => n.channel === CHANNELS.ROUTINES);
  assert.equal(out.length, WINDOW_DAYS);
  assert.equal(out[0].id, 'rtn:rtn_1:2026-08-31');
});

test('the window is bounded, so an infinite rule cannot explode', () => {
  const out = scheduleFor(docWith({ routines: [routine()] }), NOW, { windowDays: 3 })
    .filter((n) => n.channel === CHANNELS.ROUTINES);
  assert.equal(out.length, 2);
});

test('results are sorted by fire time', () => {
  const out = scheduleFor(docWith({
    routines: [routine({ id: 'rtn_late', timeMin: 22 * 60 }), routine({ id: 'rtn_early', timeMin: 18 * 60 })],
  }), NOW);
  const times = out.map((n) => n.fireAt);
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
});

test('ids are stable across identical calls, which is what makes diffing work', () => {
  const doc = docWith({ routines: [routine()], events: [event()] });
  assert.deepEqual(scheduleFor(doc, NOW).map((n) => n.id), scheduleFor(doc, NOW).map((n) => n.id));
});

// --- routines ---------------------------------------------------------------

test('an archived routine is never scheduled', () => {
  const out = scheduleFor(docWith({ routines: [routine({ archived: true })] }), NOW);
  assert.equal(out.filter((n) => n.channel === CHANNELS.ROUTINES).length, 0);
});

test('a dismissed occurrence is not scheduled', () => {
  // Dismissing at 06:00 must stop the 07:00 ping, not just clear the card.
  const early = new Date(2026, 7, 31, 6, 0).getTime();
  const doc = docWith({ routines: [routine()], dismissals: ['rtn_1:2026-08-31'] });
  const ids = scheduleFor(doc, early).map((n) => n.id);
  assert.ok(!ids.includes('rtn:rtn_1:2026-08-31'));
  assert.ok(ids.includes('rtn:rtn_1:2026-09-01'), 'tomorrow is untouched');
});

test('a routine notification names the routine and its steps count', () => {
  const out = scheduleFor(docWith({
    routines: [routine({ timeMin: 18 * 60, steps: ['a', 'b', 'c'] })],
  }), NOW);
  const first = out.find((n) => n.channel === CHANNELS.ROUTINES);
  assert.equal(first.title, 'Morning meds');
  assert.match(first.body, /3 steps/);
});

// --- events -----------------------------------------------------------------

test('a timed event fires at the default lead time', () => {
  const out = scheduleFor(docWith({ events: [event()] }), NOW)
    .filter((n) => n.channel === CHANNELS.EVENTS);
  assert.equal(out.length, 1);
  // 14:00 on 1 Sep, less the 15-minute default.
  assert.equal(out[0].fireAt, new Date(2026, 8, 1, 13, 45).getTime());
});

test('a per-event lead time overrides the default', () => {
  const out = scheduleFor(docWith({ events: [event({ leadMin: 60 })] }), NOW)
    .filter((n) => n.channel === CHANNELS.EVENTS);
  assert.equal(out[0].fireAt, new Date(2026, 8, 1, 13, 0).getTime());
});

test('a lead of zero means at the start, not "use the default"', () => {
  const out = scheduleFor(docWith({ events: [event({ leadMin: 0 })] }), NOW)
    .filter((n) => n.channel === CHANNELS.EVENTS);
  assert.equal(out[0].fireAt, new Date(2026, 8, 1, 14, 0).getTime());
});

test('an all-day event gets no notification of its own', () => {
  // It has no time to fire at, and inventing one would be a guess. The daily
  // digest carries it instead.
  const out = scheduleFor(docWith({ events: [event({ startMin: null, endMin: null })] }), NOW);
  assert.equal(out.filter((n) => n.channel === CHANNELS.EVENTS).length, 0);
});

test('a multi-day event notifies once, on its start day', () => {
  const out = scheduleFor(docWith({ events: [event({ spanDays: 3 })] }), NOW)
    .filter((n) => n.channel === CHANNELS.EVENTS);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'evt:evt_1:2026-09-01');
});

test('a recurring event notifies on each occurrence in the window', () => {
  const out = scheduleFor(docWith({
    events: [event({ rule: { kind: 'weekly', days: [2] } })],  // Wednesdays
  }), NOW).filter((n) => n.channel === CHANNELS.EVENTS);
  assert.equal(out.length, 2, 'two Wednesdays fall in a 14-day window');
});

test('an event notification states the real start time, not the lead time', () => {
  const out = scheduleFor(docWith({ events: [event({ leadMin: 30 })] }), NOW)
    .filter((n) => n.channel === CHANNELS.EVENTS);
  assert.equal(out[0].title, 'Dentist');
  assert.match(out[0].body, /14:00/);
});

// --- the digest -------------------------------------------------------------

test('the digest fires daily at its configured time', () => {
  const out = scheduleFor(docWith({}), NOW).filter((n) => n.channel === CHANNELS.DIGEST);
  assert.equal(out.length, WINDOW_DAYS - 1, "today's 07:30 has already gone");
  assert.equal(new Date(out[0].fireAt).getHours(), 7);
  assert.equal(new Date(out[0].fireAt).getMinutes(), 30);
});

test('the digest can be switched off', () => {
  const base = createEmptyDoc({ now: clock });
  const doc = { ...base, settings: { ...base.settings, digest: { enabled: false, timeMin: 450 } } };
  assert.equal(scheduleFor(doc, NOW).filter((n) => n.channel === CHANNELS.DIGEST).length, 0);
});

test("the digest body reports what that day is known to hold", () => {
  const out = scheduleFor(docWith({
    tasks: [task({ dueKey: '2026-09-01' }), task({ id: 'tsk_2', dueKey: '2026-09-01' })],
    routines: [routine()],
  }), NOW).filter((n) => n.channel === CHANNELS.DIGEST);
  const tomorrow = out.find((n) => n.id === 'dig:2026-09-01');
  assert.match(tomorrow.body, /2 tasks/);
  assert.match(tomorrow.body, /1 routine/);
});

test('a day with nothing on it still gets a digest, and says so', () => {
  const out = scheduleFor(docWith({}), NOW).filter((n) => n.channel === CHANNELS.DIGEST);
  assert.match(out[0].body, /nothing/i);
});

test('overdue tasks are counted in every digest, not only on their due day', () => {
  const out = scheduleFor(docWith({ tasks: [task({ dueKey: '2026-08-01' })] }), NOW)
    .filter((n) => n.channel === CHANNELS.DIGEST);
  assert.match(out[0].body, /1 overdue/);
});

test('a done task is never counted', () => {
  const out = scheduleFor(docWith({
    tasks: [task({ dueKey: '2026-09-01', status: 'done', doneAt: 1 })],
  }), NOW).filter((n) => n.channel === CHANNELS.DIGEST);
  assert.match(out.find((n) => n.id === 'dig:2026-09-01').body, /nothing/i);
});
