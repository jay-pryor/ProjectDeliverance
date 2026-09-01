/**
 * Entry point. Everything else is imported from here.
 */

import { createApp } from './ui/app.js';

const root = document.getElementById('app');
const app = createApp({ root });

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
