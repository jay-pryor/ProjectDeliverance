/**
 * Keeping the platform's pending notifications in step with the document.
 *
 * Extracted from `app.js` because it is a self-contained state machine — one
 * closed-over promise chain and nothing else — and because holding it apart
 * makes the serialisation guarantee testable on its own, without constructing
 * an app around it. `app.js` keeps the wiring; this keeps the rule.
 *
 * Two properties are load-bearing and neither is obvious from reading the happy
 * path, so both are spelled out where they are enforced below.
 */

import { createNotifier } from '../platform/notifier.js';

/**
 * @param {object} opts
 * @param {object} opts.backend      the platform's notification backend
 * @param {() => number} opts.now    injected clock
 * @param {() => object|null} opts.getDoc  current document, or null before boot
 * @param {(reason: string|null) => void} opts.onError  called with a reason on
 *   failure and with null on success, so the caller can surface it
 * @returns {{sync: () => Promise<object|null>}}
 */
export function createNotifySync({ backend, now, getDoc, onError }) {
  const notifier = createNotifier({ backend });
  let syncing = Promise.resolve(null);

  return {
    /**
     * Never throws and never rejects. A notification that could not be
     * scheduled — permission refused, exact alarms denied, a bridge not ready —
     * must not take down an app that is otherwise working perfectly well.
     */
    sync() {
      const doc = getDoc();
      if (!doc) return Promise.resolve(null);

      const run = async () => {
        try {
          const result = await notifier.sync(doc, now());
          onError(null);
          return result;
        } catch (err) {
          // `err` may be nullish. Some native bridges reject with no value at
          // all, and `err.message` on one of those would throw a TypeError
          // INSIDE this handler — before the reason is ever reported, so the
          // app could not even say what went wrong.
          onError((err && err.message) || String(err ?? 'Unknown notification error'));
          return null;
        }
      };

      // Serialised through one chain. Callers fire this without awaiting, so
      // two syncs can otherwise overlap — and because the diff reads the
      // notifier's `known` map, which the first has not written yet, the second
      // would schedule the same occurrences a second time.
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
}
