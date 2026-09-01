/**
 * The settings and whole-document actions.
 *
 * Extracted from `app.js` for the same reason `notify-sync.js` was: it is a
 * self-contained group — reading and writing `settings`, and replacing the
 * document wholesale — that needs none of the app's render loop, editor state or
 * storage wiring beyond the one `update` seam it is handed. `app.js` keeps the
 * wiring; this keeps the rules.
 *
 * Everything here goes through `update`, which is what makes import behave like
 * any other change: the document is swapped, scheduled for saving, redrawn and
 * re-synced to the platform's notifications in one step, with no second path
 * that could forget one of the four.
 */

import { validateDoc, migrate } from '../core/schema.js';

/**
 * @param {object} opts
 * @param {(fn: (doc: object) => object) => void} opts.update  the app's pure
 *   `doc → doc` applier, which also persists and redraws
 * @param {() => object|null} opts.getDoc  current document, or null before boot
 * @param {() => number} [opts.now]  injected clock
 */
export function createSettingsActions({ update, getDoc, now = Date.now }) {
  return {
    /** @param {string} path e.g. 'digest.timeMin' or 'accentMode' */
    setSetting(path, value) {
      update((doc) => {
        const [head, tail] = path.split('.');
        const settings = tail
          ? { ...doc.settings, [head]: { ...doc.settings[head], [tail]: value } }
          : { ...doc.settings, [head]: value };
        return { ...doc, settings };
      });
    },

    exportDoc() { return JSON.stringify(getDoc(), null, 2); },

    /**
     * Replace the document from a backup file.
     *
     * Validated before it is migrated, never after: `migrate` is deliberately
     * forgiving, so handing it nonsense would "repair" it into an empty
     * document and discard whatever the user actually had.
     *
     * @returns {boolean} whether the text was accepted
     */
    importDoc(text) {
      let raw;
      try { raw = JSON.parse(text); } catch { return false; }
      const check = validateDoc(raw);
      if (!check.ok) return false;
      update(() => migrate(raw, { now }));
      return true;
    },
  };
}
