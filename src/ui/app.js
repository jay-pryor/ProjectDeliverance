/**
 * Application state and the render loop.
 *
 * `render()` rebuilds the whole tree under `root` on every change. That is fast
 * enough at this size and removes a class of bug outright: there is no
 * incremental update path that can disagree with the document.
 */

import { el, mount } from './dom.js';
import { renderTabBar } from './tab-bar.js';
import { renderToday } from './today.js';
import { renderTasks } from './tasks.js';
import { renderCalendar } from './calendar.js';
import { renderSettings } from './settings.js';
import { renderTaskEditor } from './task-editor.js';
import { createStore, createDebouncedWriter } from '../store/store.js';
import { createStorage, SAVE_CADENCE } from '../platform/storage.js';
import { createEmptyDoc, validateDoc, migrate } from '../core/schema.js';
import { setStatus, createTask } from '../core/tasks.js';

export const SCREENS = ['today', 'tasks', 'calendar', 'settings'];

const RENDERERS = {
  today: renderToday,
  tasks: renderTasks,
  calendar: renderCalendar,
  settings: renderSettings,
};

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

export function createApp({ root, driver, now = Date.now } = {}) {
  const chosen = driver ? { driver } : createStorage();
  const store = createStore({ driver: chosen.driver, clock: now });
  const writer = createDebouncedWriter(store, SAVE_CADENCE);

  const state = { doc: null, screen: 'today', now: now(), problem: null, filter: 'open', editing: null };

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
    },
    setFilter(name) {
      state.filter = name;
      app.render();
    },
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
        // createTask mutates doc.seq to allocate a ref, so it runs against a
        // copy — update() must stay a pure doc → doc transform.
        const next = { ...doc, seq: { ...doc.seq } };
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
  };

  function recoveryScreen(problem) {
    return el('div', { class: 'screen' }, [
      el('div', { class: 'screen-head' }, [
        el('span', { class: 'mark', style: { background: 'var(--crit)' } }),
        el('span', { class: 'screen-title', text: 'Recovery' }),
      ]),
      el('p', { text: 'Your data could not be read, so nothing has been changed.' }),
      el('p', { class: 'mono', text: problem }),
    ]);
  }

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
                    editing: state.editing, actions };
      const body = state.problem
        ? recoveryScreen(state.problem)
        : RENDERERS[state.screen](ctx);
      const editor = !state.problem && state.editing?.kind === 'task'
        ? renderTaskEditor(ctx, (state.doc.tasks || []).find((t) => t.id === state.editing.id) || null)
        : null;
      mount(root, body, editor, state.problem ? null : renderTabBar(ctx, SCREENS, state.screen));
    },

    async boot() {
      await store.open();
      let raw = null;
      try {
        raw = await store.read();
      } catch (err) {
        state.problem = 'The saved file is not valid JSON.';
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
      }
      app.render();
      return app;
    },

    /** Force any pending save to land. Called when the app is backgrounded. */
    flush() { return writer.flush(); },
  };

  return app;
}
