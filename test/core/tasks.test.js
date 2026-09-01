import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createProject, createTask, liveTasks, liveProjects, setStatus,
  dueState, groupByProject, repairTasks, STATUSES, PRIORITIES,
} from '../../src/core/tasks.js';
import { createEmptyDoc } from '../../src/core/schema.js';

const clock = () => new Date(2026, 7, 31, 9, 0).getTime();
const fresh = () => createEmptyDoc({ now: clock });

test('a new task carries every default', () => {
  const doc = fresh();
  const task = createTask(doc, { name: 'Rewire the shed' }, { now: clock });
  assert.equal(task.name, 'Rewire the shed');
  assert.equal(task.status, 'todo');
  assert.equal(task.priority, 'normal');
  assert.equal(task.project, null);
  assert.equal(task.dueKey, null);
  assert.equal(task.archived, false);
  assert.equal(task.doneAt, null);
  assert.ok(task.id.startsWith('tsk_'));
  assert.equal(task.ref, 'T-1');
});

test('refs increment per kind', () => {
  const doc = fresh();
  assert.equal(createTask(doc, {}, { now: clock }).ref, 'T-1');
  assert.equal(createTask(doc, {}, { now: clock }).ref, 'T-2');
  assert.equal(createProject(doc, {}, { now: clock }).ref, 'P-1');
});

test('completing a task stamps doneAt, and un-completing clears it', () => {
  const doc = fresh();
  const task = createTask(doc, { name: 'x' }, { now: clock });
  const done = setStatus(task, 'done', { now: clock });
  assert.equal(done.status, 'done');
  assert.equal(done.doneAt, clock());
  assert.equal(task.doneAt, null, 'setStatus must be pure — the input is untouched');

  const reopened = setStatus(done, 'todo', { now: clock });
  assert.equal(reopened.doneAt, null);
});

test('an unknown status is refused rather than stored', () => {
  const doc = fresh();
  const task = createTask(doc, {}, { now: clock });
  assert.throws(() => setStatus(task, 'nearly', { now: clock }), /status/);
});

test('archived records are excluded from the live lists', () => {
  const doc = fresh();
  doc.tasks = [
    createTask(doc, { name: 'live' }, { now: clock }),
    { ...createTask(doc, { name: 'gone' }, { now: clock }), archived: true },
  ];
  assert.equal(liveTasks(doc).length, 1);
  assert.equal(liveTasks(doc)[0].name, 'live');
});

test('dueState classifies against a given day', () => {
  const today = '2026-08-31';
  assert.equal(dueState({ dueKey: null }, today), 'none');
  assert.equal(dueState({ dueKey: '2026-08-30' }, today), 'overdue');
  assert.equal(dueState({ dueKey: '2026-08-31' }, today), 'today');
  assert.equal(dueState({ dueKey: '2026-09-05' }, today), 'upcoming');
});

test('a completed task is never overdue', () => {
  // Nagging about something already finished is the fastest way to teach
  // someone to ignore the colour.
  const today = '2026-08-31';
  assert.equal(dueState({ dueKey: '2026-08-01', status: 'done' }, today), 'none');
});

test('grouping puts unfiled work in its own trailing group', () => {
  const doc = fresh();
  const shed = createProject(doc, { name: 'Shed' }, { now: clock });
  doc.projects = [shed];
  doc.tasks = [
    createTask(doc, { name: 'filed', project: shed.id }, { now: clock }),
    createTask(doc, { name: 'loose' }, { now: clock }),
  ];
  const groups = groupByProject(doc, liveTasks(doc));
  assert.equal(groups.length, 2);
  assert.equal(groups[0].name, 'Shed');
  assert.equal(groups[1].project, null);
  assert.equal(groups[1].name, 'No project');
  assert.equal(groups[1].tasks[0].name, 'loose');
});

test('a group with no tasks is dropped, but the unfiled group only appears when used', () => {
  const doc = fresh();
  const empty = createProject(doc, { name: 'Empty' }, { now: clock });
  doc.projects = [empty];
  doc.tasks = [];
  assert.deepEqual(groupByProject(doc, liveTasks(doc)), []);
});

test('repairTasks survives junk without throwing it all away', () => {
  const repaired = repairTasks([
    { id: 'tsk_1' },                                  // missing everything
    { id: 'tsk_2', name: {}, status: 'invented' },    // wrong types
    { name: 'no id' },                                // unidentifiable
    null,
  ]);
  assert.equal(repaired.length, 2, 'records without an id are dropped');
  assert.equal(repaired[0].status, 'todo');
  assert.equal(repaired[0].name, 'New task');
  // Not String(name || ''): an object is truthy, so `|| ''` would not catch it
  // and String({}) reads back as the literal "[object Object]".
  assert.equal(repaired[1].name, 'New task');
  assert.ok(STATUSES.includes(repaired[1].status));
  assert.ok(PRIORITIES.includes(repaired[1].priority));
});
