/**
 * Projects and tasks.
 *
 * Two levels and no more. The reference tracker models five
 * (opportunity → project → effort → task → subtask) because work at an
 * organisation genuinely nests that deeply; a personal list does not, and every
 * level costs a rendering path and a drag target on a screen that has neither
 * to spare.
 *
 * Pure: nothing here reads a clock it was not handed, and no function mutates
 * its argument.
 */

import { makeId, nextRef } from './ids.js';

export const STATUSES = ['todo', 'doing', 'done'];
export const PRIORITIES = ['low', 'normal', 'high'];

/** Defaults for a record read back from disk. Exported for migration. */
export const PROJECT_FIELDS = {
  name: 'New project',
  colour: null,
  archived: false,
};

export const TASK_FIELDS = {
  name: 'New task',
  detail: '',
  /** Project id, or null for unfiled work. Unfiled is a normal state, not an
   *  error: something you have not decided where to put should still be
   *  visible rather than rejected. */
  project: null,
  status: 'todo',
  priority: 'normal',
  /** "YYYY-MM-DD", or null. */
  dueKey: null,
  doneAt: null,
  archived: false,
};

export function createProject(doc, fields = {}, { now = Date.now } = {}) {
  return {
    ...PROJECT_FIELDS,
    id: makeId('prj', now),
    ref: nextRef(doc, 'project', 'P'),
    createdAt: now(),
    ...fields,
  };
}

export function createTask(doc, fields = {}, { now = Date.now } = {}) {
  return {
    ...TASK_FIELDS,
    id: makeId('tsk', now),
    ref: nextRef(doc, 'task', 'T'),
    createdAt: now(),
    ...fields,
  };
}

export const liveProjects = (doc) => (doc.projects || []).filter((p) => p && !p.archived);
export const liveTasks = (doc) => (doc.tasks || []).filter((t) => t && !t.archived);

/**
 * Move a task to a status. Pure — returns a new record.
 *
 * `doneAt` is stamped here rather than by the caller so that a task cannot end
 * up marked done with no completion time, which would silently break any later
 * "what did I finish this week" question.
 */
export function setStatus(task, status, { now = Date.now } = {}) {
  if (!STATUSES.includes(status)) {
    throw new Error(`setStatus: unknown status "${status}"`);
  }
  return {
    ...task,
    status,
    doneAt: status === 'done' ? (task.doneAt ?? now()) : null,
  };
}

/**
 * How a due date reads today.
 *
 * A done task is never overdue: nagging about finished work is the fastest way
 * to teach someone to ignore the colour that means "overdue".
 *
 * @returns {'overdue'|'today'|'upcoming'|'none'}
 */
export function dueState(task, todayKey) {
  if (!task || !task.dueKey || task.status === 'done') return 'none';
  if (task.dueKey < todayKey) return 'overdue';
  if (task.dueKey === todayKey) return 'today';
  return 'upcoming';
}

/**
 * Tasks grouped under their project, in document order, with unfiled work in a
 * trailing group.
 *
 * Empty groups are dropped. This is the opposite of the reference app's board,
 * where an empty column earns its place because it is a drop target — there is
 * no dragging here, so an empty heading is only ever noise.
 *
 * @returns {Array<{project: object|null, name: string, tasks: object[]}>}
 */
export function groupByProject(doc, tasks) {
  const groups = liveProjects(doc).map((project) => ({
    project, name: project.name, tasks: [],
  }));
  const byId = new Map(groups.map((g) => [g.project.id, g]));
  const unfiled = { project: null, name: 'No project', tasks: [] };

  for (const task of tasks) {
    (byId.get(task.project) || unfiled).tasks.push(task);
  }

  const out = groups.filter((g) => g.tasks.length);
  if (unfiled.tasks.length) out.push(unfiled);
  return out;
}

// --- migration --------------------------------------------------------------

/** A saved string field, defended against the wrong type. */
function text(value, fallback) {
  return (typeof value === 'string' ? value.trim() : '') || fallback;
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

export function repairProjects(list) {
  return (Array.isArray(list) ? list : [])
    .filter((p) => p && p.id)
    .map((p) => ({
      ...PROJECT_FIELDS,
      ...p,
      name: text(p.name, PROJECT_FIELDS.name),
      archived: !!p.archived,
    }));
}

export function repairTasks(list) {
  return (Array.isArray(list) ? list : [])
    .filter((t) => t && t.id)
    .map((t) => ({
      ...TASK_FIELDS,
      ...t,
      name: text(t.name, TASK_FIELDS.name),
      detail: typeof t.detail === 'string' ? t.detail : '',
      status: oneOf(t.status, STATUSES, TASK_FIELDS.status),
      priority: oneOf(t.priority, PRIORITIES, TASK_FIELDS.priority),
      dueKey: /^\d{4}-\d{2}-\d{2}$/.test(t.dueKey) ? t.dueKey : null,
      project: typeof t.project === 'string' ? t.project : null,
      doneAt: Number.isFinite(t.doneAt) ? t.doneAt : null,
      archived: !!t.archived,
    }));
}
