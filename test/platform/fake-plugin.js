/**
 * The plugin double, shared by the two suites that need one.
 *
 * Not a `.test.js` file, so the runner's glob leaves it alone.
 */

/**
 * A fake standing in for @capacitor/local-notifications.
 *
 * It mirrors the real plugin's SHAPES exactly — `getAll()`/`getPending()`
 * returning `{notifications: [...]}`, `schedule()` taking `{notifications:
 * [...]}`, `cancel()` taking `{notifications: [{id}]}` — because the shapes are
 * the whole risk here. The logic above this layer is already proven; what is
 * unproven is whether we speak the plugin's dialect correctly, and a fake that
 * invented its own shapes would prove nothing at all.
 *
 * Critically it stores what it was HANDED separately from what it PROJECTS
 * back. The real plugin does not echo the scheduled object: it re-serialises it
 * through `LocalNotification.buildLocalNotificationPendingList`, which emits
 * only `id`, `title`, `body`, `schedule` and `extra` — no `channelId` — and
 * whose `schedule.at` is an Android `Date` that crosses the bridge as a string,
 * never a JS Date. A fake that echoed the input would certify code the real
 * plugin breaks, so it must not be able to.
 *
 * @param {{permission?: string, afterPrompt?: string, exact?: string,
 *          inexact?: boolean}} [opts]
 *   `permission` is what checkPermissions() reports; `afterPrompt` is the
 *   user's answer to the dialog, which is NOT always 'granted'; `inexact` makes
 *   schedule() resolve with the ScheduleResult.warning the plugin returns when
 *   it has downgraded an exact-wanting alarm.
 */
export function fakePlugin({
  permission = 'granted', afterPrompt = 'granted', exact = 'granted', inexact = false,
} = {}) {
  /** id → {sent: the object we were handed, triggered: has it fired}. */
  const store = new Map();

  /** Exactly the projection `buildLocalNotificationPendingList` performs. */
  const project = (sent) => {
    const out = { id: sent.id, title: sent.title, body: sent.body, extra: sent.extra };
    if (sent.schedule) {
      out.schedule = {
        // A Date put into a JSObject reaches JS as its string form.
        at: sent.schedule.at ? String(sent.schedule.at) : undefined,
        repeats: false,
      };
    }
    return out;
  };

  return {
    calls: { channels: [], requested: 0, getAll: [] },

    /** What the plugin was actually handed — not part of its API; the test seam. */
    sent(id) { return store.get(id)?.sent ?? null; },
    /** Mark a saved notification as already delivered. */
    deliver(id) { const rec = store.get(id); if (rec) rec.triggered = true; },

    async schedule({ notifications }) {
      for (const n of notifications) store.set(n.id, { sent: n, triggered: false });
      const result = { notifications: notifications.map((n) => ({ id: n.id })) };
      if (inexact) {
        // LocalNotificationsError.SCHEDULED_INEXACT, verbatim.
        result.warning = {
          code: 'OS-PLUG-LNOT-0017',
          message: 'Unable to schedule an exact alarm due to lack of permissions. '
                 + 'Scheduled as an inexact alarm instead.',
        };
      }
      return result;
    },

    // Every saved record, delivered ones included — `getPending()` is a misnomer
    // in the Kotlin (`notificationStorage.getSavedNotifications()`, unfiltered).
    async getPending() {
      return { notifications: [...store.values()].map((r) => project(r.sent)) };
    },

    async getAll(options) {
      this.calls.getAll.push(options);
      const state = options && options.state;
      const keep = ([, r]) => (state === 'SCHEDULED' ? !r.triggered
        : state === 'TRIGGERED' ? r.triggered : true);
      return { notifications: [...store.entries()].filter(keep).map(([, r]) => project(r.sent)) };
    },

    async cancel({ notifications }) {
      for (const n of notifications) store.delete(n.id);
    },

    async createChannel(channel) { this.calls.channels.push(channel); },
    async checkPermissions() { return { display: permission }; },
    async requestPermissions() { this.calls.requested++; return { display: afterPrompt }; },
    async checkExactNotificationSetting() { return { exact_alarm: exact }; },
  };
}
