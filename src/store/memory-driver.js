/**
 * In-memory driver. The reason any of the persistence logic is testable.
 *
 * `showDirectoryPicker()` has no UI to click under a headless browser, so the
 * FSA driver can never be exercised by an automated test. Everything above the
 * driver line — snapshot rotation, debounce coalescing, migration, the event
 * log — runs against this instead, in plain Node, with no browser at all.
 *
 * Also supports fault injection so failure paths get tested rather than assumed.
 */

import { STATUS } from './store.js';

export function createMemoryDriver({ label = 'memory', seed = {} } = {}) {
  const texts = new Map(Object.entries(seed));
  const blobs = new Map();

  /** Set to a function to make the next matching op throw. */
  let faultFn = null;

  function checkFault(op, name) {
    if (faultFn) {
      const err = faultFn(op, name);
      if (err) throw err;
    }
  }

  return {
    label,
    kind: 'memory',

    async init() { return STATUS.READY; },

    async getText(name) {
      checkFault('getText', name);
      return texts.has(name) ? texts.get(name) : null;
    },

    async putText(name, text) {
      checkFault('putText', name);
      texts.set(name, text);
    },

    async appendText(name, text) {
      checkFault('appendText', name);
      texts.set(name, (texts.get(name) || '') + text);
    },

    async listNames(prefix = '') {
      checkFault('listNames', prefix);
      return [...texts.keys()].filter((k) => k.startsWith(prefix));
    },

    async removeName(name) {
      checkFault('removeName', name);
      texts.delete(name);
    },

    async putBlob(id, blob) { checkFault('putBlob', id); blobs.set(id, blob); },
    async getBlob(id) { checkFault('getBlob', id); return blobs.has(id) ? blobs.get(id) : null; },
    async removeBlob(id) { checkFault('removeBlob', id); blobs.delete(id); },

    // --- test affordances -------------------------------------------------
    /** @param {null | ((op: string, name: string) => Error|null)} fn */
    setFault(fn) { faultFn = fn; },
    dump() { return Object.fromEntries(texts); },
    get textCount() { return texts.size; },
  };
}
