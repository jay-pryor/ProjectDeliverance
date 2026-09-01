/**
 * Where the document lives — the platform's answer, not the app's.
 *
 * This is one of the two files in `platform/`, the only folder allowed to know
 * what host the app is running on. Everything above it sees a driver satisfying
 * the store's contract and nothing more.
 *
 * Today that is always IndexedDB, which is the right choice in both hosts we
 * care about:
 *
 *   - In a browser (the development loop) it is the only durable option.
 *   - Inside the Capacitor WebView it is app-private storage, cleared only when
 *     the user clears the app's data. Unlike the reference app's situation on a
 *     managed Windows machine — where `persisted: NO` made browser storage
 *     evictable and therefore never a source of truth — here it genuinely is
 *     the source of truth.
 *
 * A later phase may add a Capacitor Filesystem driver so the document is a real
 * file that can be pulled off the device with adb. If so it is added HERE, and
 * nothing above this file changes.
 */

import { createIdbDriver, isIdbSupported } from '../store/idb-driver.js';
import { createMemoryDriver } from '../store/memory-driver.js';

/**
 * @returns {{driver: object, degraded: boolean, reason: string|null}}
 */
export function createStorage() {
  if (isIdbSupported()) {
    return { driver: createIdbDriver(), degraded: false, reason: null };
  }
  // Private-mode browsers and some WebView configurations block IndexedDB.
  // A working-but-forgetful app that says so beats a blank screen.
  return {
    driver: createMemoryDriver({ label: 'memory (not saved)' }),
    degraded: true,
    reason: 'This browser is not allowing durable storage, so nothing will be '
          + 'saved when you close the app. Export a backup before you leave.',
  };
}

/**
 * Save cadence.
 *
 * Far faster than the reference app's 60s idle / 180s ceiling. That slowness was
 * bought by a specific cost: the document lived in OneDrive, and SharePoint
 * records a version per write, so an eager autosave spent the version history on
 * keystrokes. Writing to local storage on the device has no such cost, and a
 * phone can be killed by the OS at any moment, so saving promptly is strictly
 * better here.
 */
export const SAVE_CADENCE = { idle: 800, ceiling: 3000 };
