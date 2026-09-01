/**
 * The notification seam.
 *
 * One of the two files in `platform/`, and the only place the rest of the app
 * reaches the notification system. Today the backend is a log; the next plan
 * swaps in `@capacitor/local-notifications` and nothing above this file moves.
 *
 * The job is a diff, not a rewrite. Cancelling everything and re-creating it on
 * each app open would make every pending notification briefly disappear from the
 * shade, and on Android that is visible.
 */

import { scheduleFor } from '../core/schedule.js';

/**
 * A stable positive 31-bit integer for a notification key.
 *
 * Android notification ids are 32-bit signed ints, but our keys are strings like
 * `rtn:rtn_1:2026-08-31`. FNV-1a: small, fast, and stable across runs and
 * versions — which matters, because an id that changed between releases would
 * orphan every alarm the previous version scheduled.
 */
export function androidId(key) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // >>> 1 rather than masking: keeps it positive and inside the signed range.
  return (hash >>> 1) || 1;
}

/**
 * The browser stub, and the test double.
 *
 * Records what it was asked to do instead of doing it, so the whole scheduling
 * path is exercised in development and in tests with no native code present.
 *
 * Backend contract — the shape `@capacitor/local-notifications` will be adapted
 * to in the next plan:
 *
 *   list()            → Promise<Array<{id: number, key: string}>>
 *   schedule(items)   → Promise<{warning?: string}|void>   items as built in `sync`
 *   cancel(ids)       → Promise<void>   integer ids
 *
 * `list()` MUST return the key, not the id alone. `androidId` is a one-way
 * hash, so a bare id cannot be mapped back to the occurrence it belongs to, and
 * a session that cannot name what the platform is holding cannot cancel it.
 * Capacitor round-trips this in the notification's `extra` payload.
 */
export function createLogBackend() {
  const pending = new Map();   // id → item
  const backend = {
    scheduled: [],
    async list() { return [...pending.values()].map((i) => ({ id: i.id, key: i.key })); },
    async schedule(items) {
      for (const item of items) {
        pending.set(item.id, item);
        backend.scheduled.push(item);
      }
    },
    async cancel(ids) {
      for (const id of ids) pending.delete(id);
    },
  };
  return backend;
}

export function createNotifier({ backend }) {
  /** key → the payload last handed to the backend, so a changed body or time
   *  can be told from an unchanged one without asking the platform. */
  const known = new Map();
  let seeded = false;

  /**
   * Adopt whatever the platform is already holding.
   *
   * A cold start knows nothing about alarms a previous session scheduled, and
   * `cancelled` is derived from `known` — so without this, the first sync after
   * a restart cancels nothing, and a routine deleted while the app was closed
   * keeps firing for the rest of its window with no way to stop it. `androidId`
   * is one-way, so the ids alone cannot be mapped back to keys; the backend
   * returns the key it was given.
   *
   * Seeded entries carry a null payload, so a still-wanted occurrence is simply
   * re-scheduled over itself (harmless — the same integer id replaces the live
   * alarm) and one that is no longer wanted is cancelled, which is the point.
   *
   * The flag is only raised once the list has actually arrived. A bridge that is
   * not ready yet rejects, `sync` rejects with it, and the NEXT sync tries
   * again — latching the flag on the way in would spend the session's one
   * chance to adopt on a call that returned nothing. Seeding twice is harmless
   * anyway: it writes the same keys to the same nulls.
   */
  async function seedFromBackend() {
    if (seeded) return;
    const held = await backend.list();
    for (const item of held) {
      if (item && item.key) known.set(item.key, null);
    }
    seeded = true;
  }

  return {
    /**
     * Bring the platform in line with what the document says should exist.
     *
     * @returns {Promise<{created: string[], cancelled: string[],
     *                    rescheduled: string[], kept: number,
     *                    warning: string|null}>}
     *
     * `warning` is a non-fatal report from the backend about work it DID do —
     * an alarm downgraded to inexact, say. Returned rather than thrown because
     * the notifications exist and will fire; only their precision is in doubt.
     */
    async sync(doc, nowMs) {
      await seedFromBackend();
      const desired = scheduleFor(doc, nowMs);
      const wanted = new Map(desired.map((n) => [n.id, n]));

      const created = [];
      const rescheduled = [];
      let kept = 0;

      for (const [key, note] of wanted) {
        const previous = known.get(key);
        if (!previous) { created.push(key); continue; }
        if (previous.fireAt !== note.fireAt
            || previous.title !== note.title
            || previous.body !== note.body) {
          rescheduled.push(key);
        } else {
          kept++;
        }
      }

      const cancelled = [...known.keys()].filter((key) => !wanted.has(key));

      // Cancel first: rescheduling reuses the same integer id, and on Android
      // scheduling over a live alarm replaces it, so the order only matters for
      // the ones going away entirely.
      if (cancelled.length) {
        await backend.cancel(cancelled.map(androidId));
      }

      const toWrite = [...created, ...rescheduled].map((key) => {
        const note = wanted.get(key);
        return {
          id: androidId(key),
          key,
          title: note.title,
          body: note.body,
          fireAt: note.fireAt,
          channel: note.channel,
        };
      });
      let warning = null;
      if (toWrite.length) {
        const outcome = await backend.schedule(toWrite);
        warning = (outcome && outcome.warning) || null;
      }

      // Only updated once the backend has accepted the work — a throw above
      // leaves `known` describing what is genuinely still out there.
      for (const key of cancelled) known.delete(key);
      for (const key of [...created, ...rescheduled]) known.set(key, wanted.get(key));

      return { created, cancelled, rescheduled, kept, warning };
    },
  };
}
