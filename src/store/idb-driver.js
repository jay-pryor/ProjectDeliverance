/**
 * IndexedDB driver — the fallback.
 *
 * Kept because the primary path can be withdrawn by policy at any time, and
 * because it doubles as a hot mirror for recovery. It is NOT a peer of the FSA
 * driver in durability, for two measured reasons:
 *
 *  - The target machine reports storage as evictable (`persisted: NO`), so the
 *    browser is entitled to discard this.
 *  - Every `file://` page shares one origin literally named `file://`, so this
 *    data is reachable by any other local HTML file the user opens.
 *
 * Anything using it should say so visibly rather than pretend all is well.
 */

import { STATUS } from './store.js';
import { idbKv, STORES, requestPersistentStorage } from './idb-kv.js';

const TEXT_PREFIX = 'text:';

export function isIdbSupported() {
  return typeof indexedDB !== 'undefined';
}

export function createIdbDriver({ label = 'browser storage' } = {}) {
  return {
    kind: 'idb',
    label,
    /** True when the browser has exempted this origin from eviction. */
    persisted: false,

    async init() {
      if (!isIdbSupported()) return STATUS.ERROR;
      try {
        this.persisted = await requestPersistentStorage();
        await idbKv.keys(STORES.KV); // force the connection open now, not later
        return STATUS.READY;
      } catch (_) {
        return STATUS.ERROR;
      }
    },

    async getText(name) {
      const v = await idbKv.get(STORES.KV, TEXT_PREFIX + name);
      return v == null ? null : String(v);
    },

    async putText(name, text) {
      await idbKv.set(STORES.KV, TEXT_PREFIX + name, text);
    },

    async appendText(name, text) {
      const existing = (await this.getText(name)) || '';
      await this.putText(name, existing + text);
    },

    async listNames(prefix = '') {
      const keys = await idbKv.keys(STORES.KV);
      return keys
        .filter((k) => typeof k === 'string' && k.startsWith(TEXT_PREFIX))
        .map((k) => k.slice(TEXT_PREFIX.length))
        .filter((n) => n.startsWith(prefix));
    },

    async removeName(name) {
      await idbKv.del(STORES.KV, TEXT_PREFIX + name);
    },

    async putBlob(id, blob) { await idbKv.set(STORES.BLOBS, id, blob); },
    async getBlob(id) {
      const v = await idbKv.get(STORES.BLOBS, id);
      return v == null ? null : v;
    },
    async removeBlob(id) { await idbKv.del(STORES.BLOBS, id); },
  };
}
