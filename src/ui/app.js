/**
 * Application state and the render loop.
 *
 * `render()` rebuilds the whole tree under `root` on every change. That is fast
 * enough at this size and removes a class of bug outright: there is no
 * incremental update path that can disagree with the document.
 */

import { mount } from './dom.js';
import { renderTabBar } from './tab-bar.js';
import { renderToday } from './today.js';
import { renderTasks } from './tasks.js';
import { renderCalendar } from './calendar.js';
import { renderSettings } from './settings.js';
import { renderRecovery } from './recovery.js';
import { renderTaskEditor } from './task-editor.js';
import { renderEventEditor } from './event-editor.js';
import { renderRoutineEditor } from './routine-editor.js';
import { createStore, createDebouncedWriter } from '../store/store.js';
import { createStorage, SAVE_CADENCE } from '../platform/storage.js';
import { createNotifier, createLogBackend } from '../platform/notifier.js';
import { createEmptyDoc, validateDoc, migrate } from '../core/schema.js';
import { setStatus, createTask } from '../core/tasks.js';
import { createEvent } from '../core/events.js';
import { createRoutine } from '../core/routines.js';
import { todayKey, addDays, parseDateKey, dateKey } from '../core/time.js';
import { pruneDismissals } from '../core/signals.js';

export const SCREENS = ['today', 'tasks', 'calendar', 'settings'];

const RENDERERS = {
  today: renderToday,
  tasks: renderTasks,
  calendar: renderCalendar,
  settings: renderSettings,
};

/**
 * A copy of the document whose `seq` is safe to allocate a reference from.
 *
 * `nextRef` increments `doc.seq` IN PLACE, so every `create*` call has to run
 * against a copy or it mutates the live document as a side effect of what is
 * supposed to be a pure `doc → doc` transform. Three actions need this, so the
 * reason is stated once here rather than three times in comments that can drift
 * apart.
 */
function withFreshSeq(doc) {
  return { ...doc, seq: { ...doc.seq } };
}

/**
 * Apply a patch to a task. A status change is routed through `setStatus`
 * rather than spread directly, so `doneAt` is stamped when a task becomes
 * done and cleared when it moves off done — a plain spread onto the record
 * would leave `doneAt` stale in both directions.
 */
function withPatch(task, patch, now) {
  const merged = { ...task, ...patch };
  return patch.status != null ? setStatus(merged, patch.status, { now }) : merged;
}

