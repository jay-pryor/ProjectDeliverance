import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEvent, eventsOnDay, describeEventTime, eventNotifications,
  eventKey, spanOf, repairEvents, EVENT_FIELDS,
} from '../../src/core/events.js';
import { createEmptyDoc } from '../../src/core/schema.js';

const clock = () => new Date(2026, 7, 31, 9, 0).getTime();
const docWith = (events) => ({ ...createEmptyDoc({ now: clock }), events });

test('the Teams integration is gone', () => {
  assert.ok(!('teamsLink' in EVENT_FIELDS));
});

test('leadMin defaults to null, meaning "use the app default"', () => {
  assert.equal(EVENT_FIELDS.leadMin, null);
});

test('a single-day event appears only on its day', () => {
  const doc = docWith([createEvent({ seq: {} }, {
    name: 'Dentist', rule: { kind: 'once', date: '2026-09-03' }, startMin: 540,
  }, { now: clock })]);
  assert.equal(eventsOnDay(doc, '2026-09-03').length, 1);
  assert.equal(eventsOnDay(doc, '2026-09-04').length, 0);
});

test('a multi-day event covers every day of its span, with an index', () => {
  const doc = docWith([createEvent({ seq: {} }, {
    name: 'Peter visiting', rule: { kind: 'once', date: '2026-09-01' }, spanDays: 2,
  }, { now: clock })]);
  assert.equal(eventsOnDay(doc, '2026-09-01')[0].dayIndex, 0);
  assert.equal(eventsOnDay(doc, '2026-09-02')[0].dayIndex, 1);
  assert.equal(eventsOnDay(doc, '2026-09-03')[0].dayIndex, 2);
  assert.equal(eventsOnDay(doc, '2026-09-04').length, 0);
});

test('a recurring event repeats, span and all', () => {
  const doc = docWith([createEvent({ seq: {} }, {
    name: 'Standup', rule: { kind: 'weekly', days: [0] },
  }, { now: clock })]);
  assert.equal(eventsOnDay(doc, '2026-08-31').length, 1);
  assert.equal(eventsOnDay(doc, '2026-09-07').length, 1);
  assert.equal(eventsOnDay(doc, '2026-09-01').length, 0);
});

test('spanOf is clamped and never negative', () => {
  assert.equal(spanOf({ spanDays: -4 }), 0);
  assert.equal(spanOf({ spanDays: 9999 }), 92);
  assert.equal(spanOf({}), 0);
});

test('describeEventTime covers all-day, start-only and ranged', () => {
  assert.equal(describeEventTime({ startMin: null }), 'All day');
  assert.equal(describeEventTime({ startMin: 840, endMin: null }), '14:00');
  assert.equal(describeEventTime({ startMin: 840, endMin: 960 }), '14:00–16:00');
});

test('the panel list covers today and tomorrow, keyed separately', () => {
  const doc = docWith([createEvent({ seq: {} }, {
    name: 'Dentist', rule: { kind: 'once', date: '2026-09-01' },
  }, { now: clock })]);
  const notes = eventNotifications(doc, clock());
  assert.equal(notes.length, 1);
  assert.equal(notes[0].when, 'tomorrow');
});

test('dismissing tomorrow does not suppress the reminder on the day', () => {
  // Two different pieces of news about the same event, so two keys.
  const event = createEvent({ seq: {} }, { rule: { kind: 'once', date: '2026-09-01' } }, { now: clock });
  const doc = { ...docWith([event]), dismissals: [eventKey(event, '2026-09-01', 'tomorrow')] };
  assert.equal(eventNotifications(doc, clock()).length, 0);
  const onTheDay = new Date(2026, 8, 1, 9).getTime();
  assert.equal(eventNotifications(doc, onTheDay).length, 1);
});

test('repairEvents coerces and drops the unidentifiable', () => {
  const out = repairEvents([
    { id: 'evt_1' },
    { id: 'evt_2', name: {}, spanDays: -3, leadMin: 'soon' },
    { name: 'no id' },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[1].name, 'New event');
  assert.equal(out[1].spanDays, 0);
  assert.equal(out[1].leadMin, null);
});
