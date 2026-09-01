/**
 * Entry point. Everything else is imported from here.
 */

import { createApp } from './ui/app.js';
import { prepareNotifications } from './platform/notify-backend.js';

const root = document.getElementById('app');

// Channels and permissions before the first sync, and only on the device — in a
// browser this resolves immediately and changes nothing. It never throws: a
// phone that refuses permission is a working app with no notifications, not a
// broken app, so the reason is surfaced rather than raised.
//
// The gate has to reach `createApp`, but the handler that reports the reason
// needs the `app` it returns — so the promise is held open here and settled a
// line later, once both halves exist. `syncNotifications()` awaits this before
// it touches the plugin: a schedule that overtakes channel creation is dropped
// by Android, and one that overtakes the permission dialog puts a second
// request for the same alias through the bridge.
let openGate;
const ready = new Promise((resolve) => { openGate = resolve; });
const app = createApp({ root, ready });

openGate(prepareNotifications().then(
  ({ reason }) => { if (reason) app.reportNotifyIssue(reason); },
  () => {},   // never let setup reject the gate; a failed setup must not wedge every sync
));

app.boot().catch((err) => {
  root.textContent = '';
  const pre = document.createElement('pre');
  // Tokens, not literals — app.css is already loaded by the time boot can fail,
  // so the one screen that only appears when things are broken still looks like
  // the app rather than like a browser error page.
  pre.style.cssText = 'padding:24px;color:var(--crit);'
    + 'font-family:var(--font-mono);white-space:pre-wrap';
  pre.textContent = `Failed to start:\n${err && err.stack ? err.stack : err}`;
  root.appendChild(pre);
});

// Flush on the way out. Android can kill a backgrounded WebView without
// warning, and `visibilitychange` is the last event reliably delivered —
// `beforeunload` is not fired at all on mobile.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') app.flush?.();
});

// Test seam.
window.__app = app;
