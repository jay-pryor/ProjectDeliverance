/**
 * Entry point. Everything else is imported from here.
 */

import { createApp } from './ui/app.js';
import { prepareNotifications } from './platform/notify-backend.js';

const root = document.getElementById('app');
const app = createApp({ root });

// Channels and permissions before the first sync, and only on the device — in a
// browser this resolves immediately and changes nothing. It never throws: a
// phone that refuses permission is a working app with no notifications, not a
// broken app, so the reason is surfaced rather than raised.
prepareNotifications().then(({ reason }) => {
  if (reason) app.reportNotifyIssue?.(reason);
});

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
