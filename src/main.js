/**
 * Entry point. Everything else is imported from here.
 */

import { createApp } from './ui/app.js';

const root = document.getElementById('app');
const app = createApp({ root });

app.boot().catch((err) => {
  root.textContent = '';
  const pre = document.createElement('pre');
  pre.style.cssText = 'padding:24px;color:#D45D5D;font-family:monospace;white-space:pre-wrap';
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
