/**
 * Document shape, defaults and migration.
 *
 * One JSON document holds every collection. The collections are peers — tasks,
 * routines, events — rather than a hierarchy, which is what lets a further one
 * (a budget module) be added later without anything above it moving.
 *
 * `migrate` runs on every load and must be safe to apply to an already-current
 * document. It is deliberately forgiving: that is right for an old-but-genuine
 * file and wrong for a damaged one, so `validateDoc` gates it. Without that
 * gate, hand-edited nonsense would be silently "repaired" into an empty
 * document, quietly discarding real data.
 */

import { makeId } from './ids.js';
import { repairProjects, repairTasks } from './tasks.js';
import { repairRoutines } from './routines.js';

export const DOC_VERSION = 1;

export const DEFAULT_SETTINGS = {
  accentMode: 'standard',
  /** Minutes from local midnight. 450 = 07:30. */
  digest: { enabled: true, timeMin: 450 },
  /** Default minutes before an event to notify; an event may override it. */
  eventLeadMin: 15,
};

/** Settings contains a nested object, so a shallow spread would let two
 *  documents share one `digest` and let a write to either mutate DEFAULTS. */
function freshSettings(saved = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    digest: { ...DEFAULT_SETTINGS.digest, ...(saved.digest || {}) },
  };
}

export function createEmptyDoc({ now = Date.now } = {}) {
  return {
    version: DOC_VERSION,
    id: makeId('doc', now),
    createdAt: now(),
    seq: {},
    settings: freshSettings(),
    projects: [],
    tasks: [],
    routines: [],
    events: [],
    /** Flat array of keys: `<id>:<dateKey>` or `<id>:<dateKey>:<when>`.
     *  Consumed as a Set; pruned by signals.pruneDismissals so it cannot grow
     *  for the life of the document. */
    dismissals: [],
  };
}

const COLLECTIONS = ['projects', 'tasks', 'routines', 'events', 'dismissals'];

/**
 * Is this plausibly one of our documents?
 * @returns {{ok: true} | {ok: false, problem: string}}
 */
export function validateDoc(doc) {
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, problem: 'The file does not contain a tracker document.' };
  }
  for (const field of COLLECTIONS) {
    if (field in doc && !Array.isArray(doc[field])) {
      return { ok: false, problem: `"${field}" should be a list, but it is not.` };
    }
  }
  if ('settings' in doc && (typeof doc.settings !== 'object' || doc.settings === null
      || Array.isArray(doc.settings))) {
    return { ok: false, problem: '"settings" is damaged.' };
  }
  if ('version' in doc && typeof doc.version !== 'number') {
    return { ok: false, problem: '"version" is not a number.' };
  }
  const hasAnyContent = [...COLLECTIONS, 'settings', 'version'].some((f) => f in doc);
  if (!hasAnyContent) {
    return { ok: false, problem: 'The file has none of the expected fields.' };
  }
  return { ok: true };
}

/**
 * Bring any older document up to the current shape.
 *
 * Later tasks add their own `repair*()` calls here. Each owning module carries
 * its own repair rules rather than this file reaching in and duplicating them.
 */
export function migrate(doc, { now = Date.now } = {}) {
  if (!doc || typeof doc !== 'object') return createEmptyDoc({ now });

  const out = { ...doc };
  out.version = DOC_VERSION;
  out.id = out.id || makeId('doc', now);
  out.createdAt = out.createdAt ?? now();
  out.seq = out.seq && typeof out.seq === 'object' ? out.seq : {};
  out.settings = freshSettings(out.settings || {});

  out.projects = repairProjects(out.projects);
  out.tasks = repairTasks(out.tasks);
  out.routines = repairRoutines(out.routines);
  out.events = Array.isArray(out.events) ? out.events : [];
  out.dismissals = Array.isArray(out.dismissals) ? out.dismissals.map(String) : [];

  return out;
}