export function createApp({ root, driver, now = Date.now, backend } = {}) {
  const chosen = driver ? { driver, degraded: false, reason: null } : createStorage();
  const store = createStore({ driver: chosen.driver, clock: now });
  const writer = createDebouncedWriter(store, {
    ...SAVE_CADENCE,
    /**
     * Silently not saving is the worst failure this app has.
     *
     * `state.storage.degraded` only ever means "IndexedDB is not available at
     * all". A write that was accepted and then rejected — quota exceeded,
     * storage evicted, a full device — is a different failure and just as
     * total, and without this it reached nobody: the writer swallows it by
     * design so a failed save cannot spin, and told only this callback.
     */
    onStateChange: (phase, err) => {
      if (phase === 'error') {
        state.saveError = (err && err.message) || String(err ?? 'Unknown save error');
      } else if (phase === 'saved' && state.saveError !== null) {
        state.saveError = null;
      } else {
        return;   // 'dirty' and 'saving' are not news, and redrawing on them costs.
      }
      app.render();
    },
  });
  const notifier = createNotifier({ backend: backend || createLogBackend() });
  /** Tail of the sync chain — see `syncNotifications`. */
  let syncing = Promise.resolve(null);

  const state = { doc: null, screen: 'today', now: now(), problem: null, filter: 'open', editing: null,
                  month: null, selectedDay: null, notifyError: null, saveError: null };
  state.storage = {
    degraded: !!chosen.degraded,
    reason: chosen.reason || null,
    label: chosen.driver.label || null,
  };

  const actions = {
    setScreen(name) {
      if (!SCREENS.includes(name) || state.screen === name) return;
      state.screen = name;
      app.render();
    },
    /** Apply a pure `doc → doc` change, then persist and redraw. */
    update(fn) {
      const next = fn(state.doc);
      if (!next || next === state.doc) return;
      state.doc = next;
      writer.schedule(next);
      app.render();
      // Fire and forget: the render must not wait on the platform.
      app.syncNotifications();
    },
    setFilter(name) {
      state.filter = name;
      app.render();
    },
    stepMonth(n) {
      const d = parseDateKey(state.month);
      // setMonth handles the year rollover, and day 1 always exists, so this
      // cannot land on a date that does not (which +30 days would).
      d.setMonth(d.getMonth() + n);
      state.month = `${dateKey(d).slice(0, 7)}-01`;
      // Move the selection with the grid. Left behind, it makes the day panel
      // describe a date in a month the grid is no longer showing, with no cell
      // highlighted to explain why — the panel reads as stale rather than as
      // "elsewhere". The 1st exists in every month, so this can never be an
      // invalid key.
      state.selectedDay = state.month;
      app.render();
    },
    selectDay(key) { state.selectedDay = key; app.render(); },
    toggleDone(id) {
      actions.update((doc) => ({
        ...doc,
        tasks: doc.tasks.map((t) => (t.id === id
          ? setStatus(t, t.status === 'done' ? 'todo' : 'done', { now })
          : t)),
      }));
    },

    openTask(id) { state.editing = { kind: 'task', id: id ?? null }; app.render(); },
    closeEditor() { state.editing = null; app.render(); },
    openEvent(id) { state.editing = { kind: 'event', id: id ?? null }; app.render(); },

    /** Create or update, decided by whether the editor was opened on an id. */
    saveTask(patch) {
      const editing = state.editing;
      actions.update((doc) => {
        if (editing && editing.id) {
          return {
            ...doc,
            tasks: doc.tasks.map((t) => (t.id === editing.id ? withPatch(t, patch, now) : t)),
          };
        }
        const next = withFreshSeq(doc);
        const created = withPatch(createTask(next, {}, { now }), patch, now);
        return { ...next, tasks: [...next.tasks, created] };
      });
      state.editing = null;
      app.render();
    },

    archiveTask(id) {
      actions.update((doc) => ({
        ...doc,
        tasks: doc.tasks.map((t) => (t.id === id ? { ...t, archived: true } : t)),
      }));
      state.editing = null;
      app.render();
    },

    /** Create or update, decided by whether the editor was opened on an id. */
    saveEvent(patch) {
      const editing = state.editing;
      actions.update((doc) => {
        if (editing && editing.id) {
          return {
            ...doc,
            events: doc.events.map((e) => (e.id === editing.id ? { ...e, ...patch } : e)),
          };
        }
        const next = withFreshSeq(doc);
        const created = { ...createEvent(next, {}, { now }), ...patch };
        return { ...next, events: [...next.events, created] };
      });
      state.editing = null;
      app.render();
    },

    archiveEvent(id) {
      actions.update((doc) => ({
        ...doc,
        events: doc.events.map((e) => (e.id === id ? { ...e, archived: true } : e)),
      }));
      state.editing = null;
      app.render();
    },

    openRoutine(id) { state.editing = { kind: 'routine', id: id ?? null }; app.render(); },

    saveRoutine(patch) {
      const editing = state.editing;
      actions.update((doc) => {
        if (editing && editing.id) {
          return { ...doc, routines: doc.routines.map((r) => (r.id === editing.id ? { ...r, ...patch } : r)) };
        }
        const next = withFreshSeq(doc);
        return { ...next, routines: [...next.routines, createRoutine(next, patch, { now })] };
      });
      state.editing = null;
      app.render();
    },

    archiveRoutine(id) {
      actions.update((doc) => ({
        ...doc, routines: doc.routines.map((r) => (r.id === id ? { ...r, archived: true } : r)),
      }));
      state.editing = null;
      app.render();
    },

    /** Dismissals are append-only within a day; pruning happens at boot. */
    dismissRoutine(key) {
      actions.update((doc) => (doc.dismissals.includes(key)
        ? doc
        : { ...doc, dismissals: [...doc.dismissals, key] }));
    },

    /** @param {string} path e.g. 'digest.timeMin' or 'accentMode' */
    setSetting(path, value) {
      actions.update((doc) => {
        const [head, tail] = path.split('.');
        const settings = tail
          ? { ...doc.settings, [head]: { ...doc.settings[head], [tail]: value } }
          : { ...doc.settings, [head]: value };
        return { ...doc, settings };
      });
    },

    exportDoc() { return JSON.stringify(state.doc, null, 2); },

    /** @returns {boolean} whether the text was accepted */
    importDoc(text) {
      let raw;
      try { raw = JSON.parse(text); } catch { return false; }
      const check = validateDoc(raw);
      if (!check.ok) return false;
      state.doc = migrate(raw, { now });
      writer.schedule(state.doc);
      app.render();
      app.syncNotifications();
      return true;
    },
  };

  const app = {
    state,
    actions,

    render() {
      // The accent lives on <html> rather than on a wrapper so it is in scope
      // for anything portalled outside the app root — which the Phase-5
      // transition overlay will be.
      if (state.doc) {
        document.documentElement.dataset.accent = state.doc.settings.accentMode || 'standard';
      }
      const ctx = { doc: state.doc, now: state.now, filter: state.filter,
                    editing: state.editing, actions,
                    month: state.month, selectedDay: state.selectedDay,
                    notifyError: state.notifyError, saveError: state.saveError,
                    storage: state.storage };
      const body = state.problem
        ? renderRecovery(state.problem)
        : RENDERERS[state.screen](ctx);
      const editor = state.problem ? null
        : state.editing?.kind === 'task'
          ? renderTaskEditor(ctx, (state.doc.tasks || []).find((t) => t.id === state.editing.id) || null)
        : state.editing?.kind === 'event'
          ? renderEventEditor(ctx, (state.doc.events || []).find((e) => e.id === state.editing.id) || null)
        : state.editing?.kind === 'routine'
          ? renderRoutineEditor(ctx, (state.doc.routines || []).find((r) => r.id === state.editing.id) || null)
        : null;
      mount(root, body, editor, state.problem ? null : renderTabBar(ctx, SCREENS, state.screen));
    },

    async boot() {
      await store.open();
      let raw = null;
      try {
        raw = await store.read();
      } catch (err) {
        // Two very different failures arrive here. `store.read()` throws a
        // SyntaxError when state.json is present but unparseable, and re-throws
        // whatever the driver threw when the storage layer itself could not be
        // reached. Blaming the file for a driver fault sends the user hunting
        // through a JSON file that is perfectly fine.
        state.problem = err instanceof SyntaxError
          ? 'The saved file is not valid JSON.'
          : `Storage could not be read: ${(err && err.message) || String(err ?? 'unknown error')}`;
        app.render();
        return app;
      }

      if (raw === null) {
        state.doc = createEmptyDoc({ now });
        writer.schedule(state.doc);
      } else {
        const check = validateDoc(raw);
        if (!check.ok) {
          // Deliberately does NOT write. A damaged file is preserved exactly as
          // found so it can still be recovered by hand.
          state.problem = check.problem;
          app.render();
          return app;
        }
        state.doc = migrate(raw, { now });
        // Pruned once per launch rather than on a timer: the list only grows
        // when something is dismissed, and nothing else reads it in between.
        const pruned = pruneDismissals(state.doc, now());
        if (pruned.length !== (state.doc.dismissals || []).length) {
          state.doc = { ...state.doc, dismissals: pruned };
          // Persist it. Left in memory, the prune reaches disk only on the next
          // unrelated edit, so a launch where the user changes nothing leaves
          // the stored list unpruned — and bounding that list is the whole
          // reason pruning exists. Guarded, so a launch with nothing to prune
          // does not spend a write.
          writer.schedule(state.doc);
        }
      }
      const today = todayKey(now());
      state.month = `${today.slice(0, 7)}-01`;
      state.selectedDay = today;
      app.render();
      await app.syncNotifications();
      return app;
    },

    /** Force any pending save to land. Called when the app is backgrounded. */
    flush() { return writer.flush(); },

    /**
     * Bring Android's pending notifications in line with the document.
     *
     * Never throws. A notification that could not be scheduled — permission not
     * granted yet, the platform refusing exact alarms — must not take down an
     * app that is otherwise working perfectly well; SETTINGS reports it instead.
     */
    syncNotifications() {
      if (!state.doc) return Promise.resolve(null);

      const run = async () => {
        try {
          const result = await notifier.sync(state.doc, now());
          state.notifyError = null;
          return result;
        } catch (err) {
          // `err` may be nullish. Some native bridges reject with no value at
          // all, and `err.message` on one of those throws a TypeError INSIDE
          // this handler — before `state.notifyError` is assigned, so the app
          // could not even report it.
          state.notifyError = (err && err.message) || String(err ?? 'Unknown notification error');
          return null;
        }
      };

      // Serialised through one chain. `actions.update` fires this without
      // awaiting, so two syncs can otherwise overlap — and because the diff
      // reads `known`, which the first has not written yet, the second would
      // schedule the same occurrences a second time.
      //
      // `run` is attached to BOTH settle paths, and `syncing` is kept
      // un-rejected. A rejected chain head is silently fatal: every later
      // `.then(fn)` with only a fulfillment handler skips `fn` and re-propagates
      // the rejection, so one bad sync would disable notifications for the rest
      // of the session with nothing logged and nothing shown.
      const next = syncing.then(run, run);
      syncing = next.catch(() => null);
      return next;
    },
  };

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        state.now = now();
        app.syncNotifications();
      }
    });
  }

  return app;
}
