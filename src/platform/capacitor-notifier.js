/**
 * The Android backend for the notifier seam.
 *
 * Implements the contract `platform/notifier.js` defines — `list()`,
 * `schedule(items)`, `cancel(ids)` — over `@capacitor/local-notifications`,
 * which sits on Android's AlarmManager. Nothing above `platform/` changes when
 * this replaces the log backend; that was the point of the seam.
 *
 * The plugin is injected rather than imported at the call site so this module
 * can be exercised in plain Node against a fake. Every behaviour below is
 * verifiable without a phone; what a phone adds is whether the OS honours it.
 */

import { LocalNotifications } from '@capacitor/local-notifications';
import { CHANNELS } from '../core/schedule.js';

/**
 * Android importance levels. 4 = HIGH (sound, heads-up banner), 3 = DEFAULT
 * (sound, no banner). Routines and events interrupt because they are about to
 * be missed; the morning digest is a summary you read when you pick the phone
 * up, so it does not shove itself in front of anything.
 */
const HIGH = 4;
const DEFAULT = 3;

/** 1 = VISIBILITY_PUBLIC — the content shows on the lock screen. This app is
 *  personal and single-user, so hiding it behind an unlock helps nobody. */
const PUBLIC = 1;

/**
 * `vibration` is NOT optional in the way it looks.
 *
 * `NotificationChannelManager.createChannel` reads it as
 * `enableVibration(channel.getBool("vibration") ?: false)` — an omitted flag is
 * a channel with vibration switched OFF, not a channel left on Android's
 * default. And a channel's settings are frozen at first creation: every later
 * `createChannel` call for the same id is ignored, so this cannot be corrected
 * in a later release. It is only fixable before the first install, or by
 * uninstalling the app.
 */

export const CHANNEL_DEFS = [
  {
    id: CHANNELS.ROUTINES,
    name: 'Routines',
    description: 'Recurring things, at the time they are due',
    importance: HIGH,
    visibility: PUBLIC,
    vibration: true,
  },
  {
    id: CHANNELS.EVENTS,
    name: 'Events',
    description: 'Calendar events, at your chosen lead time',
    importance: HIGH,
    visibility: PUBLIC,
    vibration: true,
  },
  {
    id: CHANNELS.DIGEST,
    name: 'Daily digest',
    description: 'One summary each morning of what the day holds',
    importance: DEFAULT,
    visibility: PUBLIC,
    // Deliberately not vibrating. The digest is a summary you read when you
    // pick the phone up, not something worth buzzing a pocket for — the same
    // decision as its lower importance, and equally permanent.
    vibration: false,
  },
];

/**
 * Register one Android channel per notification kind.
 *
 * Three channels rather than one so the digest can be muted in Android's own
 * settings without losing routine alerts — the spec asks for exactly that, and
 * it is impossible to retrofit: a notification's channel is fixed when it is
 * posted, so alarms already scheduled under a single channel stay there.
 *
 * Channels are Android-only and creating one that already exists is a no-op,
 * so this is safe to call on every launch.
 */
export async function registerChannels({ plugin = LocalNotifications } = {}) {
  for (const channel of CHANNEL_DEFS) {
    await plugin.createChannel(channel);
  }
}

/**
 * Ask for permission to post notifications, if we do not already have it.
 *
 * Android 13+ requires this at runtime and the app is silent without it — the
 * A73 runs One UI 6, so it always applies. Checking first avoids re-prompting
 * someone who has already decided.
 *
 * @returns {Promise<{granted: boolean, state: string}>}
 */
export async function ensurePermission({ plugin = LocalNotifications } = {}) {
  const current = await plugin.checkPermissions();
  if (current.display === 'granted') return { granted: true, state: current.display };

  // 'denied' here means denied permanently; asking again would do nothing and
  // the caller should send the user to system settings instead.
  if (current.display === 'denied') return { granted: false, state: current.display };

  const asked = await plugin.requestPermissions();
  return { granted: asked.display === 'granted', state: asked.display };
}

/**
 * Whether Android will honour exact alarm times.
 *
 * Without this the OS batches alarms to save power and a 09:00 routine can
 * arrive at 09:15 — which quietly teaches the user the times cannot be
 * trusted. Sideloading avoids the Play Store's restriction on requesting it,
 * but the user still has to allow it.
 *
 * @returns {Promise<{exact: boolean, state: string}>}
 */
export async function checkExactAlarms({ plugin = LocalNotifications } = {}) {
  if (typeof plugin.checkExactNotificationSetting !== 'function') {
    return { exact: true, state: 'unsupported' };
  }
  const status = await plugin.checkExactNotificationSetting();
  return { exact: status.exact_alarm === 'granted', state: status.exact_alarm };
}

/**
 * The backend itself.
 *
 * @param {{plugin?: object}} [opts]
 */
export function createCapacitorBackend({ plugin = LocalNotifications } = {}) {
  return {
    async list() {
      // NOT `getPending()`, despite the name. In the Kotlin that is
      // `notificationStorage.getSavedNotifications()` with no filter at all, so
      // it returns already-delivered records too — and `cancel()` keeps a
      // delivered record (marked cancelled) rather than deleting it. Adopting
      // those means every cold start cancels occurrences that have already
      // fired and re-adopts them next launch: churn on every launch, and a
      // `sync()` result that reports deliveries as cancellations.
      //
      // `getAll({state:'SCHEDULED'})` is the same projection with the right
      // filter — for a one-shot `at` schedule like ours, exactly `!isTriggered()`.
      // It arrived in plugin 8.3.0, so an older build falls back to the old
      // behaviour rather than to no adoption at all, which would orphan alarms.
      const { notifications } = typeof plugin.getAll === 'function'
        ? await plugin.getAll({ state: 'SCHEDULED' })
        : await plugin.getPending();
      return (notifications || []).map((n) => ({
        id: n.id,
        // The key must survive a round trip through the platform. `androidId`
        // is a one-way hash, so on a cold start the integer ids alone cannot
        // name which occurrence each pending alarm belongs to — and the
        // notifier would then adopt nothing and orphan every alarm a previous
        // session scheduled. `extra` is the only field that carries our own
        // data back out of `getPending()`.
        key: (n.extra && n.extra.key) || null,
      }));
    },

    /**
     * @returns {Promise<{warning: string|null}>} non-fatal; the alarms are
     *   scheduled either way, `warning` only says they may drift.
     */
    async schedule(items) {
      const result = await plugin.schedule({
        notifications: items.map((item) => ({
          id: item.id,
          title: item.title,
          body: item.body,
          channelId: item.channel,
          extra: { key: item.key },
          schedule: {
            at: new Date(item.fireAt),
            // Doze will otherwise defer this to the next maintenance window,
            // which on a phone left alone overnight can be hours. The whole
            // point of a routine is that it arrives at its time.
            allowWhileIdle: true,
          },
        })),
      });

      // `ScheduleResult.warning` is set when an exact-wanting notification was
      // silently downgraded to an inexact alarm — permission missing, not
      // mandatory. It is the authoritative per-call signal that these specific
      // reminders will drift, and it is worth more than the one-shot startup
      // check because the permission can be revoked between launches. The
      // plugin's own wording says what happened; this says what to do about it.
      return {
        warning: result && result.warning
          ? 'Reminders were scheduled as inexact alarms, so they may arrive late. '
            + 'Allow exact alarms in Android Settings → Apps → Tracker → Alarms & reminders.'
          : null,
      };
    },

    async cancel(ids) {
      if (!ids.length) return;
      await plugin.cancel({ notifications: ids.map((id) => ({ id })) });
    },
  };
}
