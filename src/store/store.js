/**
 * Store — durable document persistence.
 *
 * Knows nothing about tasks, blocks, projects or any other domain concept. It
 * moves one opaque JSON document, rolling snapshots and some blobs. That ignorance is deliberate: it is what makes this promotable
 * to `shared/` unchanged, and what makes it testable against `memory-driver`.
 *
 * Layering:
 *
 *    Store  (this file — layout, snapshots, atomicity policy)
 *      └─ Driver  (fsa | idb | memory — raw named-text + blob IO)
 *
 * Drivers implement eight primitives and nothing else. Everything policy-shaped
 * lives here so all three drivers behave identically.
 */

/**
 * "2026-08-18T09-14-02-233Z.json" → epoch millis, or 0 if it is not one of ours.
 * The inverse of `stamp()`, which flattens `:` and `.` so the name is legal on
 * every filesystem.
 */
export function parseSnapshotStamp(name) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/.exec(name);
  if (!m) return 0;
  return Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7]}Z`);
}

/**
 * Three layers of protection, each guarding a different kind of loss.
 *
 *   mirror    ~5s to browser storage. Crash insurance, never authoritative, and
 *             free of the sync client so it can afford to be eager.
 *   folder    60s idle / 180s ceiling to state.json. Slow on purpose: SharePoint
 *             records a version per change and prunes the oldest past its
 *             retention limit, so an eager autosave spends the version history
 *             on keystrokes and pushes the versions worth keeping off the end.
 *   snapshots at most one per five minutes inside the folder, newest forty kept
 *             (below) — about three and a half hours of rollback, with
 *             SharePoint's own history as the backstop beyond that.
 */
export const CADENCE = {
  idle: 60_000,
  ceiling: 180_000,
  mirrorIdle: 5_000,
  mirrorCeiling: 15_000,
  /** null = the real half-hour boundary. Tests override with a few milliseconds. */
  tickMs: null,
};

export const STATUS = {
  IDLE: 'idle',
  READY: 'ready',
  NEEDS_PERMISSION: 'needs-permission',
  READONLY: 'readonly',
  ERROR: 'error',
};

const STATE_FILE = 'state.json';
const SNAPSHOT_DIR = 'snapshots';
const MAX_SNAPSHOTS = 40;
/**
 * Snapshots are throttled rather than taken per write. Forty of them five
 * minutes apart is three hours and twenty minutes of rollback; forty taken per
 * keystroke is about a minute of it, which is no use to anyone.
 */
const SNAPSHOT_EVERY_MS = 5 * 60 * 1000;

/**
 * @param {object} opts
 * @param {object} opts.driver   a driver implementing the primitive interface
 * @param {() => number} [opts.clock]  injectable for deterministic tests
 * @param {number} [opts.maxSnapshots]
 * @param {number} [opts.snapshotEvery]  minimum millis between snapshots
 */
export function createStore({
  driver, clock = Date.now,
  maxSnapshots = MAX_SNAPSHOTS, snapshotEvery = SNAPSHOT_EVERY_MS,
}) {
  if (!driver) throw new Error('createStore: driver is required');

  const listeners = new Set();
  let status = STATUS.IDLE;
  let lastError = null;
  /** When the last snapshot was taken. Null until read back from the folder. */
  let lastSnapshotAt = null;

  function setStatus(next, err = null) {
    if (status === next && err === lastError) return;
    status = next;
    lastError = err;
    for (const fn of listeners) {
      try { fn(status, lastError); } catch (_) { /* listener faults are not our problem */ }
    }
  }

  function stamp() {
    return new Date(clock()).toISOString().replace(/[:.]/g, '-');
  }

  const store = {
    get status() { return status; },
    get error() { return lastError; },
    get label() { return driver.label || null; },
    get canWrite() { return status === STATUS.READY; },

    onStatusChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** Connect the driver. Resolves to the resulting status. */
    async open() {
      try {
        const s = await driver.init();
        setStatus(s || STATUS.READY);
      } catch (err) {
        setStatus(STATUS.ERROR, err);
      }
      return status;
    },

    /** Prompt for access — only meaningful for drivers that gate on permission. */
    async requestAccess() {
      if (typeof driver.requestAccess !== 'function') return status;
      try {
        const s = await driver.requestAccess();
        setStatus(s || STATUS.READY);
      } catch (err) {
        setStatus(STATUS.ERROR, err);
      }
      return status;
    },

    /** @returns {Promise<object|null>} the document, or null if none exists yet. */
    async read() {
      const raw = await driver.getText(STATE_FILE);
      if (raw == null) return null;
      try {
        return JSON.parse(raw);
      } catch (err) {
        // Corrupt primary — the snapshots exist precisely for this.
        setStatus(STATUS.ERROR, new Error('state.json is not valid JSON'));
        throw err;
      }
    },

    /** The raw bytes, unparsed — used to preserve a corrupt file before replacing it. */
    readRawState() {
      return driver.getText(STATE_FILE);
    },

    /**
     * Move a bad state file aside instead of overwriting it.
     *
     * Starting fresh must never be the same thing as destroying the only copy of
     * data that a human might still be able to repair by hand.
     *
     * @returns {Promise<string|null>} the name it was preserved under
     */
    async quarantineState() {
      const raw = await driver.getText(STATE_FILE);
      if (raw == null) return null;
      const name = `state.corrupt-${stamp()}.json`;
      await driver.putText(name, raw);
      await driver.removeName(STATE_FILE);
      return name;
    },

    /**
     * Persist the document, keeping the version it replaces as a snapshot.
     *
     * The snapshot is throttled, not taken per write: the point of them is a
     * spread of restore points across the working day, and one per save gives a
     * dense cluster of the last few minutes instead.
     */
    async write(doc) {
      if (status === STATUS.READONLY) throw new Error('Store is read-only');
      const serialised = JSON.stringify(doc, null, 2);

      const previous = await driver.getText(STATE_FILE);
      // Rewriting identical bytes still costs an upload and a version, which is
      // the whole thing this cadence exists to avoid. It also makes "write now"
      // safe to press at any time, however often.
      if (previous === serialised) return doc;

      if (previous != null && await snapshotDue()) {
        await driver.putText(`${SNAPSHOT_DIR}/${stamp()}.json`, previous);
        lastSnapshotAt = clock();
        await pruneSnapshots();
      }

      await driver.putText(STATE_FILE, serialised);
      return doc;
    },

    async listSnapshots() {
      const names = await driver.listNames(`${SNAPSHOT_DIR}/`);
      return names
        .map((n) => n.slice(SNAPSHOT_DIR.length + 1))
        .filter((n) => n.endsWith('.json'))
        .sort()
        .reverse();
    },

    async readSnapshot(name) {
      const raw = await driver.getText(`${SNAPSHOT_DIR}/${name}`);
      return raw == null ? null : JSON.parse(raw);
    },

    /** Promote a snapshot back to being the live document. */
    async restore(name) {
      const doc = await store.readSnapshot(name);
      if (doc == null) throw new Error(`Snapshot not found: ${name}`);
      await store.write(doc);
      return doc;
    },

    putAttachment(id, blob) { return driver.putBlob(id, blob); },
    getAttachment(id) { return driver.getBlob(id); },
    removeAttachment(id) { return driver.removeBlob(id); },
  };

  /**
   * Time since the last snapshot, taken from the folder rather than from memory
   * on first use — otherwise every reload would take one, and a morning of
   * opening and closing the tab would fill the whole ring.
   */
  async function snapshotDue() {
    if (lastSnapshotAt === null) {
      const [newest] = await store.listSnapshots();
      lastSnapshotAt = newest ? parseSnapshotStamp(newest) : 0;
    }
    return clock() - lastSnapshotAt >= snapshotEvery;
  }

  async function pruneSnapshots() {
    const names = await store.listSnapshots();
    for (const stale of names.slice(maxSnapshots)) {
      await driver.removeName(`${SNAPSHOT_DIR}/${stale}`);
    }
  }

  return store;
}

/**
 * Debounced writer. Kept separate from the Store so the persistence policy is
 * the caller's choice, and so `write` stays trivially testable.
 *
 * Two clocks, not one:
 *
 *   `idle`     commit this long after you stop changing things.
 *   `ceiling`  commit anyway this long after the first unsaved change, however
 *              busy you are — otherwise a continuous afternoon of edits never
 *              reaches a pause and never commits.
 *
 * The idle delay is deliberately long for the OneDrive copy. SharePoint records
 * a version per change and prunes the oldest past its retention limit, so a
 * half-second autosave burns hundreds of meaningless versions in an afternoon
 * and pushes the ones worth keeping off the end of the history. The same writer
 * runs the local crash-insurance copy at a few seconds, where there is no such
 * cost.
 *
 * Coalesces bursts of edits, guarantees a trailing write, and never runs two
 * writes concurrently.
 */
export function createDebouncedWriter(store, {
  idle = 60_000, ceiling = 180_000, clock = Date.now, onStateChange = () => {},
} = {}) {
  /**
   * A timer that does not, by itself, keep the program alive.
   *
   * Browsers have no such notion and skip the call; under Node — which is where
   * the tests run — a three-minute ceiling timer would otherwise hold the
   * process open long after the last assertion.
   */
  const later = (fn, ms) => {
    const t = setTimeout(fn, ms);
    if (t && typeof t.unref === 'function') t.unref();
    return t;
  };

  let idleTimer = null;
  let ceilingTimer = null;
  let pending = null;
  /** When the oldest unwritten change arrived, or null when nothing is pending. */
  let since = null;
  /** When the most recent change arrived — what the idle delay is measured from. */
  let lastAt = null;
  /** The currently running drain, or null. Only ever one at a time. */
  let inFlight = null;

  /**
   * Drain `pending` until it is empty. Looping rather than recursing means an
   * edit that arrives *during* a write is picked up by the same drain, so the
   * caller can await one promise and know everything landed.
   */
  async function drain() {
    while (pending != null) {
      const doc = pending;
      pending = null;
      since = null;
      lastAt = null;
      onStateChange('saving');
      try {
        await store.write(doc);
        onStateChange('saved');
      } catch (err) {
        // Leave `pending` clear: retrying a write that just failed in a tight
        // loop would spin. The caller is told, and the next edit will retry.
        onStateChange('error', err);
      }
    }
  }

  function kick() {
    clearTimers();
    if (!inFlight) {
      inFlight = drain().finally(() => { inFlight = null; });
    }
    return inFlight;
  }

  function clearTimers() {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    if (ceilingTimer) { clearTimeout(ceilingTimer); ceilingTimer = null; }
  }

  const writer = {
    /** Queue a document for saving. */
    schedule(doc) {
      pending = doc;
      if (since === null) since = clock();
      lastAt = clock();
      onStateChange('dirty');

      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = later(() => { idleTimer = null; kick(); }, idle);

      // Anchored to the first unsaved change and never rescheduled, so typing
      // without a pause cannot push the deadline out indefinitely.
      if (!ceilingTimer) {
        const due = Math.max(0, ceiling - (clock() - since));
        ceilingTimer = later(() => { ceilingTimer = null; kick(); }, due);
      }
    },

    /**
     * Force everything out now and wait for it — used on page hide, before
     * confirming a week, when saving by hand, and anywhere data loss would be
     * unacceptable.
     *
     * Resolves only when nothing is queued *and* nothing is in flight. An edit
     * that arrived while an earlier write was still running is included.
     */
    async flush() {
      clearTimers();
      while (pending != null || inFlight) {
        await (inFlight || kick());
      }
    },

    /**
     * Write only if one of the two deadlines has already passed.
     *
     * What hiding the tab does: a switch to another window is not a reason to
     * spend a version, and the timers keep running anyway. Losing the change is
     * covered by the crash-insurance copy, which is flushed unconditionally.
     */
    async flushIfDue() {
      if (pending == null || since === null) return false;
      const quietFor = clock() - lastAt;
      const waitingFor = clock() - since;
      if (quietFor < idle && waitingFor < ceiling) return false;
      await writer.flush();
      return true;
    },

    /**
     * Drop anything queued without writing it.
     *
     * Only safe when something else has already persisted the work — the folder
     * committing is what lets the crash-insurance copy stop caring about it.
     */
    discard() {
      clearTimers();
      pending = null;
      since = null;
      lastAt = null;
    },

    get hasPending() { return pending != null || inFlight != null; },
    /** When the oldest unsaved change arrived, for "unsaved for 45s" readouts. */
    get pendingSince() { return since; },
  };

  return writer;
}
