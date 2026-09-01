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
import { createStore, createDebouncedWriter } from '../store/store.js';
import { createStorage, SAVE_CADENCE } from '../platform/storage.js';
import { createEmptyDoc, validateDoc, migrate } from '../core/schema.js';

export const SCREENS = ['today', 'tasks', 'calendar', 'settings'];

const RENDERERS = {
  today: renderToday,
  tasks: renderTasks,
  calendar: renderCalendar,
  settings: renderSettings,
};

export function createApp({ root, driver, now = Date.now } = {}) {
  const chosen = driver ? { driver } : createStorage();
  const store = createStore({ driver: chosen.driver, clock: now });
  const writer = createDebouncedWriter(store, SAVE_CADENCE);

  const state = { doc: null, screen: 'today', now: now(), problem: null };

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
      const ctx = { doc: state.doc, now: state.now, actions };
      const body = state.problem
        ? recoveryScreen(state.problem)
        : RENDERERS[state.screen](ctx);
      mount(root, body, state.problem ? null : renderTabBar(ctx, SCREENS, state.screen));
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
