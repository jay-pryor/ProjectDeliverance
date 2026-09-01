/**
 * SETTINGS. Reached from the tab bar rather than an app-bar icon, because with
 * only four destinations a tab costs nothing and a hidden icon costs a tap and
 * a guess.
 */

import { el } from './dom.js';
import { minutesToLabel, labelToMinutes, todayKey } from '../core/time.js';

function row(label, control, hint = null) {
  return el('div', { class: 'set-row' }, [
    el('div', { class: 'set-label' }, [
      el('span', { class: 'label', text: label }),
      hint ? el('span', { class: 'set-hint', text: hint }) : null,
    ]),
    control,
  ]);
}

export function renderSettings(ctx) {
  const { settings } = ctx.doc;
  const alert = settings.accentMode === 'alert';

  const digestTime = el('input', {
    attrs: { name: 'digestTime', type: 'time', value: minutesToLabel(settings.digest.timeMin) },
    on: { change: (e) => {
      const min = labelToMinutes(e.target.value);
      if (min !== null) ctx.actions.setSetting('digest.timeMin', min);
    } },
  });

  const digestEnabled = el('button', {
    class: 'btn', attrs: { type: 'button', name: 'digestEnabled', 'aria-pressed': settings.digest.enabled },
    text: settings.digest.enabled ? 'On' : 'Off',
    on: { click: () => ctx.actions.setSetting('digest.enabled', !settings.digest.enabled) },
  });

  const lead = el('input', {
    attrs: { name: 'eventLeadMin', type: 'number', min: '0', value: String(settings.eventLeadMin) },
    on: { change: (e) => ctx.actions.setSetting('eventLeadMin',
      Math.max(0, Number(e.target.value) || 0)) },
  });

  return el('div', { class: 'screen' }, [
    el('div', { class: 'screen-head' }, [
      el('span', { class: 'mark' }),
      el('span', { class: 'screen-title', text: 'Settings' }),
    ]),

    el('div', { class: 'group-head label bracket', text: 'Notifications' }),
    row('Daily digest', digestEnabled, 'One summary each morning'),
    row('Digest at', digestTime),
    row('Notify before events', lead, 'Minutes; an event can override it'),
    ctx.notifyError
      ? el('p', { class: 'set-error mono', text: `Notifications: ${ctx.notifyError}` })
      : null,

    el('div', { class: 'group-head label bracket', text: 'Display' }),
    row('Accent', el('button', {
      class: 'btn accent-toggle',
      attrs: { type: 'button', 'aria-pressed': alert },
      text: alert ? 'Alert' : 'Standard',
      on: { click: () => ctx.actions.setSetting('accentMode', alert ? 'standard' : 'alert') },
    })),

    el('div', { class: 'group-head label bracket', text: 'Storage' }),
    row('Saving', el('span', {
      class: ctx.storage.degraded ? 'mono set-error' : 'mono',
      text: ctx.storage.degraded ? 'NOT SAVED' : (ctx.storage.label || 'On this device'),
    }), ctx.storage.reason || null),
    // Distinct from the row above: that one means "durable storage is not
    // available at all", this one means "a save was attempted and refused".
    ctx.saveError
      ? el('p', { class: 'set-error mono', text: `Last save failed: ${ctx.saveError}` })
      : null,

    el('div', { class: 'group-head label bracket', text: 'Data' }),
    row('Backup', el('button', {
      class: 'btn export-doc', attrs: { type: 'button' }, text: 'Export',
      on: { click: () => downloadJson(ctx.actions.exportDoc(), ctx.now) },
    }), 'Saves a JSON copy'),
    row('Restore', el('label', { class: 'btn' }, [
      el('span', { text: 'Import' }),
      el('input', {
        attrs: { type: 'file', accept: 'application/json' },
        style: { display: 'none' },
        on: { change: (e) => readFileInto(e.target.files[0], ctx.actions.importDoc) },
      }),
    ]), 'Replaces everything'),
  ]);
}

/**
 * Browser download. The Capacitor build replaces this with Filesystem + Share
 * in the next plan — it is the one piece of platform knowledge left in `ui/`,
 * and it is here rather than in `platform/` because a whole seam for one button
 * would be more structure than it earns until there are two implementations.
 */
function downloadJson(text, nowMs) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  // todayKey, never toISOString: the filename is a date key like every other
  // date in this app, and a UTC one names the backup for the wrong day for the
  // hour either side of local midnight.
  a.download = `tracker-${todayKey(nowMs)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function readFileInto(file, accept) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    if (!accept(String(reader.result))) {
      window.alert('That file is not a tracker backup, so nothing was changed.');
    }
  };
  reader.readAsText(file);
}
