/**
 * Minimal promise wrapper over one IndexedDB object store.
 *
 * Used by the IndexedDB driver for its data, and by the FSA driver purely to
 * remember the directory handle between sessions (handles are structured-
 * cloneable, which is what makes "reopen straight into your folder" possible).
 */

const DB_NAME = 'task-tracker';
const DB_VERSION = 1;
export const STORES = { KV: 'kv', BLOBS: 'blobs' };

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    req.onblocked = () => reject(new Error('IndexedDB blocked by another tab'));
  });
  return dbPromise;
}

function tx(storeName, mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const result = fn(t.objectStore(storeName));
    t.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('transaction aborted'));
  }));
}

export const idbKv = {
  get: (store, key) => tx(store, 'readonly', (s) => s.get(key)),
  set: (store, key, value) => tx(store, 'readwrite', (s) => { s.put(value, key); }),
  del: (store, key) => tx(store, 'readwrite', (s) => { s.delete(key); }),
  keys: (store) => tx(store, 'readonly', (s) => s.getAllKeys()),
};

/**
 * Ask the browser to exempt our storage from eviction.
 *
 * The target machine reports storage as evictable, so this is requested on
 * first run. It may be refused — the IndexedDB mirror is a convenience, never
 * the source of truth, so a refusal is not an error.
 */
export async function requestPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch (_) { /* not fatal */ }
  return false;
}
