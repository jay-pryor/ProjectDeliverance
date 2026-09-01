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
 * @param {Promise<any>} [opts.ready]  settles once the platform is set up —
 *   channels registered, permission decided. Defaults to already-ready.
 * @returns {{sync: () => Promise<object|null>}}
 */
export function createNotifySync({ backend, now, getDoc, onError, ready = Promise.resolve() }) {
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
          // Ordering, not politeness. Android drops a notification posted to a
          // channel that does not exist yet, and the plugin's own schedule()
          // requests POST_NOTIFICATIONS itself when it is not yet granted — so
          // a schedule racing setup can put two permission requests for one
          // alias through the bridge at once, and the loser comes back
          // cancelled. Worse, schedule() rejects the WHOLE call with
          // NOTIFICATIONS_DISABLED while notifications are off, which throws
          // before `known` is updated: a first launch where the user grants
          // permission and then edits nothing would end with no alarms at all
          // until the next document change. Inside the try, because a gate that
          // rejected would otherwise escape as an unhandled rejection.
          await ready;
          const result = await notifier.sync(doc, now());
          // A warning is a success with a caveat — the alarms were scheduled,
          // just imprecisely — so it is reported through the same field and
          // clears itself the moment a sync comes back clean.
          onError((result && result.warning) || null);
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
