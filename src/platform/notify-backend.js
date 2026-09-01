/**
 * Which notification backend this host gets.
 *
 * The mirror of `storage.js`'s `createStorage()`: one place that answers a
 * platform question, so nothing above `platform/` has to ask it. In a browser
 * — the development loop — that is the log backend, which records what it was
 * asked to do instead of doing it, so the whole scheduling path stays
 * exercisable with no device present. Inside the Capacitor shell it is the real
 * one, over AlarmManager.
 */

import { Capacitor } from '@capacitor/core';
import { createLogBackend } from './notifier.js';
import {
  createCapacitorBackend, registerChannels, ensurePermission, checkExactAlarms,
} from './capacitor-notifier.js';

/** True only inside the Capacitor shell; false in any browser. */
export const isNative = () => Capacitor.isNativePlatform();

export function createNotifyBackend() {
  return isNative() ? createCapacitorBackend() : createLogBackend();
}

/**
 * Everything Android needs in place before a notification can be scheduled.
 *
 * Runs once at startup and only on the device. Order matters: channels first,
 * because a notification's channel is fixed when it is posted and one posted to
 * an unregistered channel is dropped.
 *
 * Never throws. A phone that refuses permission is a phone with a working app
 * and no notifications, not a broken app — the caller surfaces the reason.
 *
 * @returns {Promise<{ready: boolean, reason: string|null}>}
 */
export async function prepareNotifications() {
  if (!isNative()) return { ready: true, reason: null };

  try {
    await registerChannels();

    const permission = await ensurePermission();
    if (!permission.granted) {
      return {
        ready: false,
        reason: permission.state === 'denied'
          // Re-requesting a permanent denial does nothing, so the only route
          // back is Android's own settings. Say so rather than let the user
          // wonder why nothing arrives.
          ? 'Notifications are blocked. Turn them on in Android Settings → Apps → Tracker → Notifications.'
          : 'Notifications were not allowed, so nothing will be announced.',
      };
    }

    const exact = await checkExactAlarms();
    if (!exact.exact) {
      // Not fatal: notifications still arrive, just batched by the OS to save
      // power, which can move a 09:00 routine by a quarter of an hour.
      return {
        ready: true,
        reason: 'Exact alarms are off, so reminders may arrive late. '
              + 'Allow them in Android Settings → Apps → Tracker → Alarms & reminders.',
      };
    }

    return { ready: true, reason: null };
  } catch (err) {
    return { ready: false, reason: (err && err.message) || String(err ?? 'Notification setup failed') };
  }
}
