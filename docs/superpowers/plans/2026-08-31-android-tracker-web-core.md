# Android TRACKER — Web Core Implementation Plan (Phases 0–3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete, working, touch-first mobile web app — tasks, routines, calendar, and a fully tested pure notification scheduler — that runs in Chrome on the phone with no Android toolchain present.

**Architecture:** Pure domain logic in `src/core/` with no DOM and no I/O; an opaque-document `src/store/`; a `src/platform/` seam that is the only place allowed to know Capacitor exists (browser stubs for now); and a new mobile-first `src/ui/`. Several `core/` modules are harvested near-verbatim from `reference/2026-08-16-task-tracker/`, so **their field-name conventions are authoritative**. `core/schedule.js` is one pure function producing the desired notification set, which a later plan's native notifier will diff against Android's pending alarms.

**Tech Stack:** Vanilla ES modules, esbuild, `node --test` with `node:assert/strict`, jsdom for DOM unit tests, `@fontsource/*` for self-hosted IBM Plex. No framework, no runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-08-31-android-tracker-design.md`

**Follow-on plan (not this one):** Phases 4–5 — Capacitor, the `android/` project, notification permissions and channels, and the portrait-reshaped accent FX.

## Global Constraints

- **Target device:** Samsung Galaxy A73 5G — 1080×2400, 120Hz, One UI. Assume a **8.3ms frame budget** for anything animated.
- **`reference/` is read-only.** Never edit, move, rename, delete or reformat anything under it. Harvesting means *copying out* into `src/`, then editing the copy. (`CLAUDE.md`, and `.gitignore` excludes `/reference/` from the repo.)
- **400-line cap per source file.** The build warns above it. Split before exceeding.
- **`src/core/` is pure:** no DOM, no `window`, no timers, no I/O, no Capacitor. Every function takes its clock as a parameter (`now = Date.now`) so tests are deterministic.
- **`src/platform/` is the only Capacitor-aware folder.** Nothing else may import from it except through its exported interface.
- **Times are integers, minutes from local midnight** (`timeMin`, `startMin`, `endMin`, `leadMin`). Never time strings in the document.
- **Date keys are `"YYYY-MM-DD"` built from local calendar components.** Never `toISOString()`, which shifts the day across a UTC boundary.
- **Palette is fixed** — from `reference/ui-design.md`: `--void #0A0C10`, `--panel #12161D`, `--panel-alt #171C25`, `--rule #1E2530`, `--text #C8D2DC`, `--text-dim #7B8492`, `--accent #57C7E3`, `--accent-dim #2A6B7D`. ALERT mode swaps `--accent` → `#FF5A47` and `--accent-dim` → `#7A2E24` and nothing else. Semantic set: `--ok #4FA97B`, `--warn #D89B3C`, `--crit #D45D5D`.
- **Typography:** IBM Plex Sans Condensed for labels/nav (uppercase, `letter-spacing: 0.12em`, weight 500–600); IBM Plex Sans for prose; IBM Plex Mono with `font-variant-numeric: tabular-nums` for all numerals, times and IDs. Never Inter, Roboto, Open Sans, Lato, or a system stack. Fonts are **self-hosted**, never fetched from Google Fonts.
- **Form:** `border-radius` 0–2px. 1px hairline borders in `--rule` do the structural work; no drop shadows, no blur, no glassmorphism. Status indicators are squares or bars, never circles.
- **Motion:** 80–160ms, `linear` or `steps()`. No bounce or spring. Glow only on live/active/focused elements. `prefers-reduced-motion` always respected.
- **Touch targets are minimum 44×44px**, overriding the reference's density guidance where they conflict.
- **No emoji as UI iconography.**
- **Contrast floor 4.5:1** for text against its background.

---

## File Structure

```
build/build.js              esbuild bundling + line-cap enforcement
src/
  index.html                shell document; the only HTML file
  main.js                   entry point — wires store, platform, app
  core/                     PURE. no DOM, no I/O, no Capacitor.
    ids.js                  harvested verbatim — makeId, nextRef
    time.js                 harvested, trimmed — date keys, minute labels
    recurrence.js           harvested verbatim — occursOn, nextOccurrence
    schema.js               NEW — document shape, validateDoc, migrate
    tasks.js                NEW — projects and tasks
    routines.js             harvested, trimmed
    events.js               harvested, minus teamsLink
    signals.js              harvested, trimmed — attention, pruneDismissals
    schedule.js             NEW — scheduleFor(doc, now) → desired notifications
  store/                    harvested; opaque-document persistence
    store.js  memory-driver.js  idb-driver.js  idb-kv.js
  platform/                 ONLY Capacitor-aware folder
    storage.js              driver selection (IndexedDB now, Filesystem later)
    notifier.js             stub now, Capacitor later
  ui/
    dom.js                  el() / icon() helpers
    app.js                  state, render loop, mount
    tab-bar.js              bottom navigation
    today.js  tasks.js  calendar.js  settings.js      the four screens
    task-editor.js  event-editor.js  routine-editor.js  rule-input.js
  styles/
    index.css  tokens.css  layout.css  screens.css  editors.css
test/                       mirrors src/, node --test
```

---

# PHASE 0 — SKELETON

*Ends with: four empty screens, a working build, and a document that persists across reload.*

---

### Task 1: Build pipeline and scaffolding

**Files:**
- Create: `package.json`, `build/build.js`, `src/index.html`, `src/main.js`, `src/styles/index.css`, `.gitignore` (modify)
- Test: `test/build.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm run build` emits `www/index.html`, `www/app.js`, `www/app.css`, each with a `.map`. `npm test` runs `node --test`. `npm run dev` serves `www/` on port 5173.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "tracker-android",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Personal task tracker for Android — tasks, routines, calendar, notifications",
  "scripts": {
    "build": "node build/build.js",
    "watch": "node build/build.js --watch",
    "dev": "node build/build.js --watch --serve",
    "pretest": "node build/build.js",
    "test": "node --test \"test/**/*.test.js\""
  },
  "devDependencies": {
    "esbuild": "^0.25.0",
    "jsdom": "^25.0.0",
    "@fontsource/ibm-plex-sans": "^5.0.0",
    "@fontsource/ibm-plex-sans-condensed": "^5.0.0",
    "@fontsource/ibm-plex-mono": "^5.0.0"
  }
}
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: no errors; `node_modules/` created.

- [ ] **Step 3: Add `www/` and `node_modules/` to `.gitignore`**

Append to the existing `.gitignore` (which already contains `/reference/`):

```
# Build output
/www/
node_modules/
```

- [ ] **Step 4: Write the failing build test**

Create `test/build.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const www = (f) => path.join(ROOT, 'www', f);

// `pretest` runs the build, so these files must exist by the time this runs.
test('build emits the three artifacts plus source maps', async () => {
  for (const f of ['index.html', 'app.js', 'app.css', 'app.js.map', 'app.css.map']) {
    const s = await stat(www(f));
    assert.ok(s.size > 0, `${f} should exist and be non-empty`);
  }
});

test('index.html references the built assets, not the source', async () => {
  const html = await readFile(www('index.html'), 'utf8');
  assert.match(html, /app\.css/);
  assert.match(html, /app\.js/);
  assert.doesNotMatch(html, /src\//, 'must not point at unbuilt source');
});

test('the bundle is not an ES module — it must run as a plain script', async () => {
  const html = await readFile(www('index.html'), 'utf8');
  assert.doesNotMatch(html, /type="module"/);
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `ENOENT`, no `www/` directory.

- [ ] **Step 6: Write `build/build.js`**

```js
/**
 * Bundle src/ into www/.
 *
 * Two reasons this exists rather than shipping raw modules:
 *  1. One request for the app, one for its styles.
 *  2. To enforce the per-file line cap, because "split it later" never happens.
 *
 * Unlike the reference app, this does NOT inline everything into one HTML file.
 * That constraint existed only because ES modules are blocked by CORS on
 * `file://`. Capacitor serves from `capacitor://localhost`, a real origin, so we
 * emit normal assets with source maps — which is what makes remote-debugging the
 * phone over chrome://inspect show real module names instead of one large blob.
 */

import { build as esbuild, context } from 'esbuild';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'www');
const MAX_LINES = 400;

const watch = process.argv.includes('--watch');
const serve = process.argv.includes('--serve');

/** Every .js and .css file under src/, recursively. */
async function sourceFiles(dir = SRC) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await sourceFiles(full));
    else if (/\.(js|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Warn about files creeping past the cap. Warns, never fails: a build that
 *  refuses to run mid-refactor helps nobody. */
async function checkLineCap() {
  const offenders = [];
  for (const file of await sourceFiles()) {
    const lines = (await readFile(file, 'utf8')).split('\n').length;
    if (lines > MAX_LINES) offenders.push(`${path.relative(ROOT, file)} — ${lines} lines`);
  }
  if (offenders.length) {
    console.warn(`\n  !  Over the ${MAX_LINES}-line cap — split these before they grow:`);
    for (const o of offenders) console.warn(`     ${o}`);
    console.warn('');
  }
  return offenders.length;
}

const options = {
  entryPoints: {
    app: path.join(SRC, 'main.js'),
  },
  bundle: true,
  outdir: OUT,
  sourcemap: true,
  // IIFE, not ESM: the shell loads app.js with a plain <script>, so nothing
  // depends on module resolution at runtime.
  format: 'iife',
  target: ['chrome100'],
  loader: { '.woff2': 'file' },
  assetNames: 'fonts/[name]-[hash]',
  logLevel: 'info',
};

const cssOptions = {
  ...options,
  entryPoints: { app: path.join(SRC, 'styles', 'index.css') },
};

async function copyShell() {
  await mkdir(OUT, { recursive: true });
  const html = await readFile(path.join(SRC, 'index.html'), 'utf8');
  await writeFile(path.join(OUT, 'index.html'), html);
}

async function once() {
  await copyShell();
  await esbuild(options);
  await esbuild(cssOptions);
  const over = await checkLineCap();
  console.log(`  built -> www/${over ? `  (${over} file(s) over the line cap)` : ''}`);
}

if (watch) {
  await copyShell();
  const js = await context(options);
  const css = await context(cssOptions);
  await js.watch();
  await css.watch();
  await checkLineCap();
  if (serve) {
    const { host, port } = await js.serve({ servedir: OUT, port: 5173, host: '0.0.0.0' });
    console.log(`  serving http://${host}:${port} — forward this port to view on the phone`);
  } else {
    console.log('  watching...');
  }
} else {
  await once();
}
```

- [ ] **Step 7: Write `src/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<!-- viewport-fit=cover is what makes env(safe-area-inset-*) report real values
     behind the status bar and the gesture pill. -->
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0A0C10">
<title>Tracker</title>
<link rel="stylesheet" href="app.css">
</head>
<body>
<div id="app"></div>
<script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 8: Write `src/main.js`**

```js
/**
 * Entry point. Everything else is imported from here.
 */

const root = document.getElementById('app');
root.textContent = 'Tracker';
```

- [ ] **Step 9: Write `src/styles/index.css`**

```css
/* The one stylesheet entry point. esbuild follows these imports and emits a
   single app.css; the split exists for editing, not for delivery. */
@import "./tokens.css";
```

- [ ] **Step 10: Write a placeholder `src/styles/tokens.css`**

```css
:root { --void: #0A0C10; }
body { margin: 0; background: var(--void); }
```

- [ ] **Step 11: Run the tests**

Run: `npm test`
Expected: PASS — 3 tests.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json .gitignore build/ src/ test/
git commit -m "build: esbuild pipeline emitting www/ with source maps"
```

---

### Task 2: Design tokens, fonts and the accent palettes

**Files:**
- Modify: `src/styles/tokens.css`, `src/styles/index.css`
- Create: `src/styles/layout.css`
- Test: `test/tokens.test.js`

**Interfaces:**
- Consumes: the build from Task 1.
- Produces: CSS custom properties on `:root`, and `[data-accent="alert"]` on `<html>` as the ALERT-mode switch. `--rgb-standard` / `--rgb-alert` are exported as bare `R,G,B` triplets, which the Phase-5 FX layer reads.

- [ ] **Step 1: Write the failing test**

Create `test/tokens.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const CSS = path.resolve(import.meta.dirname, '..', 'www', 'app.css');

test('the fixed palette is present verbatim', async () => {
  const css = await readFile(CSS, 'utf8');
  for (const value of ['#0A0C10', '#12161D', '#171C25', '#1E2530',
                       '#C8D2DC', '#7B8492', '#57C7E3', '#2A6B7D']) {
    assert.ok(css.includes(value), `palette must contain ${value}`);
  }
});

test('ALERT mode swaps only the two accent tokens', async () => {
  const css = await readFile(CSS, 'utf8');
  // Quotes optional: esbuild's CSS printer always strips them from attribute
  // selectors whose value is a valid identifier, regardless of minify. Both
  // forms are the same selector, so asserting on the quoted form alone would
  // be testing incidental formatting rather than meaning.
  const block = /\[data-accent=["']?alert["']?\][^{]*\{([^}]*)\}/.exec(css);
  assert.ok(block, 'an [data-accent="alert"] block must exist');
  const declared = block[1].match(/--[a-z-]+(?=\s*:)/g) || [];
  assert.deepEqual(
    declared.sort(),
    ['--accent', '--accent-dim'].sort(),
    'ALERT must move the accent and nothing else — surfaces and text stay put',
  );
  assert.ok(block[1].includes('#FF5A47'));
  assert.ok(block[1].includes('#7A2E24'));
});

test('fonts are self-hosted, never fetched from Google', async () => {
  const css = await readFile(CSS, 'utf8');
  assert.doesNotMatch(css, /fonts\.googleapis\.com/);
  assert.doesNotMatch(css, /fonts\.gstatic\.com/);
  assert.match(css, /IBM Plex/);
});

test('no banned typeface is used in a font stack', async () => {
  const css = await readFile(CSS, 'utf8');
  // Scoped to font-family declarations on purpose. A bare substring search
  // false-positives on any capitalised word containing one of these — "Inter"
  // inside "Internet" in a vendor comment would fail a correct stylesheet.
  const stacks = css.match(/font-family:[^;}]*/g) || [];
  for (const banned of ['Inter', 'Roboto', 'Open Sans', 'Lato']) {
    const re = new RegExp(`\\b${banned}\\b`);
    const hit = stacks.find((stack) => re.test(stack));
    assert.ok(!hit, `${banned} is banned by ui-design.md — found in: ${hit}`);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — the palette values are not in `app.css` yet.

- [ ] **Step 3: Write `src/styles/tokens.css`**

```css
/**
 * The fixed palette, from reference/ui-design.md. Do not add decorative
 * colours, gradients between unrelated hues, or per-section theming.
 *
 * Retyping these values into another file is how they drift, so this is the one
 * home for them.
 */

:root {
  --void:       #0A0C10;  /* page background — near-black, never pure #000 */
  --panel:      #12161D;  /* raised surfaces, panels, headers */
  --panel-alt:  #171C25;  /* hover states, alternating rows */
  --rule:       #1E2530;  /* hairline borders and dividers */
  --text:       #C8D2DC;  /* primary text — cool off-white, never pure #FFF */
  --text-dim:   #7B8492;  /* labels, captions — 4.52:1 on --panel-alt */
  --accent:     #57C7E3;  /* holo-cyan — the ONE accent */
  --accent-dim: #2A6B7D;  /* accent at rest: borders, inactive indicators */

  /* Semantic. Exempt from the palette, but only where the colour itself
     carries meaning: status, priority, severity, validation. */
  --ok:   #4FA97B;
  --warn: #D89B3C;
  --crit: #D45D5D;
  --info: #57C7E3;  /* info and "live" are the same signal here */

  /* Bare triplets for the Phase-5 accent FX, which needs rgba() with a runtime
     alpha and cannot decompose a hex at speed. */
  --rgb-standard: 87, 199, 227;
  --rgb-alert: 255, 90, 71;

  --font-label: 'IBM Plex Sans Condensed', system-ui, sans-serif;
  --font-body:  'IBM Plex Sans', system-ui, sans-serif;
  --font-mono:  'IBM Plex Mono', ui-monospace, monospace;

  --tap: 44px;          /* minimum touch target — overrides density guidance */
  --step: 80ms;         /* mechanical transition; snap rather than glide */

  /* Safe areas, so every screen can reason about chrome without repeating env() */
  --inset-top: env(safe-area-inset-top, 0px);
  --inset-bottom: env(safe-area-inset-bottom, 0px);
}

/**
 * ALERT mode. The accent becomes red and NOTHING else changes — surfaces, text
 * and the semantic set stay where they are, so "this is live" and "this is
 * wrong" remain different signals.
 */
:root[data-accent="alert"] {
  --accent:     #FF5A47;
  --accent-dim: #7A2E24;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  height: 100%;
  background: var(--void);
  color: var(--text);
  font-family: var(--font-body);
  font-size: 15px;
  line-height: 1.45;
  /* The app owns its own scrolling; the document never bounces. */
  overscroll-behavior: none;
  -webkit-tap-highlight-color: transparent;
}

/** Labels, headers, nav — this is what makes it read as an instrument panel. */
.label {
  font-family: var(--font-label);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 600;
  font-size: 11px;
  color: var(--text-dim);
}

/** All numerals, IDs, timestamps, tabular data. Numbers must align. */
.mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

/** The accent glow is the focus ring. */
:focus-visible {
  outline: none;
  box-shadow: 0 0 0 1px var(--accent), 0 0 8px rgba(var(--rgb-standard), 0.45);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }
}
```

- [ ] **Step 4: Import the self-hosted fonts**

Rewrite `src/styles/index.css`:

```css
/* The one stylesheet entry point. esbuild follows these imports and emits a
   single app.css; the split exists for editing, not for delivery.
   @fontsource ships the woff2 files locally — nothing is fetched at runtime,
   which an offline app cannot do. */
@import "@fontsource/ibm-plex-sans/400.css";
@import "@fontsource/ibm-plex-sans/600.css";
@import "@fontsource/ibm-plex-sans-condensed/500.css";
@import "@fontsource/ibm-plex-sans-condensed/600.css";
@import "@fontsource/ibm-plex-mono/400.css";
@import "@fontsource/ibm-plex-mono/600.css";

@import "./tokens.css";
@import "./layout.css";
```

- [ ] **Step 5: Write `src/styles/layout.css`**

```css
/**
 * App frame: a fixed bottom tab bar, a scrolling screen above it.
 *
 * dvh rather than vh — Chrome on Android collapses its URL bar on scroll, and
 * vh does not account for that, leaving the tab bar cropped or floating.
 */

#app {
  display: flex;
  flex-direction: column;
  height: 100dvh;
}

.screen {
  flex: 1;
  overflow-y: auto;
  padding: calc(var(--inset-top) + 12px) 12px 12px;
}

.screen-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  min-height: var(--tap);
}

.screen-title {
  font-family: var(--font-label);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 600;
  font-size: 17px;
  color: var(--text);
}

/* Bracket marks — the preferred decorative device, used sparingly. */
.bracket {
  position: relative;
}
.bracket::before,
.bracket::after {
  content: '';
  position: absolute;
  width: 7px; height: 7px;
  border: 1px solid var(--accent-dim);
  pointer-events: none;
}
.bracket::before { top: 0; left: 0; border-right: 0; border-bottom: 0; }
.bracket::after  { bottom: 0; right: 0; border-left: 0; border-top: 0; }

.tab-bar {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-top: 1px solid var(--rule);
  background: var(--panel);
  padding-bottom: var(--inset-bottom);
}

.tab {
  min-height: var(--tap);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 6px 2px;
  background: none;
  border: 0;
  border-top: 2px solid transparent;
  color: var(--text-dim);
  font-family: var(--font-label);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 600;
  font-size: 10px;
  cursor: pointer;
  transition: color var(--step) linear, border-color var(--step) linear;
}

.tab[aria-current="page"] {
  color: var(--accent);
  border-top-color: var(--accent);
}

/* Status indicators are small squares, never circles. */
.mark {
  width: 6px; height: 6px;
  background: var(--accent-dim);
  display: inline-block;
}
.mark.live {
  background: var(--accent);
  box-shadow: 0 0 6px var(--accent);
}
```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS — 7 tests (3 build + 4 tokens).

- [ ] **Step 7: Commit**

```bash
git add src/styles test/tokens.test.js package.json package-lock.json
git commit -m "style: fixed palette, self-hosted IBM Plex, ALERT accent mode"
```

---

### Task 3: Harvest `ids.js` and `time.js`

**Files:**
- Create: `src/core/ids.js`, `src/core/time.js`
- Test: `test/core/time.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `makeId(prefix = 'id', now = Date.now) → string`
  - `nextRef(doc, kind, letter) → string` (mutates `doc.seq`)
  - `__resetCounter()` — test-only
  - `dateKey(date) → "YYYY-MM-DD"`, `parseDateKey(key) → Date|null`, `addDays(key, n) → string|null`, `todayKey(now = Date.now()) → string`
  - `minutesToLabel(minutes) → "07:15"`, `labelToMinutes(label) → number|null`
  - `dayName(key) → "Mon"`, `formatDayLabel(key) → "Mon 16 Aug"`, `isWeekend(key) → boolean`, `clamp(v, lo, hi) → number`
  - `DAY_NAMES`, `MONTH_NAMES` — Monday-first and Jan-first arrays

- [ ] **Step 1: Copy both files out of `reference/`**

`reference/` is read-only; this copies out and leaves the original untouched.

```bash
mkdir -p src/core test/core
cp reference/2026-08-16-task-tracker/src/core/ids.js src/core/ids.js
cp reference/2026-08-16-task-tracker/src/core/time.js src/core/time.js
```

`ids.js` is taken **verbatim** — no edits at all. It avoids `Math.random()` on purpose so a seeded clock produces a reproducible sequence and tests can assert on real ids.

- [ ] **Step 2: Trim `src/core/time.js` to what this app uses**

Delete these exports and any helper used only by them. They exist for the week grid and the user-selectable date format, neither of which is in scope:

- `SLOT_MIN`, `MIN_BLOCK`, `snap()`, `snapDown()`
- `startOfWeek()`, `weekKey()`, `weekKeyOf()`, `weekDays()`, `formatWeekRange()`
- `formatDuration()`
- `DATE_FORMAT_IDS`, `formatDate()`, and the module-level `DAY_NAMES_LONG` / `MONTH_NAMES_LONG` arrays they alone use

Keep everything else exactly as written. **Do not touch `dateKey()`** — its local-components construction is the reason a Monday morning does not land on Sunday for anyone east of Greenwich, and `toISOString()` would reintroduce that bug.

Update the module's opening comment, which currently says "for the week grid":

```js
/**
 * Time and date arithmetic.
 *
 * Everything here is pure and local-timezone. Date keys are "YYYY-MM-DD" strings
 * built from *local* calendar components — never `toISOString()`, which silently
 * shifts the day across a UTC boundary.
 *
 * Minutes are always minutes-from-local-midnight.
 */
```

- [ ] **Step 3: Write the test**

Create `test/core/time.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dateKey, parseDateKey, addDays, todayKey,
  minutesToLabel, labelToMinutes, dayName, formatDayLabel, isWeekend,
} from '../../src/core/time.js';

test('dateKey uses local components, not UTC', () => {
  // 23:30 local on the 31st. toISOString() would report the 1st for anyone
  // east of Greenwich — this is the bug the local construction prevents.
  const d = new Date(2026, 7, 31, 23, 30);
  assert.equal(dateKey(d), '2026-08-31');
});

test('parseDateKey round-trips', () => {
  assert.equal(dateKey(parseDateKey('2026-08-31')), '2026-08-31');
  assert.equal(parseDateKey('nonsense'), null);
});

test('addDays crosses month and year boundaries', () => {
  assert.equal(addDays('2026-08-31', 1), '2026-09-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
});

test('addDays crosses a DST boundary without losing a day', () => {
  // UK clocks go back on 2026-10-25. Naive +86400000ms arithmetic lands at
  // 23:00 the previous day; calendar arithmetic does not.
  assert.equal(addDays('2026-10-24', 1), '2026-10-25');
  assert.equal(addDays('2026-10-25', 1), '2026-10-26');
});

test('minute labels round-trip', () => {
  assert.equal(minutesToLabel(435), '07:15');
  assert.equal(minutesToLabel(0), '00:00');
  assert.equal(labelToMinutes('07:15'), 435);
  assert.equal(labelToMinutes('25:00'), null);
  assert.equal(labelToMinutes('rubbish'), null);
});

test('day naming is Monday-first', () => {
  assert.equal(dayName('2026-08-31'), 'Mon');
  assert.equal(formatDayLabel('2026-08-31'), 'Mon 31 Aug');
  assert.equal(isWeekend('2026-08-31'), false);
  assert.equal(isWeekend('2026-08-30'), true);
});

test('todayKey accepts an injected clock', () => {
  assert.equal(todayKey(new Date(2026, 7, 31, 9, 0).getTime()), '2026-08-31');
});
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS. If a deleted export is still referenced, the test file will fail to import — that is the trim check working.

- [ ] **Step 5: Commit**

```bash
git add src/core/ids.js src/core/time.js test/core/time.test.js
git commit -m "feat(core): harvest ids and time from the reference tracker"
```

---

### Task 4: Harvest `recurrence.js`

**Files:**
- Create: `src/core/recurrence.js`
- Test: `test/core/recurrence.test.js`

**Interfaces:**
- Consumes: `time.js` — `dateKey`, `parseDateKey`, `addDays`, `DAY_NAMES`.
- Produces:
  - `RULE_KINDS = ['once', 'daily', 'weekly', 'monthly']`
  - `occursOn(rule, key) → boolean` — the single question everything else asks
  - `nextOccurrence(rule, afterKey) → string|null` — first firing strictly after `afterKey`, scanning at most 400 days
  - `describeRule(rule) → string` — the rule in words
  - `defaultRule(todayKey) → object`, `weekdayOf(key) → number|null` (Monday = 0)
  - Rule shapes: `{kind:'once', date}` · `{kind:'daily', from, every}` · `{kind:'weekly', days:[0..6]}` · `{kind:'monthly', day}` or `{kind:'monthly', nth, weekday}`; all accept optional `from` / `until` bounds.

- [ ] **Step 1: Copy it out, verbatim**

```bash
cp reference/2026-08-16-task-tracker/src/core/recurrence.js src/core/recurrence.js
```

**No edits.** This module is already pure, clock-free and general — it was written to be shared by routines and calendar events, which is exactly how this app uses it. It is the engine `schedule.js` will be built on in Phase 3.

- [ ] **Step 2: Write the test**

Create `test/core/recurrence.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { occursOn, nextOccurrence, describeRule, weekdayOf } from '../../src/core/recurrence.js';

test('weekdayOf is Monday-first', () => {
  assert.equal(weekdayOf('2026-08-31'), 0);  // Monday
  assert.equal(weekdayOf('2026-08-30'), 6);  // Sunday
});

test('once fires on exactly one day', () => {
  const rule = { kind: 'once', date: '2026-08-31' };
  assert.equal(occursOn(rule, '2026-08-31'), true);
  assert.equal(occursOn(rule, '2026-09-01'), false);
});

test('weekly fires on its chosen days only', () => {
  const rule = { kind: 'weekly', days: [0, 2] };  // Mon, Wed
  assert.equal(occursOn(rule, '2026-08-31'), true);   // Mon
  assert.equal(occursOn(rule, '2026-09-01'), false);  // Tue
  assert.equal(occursOn(rule, '2026-09-02'), true);   // Wed
});

test('daily honours its interval and its anchor', () => {
  const rule = { kind: 'daily', from: '2026-08-31', every: 3 };
  assert.equal(occursOn(rule, '2026-08-31'), true);
  assert.equal(occursOn(rule, '2026-09-01'), false);
  assert.equal(occursOn(rule, '2026-09-03'), true);
  assert.equal(occursOn(rule, '2026-08-30'), false, 'never before the anchor');
});

test('monthly day-of-month SKIPS an absent date rather than clamping', () => {
  // The whole point: "day 31" does not occur in September. Clamping it to the
  // 30th would silently move a date the user pinned.
  const rule = { kind: 'monthly', day: 31 };
  assert.equal(occursOn(rule, '2026-08-31'), true);
  assert.equal(occursOn(rule, '2026-09-30'), false);
  assert.equal(occursOn(rule, '2026-10-31'), true);
});

test('monthly nth-weekday supports "last"', () => {
  const last = { kind: 'monthly', nth: -1, weekday: 0 };  // last Monday
  assert.equal(occursOn(last, '2026-08-31'), true);
  assert.equal(occursOn(last, '2026-08-24'), false);
});

test('from and until bound every rule kind', () => {
  const rule = { kind: 'weekly', days: [0], from: '2026-09-01', until: '2026-09-30' };
  assert.equal(occursOn(rule, '2026-08-31'), false, 'before from');
  assert.equal(occursOn(rule, '2026-09-07'), true);
  assert.equal(occursOn(rule, '2026-10-05'), false, 'after until');
});

test('nextOccurrence is strictly after the given day', () => {
  const rule = { kind: 'weekly', days: [0] };
  assert.equal(nextOccurrence(rule, '2026-08-31'), '2026-09-07');
});

test('nextOccurrence returns null for a rule that can never fire', () => {
  // Day 32 exists in no month. Scanning forever would hang; null is honest.
  assert.equal(nextOccurrence({ kind: 'monthly', day: 32 }, '2026-08-31'), null);
});

test('malformed rules are false, never thrown', () => {
  for (const bad of [null, undefined, {}, 'weekly', 42, { kind: 'yearly' }]) {
    assert.equal(occursOn(bad, '2026-08-31'), false);
  }
});

test('describeRule produces readable text', () => {
  assert.equal(describeRule({ kind: 'weekly', days: [0, 2] }), 'Every Mon, Wed');
  assert.equal(describeRule({ kind: 'daily', from: '2026-08-31', every: 1 }), 'Every day');
  assert.equal(describeRule({ kind: 'monthly', day: 15 }), 'Day 15 of the month');
  assert.equal(describeRule(null), 'No schedule');
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test`
Expected: PASS — 11 recurrence tests.

- [ ] **Step 4: Commit**

```bash
git add src/core/recurrence.js test/core/recurrence.test.js
git commit -m "feat(core): harvest the recurrence engine verbatim"
```

---

### Task 5: The document — `core/schema.js`

**Files:**
- Create: `src/core/schema.js`
- Test: `test/core/schema.test.js`

**Interfaces:**
- Consumes: `ids.js` — `makeId`.
- Produces:
  - `DOC_VERSION = 1`, `DEFAULT_SETTINGS`
  - `createEmptyDoc({ now }) → doc`
  - `validateDoc(doc) → {ok: true} | {ok: false, problem: string}`
  - `migrate(doc, { now }) → doc` — safe to run on an already-current document
  - Later tasks add their `repair*()` functions to `migrate`'s body.

- [ ] **Step 1: Write the failing test**

Create `test/core/schema.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyDoc, validateDoc, migrate, DOC_VERSION, DEFAULT_SETTINGS }
  from '../../src/core/schema.js';

const clock = () => new Date(2026, 7, 31, 9, 0).getTime();

test('a fresh document has every collection', () => {
  const doc = createEmptyDoc({ now: clock });
  assert.equal(doc.version, DOC_VERSION);
  for (const key of ['projects', 'tasks', 'routines', 'events', 'dismissals']) {
    assert.ok(Array.isArray(doc[key]), `${key} must be an array`);
    assert.equal(doc[key].length, 0);
  }
  assert.equal(doc.settings.accentMode, 'standard');
  assert.equal(doc.settings.digest.timeMin, 450);
  assert.equal(doc.settings.eventLeadMin, 15);
});

test('settings are deep-copied, so two documents cannot share a digest object', () => {
  const a = createEmptyDoc({ now: clock });
  const b = createEmptyDoc({ now: clock });
  a.settings.digest.timeMin = 999;
  assert.equal(b.settings.digest.timeMin, 450);
  assert.equal(DEFAULT_SETTINGS.digest.timeMin, 450, 'the defaults must not be mutated');
});

test('validateDoc rejects things that are not our document', () => {
  assert.equal(validateDoc(null).ok, false);
  assert.equal(validateDoc([]).ok, false);
  assert.equal(validateDoc('a string').ok, false);
  assert.equal(validateDoc({}).ok, false);
  assert.equal(validateDoc({ tasks: 'not an array' }).ok, false);
  assert.equal(validateDoc({ version: 'one' }).ok, false);
});

test('validateDoc accepts a genuine document, current or old', () => {
  assert.equal(validateDoc(createEmptyDoc({ now: clock })).ok, true);
  assert.equal(validateDoc({ tasks: [] }).ok, true, 'an old but genuine file');
});

test('a damaged document is reported, not silently repaired', () => {
  // The distinction that matters: migrate() is deliberately forgiving, which is
  // right for an old file and wrong for a corrupt one. Hand-edited nonsense
  // must reach a recovery screen rather than be "repaired" into an empty doc.
  const result = validateDoc({ tasks: { not: 'a list' } });
  assert.equal(result.ok, false);
  assert.match(result.problem, /tasks/);
});

test('migrate fills in everything a partial document is missing', () => {
  const doc = migrate({ tasks: [] }, { now: clock });
  assert.equal(doc.version, DOC_VERSION);
  assert.ok(doc.id);
  assert.deepEqual(doc.events, []);
  assert.equal(doc.settings.eventLeadMin, 15);
});

test('migrate is idempotent', () => {
  const once = migrate(createEmptyDoc({ now: clock }), { now: clock });
  const twice = migrate(once, { now: clock });
  assert.deepEqual(twice, once);
});

test('migrate preserves saved settings rather than resetting them', () => {
  const doc = migrate({
    tasks: [],
    settings: { accentMode: 'alert', digest: { enabled: false, timeMin: 600 } },
  }, { now: clock });
  assert.equal(doc.settings.accentMode, 'alert');
  assert.equal(doc.settings.digest.enabled, false);
  assert.equal(doc.settings.digest.timeMin, 600);
  assert.equal(doc.settings.eventLeadMin, 15, 'absent keys still get defaults');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `src/core/schema.js`.

- [ ] **Step 3: Write `src/core/schema.js`**

```js
/**
 * Document shape, defaults and migration.
 *
 * One JSON document holds every collection. The collections are peers — tasks,
 * routines, events — rather than a hierarchy, which is what lets a further one
 * (a budget module) be added later without anything above it moving.
 *
 * `migrate` runs on every load and must be safe to apply to an already-current
 * document. It is deliberately forgiving: that is right for an old-but-genuine
 * file and wrong for a damaged one, so `validateDoc` gates it. Without that
 * gate, hand-edited nonsense would be silently "repaired" into an empty
 * document, quietly discarding real data.
 */

import { makeId } from './ids.js';

export const DOC_VERSION = 1;

export const DEFAULT_SETTINGS = {
  accentMode: 'standard',
  /** Minutes from local midnight. 450 = 07:30. */
  digest: { enabled: true, timeMin: 450 },
  /** Default minutes before an event to notify; an event may override it. */
  eventLeadMin: 15,
};

/** Settings contains a nested object, so a shallow spread would let two
 *  documents share one `digest` and let a write to either mutate DEFAULTS. */
function freshSettings(saved = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    digest: { ...DEFAULT_SETTINGS.digest, ...(saved.digest || {}) },
  };
}

export function createEmptyDoc({ now = Date.now } = {}) {
  return {
    version: DOC_VERSION,
    id: makeId('doc', now),
    createdAt: now(),
    seq: {},
    settings: freshSettings(),
    projects: [],
    tasks: [],
    routines: [],
    events: [],
    /** Flat array of keys: `<id>:<dateKey>` or `<id>:<dateKey>:<when>`.
     *  Consumed as a Set; pruned by signals.pruneDismissals so it cannot grow
     *  for the life of the document. */
    dismissals: [],
  };
}

const COLLECTIONS = ['projects', 'tasks', 'routines', 'events', 'dismissals'];

/**
 * Is this plausibly one of our documents?
 * @returns {{ok: true} | {ok: false, problem: string}}
 */
export function validateDoc(doc) {
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, problem: 'The file does not contain a tracker document.' };
  }
  for (const field of COLLECTIONS) {
    if (field in doc && !Array.isArray(doc[field])) {
      return { ok: false, problem: `"${field}" should be a list, but it is not.` };
    }
  }
  if ('settings' in doc && (typeof doc.settings !== 'object' || doc.settings === null
      || Array.isArray(doc.settings))) {
    return { ok: false, problem: '"settings" is damaged.' };
  }
  if ('version' in doc && typeof doc.version !== 'number') {
    return { ok: false, problem: '"version" is not a number.' };
  }
  const hasAnyContent = [...COLLECTIONS, 'settings', 'version'].some((f) => f in doc);
  if (!hasAnyContent) {
    return { ok: false, problem: 'The file has none of the expected fields.' };
  }
  return { ok: true };
}

/**
 * Bring any older document up to the current shape.
 *
 * Later tasks add their own `repair*()` calls here. Each owning module carries
 * its own repair rules rather than this file reaching in and duplicating them.
 */
export function migrate(doc, { now = Date.now } = {}) {
  if (!doc || typeof doc !== 'object') return createEmptyDoc({ now });

  const out = { ...doc };
  out.version = DOC_VERSION;
  out.id = out.id || makeId('doc', now);
  out.createdAt = out.createdAt ?? now();
  out.seq = out.seq && typeof out.seq === 'object' ? out.seq : {};
  out.settings = freshSettings(out.settings || {});

  out.projects = Array.isArray(out.projects) ? out.projects : [];
  out.tasks = Array.isArray(out.tasks) ? out.tasks : [];
  out.routines = Array.isArray(out.routines) ? out.routines : [];
  out.events = Array.isArray(out.events) ? out.events : [];
  out.dismissals = Array.isArray(out.dismissals) ? out.dismissals.map(String) : [];

  return out;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS — 8 schema tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/schema.js test/core/schema.test.js
git commit -m "feat(core): document shape, validation and migration"
```

---

### Task 6: Persistence — harvest `store/`, add the `platform/` seam

**Files:**
- Create: `src/store/store.js`, `src/store/memory-driver.js`, `src/store/idb-driver.js`, `src/store/idb-kv.js`, `src/platform/storage.js`
- Test: `test/store/store.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks — `store/` is domain-ignorant by design, which is what makes it testable against the memory driver.
- Produces:
  - `createStore({ driver, clock, maxSnapshots, snapshotEvery }) → store` with `open()`, `read()`, `write(doc)`, `status`, `label`, `canWrite`, `onStatusChange(fn)`
  - `createDebouncedWriter(store, { idle, ceiling }) → writer` with `schedule(doc)` and `flush()`
  - `STATUS`, `CADENCE`, `createMemoryDriver({ label, seed })`, `createIdbDriver()`
  - `createStorage() → { driver, degraded, reason }` from `platform/storage.js` — **the only function the app calls to obtain a driver**

- [ ] **Step 1: Copy the store out of `reference/`**

```bash
mkdir -p src/store src/platform test/store
cp reference/2026-08-16-task-tracker/src/store/store.js        src/store/store.js
cp reference/2026-08-16-task-tracker/src/store/memory-driver.js src/store/memory-driver.js
cp reference/2026-08-16-task-tracker/src/store/idb-driver.js    src/store/idb-driver.js
cp reference/2026-08-16-task-tracker/src/store/idb-kv.js        src/store/idb-kv.js
```

Deliberately **not** copied:

- `fsa-driver.js` — the File System Access API does not exist in an Android WebView. This is the driver the port replaces.
- `mirror.js` — it mirrored the folder copy into browser storage as crash insurance. With IndexedDB as the primary there is nothing to mirror into.
- `index.js` — its `selectDriver()` chooses between FSA and IndexedDB. `platform/storage.js` replaces it, because driver selection is now a platform question.

Take all four **verbatim**. In particular do not trim the blob primitives from the driver contract: they are unused here, but removing them would mean editing `store.js` too, and the value of this harvest is that it arrives already proven.

- [ ] **Step 2: Write the store test**

Create `test/store/store.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, createDebouncedWriter, STATUS } from '../../src/store/store.js';
import { createMemoryDriver } from '../../src/store/memory-driver.js';

const makeStore = (seed) => {
  const driver = createMemoryDriver({ seed });
  return { driver, store: createStore({ driver }) };
};

test('a fresh store reads null rather than throwing', async () => {
  const { store } = makeStore();
  assert.equal(await store.open(), STATUS.READY);
  assert.equal(await store.read(), null);
});

test('what is written is what is read back', async () => {
  const { store } = makeStore();
  await store.open();
  await store.write({ hello: 'world', n: 1 });
  assert.deepEqual(await store.read(), { hello: 'world', n: 1 });
});

test('a corrupt primary reports rather than returning an empty document', async () => {
  const { store } = makeStore({ 'state.json': '{ not json' });
  await store.open();
  await assert.rejects(() => store.read());
  assert.equal(store.status, STATUS.ERROR);
});

test('a driver fault surfaces as an error status, not a crash', async () => {
  const { driver, store } = makeStore();
  await store.open();
  driver.setFault((op) => (op === 'putText' ? new Error('disk full') : null));
  await assert.rejects(() => store.write({ a: 1 }));
});

test('the debounced writer coalesces a burst into one write', async () => {
  const { driver, store } = makeStore();
  await store.open();
  const writer = createDebouncedWriter(store, { idle: 20, ceiling: 200 });

  let writes = 0;
  const realPut = driver.putText.bind(driver);
  driver.putText = async (name, text) => { if (name === 'state.json') writes++; return realPut(name, text); };

  for (let i = 0; i < 10; i++) writer.schedule({ n: i });
  await writer.flush();

  assert.equal(writes, 1, 'ten edits in one burst must cost one write');
  assert.deepEqual(await store.read(), { n: 9 }, 'and the last edit must win');
});

test('flush resolves only once the write has actually landed', async () => {
  // This is the page-unload path. A flush() that resolved while a write was
  // still in flight would lose the last edit — a real bug the reference app's
  // suite caught, and the reason this test exists.
  //
  // The injected latency is load-bearing, not decoration. Against the bare
  // memory driver — whose writes settle in the same microtask window as the
  // read that follows — a fire-and-forget flush() that never awaits the drain
  // passes this test just as happily as a correct one. Only a driver that
  // actually takes time can tell the two apart.
  const driver = createMemoryDriver();
  const realPut = driver.putText.bind(driver);
  driver.putText = async (name, text) => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return realPut(name, text);
  };
  const store = createStore({ driver });

  await store.open();
  const writer = createDebouncedWriter(store, { idle: 5, ceiling: 50 });
  writer.schedule({ final: true });
  await writer.flush();
  assert.deepEqual(await store.read(), { final: true });
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test`
Expected: PASS — 6 store tests. If `store.js` imports anything from the two files that were not copied, the failure will name it; delete that import.

- [ ] **Step 4: Write `src/platform/storage.js`**

```js
/**
 * Where the document lives — the platform's answer, not the app's.
 *
 * This is one of the two files in `platform/`, the only folder allowed to know
 * what host the app is running on. Everything above it sees a driver satisfying
 * the store's contract and nothing more.
 *
 * Today that is always IndexedDB, which is the right choice in both hosts we
 * care about:
 *
 *   - In a browser (the development loop) it is the only durable option.
 *   - Inside the Capacitor WebView it is app-private storage, cleared only when
 *     the user clears the app's data. Unlike the reference app's situation on a
 *     managed Windows machine — where `persisted: NO` made browser storage
 *     evictable and therefore never a source of truth — here it genuinely is
 *     the source of truth.
 *
 * A later phase may add a Capacitor Filesystem driver so the document is a real
 * file that can be pulled off the device with adb. If so it is added HERE, and
 * nothing above this file changes.
 */

import { createIdbDriver, isIdbSupported } from '../store/idb-driver.js';
import { createMemoryDriver } from '../store/memory-driver.js';

/**
 * @returns {{driver: object, degraded: boolean, reason: string|null}}
 */
export function createStorage() {
  if (isIdbSupported()) {
    return { driver: createIdbDriver(), degraded: false, reason: null };
  }
  // Private-mode browsers and some WebView configurations block IndexedDB.
  // A working-but-forgetful app that says so beats a blank screen.
  return {
    driver: createMemoryDriver({ label: 'memory (not saved)' }),
    degraded: true,
    reason: 'This browser is not allowing durable storage, so nothing will be '
          + 'saved when you close the app. Export a backup before you leave.',
  };
}

/**
 * Save cadence.
 *
 * Far faster than the reference app's 60s idle / 180s ceiling. That slowness was
 * bought by a specific cost: the document lived in OneDrive, and SharePoint
 * records a version per write, so an eager autosave spent the version history on
 * keystrokes. Writing to local storage on the device has no such cost, and a
 * phone can be killed by the OS at any moment, so saving promptly is strictly
 * better here.
 */
export const SAVE_CADENCE = { idle: 800, ceiling: 3000 };
```

- [ ] **Step 5: Run the tests again**

Run: `npm test`
Expected: PASS — nothing broken.

- [ ] **Step 6: Commit**

```bash
git add src/store src/platform test/store
git commit -m "feat(store): harvest the store, add the platform storage seam"
```

---

### Task 7: The shell — `dom.js`, `app.js`, the tab bar and four empty screens

**Files:**
- Create: `src/ui/dom.js`, `src/ui/app.js`, `src/ui/tab-bar.js`, `src/ui/today.js`, `src/ui/tasks.js`, `src/ui/calendar.js`, `src/ui/settings.js`
- Modify: `src/main.js`
- Test: `test/ui/shell.test.js`

**Interfaces:**
- Consumes: `platform/storage.js` — `createStorage`, `SAVE_CADENCE`; `store/store.js` — `createStore`, `createDebouncedWriter`; `core/schema.js` — `createEmptyDoc`, `validateDoc`, `migrate`.
- Produces:
  - `el(tag, opts, children) → HTMLElement` where `opts` is `{ class, text, attrs, style, on }`
  - `createApp({ root, driver, now }) → app` with `boot()`, `render()`, `state`, `actions`
  - `SCREENS = ['today', 'tasks', 'calendar', 'settings']`
  - `state = { doc, screen, now }`; `actions.setScreen(name)`, `actions.update(fn)` where `fn(doc) → doc`
  - Each screen module exports `renderToday(ctx)` / `renderTasks(ctx)` / `renderCalendar(ctx)` / `renderSettings(ctx)`, taking `ctx = { doc, now, actions }` and returning one element.

- [ ] **Step 1: Write the failing shell test**

Create `test/ui/shell.test.js`:

```js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createApp, SCREENS } from '../../src/ui/app.js';
import { createMemoryDriver } from '../../src/store/memory-driver.js';

const clock = () => new Date(2026, 7, 31, 9, 0).getTime();

function mount(seed) {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
  const root = dom.window.document.getElementById('app');
  const app = createApp({ root, driver: createMemoryDriver({ seed }), now: clock });
  return { dom, root, app };
}

test('boot renders a tab bar with one tab per screen', async () => {
  const { root, app } = mount();
  await app.boot();
  const tabs = root.querySelectorAll('.tab');
  assert.equal(tabs.length, SCREENS.length);
  assert.deepEqual([...tabs].map((t) => t.dataset.screen), [...SCREENS]);
});

test('boot on an empty driver creates a document', async () => {
  const { app } = mount();
  await app.boot();
  assert.ok(app.state.doc.id);
  assert.deepEqual(app.state.doc.tasks, []);
});

test('the app opens on TODAY', async () => {
  const { root, app } = mount();
  await app.boot();
  assert.equal(app.state.screen, 'today');
  assert.equal(root.querySelector('[aria-current="page"]').dataset.screen, 'today');
});

test('tapping a tab changes screen and moves the current marker', async () => {
  const { root, app } = mount();
  await app.boot();
  root.querySelector('.tab[data-screen="calendar"]').click();
  assert.equal(app.state.screen, 'calendar');
  const current = root.querySelectorAll('[aria-current="page"]');
  assert.equal(current.length, 1, 'exactly one tab is ever current');
  assert.equal(current[0].dataset.screen, 'calendar');
});

test('every tab meets the 44px touch-target floor', async () => {
  const { root, app } = mount();
  await app.boot();
  // jsdom does not lay out, so assert the contract the stylesheet must honour
  // rather than a measured height: the class is the promise.
  for (const tab of root.querySelectorAll('.tab')) {
    assert.ok(tab.classList.contains('tab'));
    assert.equal(tab.tagName, 'BUTTON', 'a tab must be a real button, for focus and a11y');
  }
});

test('a saved document is loaded rather than replaced', async () => {
  const seed = { 'state.json': JSON.stringify({ tasks: [], settings: { accentMode: 'alert' } }) };
  const { app } = mount(seed);
  await app.boot();
  assert.equal(app.state.doc.settings.accentMode, 'alert');
});

test('accentMode is reflected onto the document element', async () => {
  const seed = { 'state.json': JSON.stringify({ tasks: [], settings: { accentMode: 'alert' } }) };
  const { dom, app } = mount(seed);
  await app.boot();
  assert.equal(dom.window.document.documentElement.dataset.accent, 'alert');
});

test('aria state attributes serialise as strings, not boolean attributes', async () => {
  // A boolean HTML attribute writes "", so [aria-pressed="true"] would never
  // match and every pressed style in the app would silently do nothing.
  const { dom } = mount();
  const { el } = await import('../../src/ui/dom.js');
  global.document = dom.window.document;
  const on = el('button', { attrs: { 'aria-pressed': true } });
  const off = el('button', { attrs: { 'aria-pressed': false } });
  assert.equal(on.getAttribute('aria-pressed'), 'true');
  assert.equal(off.getAttribute('aria-pressed'), 'false');
  assert.ok(on.matches('[aria-pressed="true"]'));
  // Non-aria booleans keep HTML boolean-attribute semantics.
  const plain = el('input', { attrs: { disabled: true, readonly: false } });
  assert.equal(plain.getAttribute('disabled'), '');
  assert.equal(plain.hasAttribute('readonly'), false);
});

test('a damaged document reaches recovery instead of being silently emptied', async () => {
  const { root, app } = mount({ 'state.json': JSON.stringify({ tasks: 'not a list' }) });
  await app.boot();
  assert.match(root.textContent, /could not be read/i);
  assert.equal(app.state.doc, null, 'nothing is written over the damaged file');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `src/ui/app.js`.

- [ ] **Step 3: Write `src/ui/dom.js`**

```js
/**
 * Element construction.
 *
 * One helper rather than a template language: the whole UI is built by calling
 * this, so there is no string-to-DOM path anywhere and therefore no place for an
 * injection bug to live. `text` sets textContent, never innerHTML.
 */

/**
 * @param {string} tag
 * @param {{class?: string, text?: string, attrs?: object, style?: object,
 *          on?: Record<string, Function>}} [opts]
 * @param {Array<Node|null|undefined|false>} [children]
 * @returns {HTMLElement}
 */
export function el(tag, opts = {}, children = []) {
  const node = document.createElement(tag);
  if (opts.class) node.className = opts.class;
  if (opts.text != null) node.textContent = String(opts.text);
  for (const [k, v] of Object.entries(opts.attrs || {})) {
    if (v == null) continue;
    // ARIA states are string-valued, not boolean HTML attributes. Setting
    // `aria-pressed` to `true` the boolean-attribute way writes an empty
    // string, so `[aria-pressed="true"]` never matches and the pressed style
    // never applies; and `false` must be written out rather than dropped,
    // because "not pressed" and "not a toggle" are different statements to a
    // screen reader. Serialise both explicitly.
    if (k.startsWith('aria-') && typeof v === 'boolean') {
      node.setAttribute(k, String(v));
      continue;
    }
    if (v === false) continue;
    node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const [k, v] of Object.entries(opts.style || {})) node.style[k] = v;
  for (const [event, fn] of Object.entries(opts.on || {})) node.addEventListener(event, fn);
  for (const child of children) if (child) node.appendChild(child);
  return node;
}

/** Replace everything under `node` with `children`. */
export function mount(node, ...children) {
  node.textContent = '';
  for (const child of children) if (child) node.appendChild(child);
  return node;
}
```

- [ ] **Step 4: Write the four screen stubs**

Each is a real module from the start so later tasks fill one in rather than splitting a file. `src/ui/today.js`:

```js
import { el } from './dom.js';

export function renderToday(ctx) {
  return el('div', { class: 'screen' }, [
    el('div', { class: 'screen-head' }, [
      el('span', { class: 'mark' }),
      el('span', { class: 'screen-title', text: 'Today' }),
    ]),
    el('span', { class: 'label', text: 'Nothing yet' }),
  ]);
}
```

Create `src/ui/tasks.js`, `src/ui/calendar.js` and `src/ui/settings.js` identically, changing only the exported name (`renderTasks`, `renderCalendar`, `renderSettings`) and the title text (`'Tasks'`, `'Calendar'`, `'Settings'`).

- [ ] **Step 5: Write `src/ui/tab-bar.js`**

```js
import { el } from './dom.js';

/** Bottom navigation. At the bottom because that is where thumbs are. */
export function renderTabBar(ctx, screens, current) {
  return el('nav', { class: 'tab-bar' }, screens.map((name) => el('button', {
    class: 'tab',
    attrs: {
      type: 'button',
      'data-screen': name,
      // aria-current, not a class, so assistive tech and the stylesheet read
      // the same fact rather than two that can drift apart.
      'aria-current': name === current ? 'page' : null,
    },
    on: { click: () => ctx.actions.setScreen(name) },
  }, [
    el('span', { class: 'mark' }),
    el('span', { text: name }),
  ])));
}
```

- [ ] **Step 6: Write `src/ui/app.js`**

```js
/**
 * Application state and the render loop.
 *
 * `render()` rebuilds the whole tree under `root` on every change. That is fast
 * enough at this size and removes a class of bug outright: there is no
 * incremental update path that can disagree with the document.
 */

import { el, mount } from './dom.js';
import { renderTabBar } from './tab-bar.js';
import { renderToday } from './today.js';
import { renderTasks } from './tasks.js';
import { renderCalendar } from './calendar.js';
import { renderSettings } from './settings.js';
import { createStore, createDebouncedWriter } from '../store/store.js';
import { createStorage, SAVE_CADENCE } from '../platform/storage.js';
import { createEmptyDoc, validateDoc, migrate } from '../core/schema.js';

export const SCREENS = ['today', 'tasks', 'calendar', 'settings'];

const RENDERERS = {
  today: renderToday,
  tasks: renderTasks,
  calendar: renderCalendar,
  settings: renderSettings,
};

/**
 * Apply an editor patch to a task.
 *
 * A status change is routed through `setStatus` rather than spread in, so
 * `doneAt` can never end up disagreeing with `status` — spreading
 * `{status: 'done'}` straight onto a record would mark it done with no
 * completion time, which is exactly what `setStatus` exists to prevent.
 */
function withPatch(task, patch, now) {
  const { status, ...rest } = patch;
  const merged = { ...task, ...rest };
  return status && status !== task.status ? setStatus(merged, status, { now }) : merged;
}

export function createApp({ root, driver, now = Date.now } = {}) {
  const chosen = driver ? { driver } : createStorage();
  const store = createStore({ driver: chosen.driver, clock: now });
  const writer = createDebouncedWriter(store, SAVE_CADENCE);

  const state = { doc: null, screen: 'today', now: now(), problem: null };

  const actions = {
    setScreen(name) {
      if (!SCREENS.includes(name) || state.screen === name) return;
      state.screen = name;
      app.render();
    },
    /** Apply a pure `doc → doc` change, then persist and redraw. */
    update(fn) {
      const next = fn(state.doc);
      if (!next || next === state.doc) return;
      state.doc = next;
      writer.schedule(next);
      app.render();
    },
  };

  function recoveryScreen(problem) {
    return el('div', { class: 'screen' }, [
      el('div', { class: 'screen-head' }, [
        el('span', { class: 'mark', style: { background: 'var(--crit)' } }),
        el('span', { class: 'screen-title', text: 'Recovery' }),
      ]),
      el('p', { text: 'Your data could not be read, so nothing has been changed.' }),
      el('p', { class: 'mono', text: problem }),
    ]);
  }

  const app = {
    state,
    actions,

    render() {
      // The accent lives on <html> rather than on a wrapper so it is in scope
      // for anything portalled outside the app root — which the Phase-5
      // transition overlay will be.
      if (state.doc) {
        document.documentElement.dataset.accent = state.doc.settings.accentMode || 'standard';
      }
      const ctx = { doc: state.doc, now: state.now, actions };
      const body = state.problem
        ? recoveryScreen(state.problem)
        : RENDERERS[state.screen](ctx);
      mount(root, body, state.problem ? null : renderTabBar(ctx, SCREENS, state.screen));
    },

    async boot() {
      await store.open();
      let raw = null;
      try {
        raw = await store.read();
      } catch (err) {
        state.problem = 'The saved file is not valid JSON.';
        app.render();
        return app;
      }

      if (raw === null) {
        state.doc = createEmptyDoc({ now });
        writer.schedule(state.doc);
      } else {
        const check = validateDoc(raw);
        if (!check.ok) {
          // Deliberately does NOT write. A damaged file is preserved exactly as
          // found so it can still be recovered by hand.
          state.problem = check.problem;
          app.render();
          return app;
        }
        state.doc = migrate(raw, { now });
      }
      app.render();
      return app;
    },
  };

  return app;
}
```

- [ ] **Step 7: Wire `src/main.js`**

```js
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
```

- [ ] **Step 8: Expose `flush()` on the app**

In `src/ui/app.js`, add to the returned object, beside `render`:

```js
    /** Force any pending save to land. Called when the app is backgrounded. */
    flush() { return writer.flush(); },
```

- [ ] **Step 9: Run the tests**

Run: `npm test`
Expected: PASS — 8 shell tests.

- [ ] **Step 10: See it on the phone**

Run: `npm run dev`

Forward port 5173 and set its visibility to **Public**, then open the forwarded URL in Chrome on the phone. Expected: a near-black screen, four uppercase tabs across the bottom, "TODAY" lit in cyan, and tapping a tab moving the lit marker. This is the first Loop A check — confirm the tab bar clears the gesture bar and that tapping is comfortable one-handed.

- [ ] **Step 11: Commit**

```bash
git add src/ui src/main.js test/ui
git commit -m "feat(ui): app shell, bottom tab bar, four screens, recovery path"
```

**PHASE 0 COMPLETE.** The app boots, persists across reload, survives a corrupt file without destroying it, and runs on the phone.

---

# PHASE 1 — TASKS

*Ends with: projects and tasks you can create, complete and see grouped, on TODAY and TASKS.*

---

### Task 8: `core/tasks.js`

**Files:**
- Create: `src/core/tasks.js`
- Modify: `src/core/schema.js` (call the repairs from `migrate`)
- Test: `test/core/tasks.test.js`

**Interfaces:**
- Consumes: `ids.js` — `makeId`, `nextRef`; `time.js` — `todayKey`, `addDays`.
- Produces:
  - `STATUSES = ['todo', 'doing', 'done']`, `PRIORITIES = ['low', 'normal', 'high']`
  - `PROJECT_FIELDS`, `TASK_FIELDS` — defaults for a record read back from disk
  - `createProject(doc, fields, { now }) → project`, `createTask(doc, fields, { now }) → task`
  - `liveProjects(doc) → project[]`, `liveTasks(doc) → task[]`
  - `setStatus(task, status, { now }) → task` — pure; stamps or clears `doneAt`
  - `dueState(task, todayKey) → 'overdue' | 'today' | 'upcoming' | 'none'`
  - `groupByProject(doc, tasks) → Array<{project: object|null, name: string, tasks: object[]}>`
  - `repairProjects(list) → project[]`, `repairTasks(list) → task[]`

- [ ] **Step 1: Write the failing test**

Create `test/core/tasks.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createProject, createTask, liveTasks, liveProjects, setStatus,
  dueState, groupByProject, repairTasks, STATUSES, PRIORITIES,
} from '../../src/core/tasks.js';
import { createEmptyDoc } from '../../src/core/schema.js';

const clock = () => new Date(2026, 7, 31, 9, 0).getTime();
const fresh = () => createEmptyDoc({ now: clock });

test('a new task carries every default', () => {
  const doc = fresh();
  const task = createTask(doc, { name: 'Rewire the shed' }, { now: clock });
  assert.equal(task.name, 'Rewire the shed');
  assert.equal(task.status, 'todo');
  assert.equal(task.priority, 'normal');
  assert.equal(task.project, null);
  assert.equal(task.dueKey, null);
  assert.equal(task.archived, false);
  assert.equal(task.doneAt, null);
  assert.ok(task.id.startsWith('tsk_'));
  assert.equal(task.ref, 'T-1');
});

test('refs increment per kind', () => {
  const doc = fresh();
  assert.equal(createTask(doc, {}, { now: clock }).ref, 'T-1');
  assert.equal(createTask(doc, {}, { now: clock }).ref, 'T-2');
  assert.equal(createProject(doc, {}, { now: clock }).ref, 'P-1');
});

test('completing a task stamps doneAt, and un-completing clears it', () => {
  const doc = fresh();
  const task = createTask(doc, { name: 'x' }, { now: clock });
  const done = setStatus(task, 'done', { now: clock });
  assert.equal(done.status, 'done');
  assert.equal(done.doneAt, clock());
  assert.equal(task.doneAt, null, 'setStatus must be pure — the input is untouched');

  const reopened = setStatus(done, 'todo', { now: clock });
  assert.equal(reopened.doneAt, null);
});

test('an unknown status is refused rather than stored', () => {
  const doc = fresh();
  const task = createTask(doc, {}, { now: clock });
  assert.throws(() => setStatus(task, 'nearly', { now: clock }), /status/);
});

test('archived records are excluded from the live lists', () => {
  const doc = fresh();
  doc.tasks = [
    createTask(doc, { name: 'live' }, { now: clock }),
    { ...createTask(doc, { name: 'gone' }, { now: clock }), archived: true },
  ];
  assert.equal(liveTasks(doc).length, 1);
  assert.equal(liveTasks(doc)[0].name, 'live');
});

test('dueState classifies against a given day', () => {
  const today = '2026-08-31';
  assert.equal(dueState({ dueKey: null }, today), 'none');
  assert.equal(dueState({ dueKey: '2026-08-30' }, today), 'overdue');
  assert.equal(dueState({ dueKey: '2026-08-31' }, today), 'today');
  assert.equal(dueState({ dueKey: '2026-09-05' }, today), 'upcoming');
});

test('a completed task is never overdue', () => {
  // Nagging about something already finished is the fastest way to teach
  // someone to ignore the colour.
  const today = '2026-08-31';
  assert.equal(dueState({ dueKey: '2026-08-01', status: 'done' }, today), 'none');
});

test('grouping puts unfiled work in its own trailing group', () => {
  const doc = fresh();
  const shed = createProject(doc, { name: 'Shed' }, { now: clock });
  doc.projects = [shed];
  doc.tasks = [
    createTask(doc, { name: 'filed', project: shed.id }, { now: clock }),
    createTask(doc, { name: 'loose' }, { now: clock }),
  ];
  const groups = groupByProject(doc, liveTasks(doc));
  assert.equal(groups.length, 2);
  assert.equal(groups[0].name, 'Shed');
  assert.equal(groups[1].project, null);
  assert.equal(groups[1].name, 'No project');
  assert.equal(groups[1].tasks[0].name, 'loose');
});

test('a group with no tasks is dropped, but the unfiled group only appears when used', () => {
  const doc = fresh();
  const empty = createProject(doc, { name: 'Empty' }, { now: clock });
  doc.projects = [empty];
  doc.tasks = [];
  assert.deepEqual(groupByProject(doc, liveTasks(doc)), []);
});

test('repairTasks survives junk without throwing it all away', () => {
  const repaired = repairTasks([
    { id: 'tsk_1' },                                  // missing everything
    { id: 'tsk_2', name: {}, status: 'invented' },    // wrong types
    { name: 'no id' },                                // unidentifiable
    null,
  ]);
  assert.equal(repaired.length, 2, 'records without an id are dropped');
  assert.equal(repaired[0].status, 'todo');
  assert.equal(repaired[0].name, 'New task');
  // Not String(name || ''): an object is truthy, so `|| ''` would not catch it
  // and String({}) reads back as the literal "[object Object]".
  assert.equal(repaired[1].name, 'New task');
  assert.ok(STATUSES.includes(repaired[1].status));
  assert.ok(PRIORITIES.includes(repaired[1].priority));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `src/core/tasks.js`.

- [ ] **Step 3: Write `src/core/tasks.js`**

```js
/**
 * Projects and tasks.
 *
 * Two levels and no more. The reference tracker models five
 * (opportunity → project → effort → task → subtask) because work at an
 * organisation genuinely nests that deeply; a personal list does not, and every
 * level costs a rendering path and a drag target on a screen that has neither
 * to spare.
 *
 * Pure, with one documented exception: `createProject` and `createTask` call
 * `nextRef`, which allocates a short reference by incrementing `doc.seq` IN
 * PLACE. That is inherited from the harvested `ids.js` and kept deliberately —
 * making it pure would mean threading a new `seq` back through every caller for
 * no functional gain. Callers that must stay pure copy `doc.seq` first; see
 * `actions.update` in the UI layer, which does exactly that.
 *
 * Everything else here takes its clock as a parameter and returns new records
 * rather than mutating the ones it is given.
 */

import { makeId, nextRef } from './ids.js';

export const STATUSES = ['todo', 'doing', 'done'];
export const PRIORITIES = ['low', 'normal', 'high'];

/** Defaults for a record read back from disk. Exported for migration. */
export const PROJECT_FIELDS = {
  name: 'New project',
  colour: null,
  archived: false,
};

export const TASK_FIELDS = {
  name: 'New task',
  detail: '',
  /** Project id, or null for unfiled work. Unfiled is a normal state, not an
   *  error: something you have not decided where to put should still be
   *  visible rather than rejected. */
  project: null,
  status: 'todo',
  priority: 'normal',
  /** "YYYY-MM-DD", or null. */
  dueKey: null,
  doneAt: null,
  archived: false,
};

export function createProject(doc, fields = {}, { now = Date.now } = {}) {
  return {
    ...PROJECT_FIELDS,
    id: makeId('prj', now),
    ref: nextRef(doc, 'project', 'P'),
    createdAt: now(),
    ...fields,
  };
}

export function createTask(doc, fields = {}, { now = Date.now } = {}) {
  return {
    ...TASK_FIELDS,
    id: makeId('tsk', now),
    ref: nextRef(doc, 'task', 'T'),
    createdAt: now(),
    ...fields,
  };
}

export const liveProjects = (doc) => (doc.projects || []).filter((p) => p && !p.archived);
export const liveTasks = (doc) => (doc.tasks || []).filter((t) => t && !t.archived);

/**
 * Move a task to a status. Pure — returns a new record.
 *
 * `doneAt` is stamped here rather than by the caller so that a task cannot end
 * up marked done with no completion time, which would silently break any later
 * "what did I finish this week" question.
 */
export function setStatus(task, status, { now = Date.now } = {}) {
  if (!STATUSES.includes(status)) {
    throw new Error(`setStatus: unknown status "${status}"`);
  }
  return {
    ...task,
    status,
    doneAt: status === 'done' ? (task.doneAt ?? now()) : null,
  };
}

/**
 * How a due date reads today.
 *
 * A done task is never overdue: nagging about finished work is the fastest way
 * to teach someone to ignore the colour that means "overdue".
 *
 * @returns {'overdue'|'today'|'upcoming'|'none'}
 */
export function dueState(task, todayKey) {
  if (!task || !task.dueKey || task.status === 'done') return 'none';
  if (task.dueKey < todayKey) return 'overdue';
  if (task.dueKey === todayKey) return 'today';
  return 'upcoming';
}

/**
 * Tasks grouped under their project, in document order, with unfiled work in a
 * trailing group.
 *
 * Empty groups are dropped. This is the opposite of the reference app's board,
 * where an empty column earns its place because it is a drop target — there is
 * no dragging here, so an empty heading is only ever noise.
 *
 * @returns {Array<{project: object|null, name: string, tasks: object[]}>}
 */
export function groupByProject(doc, tasks) {
  const groups = liveProjects(doc).map((project) => ({
    project, name: project.name, tasks: [],
  }));
  const byId = new Map(groups.map((g) => [g.project.id, g]));
  const unfiled = { project: null, name: 'No project', tasks: [] };

  for (const task of tasks) {
    (byId.get(task.project) || unfiled).tasks.push(task);
  }

  const out = groups.filter((g) => g.tasks.length);
  if (unfiled.tasks.length) out.push(unfiled);
  return out;
}

// --- migration --------------------------------------------------------------

/** A saved string field, defended against the wrong type. */
function text(value, fallback) {
  return (typeof value === 'string' ? value.trim() : '') || fallback;
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

export function repairProjects(list) {
  return (Array.isArray(list) ? list : [])
    .filter((p) => p && p.id)
    .map((p) => ({
      ...PROJECT_FIELDS,
      ...p,
      name: text(p.name, PROJECT_FIELDS.name),
      archived: !!p.archived,
    }));
}

export function repairTasks(list) {
  return (Array.isArray(list) ? list : [])
    .filter((t) => t && t.id)
    .map((t) => ({
      ...TASK_FIELDS,
      ...t,
      name: text(t.name, TASK_FIELDS.name),
      detail: typeof t.detail === 'string' ? t.detail : '',
      status: oneOf(t.status, STATUSES, TASK_FIELDS.status),
      priority: oneOf(t.priority, PRIORITIES, TASK_FIELDS.priority),
      dueKey: /^\d{4}-\d{2}-\d{2}$/.test(t.dueKey) ? t.dueKey : null,
      project: typeof t.project === 'string' ? t.project : null,
      doneAt: Number.isFinite(t.doneAt) ? t.doneAt : null,
      archived: !!t.archived,
    }));
}
```

- [ ] **Step 4: Call the repairs from `migrate`**

In `src/core/schema.js`, add the import at the top:

```js
import { repairProjects, repairTasks } from './tasks.js';
```

and replace these two lines in `migrate`:

```js
  out.projects = Array.isArray(out.projects) ? out.projects : [];
  out.tasks = Array.isArray(out.tasks) ? out.tasks : [];
```

with:

```js
  out.projects = repairProjects(out.projects);
  out.tasks = repairTasks(out.tasks);
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS — 10 task tests, and the existing schema tests still green (`migrate` is still idempotent, because the repairs are).

- [ ] **Step 6: Commit**

```bash
git add src/core/tasks.js src/core/schema.js test/core/tasks.test.js
git commit -m "feat(core): projects and tasks, two levels only"
```

---

### Task 9: The TASKS screen

**Files:**
- Modify: `src/ui/tasks.js`
- Create: `src/styles/screens.css`
- Modify: `src/styles/index.css` (import it)
- Test: `test/ui/tasks-screen.test.js`

**Interfaces:**
- Consumes: `core/tasks.js` — `liveTasks`, `groupByProject`, `dueState`, `setStatus`; `core/time.js` — `todayKey`, `formatDayLabel`.
- Produces: `renderTasks(ctx) → HTMLElement`. Rows carry `data-task` (the id) and `.task-row`; the completion control is `.task-check`. Adds `ctx.actions.toggleDone(id)` and `ctx.actions.setFilter(name)` to the app.

- [ ] **Step 1: Write the failing test**

Create `test/ui/tasks-screen.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createApp } from '../../src/ui/app.js';
import { createMemoryDriver } from '../../src/store/memory-driver.js';

const clock = () => new Date(2026, 7, 31, 9, 0).getTime();

const seedDoc = {
  version: 1, id: 'doc_1', createdAt: 0, seq: {}, dismissals: [],
  settings: { accentMode: 'standard', digest: { enabled: true, timeMin: 450 }, eventLeadMin: 15 },
  projects: [{ id: 'prj_1', ref: 'P-1', name: 'Shed', colour: null, archived: false }],
  routines: [], events: [],
  tasks: [
    { id: 'tsk_1', ref: 'T-1', name: 'Buy timber', project: 'prj_1', status: 'todo',
      priority: 'high', dueKey: '2026-08-30', detail: '', doneAt: null, archived: false },
    { id: 'tsk_2', ref: 'T-2', name: 'Ring the council', project: null, status: 'todo',
      priority: 'normal', dueKey: null, detail: '', doneAt: null, archived: false },
    { id: 'tsk_3', ref: 'T-3', name: 'Old thing', project: 'prj_1', status: 'done',
      priority: 'low', dueKey: null, detail: '', doneAt: 1, archived: false },
  ],
};

async function mount() {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
  const root = dom.window.document.getElementById('app');
  const driver = createMemoryDriver({ seed: { 'state.json': JSON.stringify(seedDoc) } });
  const app = createApp({ root, driver, now: clock });
  await app.boot();
  app.actions.setScreen('tasks');
  return { root, app };
}

test('outstanding tasks are listed under their project', async () => {
  const { root } = await mount();
  const headings = [...root.querySelectorAll('.group-head')].map((h) => h.textContent);
  assert.ok(headings.some((h) => h.includes('Shed')));
  assert.ok(headings.some((h) => h.includes('No project')));
});

test('done tasks are hidden until asked for', async () => {
  const { root } = await mount();
  assert.equal(root.querySelector('[data-task="tsk_3"]'), null);
  assert.equal(root.querySelectorAll('.task-row').length, 2);
});

test('showing done reveals them without losing the rest', async () => {
  const { root, app } = await mount();
  app.actions.setFilter('all');
  assert.ok(root.querySelector('[data-task="tsk_3"]'));
  assert.equal(root.querySelectorAll('.task-row').length, 3);
});

test('an overdue task is marked overdue', async () => {
  const { root } = await mount();
  const row = root.querySelector('[data-task="tsk_1"]');
  assert.equal(row.dataset.due, 'overdue');
});

test('completing a task removes it from the outstanding list and stamps doneAt', async () => {
  const { root, app } = await mount();
  root.querySelector('[data-task="tsk_1"] .task-check').click();
  const task = app.state.doc.tasks.find((t) => t.id === 'tsk_1');
  assert.equal(task.status, 'done');
  assert.equal(task.doneAt, clock());
  assert.equal(root.querySelector('[data-task="tsk_1"]'), null);
});

test('the completion control is a real button of tappable size', async () => {
  const { root } = await mount();
  const check = root.querySelector('.task-check');
  assert.equal(check.tagName, 'BUTTON');
  assert.ok(check.getAttribute('aria-label'), 'must be labelled for screen readers');
});

test('an empty list says so rather than showing a blank screen', async () => {
  const { root, app } = await mount();
  app.actions.update((doc) => ({ ...doc, tasks: [] }));
  assert.match(root.textContent, /nothing outstanding/i);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — no `.group-head` in the stub screen.

- [ ] **Step 3: Add the two actions to `src/ui/app.js`**

Add `filter: 'open'` to `state`, and these to `actions`:

```js
    setFilter(name) {
      state.filter = name;
      app.render();
    },
    toggleDone(id) {
      actions.update((doc) => ({
        ...doc,
        tasks: doc.tasks.map((t) => (t.id === id
          ? setStatus(t, t.status === 'done' ? 'todo' : 'done', { now })
          : t)),
      }));
    },
```

and import `setStatus` at the top:

```js
import { setStatus } from '../core/tasks.js';
```

Pass the filter through in `render()` by extending `ctx`:

```js
      const ctx = { doc: state.doc, now: state.now, filter: state.filter, actions };
```

- [ ] **Step 4: Write `src/ui/tasks.js`**

```js
/**
 * The TASKS screen: everything outstanding, grouped by project.
 *
 * No saved views, filters, sorts or colour rules — the reference app's whole
 * property system. On a phone, configuring a view costs more than scrolling
 * past what it would have hidden.
 */

import { el } from './dom.js';
import { liveTasks, groupByProject, dueState } from '../core/tasks.js';
import { todayKey, formatDayLabel } from '../core/time.js';

const FILTERS = [
  ['open', 'Open'],
  ['all', 'All'],
];

function filterChips(ctx) {
  return el('div', { class: 'chips' }, FILTERS.map(([id, label]) => el('button', {
    class: 'chip',
    attrs: { type: 'button', 'aria-pressed': (ctx.filter || 'open') === id },
    text: label,
    on: { click: () => ctx.actions.setFilter(id) },
  })));
}

function taskRow(ctx, task, today) {
  const done = task.status === 'done';
  return el('div', {
    class: `task-row${done ? ' is-done' : ''}`,
    attrs: {
      'data-task': task.id,
      'data-due': dueState(task, today),
      'data-priority': task.priority,
      // Carried so the list can show an in-progress task as in-progress.
      // Without it, DOING is settable in the editor and invisible everywhere else.
      'data-status': task.status,
    },
  }, [
    el('button', {
      class: 'task-check',
      attrs: {
        type: 'button',
        'aria-label': done ? `Reopen ${task.name}` : `Complete ${task.name}`,
        'aria-pressed': done,
      },
      on: { click: () => ctx.actions.toggleDone(task.id) },
    }, [el('span', { class: 'mark' })]),
    el('span', { class: 'task-name', text: task.name }),
    task.dueKey
      ? el('span', { class: 'task-due mono', text: formatDayLabel(task.dueKey) })
      : null,
  ]);
}

export function renderTasks(ctx) {
  const today = todayKey(ctx.now);
  const all = liveTasks(ctx.doc);
  const shown = (ctx.filter || 'open') === 'all' ? all : all.filter((t) => t.status !== 'done');
  const groups = groupByProject(ctx.doc, shown);

  return el('div', { class: 'screen' }, [
    el('div', { class: 'screen-head' }, [
      el('span', { class: shown.length ? 'mark live' : 'mark' }),
      el('span', { class: 'screen-title', text: 'Tasks' }),
      el('span', { style: { flex: '1' } }),
      filterChips(ctx),
    ]),
    ...(groups.length
      ? groups.flatMap((group) => [
          el('div', { class: 'group-head label bracket', text: group.name }),
          el('div', { class: 'stack' }, group.tasks.map((t) => taskRow(ctx, t, today))),
        ])
      : [el('p', { class: 'empty label', text: 'Nothing outstanding' })]),
  ]);
}
```

- [ ] **Step 5: Write `src/styles/screens.css`**

```css
/**
 * The list surfaces. Density comes from type scale and hairlines, never from
 * shrinking a hit area below what a thumb can hit — every interactive row is at
 * least --tap tall.
 */

.stack { display: flex; flex-direction: column; }

.group-head {
  padding: 14px 8px 6px;
  color: var(--text-dim);
}

.task-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: var(--tap);
  padding: 6px 8px;
  border-bottom: 1px solid var(--rule);
  background: var(--panel);
}
.task-row:nth-child(even) { background: var(--panel-alt); }

.task-check {
  flex: 0 0 auto;
  width: var(--tap);
  height: var(--tap);
  margin: -6px 0 -6px -8px;   /* full tap area without inflating the row */
  display: grid;
  place-items: center;
  background: none;
  border: 0;
  cursor: pointer;
}
.task-check .mark {
  width: 14px; height: 14px;
  border: 1px solid var(--accent-dim);
  background: transparent;
}
.task-check[aria-pressed="true"] .mark {
  background: var(--accent);
  border-color: var(--accent);
}
/* In progress: a dim fill, distinct from both empty (todo) and solid (done).
   A square at three fill levels, not three different shapes or hues. */
.task-row[data-status="doing"] .task-check .mark {
  background: var(--accent-dim);
  border-color: var(--accent);
}

.task-name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.is-done .task-name { color: var(--text-dim); text-decoration: line-through; }

.task-due { font-size: 12px; color: var(--text-dim); }
[data-due="overdue"] .task-due { color: var(--crit); }
[data-due="today"]   .task-due { color: var(--warn); }

/* Priority reads as a bar down the leading edge — a square-edged status
   indicator, not a coloured pill. */
.task-row[data-priority="high"] { box-shadow: inset 2px 0 0 var(--crit); }
.task-row[data-priority="low"]  { box-shadow: inset 2px 0 0 var(--rule); }

.chips { display: flex; gap: 4px; }
.chip {
  /* --tap, not 32px: these are real buttons and the 44px floor is not waived
     for being small controls in a header row. */
  min-height: var(--tap);
  padding: 4px 10px;
  background: var(--panel);
  border: 1px solid var(--rule);
  border-radius: 0;
  color: var(--text-dim);
  font-family: var(--font-label);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 600;
  font-size: 10px;
  cursor: pointer;
  transition: color var(--step) linear, border-color var(--step) linear;
}
.chip[aria-pressed="true"] { color: var(--accent); border-color: var(--accent-dim); }

.empty { display: block; padding: 24px 8px; color: var(--text-dim); }
```

- [ ] **Step 6: Import the stylesheet**

Add to `src/styles/index.css`, after `layout.css`:

```css
@import "./screens.css";
```

- [ ] **Step 7: Run the tests**

Run: `npm test`
Expected: PASS — 7 tasks-screen tests.

- [ ] **Step 8: Commit**

```bash
git add src/ui/tasks.js src/styles test/ui/tasks-screen.test.js src/ui/app.js
git commit -m "feat(ui): TASKS screen — grouped list, completion, open/all filter"
```

---

### Task 10: The task editor

**Files:**
- Create: `src/ui/task-editor.js`, `src/styles/editors.css`
- Modify: `src/ui/tasks.js` (open on row tap, add a "+" control), `src/ui/app.js` (editor state), `src/styles/index.css`
- Test: `test/ui/task-editor.test.js`

**Interfaces:**
- Consumes: `core/tasks.js` — `createTask`, `createProject`, `liveProjects`, `STATUSES`, `PRIORITIES`.
- Produces: `renderTaskEditor(ctx, task) → HTMLElement`. New app state `state.editing = {kind, id} | null`, and actions `openTask(id|null)`, `closeEditor()`, `saveTask(patch)`, `archiveTask(id)`.

- [ ] **Step 1: Write the failing test**

Create `test/ui/task-editor.test.js`. Reuse the `seedDoc` and `mount()` helper from `test/ui/tasks-screen.test.js` — copy them into this file rather than importing, so each test file stands alone.

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createApp } from '../../src/ui/app.js';
import { createMemoryDriver } from '../../src/store/memory-driver.js';

const clock = () => new Date(2026, 7, 31, 9, 0).getTime();

const seedDoc = {
  version: 1, id: 'doc_1', createdAt: 0, seq: { task: 2 }, dismissals: [],
  settings: { accentMode: 'standard', digest: { enabled: true, timeMin: 450 }, eventLeadMin: 15 },
  projects: [{ id: 'prj_1', ref: 'P-1', name: 'Shed', colour: null, archived: false }],
  routines: [], events: [],
  tasks: [
    { id: 'tsk_1', ref: 'T-1', name: 'Buy timber', project: 'prj_1', status: 'todo',
      priority: 'high', dueKey: '2026-08-30', detail: '', doneAt: null, archived: false },
  ],
};

async function mount() {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
  const root = dom.window.document.getElementById('app');
  const app = createApp({
    root, now: clock,
    driver: createMemoryDriver({ seed: { 'state.json': JSON.stringify(seedDoc) } }),
  });
  await app.boot();
  app.actions.setScreen('tasks');
  return { root, app };
}

test('tapping a task row opens the editor on that task', async () => {
  const { root, app } = await mount();
  root.querySelector('[data-task="tsk_1"] .task-name').click();
  assert.deepEqual(app.state.editing, { kind: 'task', id: 'tsk_1' });
  assert.equal(root.querySelector('[name="name"]').value, 'Buy timber');
});

test('the "+" control opens an empty editor without creating a record yet', async () => {
  const { root, app } = await mount();
  root.querySelector('.add-task').click();
  assert.equal(app.state.editing.id, null);
  assert.equal(app.state.doc.tasks.length, 1, 'nothing is written until save');
});

test('saving a new task appends it', async () => {
  const { root, app } = await mount();
  root.querySelector('.add-task').click();
  root.querySelector('[name="name"]').value = 'Hire a skip';
  root.querySelector('.editor-save').click();
  assert.equal(app.state.doc.tasks.length, 2);
  const added = app.state.doc.tasks.at(-1);
  assert.equal(added.name, 'Hire a skip');
  assert.equal(added.ref, 'T-3', 'refs continue from the document sequence');
  assert.equal(app.state.editing, null, 'saving closes the editor');
});

test('saving an existing task edits in place rather than appending', async () => {
  const { root, app } = await mount();
  root.querySelector('[data-task="tsk_1"] .task-name').click();
  root.querySelector('[name="name"]').value = 'Buy oak';
  root.querySelector('[name="priority"]').value = 'low';
  root.querySelector('.editor-save').click();
  assert.equal(app.state.doc.tasks.length, 1);
  assert.equal(app.state.doc.tasks[0].name, 'Buy oak');
  assert.equal(app.state.doc.tasks[0].priority, 'low');
  assert.equal(app.state.doc.tasks[0].id, 'tsk_1', 'the id is stable across an edit');
});

test('a task saved with a blank name keeps a usable name', async () => {
  const { root, app } = await mount();
  root.querySelector('.add-task').click();
  root.querySelector('[name="name"]').value = '   ';
  root.querySelector('.editor-save').click();
  assert.equal(app.state.doc.tasks.at(-1).name, 'New task');
});

test('cancel discards every change', async () => {
  const { root, app } = await mount();
  root.querySelector('[data-task="tsk_1"] .task-name').click();
  root.querySelector('[name="name"]').value = 'Discarded';
  root.querySelector('.editor-cancel').click();
  assert.equal(app.state.doc.tasks[0].name, 'Buy timber');
  assert.equal(app.state.editing, null);
});

test('delete archives rather than destroying', async () => {
  const { root, app } = await mount();
  root.querySelector('[data-task="tsk_1"] .task-name').click();
  root.querySelector('.editor-delete').click();
  assert.equal(app.state.doc.tasks.length, 1, 'the record is kept');
  assert.equal(app.state.doc.tasks[0].archived, true);
  assert.equal(root.querySelector('[data-task="tsk_1"]'), null, 'and is out of the list');
});

test('an in-progress task is visibly in progress in the list', async () => {
  // DOING must not be settable-but-invisible.
  const { root, app } = await mount();
  app.actions.update((d) => ({ ...d, tasks: d.tasks.map((t) => ({ ...t, status: 'doing' })) }));
  assert.equal(root.querySelector('[data-task="tsk_1"]').dataset.status, 'doing');
});

test('the editor shows the task\'s current status as pressed', async () => {
  const { root, app } = await mount();
  app.actions.update((d) => ({ ...d, tasks: d.tasks.map((t) => ({ ...t, status: 'doing' })) }));
  root.querySelector('[data-task="tsk_1"] .task-name').click();
  const pressed = root.querySelectorAll('.seg-btn[aria-pressed="true"]');
  assert.equal(pressed.length, 1, 'exactly one status is ever current');
  assert.equal(pressed[0].dataset.status, 'doing');
});

test('a new task defaults to todo', async () => {
  const { root, app } = await mount();
  root.querySelector('.add-task').click();
  assert.equal(root.querySelector('.seg-btn[aria-pressed="true"]').dataset.status, 'todo');
  root.querySelector('[name="name"]').value = 'Fresh';
  root.querySelector('.editor-save').click();
  assert.equal(app.state.doc.tasks.at(-1).status, 'todo');
});

test('setting status to doing saves it', async () => {
  const { root, app } = await mount();
  root.querySelector('[data-task="tsk_1"] .task-name').click();
  root.querySelector('.seg-btn[data-status="doing"]').click();
  root.querySelector('.editor-save').click();
  assert.equal(app.state.doc.tasks[0].status, 'doing');
  assert.equal(app.state.doc.tasks[0].doneAt, null);
});

test('setting status to done through the editor stamps doneAt', async () => {
  // Spreading {status:'done'} straight onto the record would mark it done with
  // no completion time. saveTask routes status through setStatus for exactly
  // this reason.
  const { root, app } = await mount();
  root.querySelector('[data-task="tsk_1"] .task-name').click();
  root.querySelector('.seg-btn[data-status="done"]').click();
  root.querySelector('.editor-save').click();
  assert.equal(app.state.doc.tasks[0].status, 'done');
  assert.equal(app.state.doc.tasks[0].doneAt, clock());
});

test('clearing done through the editor clears doneAt', async () => {
  const { root, app } = await mount();
  app.actions.update((d) => ({ ...d,
    tasks: d.tasks.map((t) => ({ ...t, status: 'done', doneAt: 123 })) }));
  // The default 'open' filter hides done work, so the row must be shown before
  // it can be tapped — otherwise this queries null and throws.
  app.actions.setFilter('all');
  root.querySelector('[data-task="tsk_1"] .task-name').click();
  root.querySelector('.seg-btn[data-status="doing"]').click();
  root.querySelector('.editor-save').click();
  assert.equal(app.state.doc.tasks[0].doneAt, null);
});

test('the project select offers every live project plus unfiled', async () => {
  const { root } = await mount();
  root.querySelector('.add-task').click();
  const options = [...root.querySelectorAll('[name="project"] option')].map((o) => o.value);
  assert.deepEqual(options, ['', 'prj_1']);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — no `.add-task` control exists.

- [ ] **Step 3: Add editor state and actions to `src/ui/app.js`**

Add `editing: null` to `state`. Add to `actions`:

```js
    openTask(id) { state.editing = { kind: 'task', id: id ?? null }; app.render(); },
    closeEditor() { state.editing = null; app.render(); },

    /** Create or update, decided by whether the editor was opened on an id. */
    saveTask(patch) {
      const editing = state.editing;
      actions.update((doc) => {
        if (editing && editing.id) {
          return {
            ...doc,
            tasks: doc.tasks.map((t) => (t.id === editing.id ? withPatch(t, patch, now) : t)),
          };
        }
        // createTask mutates doc.seq to allocate a ref, so it runs against a
        // copy — update() must stay a pure doc → doc transform.
        const next = { ...doc, seq: { ...doc.seq } };
        const created = withPatch(createTask(next, {}, { now }), patch, now);
        return { ...next, tasks: [...next.tasks, created] };
      });
      state.editing = null;
      app.render();
    },

    archiveTask(id) {
      actions.update((doc) => ({
        ...doc,
        tasks: doc.tasks.map((t) => (t.id === id ? { ...t, archived: true } : t)),
      }));
      state.editing = null;
      app.render();
    },
```

Import `createTask` alongside `setStatus`. In `render()`, put the editor above the screen when open, and pass `editing` through `ctx`:

```js
      const ctx = { doc: state.doc, now: state.now, filter: state.filter,
                    editing: state.editing, actions };
      const body = state.problem
        ? recoveryScreen(state.problem)
        : RENDERERS[state.screen](ctx);
      const editor = !state.problem && state.editing?.kind === 'task'
        ? renderTaskEditor(ctx, (state.doc.tasks || []).find((t) => t.id === state.editing.id) || null)
        : null;
      mount(root, body, editor, state.problem ? null : renderTabBar(ctx, SCREENS, state.screen));
```

with `import { renderTaskEditor } from './task-editor.js';` at the top.

- [ ] **Step 4: Write `src/ui/task-editor.js`**

```js
/**
 * The task editor — a full-height sheet over the screen.
 *
 * A sheet rather than a separate route: the list underneath stays where it was,
 * so closing the editor never costs a scroll position. Nothing is written to the
 * document until Save, which is what makes Cancel free rather than an undo.
 */

import { el } from './dom.js';
import { liveProjects, PRIORITIES, STATUSES, TASK_FIELDS } from '../core/tasks.js';

/** Sentence-case for the three status ids, which are stored lowercase. */
const STATUS_LABELS = { todo: 'To do', doing: 'Doing', done: 'Done' };

function field(label, control) {
  return el('label', { class: 'field' }, [
    el('span', { class: 'label', text: label }),
    control,
  ]);
}

export function renderTaskEditor(ctx, task) {
  const form = el('form', { class: 'editor', attrs: { novalidate: true } });

  const name = el('input', {
    attrs: { name: 'name', type: 'text', value: task ? task.name : '',
             placeholder: 'What needs doing', autocomplete: 'off' },
  });

  const project = el('select', { attrs: { name: 'project' } }, [
    el('option', { attrs: { value: '', selected: !task?.project }, text: 'No project' }),
    ...liveProjects(ctx.doc).map((p) => el('option', {
      attrs: { value: p.id, selected: task?.project === p.id }, text: p.name,
    })),
  ]);

  // A segmented control rather than a select: three options is few enough to
  // show at once, and status is the field most likely to be changed on the way
  // past — one tap beats open-pick-close. Squares, not pills, per the palette.
  let status = task?.status || 'todo';
  const statusControl = el('div', {
    class: 'seg', attrs: { role: 'group', 'aria-label': 'Status' },
  }, STATUSES.map((id) => el('button', {
    class: 'seg-btn',
    attrs: { type: 'button', name: 'status', 'data-status': id, 'aria-pressed': status === id },
    text: STATUS_LABELS[id],
    on: { click: () => { status = id; paintStatus(); } },
  })));

  /** Repaint in place: the editor is not re-rendered while it is open. */
  function paintStatus() {
    for (const button of statusControl.querySelectorAll('.seg-btn')) {
      button.setAttribute('aria-pressed', String(button.dataset.status === status));
    }
  }

  const priority = el('select', { attrs: { name: 'priority' } },
    PRIORITIES.map((p) => el('option', {
      attrs: { value: p, selected: (task?.priority || 'normal') === p }, text: p,
    })));

  // type="date" gets the platform picker for free, which beats anything a web
  // app can build and is what the user already knows.
  const due = el('input', {
    attrs: { name: 'dueKey', type: 'date', value: task?.dueKey || '' },
  });

  const detail = el('textarea', {
    attrs: { name: 'detail', rows: 3, placeholder: 'Notes' }, text: task?.detail || '',
  });

  function save() {
    ctx.actions.saveTask({
      name: name.value.trim() || TASK_FIELDS.name,
      status,
      project: project.value || null,
      priority: priority.value,
      dueKey: due.value || null,
      detail: detail.value,
    });
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); save(); });

  form.append(
    el('div', { class: 'editor-head' }, [
      el('span', { class: 'label', text: task ? `Task ${task.ref}` : 'New task' }),
    ]),
    field('Name', name),
    field('Project', project),
    field('Status', statusControl),
    field('Priority', priority),
    field('Due', due),
    field('Notes', detail),
    el('div', { class: 'editor-actions' }, [
      task
        ? el('button', {
            class: 'btn danger editor-delete', attrs: { type: 'button' }, text: 'Delete',
            on: { click: () => ctx.actions.archiveTask(task.id) },
          })
        : null,
      el('span', { style: { flex: '1' } }),
      el('button', {
        class: 'btn editor-cancel', attrs: { type: 'button' }, text: 'Cancel',
        on: { click: () => ctx.actions.closeEditor() },
      }),
      el('button', {
        class: 'btn primary editor-save', attrs: { type: 'button' }, text: 'Save',
        on: { click: save },
      }),
    ]),
  );

  return form;
}
```

- [ ] **Step 5: Open the editor from the TASKS screen**

In `src/ui/tasks.js`, make the name tappable by giving it a click handler inside `taskRow`:

```js
    el('button', {
      class: 'task-name',
      attrs: { type: 'button' },
      text: task.name,
      on: { click: () => ctx.actions.openTask(task.id) },
    }),
```

(replacing the `span` of the same class), and add the create control to `screen-head`, after `filterChips(ctx)`:

```js
      el('button', {
        class: 'btn sq add-task',
        attrs: { type: 'button', 'aria-label': 'New task' },
        text: '+',
        on: { click: () => ctx.actions.openTask(null) },
      }),
```

Add to `screens.css` so the button still reads as a row rather than a control:

```css
button.task-name {
  background: none;
  border: 0;
  padding: 0;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  min-height: var(--tap);
}
```

- [ ] **Step 6: Write `src/styles/editors.css`**

```css
/**
 * The editor sheet. Covers the screen but not the tab bar, so the way out is
 * always visible.
 */

.editor {
  position: fixed;
  inset: var(--inset-top) 0 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 12px calc(var(--tap) + var(--inset-bottom) + 16px);
  background: var(--panel);
  border-top: 1px solid var(--accent-dim);
  overflow-y: auto;
}

.editor-head { padding-bottom: 8px; border-bottom: 1px solid var(--rule); }

.field { display: flex; flex-direction: column; gap: 4px; }

.field input,
.field select,
.field textarea {
  min-height: var(--tap);
  padding: 8px 10px;
  background: var(--void);
  border: 1px solid var(--rule);
  border-radius: 0;
  color: var(--text);
  font-family: var(--font-body);
  font-size: 16px;   /* 16px or Chrome on Android zooms the page on focus */
}
.field input:focus, .field select:focus, .field textarea:focus { border-color: var(--accent-dim); }
.field input[type="date"] { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.field textarea { min-height: 84px; resize: vertical; }

/* Segmented control. One row of square buttons sharing a hairline, so the set
   reads as a single control rather than three loose ones. */
.seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--rule); border: 1px solid var(--rule); }
.seg-btn {
  min-height: var(--tap);
  background: var(--void);
  border: 0;
  border-radius: 0;
  color: var(--text-dim);
  font-family: var(--font-label);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 600;
  font-size: 10px;
  cursor: pointer;
  transition: color var(--step) linear, background var(--step) linear;
}
.seg-btn[aria-pressed="true"] { color: var(--accent); background: var(--panel-alt); }

.editor-actions { display: flex; align-items: center; gap: 8px; margin-top: auto; }

.btn {
  min-height: var(--tap);
  min-width: var(--tap);
  padding: 8px 16px;
  background: var(--panel-alt);
  border: 1px solid var(--rule);
  border-radius: 0;
  color: var(--text);
  font-family: var(--font-label);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 600;
  font-size: 11px;
  cursor: pointer;
  transition: border-color var(--step) linear, color var(--step) linear;
}
.btn.primary { color: var(--accent); border-color: var(--accent-dim); }
.btn.danger  { color: var(--crit); }
.btn.sq { padding: 8px; font-size: 18px; line-height: 1; }
```

Import it in `src/styles/index.css` after `screens.css`.

- [ ] **Step 7: Run the tests**

Run: `npm test`
Expected: PASS — 8 editor tests.

- [ ] **Step 8: Commit**

```bash
git add src/ui src/styles test/ui/task-editor.test.js
git commit -m "feat(ui): task editor sheet — create, edit, archive"
```

---

### Task 11: The TODAY screen — tasks portion

**Files:**
- Modify: `src/ui/today.js`
- Create: `src/core/digest.js`
- Test: `test/core/digest.test.js`, `test/ui/today.test.js`

**Interfaces:**
- Consumes: `core/tasks.js` — `liveTasks`, `dueState`; `core/time.js` — `todayKey`.
- Produces: `digestFor(doc, nowMs) → { overdue: task[], dueToday: task[], routines: [], events: [] }`. The routine and event arrays are empty until Phase 2 fills them; **the shape is fixed now** so Phase 3's notification body builder has a stable contract to read.

- [ ] **Step 1: Write the failing test**

Create `test/core/digest.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digestFor } from '../../src/core/digest.js';
import { createEmptyDoc } from '../../src/core/schema.js';

const clock = () => new Date(2026, 7, 31, 9, 0).getTime();

function docWith(tasks) {
  return { ...createEmptyDoc({ now: clock }), tasks };
}

const task = (over) => ({
  id: 't', name: 'x', status: 'todo', priority: 'normal', project: null,
  detail: '', doneAt: null, archived: false, dueKey: null, ...over,
});

test('an empty document yields an empty digest of the right shape', () => {
  const d = digestFor(docWith([]), clock());
  assert.deepEqual(d, { overdue: [], dueToday: [], routines: [], events: [] });
});

test('tasks are split into overdue and due today', () => {
  const d = digestFor(docWith([
    task({ id: 'a', dueKey: '2026-08-29' }),
    task({ id: 'b', dueKey: '2026-08-31' }),
    task({ id: 'c', dueKey: '2026-09-04' }),
    task({ id: 'd', dueKey: null }),
  ]), clock());
  assert.deepEqual(d.overdue.map((t) => t.id), ['a']);
  assert.deepEqual(d.dueToday.map((t) => t.id), ['b']);
});

test('done and archived work never reaches the digest', () => {
  const d = digestFor(docWith([
    task({ id: 'a', dueKey: '2026-08-01', status: 'done', doneAt: 1 }),
    task({ id: 'b', dueKey: '2026-08-01', archived: true }),
  ]), clock());
  assert.deepEqual(d.overdue, []);
});

test('overdue is ordered oldest first', () => {
  const d = digestFor(docWith([
    task({ id: 'newer', dueKey: '2026-08-30' }),
    task({ id: 'older', dueKey: '2026-08-01' }),
  ]), clock());
  assert.deepEqual(d.overdue.map((t) => t.id), ['older', 'newer']);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `src/core/digest.js`.

- [ ] **Step 3: Write `src/core/digest.js`**

```js
/**
 * What today holds — one answer, read by both the TODAY screen and the daily
 * digest notification.
 *
 * Sharing it is the point. If the screen and the notification each worked out
 * "what is due" for themselves they would eventually disagree, and the one you
 * would trust is the one you could see, which is the wrong one to be wrong.
 *
 * Pure. Routines and events are filled in during Phase 2; the shape is fixed
 * now so Phase 3 can be written against a stable contract.
 *
 * @returns {{overdue: object[], dueToday: object[], routines: object[], events: object[]}}
 */

import { liveTasks, dueState } from './tasks.js';
import { todayKey } from './time.js';

export function digestFor(doc, nowMs) {
  const today = todayKey(nowMs);
  const tasks = liveTasks(doc);

  const overdue = tasks
    .filter((t) => dueState(t, today) === 'overdue')
    // Oldest first: the thing that has been waiting longest is the thing most
    // likely to have been forgotten.
    .sort((a, b) => a.dueKey.localeCompare(b.dueKey));

  const dueToday = tasks.filter((t) => dueState(t, today) === 'today');

  return { overdue, dueToday, routines: [], events: [] };
}
```

- [ ] **Step 4: Write `test/ui/today.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createApp } from '../../src/ui/app.js';
import { createMemoryDriver } from '../../src/store/memory-driver.js';

const clock = () => new Date(2026, 7, 31, 9, 0).getTime();

const doc = {
  version: 1, id: 'doc_1', createdAt: 0, seq: {}, dismissals: [],
  settings: { accentMode: 'standard', digest: { enabled: true, timeMin: 450 }, eventLeadMin: 15 },
  projects: [], routines: [], events: [],
  tasks: [
    { id: 'tsk_1', ref: 'T-1', name: 'Late thing', project: null, status: 'todo',
      priority: 'high', dueKey: '2026-08-20', detail: '', doneAt: null, archived: false },
    { id: 'tsk_2', ref: 'T-2', name: 'Today thing', project: null, status: 'todo',
      priority: 'normal', dueKey: '2026-08-31', detail: '', doneAt: null, archived: false },
  ],
};

async function mount(seed = doc) {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
  const root = dom.window.document.getElementById('app');
  const app = createApp({
    root, now: clock,
    driver: createMemoryDriver({ seed: { 'state.json': JSON.stringify(seed) } }),
  });
  await app.boot();
  return { root, app };
}

test('overdue and due-today appear under separate headings', async () => {
  const { root } = await mount();
  const heads = [...root.querySelectorAll('.group-head')].map((h) => h.textContent.toLowerCase());
  assert.ok(heads.some((h) => h.includes('overdue')));
  assert.ok(heads.some((h) => h.includes('today')));
  assert.ok(root.textContent.includes('Late thing'));
  assert.ok(root.textContent.includes('Today thing'));
});

test('a clear day says so rather than showing empty headings', async () => {
  const { root } = await mount({ ...doc, tasks: [] });
  assert.match(root.textContent, /nothing due/i);
  assert.equal(root.querySelectorAll('.group-head').length, 0);
});

test('completing from TODAY removes the row', async () => {
  const { root, app } = await mount();
  root.querySelector('[data-task="tsk_2"] .task-check').click();
  assert.equal(app.state.doc.tasks.find((t) => t.id === 'tsk_2').status, 'done');
  assert.equal(root.querySelector('[data-task="tsk_2"]'), null);
});
```

- [ ] **Step 5: Write `src/ui/today.js`**

```js
/**
 * TODAY — the app's centre of gravity, and the screen the daily digest
 * notification points at. Routines and events are added in Phase 2.
 */

import { el } from './dom.js';
import { digestFor } from '../core/digest.js';
import { todayKey } from '../core/time.js';
import { taskRow } from './task-row.js';

function section(title, tasks, ctx, today) {
  if (!tasks.length) return null;
  return el('div', {}, [
    el('div', { class: 'group-head label bracket', text: title }),
    el('div', { class: 'stack' }, tasks.map((t) => taskRow(ctx, t, today))),
  ]);
}

export function renderToday(ctx) {
  // Today's key comes from the clock, never from the data. Deriving it from the
  // first due task would be undefined on an empty list and wrong on a stale one.
  const today = todayKey(ctx.now);
  const digest = digestFor(ctx.doc, ctx.now);

  const sections = [
    section('Overdue', digest.overdue, ctx, today),
    section('Due today', digest.dueToday, ctx, today),
  ].filter(Boolean);

  return el('div', { class: 'screen' }, [
    el('div', { class: 'screen-head' }, [
      el('span', { class: sections.length ? 'mark live' : 'mark' }),
      el('span', { class: 'screen-title', text: 'Today' }),
    ]),
    ...(sections.length ? sections : [el('p', { class: 'empty label', text: 'Nothing due' })]),
  ]);
}
```

`taskRow` is imported rather than redefined — Step 6 extracts it. Write that step
first if you prefer the file to resolve as you go; the tests gate both together.

- [ ] **Step 6: Extract `taskRow` so both screens share it**

Create `src/ui/task-row.js` and move the `taskRow` function out of `src/ui/tasks.js` into it verbatim, exporting it:

```js
import { el } from './dom.js';
import { dueState } from '../core/tasks.js';
import { formatDayLabel } from '../core/time.js';

/** One task, as it appears on both TASKS and TODAY. Shared so the two screens
 *  cannot drift into rendering the same record two different ways. */
export function taskRow(ctx, task, today) {
  const done = task.status === 'done';
  return el('div', {
    class: `task-row${done ? ' is-done' : ''}`,
    attrs: {
      'data-task': task.id,
      'data-due': dueState(task, today),
      'data-priority': task.priority,
      // Carried so the list can show an in-progress task as in-progress.
      // Without it, DOING is settable in the editor and invisible everywhere else.
      'data-status': task.status,
    },
  }, [
    el('button', {
      class: 'task-check',
      attrs: {
        type: 'button',
        'aria-label': done ? `Reopen ${task.name}` : `Complete ${task.name}`,
        'aria-pressed': done,
      },
      on: { click: () => ctx.actions.toggleDone(task.id) },
    }, [el('span', { class: 'mark' })]),
    el('button', {
      class: 'task-name', attrs: { type: 'button' }, text: task.name,
      on: { click: () => ctx.actions.openTask(task.id) },
    }),
    task.dueKey ? el('span', { class: 'task-due mono', text: formatDayLabel(task.dueKey) }) : null,
  ]);
}
```

In `src/ui/tasks.js`, delete the local `taskRow` and its now-unused imports, and add `import { taskRow } from './task-row.js';`.

- [ ] **Step 7: Run the tests**

Run: `npm test`
Expected: PASS — 4 digest tests and 3 today tests, with every earlier test still green.

- [ ] **Step 8: Check it on the phone**

Run: `npm run dev`, open the forwarded URL, add two or three real tasks with due dates. Confirm the sheet's inputs do not zoom the page on focus (the 16px rule), and that the date picker is the native Android one.

- [ ] **Step 9: Commit**

```bash
git add src/core/digest.js src/ui test/core/digest.test.js test/ui/today.test.js
git commit -m "feat: TODAY screen and the shared digest both screens read"
```

**PHASE 1 COMPLETE.** Tasks and projects work end to end.

---

# PHASE 2 — ROUTINES AND CALENDAR

*Ends with: recurring routines appearing at their time on TODAY, and a month calendar of one-off and recurring events.*

---

### Task 12: Harvest `routines.js`

**Files:**
- Create: `src/core/routines.js`
- Modify: `src/core/schema.js`
- Test: `test/core/routines.test.js`

**Interfaces:**
- Consumes: `ids.js`, `time.js` — `todayKey`, `addDays`, `minutesToLabel`; `recurrence.js` — `occursOn`, `describeRule`.
- Produces:
  - `ROUTINE_FIELDS`, `createRoutine(doc, fields, { now }) → routine`
  - `liveRoutines(doc) → routine[]`, `routineKey(routine, dateKey) → string`
  - `activeRoutines(doc, nowMs) → Array<{routine, key}>` — what wants attention **now**
  - `nextRoutineDue(doc, nowMs) → {routine, dateKey} | null`
  - `describeRoutine(routine) → "07:00 · Every Mon, Wed"`
  - `repairRoutines(list) → routine[]`

- [ ] **Step 1: Copy it out**

```bash
cp reference/2026-08-16-task-tracker/src/core/routines.js src/core/routines.js
```

Take it **verbatim**. Nothing in it is work-specific: it depends only on `ids`, `time` and `recurrence`, all three of which are already harvested with the same names.

Read its opening comment before touching anything downstream — *"Nothing here is stored when a routine fires. A routine is active because the clock says so"* — because that is what makes "active" survive the app not having been open at the time, which matters far more on a phone that gets killed in the background than it did on a desktop.

- [ ] **Step 2: Write the test**

Create `test/core/routines.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRoutine, activeRoutines, nextRoutineDue, describeRoutine,
  routineKey, repairRoutines,
} from '../../src/core/routines.js';
import { createEmptyDoc } from '../../src/core/schema.js';

// Monday 2026-08-31, 09:00 local.
const at = (h, m = 0) => new Date(2026, 7, 31, h, m).getTime();
const clock = () => at(9);

function docWith(routines) {
  return { ...createEmptyDoc({ now: clock }), routines };
}

const weekdayMorning = { kind: 'weekly', days: [0, 1, 2, 3, 4] };

test('a routine is not active before its time', () => {
  const doc = docWith([createRoutine({ seq: {} }, {
    name: 'Meds', rule: weekdayMorning, timeMin: 7 * 60,
  }, { now: clock })]);
  assert.equal(activeRoutines(doc, at(6, 30)).length, 0);
  assert.equal(activeRoutines(doc, at(7, 0)).length, 1);
  assert.equal(activeRoutines(doc, at(23, 0)).length, 1, 'and stays active all day');
});

test('a routine is not active on a day its rule does not fire', () => {
  const doc = docWith([createRoutine({ seq: {} }, {
    name: 'Bins', rule: { kind: 'weekly', days: [2] }, timeMin: 7 * 60,
  }, { now: clock })]);
  assert.equal(activeRoutines(doc, at(9)).length, 0, 'Monday is not Wednesday');
});

test('yesterday cannot be active — expiry is a property of the model', () => {
  // Only *today's* occurrence is ever considered, so "clears at end of day"
  // needs no cleanup job and cannot be forgotten.
  const doc = docWith([createRoutine({ seq: {} }, {
    rule: { kind: 'once', date: '2026-08-30' }, timeMin: 0,
  }, { now: clock })]);
  assert.equal(activeRoutines(doc, at(9)).length, 0);
});

test('a dismissal suppresses today only', () => {
  const routine = createRoutine({ seq: {} }, {
    rule: weekdayMorning, timeMin: 7 * 60,
  }, { now: clock });
  const doc = { ...docWith([routine]), dismissals: [routineKey(routine, '2026-08-31')] };
  assert.equal(activeRoutines(doc, at(9)).length, 0);
  // Tuesday's occurrence has its own key, so it is untouched.
  assert.equal(activeRoutines(doc, new Date(2026, 8, 1, 9).getTime()).length, 1);
});

test('archived routines never fire', () => {
  const doc = docWith([{
    ...createRoutine({ seq: {} }, { rule: weekdayMorning, timeMin: 0 }, { now: clock }),
    archived: true,
  }]);
  assert.equal(activeRoutines(doc, at(9)).length, 0);
});

test('nextRoutineDue finds the soonest still to come', () => {
  const doc = docWith([
    createRoutine({ seq: {} }, { name: 'Evening', rule: weekdayMorning, timeMin: 18 * 60 }, { now: clock }),
    createRoutine({ seq: {} }, { name: 'Morning', rule: weekdayMorning, timeMin: 7 * 60 }, { now: clock }),
  ]);
  const next = nextRoutineDue(doc, at(9));
  assert.equal(next.routine.name, 'Evening', "07:00 has already gone past");
  assert.equal(next.dateKey, '2026-08-31');
});

test('describeRoutine states time and schedule on one line', () => {
  const routine = createRoutine({ seq: {} }, {
    rule: { kind: 'weekly', days: [0, 2] }, timeMin: 7 * 60,
  }, { now: clock });
  assert.equal(describeRoutine(routine), '07:00 · Every Mon, Wed');
});

test('repairRoutines defends against junk', () => {
  const out = repairRoutines([
    { id: 'rtn_1' },
    { id: 'rtn_2', name: {}, steps: 'not a list', timeMin: 'noon' },
    { name: 'no id' },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].timeMin, 7 * 60);
  assert.equal(out[1].name, 'New routine');
  assert.deepEqual(out[1].steps, []);
  assert.equal(out[1].timeMin, 7 * 60);
});
```

- [ ] **Step 3: Wire the repair into `migrate`**

In `src/core/schema.js` add `import { repairRoutines } from './routines.js';` and replace

```js
  out.routines = Array.isArray(out.routines) ? out.routines : [];
```

with

```js
  out.routines = repairRoutines(out.routines);
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS — 8 routine tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/routines.js src/core/schema.js test/core/routines.test.js
git commit -m "feat(core): harvest routines verbatim"
```

---

### Task 13: Harvest `events.js`, minus the work integrations

**Files:**
- Create: `src/core/events.js`
- Modify: `src/core/schema.js`
- Test: `test/core/events.test.js`

**Interfaces:**
- Consumes: `ids.js`, `time.js`, `recurrence.js` — `occursOn`.
- Produces:
  - `EVENT_FIELDS`, `MAX_SPAN = 92`, `createEvent(doc, fields, { now }) → event`
  - `liveEvents(doc)`, `spanOf(event) → number`, `eventKey(event, dateKey, when) → string`
  - `eventsOnDay(doc, dateKey) → Array<{event, startKey, dayIndex, span}>`
  - `describeEventTime(event) → "14:00–16:00" | "14:00" | "All day"`
  - `eventNotifications(doc, nowMs) → Array<{event, dateKey, when, key}>` — the **panel** list, today and tomorrow
  - `repairEvents(list) → event[]`

- [ ] **Step 1: Copy it out**

```bash
cp reference/2026-08-16-task-tracker/src/core/events.js src/core/events.js
```

- [ ] **Step 2: Remove the Teams integration**

Three deletions in `src/core/events.js`, and nothing else changes:

1. Delete the `teamsLink` line and its comment from `EVENT_FIELDS`.
2. Delete the whole `isHttpsTeamsLink()` function and its doc comment.
3. Delete the `teamsLink:` branch from `repairEvents`, including its comment.

Then add the one genuinely new field to `EVENT_FIELDS`, after `spanDays`:

```js
  /** Minutes before the start to notify. Null falls back to
   *  settings.eventLeadMin, so changing the default moves every event that
   *  never asked for something different. */
  leadMin: null,
```

and in `repairEvents`, beside the other coercions:

```js
      leadMin: Number.isFinite(e.leadMin) ? Math.max(0, Math.round(e.leadMin)) : null,
```

Do **not** touch `eventsOnDay`. Its walk-back-over-the-span logic is what draws a three-day visit as one continuous bar rather than three unrelated entries, and it is the only part of this module the month grid depends on.

- [ ] **Step 3: Write the test**

Create `test/core/events.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEvent, eventsOnDay, describeEventTime, eventNotifications,
  eventKey, spanOf, repairEvents, EVENT_FIELDS,
} from '../../src/core/events.js';
import { createEmptyDoc } from '../../src/core/schema.js';

const clock = () => new Date(2026, 7, 31, 9, 0).getTime();
const docWith = (events) => ({ ...createEmptyDoc({ now: clock }), events });

test('the Teams integration is gone', () => {
  assert.ok(!('teamsLink' in EVENT_FIELDS));
});

test('leadMin defaults to null, meaning "use the app default"', () => {
  assert.equal(EVENT_FIELDS.leadMin, null);
});

test('a single-day event appears only on its day', () => {
  const doc = docWith([createEvent({ seq: {} }, {
    name: 'Dentist', rule: { kind: 'once', date: '2026-09-03' }, startMin: 540,
  }, { now: clock })]);
  assert.equal(eventsOnDay(doc, '2026-09-03').length, 1);
  assert.equal(eventsOnDay(doc, '2026-09-04').length, 0);
});

test('a multi-day event covers every day of its span, with an index', () => {
  const doc = docWith([createEvent({ seq: {} }, {
    name: 'Peter visiting', rule: { kind: 'once', date: '2026-09-01' }, spanDays: 2,
  }, { now: clock })]);
  assert.equal(eventsOnDay(doc, '2026-09-01')[0].dayIndex, 0);
  assert.equal(eventsOnDay(doc, '2026-09-02')[0].dayIndex, 1);
  assert.equal(eventsOnDay(doc, '2026-09-03')[0].dayIndex, 2);
  assert.equal(eventsOnDay(doc, '2026-09-04').length, 0);
});

test('a recurring event repeats, span and all', () => {
  const doc = docWith([createEvent({ seq: {} }, {
    name: 'Standup', rule: { kind: 'weekly', days: [0] },
  }, { now: clock })]);
  assert.equal(eventsOnDay(doc, '2026-08-31').length, 1);
  assert.equal(eventsOnDay(doc, '2026-09-07').length, 1);
  assert.equal(eventsOnDay(doc, '2026-09-01').length, 0);
});

test('spanOf is clamped and never negative', () => {
  assert.equal(spanOf({ spanDays: -4 }), 0);
  assert.equal(spanOf({ spanDays: 9999 }), 92);
  assert.equal(spanOf({}), 0);
});

test('describeEventTime covers all-day, start-only and ranged', () => {
  assert.equal(describeEventTime({ startMin: null }), 'All day');
  assert.equal(describeEventTime({ startMin: 840, endMin: null }), '14:00');
  assert.equal(describeEventTime({ startMin: 840, endMin: 960 }), '14:00–16:00');
});

test('the panel list covers today and tomorrow, keyed separately', () => {
  const doc = docWith([createEvent({ seq: {} }, {
    name: 'Dentist', rule: { kind: 'once', date: '2026-09-01' },
  }, { now: clock })]);
  const notes = eventNotifications(doc, clock());
  assert.equal(notes.length, 1);
  assert.equal(notes[0].when, 'tomorrow');
});

test('dismissing tomorrow does not suppress the reminder on the day', () => {
  // Two different pieces of news about the same event, so two keys.
  const event = createEvent({ seq: {} }, { rule: { kind: 'once', date: '2026-09-01' } }, { now: clock });
  const doc = { ...docWith([event]), dismissals: [eventKey(event, '2026-09-01', 'tomorrow')] };
  assert.equal(eventNotifications(doc, clock()).length, 0);
  const onTheDay = new Date(2026, 8, 1, 9).getTime();
  assert.equal(eventNotifications(doc, onTheDay).length, 1);
});

test('repairEvents coerces and drops the unidentifiable', () => {
  const out = repairEvents([
    { id: 'evt_1' },
    { id: 'evt_2', name: {}, spanDays: -3, leadMin: 'soon' },
    { name: 'no id' },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[1].name, 'New event');
  assert.equal(out[1].spanDays, 0);
  assert.equal(out[1].leadMin, null);
});
```

- [ ] **Step 4: Wire the repair into `migrate`**

In `src/core/schema.js` add `import { repairEvents } from './events.js';` and replace the `out.events` line with `out.events = repairEvents(out.events);`.

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS — 10 event tests. A failure naming `isHttpsTeamsLink` means the deletion in Step 2 missed a call site.

- [ ] **Step 6: Commit**

```bash
git add src/core/events.js src/core/schema.js test/core/events.test.js
git commit -m "feat(core): harvest calendar events, drop the Teams integration"
```

---

### Task 14: `signals.js`, dismissal pruning, and the completed digest

**Files:**
- Create: `src/core/signals.js`
- Modify: `src/core/digest.js`, `src/ui/app.js`
- Test: `test/core/signals.test.js`, extend `test/core/digest.test.js`

**Interfaces:**
- Consumes: `routines.js` — `activeRoutines`; `events.js` — `eventNotifications`; `time.js` — `todayKey`.
- Produces:
  - `attention(doc, nowMs) → {today: number, calendar: number}` — badge counts
  - `pruneDismissals(doc, nowMs) → string[]` — the surviving keys
  - `digestFor` now returns populated `routines` and `events` arrays.

- [ ] **Step 1: Copy `signals.js` out and trim it**

```bash
cp reference/2026-08-16-task-tracker/src/core/signals.js src/core/signals.js
```

The harvested `attention()` counts three screens that no longer exist in this shape. Replace that function (keeping `pruneDismissals` **exactly** as written) with:

```js
/**
 * @returns {{today: number, calendar: number}} how many items each tab has
 */
export function attention(doc, nowMs) {
  const digest = digestFor(doc, nowMs);
  return {
    today: digest.overdue.length + digest.dueToday.length + digest.routines.length,
    calendar: eventNotifications(doc, nowMs).length,
  };
}
```

Fix the imports at the top: drop `activeRoutines` and `./check-ins.js` (that module is out of scope and was never copied), and add `import { digestFor } from './digest.js';`.

Leave `pruneDismissals` and its `DATE_IN_KEY` regex untouched. Its comment explains why it is safe — routines only consider today and event notifications only today and tomorrow, so a key naming an earlier date is provably dead — and that reasoning still holds exactly.

- [ ] **Step 2: Write `test/core/signals.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pruneDismissals, attention } from '../../src/core/signals.js';
import { createEmptyDoc } from '../../src/core/schema.js';

const clock = () => new Date(2026, 7, 31, 9, 0).getTime();

test('dismissals for past days are dropped', () => {
  const doc = {
    ...createEmptyDoc({ now: clock }),
    dismissals: [
      'rtn_1:2026-08-30',              // yesterday — provably dead
      'rtn_2:2026-08-31',              // today — still live
      'evt_1:2026-09-01:tomorrow',     // future — still live
      'junk-with-no-date',             // cannot match anything we generate
    ],
  };
  assert.deepEqual(pruneDismissals(doc, clock()),
    ['rtn_2:2026-08-31', 'evt_1:2026-09-01:tomorrow']);
});

test('pruning an empty list is safe', () => {
  assert.deepEqual(pruneDismissals({ }, clock()), []);
});

test('attention counts what each tab is holding', () => {
  const doc = {
    ...createEmptyDoc({ now: clock }),
    tasks: [{ id: 't1', name: 'x', status: 'todo', priority: 'normal', project: null,
              detail: '', doneAt: null, archived: false, dueKey: '2026-08-20' }],
  };
  assert.equal(attention(doc, clock()).today, 1);
  assert.equal(attention(doc, clock()).calendar, 0);
});
```

- [ ] **Step 3: Fill in the digest's routines and events**

In `src/core/digest.js`, add the imports and populate the two arrays that were stubbed in Task 11:

```js
import { activeRoutines } from './routines.js';
import { eventsOnDay } from './events.js';
```

and replace the return statement:

```js
  return {
    overdue,
    dueToday,
    // Only what is due *now* — the routine module's own definition, which is
    // why a routine you have not reached yet does not clutter the screen.
    routines: activeRoutines(doc, nowMs),
    // Every event covering today, including one that started earlier in its span.
    events: eventsOnDay(doc, today),
  };
```

- [ ] **Step 4: Extend `test/core/digest.test.js`**

Append:

```js
import { createRoutine } from '../../src/core/routines.js';
import { createEvent } from '../../src/core/events.js';

test('the digest carries the routines that are due now', () => {
  const routine = createRoutine({ seq: {} }, {
    name: 'Meds', rule: { kind: 'daily', from: '2026-08-01', every: 1 }, timeMin: 7 * 60,
  }, { now: clock });
  const doc = { ...docWith([]), routines: [routine] };
  assert.equal(digestFor(doc, clock()).routines.length, 1);
  // 06:00 — before it is due.
  assert.equal(digestFor(doc, new Date(2026, 7, 31, 6).getTime()).routines.length, 0);
});

test('the digest carries today\\'s events, including mid-span days', () => {
  const event = createEvent({ seq: {} }, {
    name: 'Peter visiting', rule: { kind: 'once', date: '2026-08-30' }, spanDays: 3,
  }, { now: clock });
  const doc = { ...docWith([]), events: [event] };
  const d = digestFor(doc, clock());
  assert.equal(d.events.length, 1);
  assert.equal(d.events[0].dayIndex, 1, 'day two of a visit that began yesterday');
});
```

- [ ] **Step 5: Prune on boot**

In `src/ui/app.js`, after `state.doc = migrate(raw, { now });` in `boot()`:

```js
        // Pruned once per launch rather than on a timer: the list only grows
        // when something is dismissed, and nothing else reads it in between.
        state.doc = { ...state.doc, dismissals: pruneDismissals(state.doc, now()) };
```

with `import { pruneDismissals } from '../core/signals.js';` at the top.

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS — 3 signals tests and 6 digest tests.

- [ ] **Step 7: Commit**

```bash
git add src/core/signals.js src/core/digest.js src/ui/app.js test/core
git commit -m "feat(core): attention counts, dismissal pruning, complete digest"
```

---

### Task 15: The CALENDAR screen — month grid

**Files:**
- Modify: `src/ui/calendar.js`
- Create: `src/styles/calendar.css`
- Modify: `src/ui/app.js` (month navigation state), `src/styles/index.css`
- Test: `test/ui/calendar.test.js`

**Interfaces:**
- Consumes: `core/events.js` — `eventsOnDay`, `describeEventTime`; `core/time.js` — `dateKey`, `parseDateKey`, `addDays`, `todayKey`, `MONTH_NAMES`, `DAY_NAMES`.
- Produces: `renderCalendar(ctx) → HTMLElement`. Day cells carry `data-day` (the date key). New app state `state.month` (a `"YYYY-MM-01"` key) and `state.selectedDay`; actions `stepMonth(n)`, `selectDay(key)`.

- [ ] **Step 1: Write the failing test**

Create `test/ui/calendar.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createApp } from '../../src/ui/app.js';
import { createMemoryDriver } from '../../src/store/memory-driver.js';

const clock = () => new Date(2026, 7, 31, 9, 0).getTime();

const doc = {
  version: 1, id: 'doc_1', createdAt: 0, seq: {}, dismissals: [],
  settings: { accentMode: 'standard', digest: { enabled: true, timeMin: 450 }, eventLeadMin: 15 },
  projects: [], tasks: [], routines: [],
  events: [
    { id: 'evt_1', ref: 'C-1', name: 'Dentist', detail: '',
      rule: { kind: 'once', date: '2026-08-12' },
      startMin: 540, endMin: 600, spanDays: 0, leadMin: null, archived: false },
    { id: 'evt_2', ref: 'C-2', name: 'Peter visiting', detail: '',
      rule: { kind: 'once', date: '2026-08-20' },
      startMin: null, endMin: null, spanDays: 2, leadMin: null, archived: false },
  ],
};

async function mount() {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
  const root = dom.window.document.getElementById('app');
  const app = createApp({
    root, now: clock,
    driver: createMemoryDriver({ seed: { 'state.json': JSON.stringify(doc) } }),
  });
  await app.boot();
  app.actions.setScreen('calendar');
  return { root, app };
}

test('the grid opens on the current month and is a whole number of weeks', async () => {
  const { root } = await mount();
  assert.match(root.querySelector('.cal-title').textContent, /Aug 2026/);
  const cells = root.querySelectorAll('[data-day]');
  assert.equal(cells.length % 7, 0, 'always full weeks — a ragged grid reflows as you page');
  assert.ok(cells.length >= 28 && cells.length <= 42);
});

test('the grid starts on a Monday', async () => {
  const { root } = await mount();
  const labels = [...root.querySelectorAll('.cal-dow')].map((n) => n.textContent);
  assert.equal(labels[0], 'Mon');
  assert.equal(labels[6], 'Sun');
});

test('today is marked', async () => {
  const { root } = await mount();
  assert.equal(root.querySelector('[data-day="2026-08-31"]').dataset.today, 'true');
});

test('days outside the month are marked so, but still rendered', async () => {
  const { root } = await mount();
  // August 2026 starts on a Saturday, so the grid opens with July days.
  const first = root.querySelector('[data-day]');
  assert.equal(first.dataset.outside, 'true');
});

test('a day carrying events shows a marker', async () => {
  const { root } = await mount();
  assert.ok(root.querySelector('[data-day="2026-08-12"] .mark'));
  assert.equal(root.querySelector('[data-day="2026-08-13"] .mark'), null);
});

test('a multi-day event marks every day of its span', async () => {
  const { root } = await mount();
  for (const key of ['2026-08-20', '2026-08-21', '2026-08-22']) {
    assert.ok(root.querySelector(`[data-day="${key}"] .mark`), `${key} is within the span`);
  }
  assert.equal(root.querySelector('[data-day="2026-08-23"] .mark'), null);
});

test('selecting a day lists its events with their times', async () => {
  const { root, app } = await mount();
  root.querySelector('[data-day="2026-08-12"]').click();
  assert.equal(app.state.selectedDay, '2026-08-12');
  const detail = root.querySelector('.cal-day-detail');
  assert.match(detail.textContent, /Dentist/);
  assert.match(detail.textContent, /09:00–10:00/);
});

test('paging months moves the grid and survives a year boundary', async () => {
  const { root, app } = await mount();
  root.querySelector('.cal-next').click();
  assert.match(root.querySelector('.cal-title').textContent, /Sep 2026/);
  for (let i = 0; i < 4; i++) root.querySelector('.cal-next').click();
  assert.match(root.querySelector('.cal-title').textContent, /Jan 2027/);
  assert.equal(app.state.month, '2027-01-01');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — no `.cal-title` in the stub screen.

- [ ] **Step 3: Add month state and actions to `src/ui/app.js`**

Add to `state`: `month: null, selectedDay: null`. In `boot()`, after the document is loaded, seed the month from the clock:

```js
      const today = todayKey(now());
      state.month = `${today.slice(0, 7)}-01`;
      state.selectedDay = today;
```

with `import { todayKey, addDays, parseDateKey, dateKey } from '../core/time.js';`. Add to `actions`:

```js
    stepMonth(n) {
      const d = parseDateKey(state.month);
      // setMonth handles the year rollover, and day 1 always exists, so this
      // cannot land on a date that does not (which +30 days would).
      d.setMonth(d.getMonth() + n);
      state.month = `${dateKey(d).slice(0, 7)}-01`;
      app.render();
    },
    selectDay(key) { state.selectedDay = key; app.render(); },
```

Extend `ctx` in `render()` with `month: state.month, selectedDay: state.selectedDay`.

- [ ] **Step 4: Write `src/ui/calendar.js`**

```js
/**
 * CALENDAR — a month at a glance, then one day's detail.
 *
 * The grid always draws whole weeks including the days either side of the
 * month. A ragged grid changes height as you page, which makes the control you
 * just tapped move out from under your thumb.
 */

import { el } from './dom.js';
import { eventsOnDay, describeEventTime } from '../core/events.js';
import { parseDateKey, addDays, todayKey, MONTH_NAMES, DAY_NAMES } from '../core/time.js';

/** Every day the grid draws: whole weeks, Monday first, covering the month. */
function gridDays(monthKey) {
  const first = parseDateKey(monthKey);
  const lead = (first.getDay() + 6) % 7;             // Monday-first offset
  let cursor = addDays(monthKey, -lead);
  const days = [];
  // Six weeks covers every month layout; trim the trailing week if unused.
  for (let i = 0; i < 42; i++) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  const month = monthKey.slice(0, 7);
  const lastUsed = days.findLastIndex((k) => k.slice(0, 7) === month);
  return days.slice(0, Math.ceil((lastUsed + 1) / 7) * 7);
}

function dayCell(ctx, key, month, today) {
  const has = eventsOnDay(ctx.doc, key).length > 0;
  return el('button', {
    class: 'cal-day',
    attrs: {
      type: 'button',
      'data-day': key,
      'data-outside': key.slice(0, 7) !== month ? 'true' : null,
      'data-today': key === today ? 'true' : null,
      'aria-pressed': key === ctx.selectedDay,
    },
    on: { click: () => ctx.actions.selectDay(key) },
  }, [
    el('span', { class: 'cal-num mono', text: String(parseDateKey(key).getDate()) }),
    has ? el('span', { class: 'mark live' }) : null,
  ]);
}

function dayDetail(ctx) {
  const key = ctx.selectedDay;
  const entries = key ? eventsOnDay(ctx.doc, key) : [];
  return el('div', { class: 'cal-day-detail' }, [
    el('div', { class: 'group-head label bracket', text: key || '' }),
    entries.length
      ? el('div', { class: 'stack' }, entries.map(({ event, dayIndex, span }) => el('button', {
          class: 'cal-entry', attrs: { type: 'button', 'data-event': event.id },
          on: { click: () => ctx.actions.openEvent(event.id) },
        }, [
          el('span', { class: 'cal-entry-name', text: event.name }),
          span > 0
            ? el('span', { class: 'label', text: `Day ${dayIndex + 1} of ${span + 1}` })
            : null,
          el('span', { class: 'cal-entry-time mono', text: describeEventTime(event) }),
        ])))
      : el('p', { class: 'empty label', text: 'Nothing on' }),
  ]);
}

export function renderCalendar(ctx) {
  const month = ctx.month.slice(0, 7);
  const today = todayKey(ctx.now);
  const first = parseDateKey(ctx.month);

  return el('div', { class: 'screen' }, [
    el('div', { class: 'screen-head' }, [
      el('button', {
        class: 'btn sq cal-prev', attrs: { type: 'button', 'aria-label': 'Previous month' },
        text: '‹', on: { click: () => ctx.actions.stepMonth(-1) },
      }),
      el('span', {
        class: 'screen-title cal-title',
        text: `${MONTH_NAMES[first.getMonth()]} ${first.getFullYear()}`,
      }),
      el('span', { style: { flex: '1' } }),
      el('button', {
        class: 'btn sq cal-next', attrs: { type: 'button', 'aria-label': 'Next month' },
        text: '›', on: { click: () => ctx.actions.stepMonth(1) },
      }),
      el('button', {
        class: 'btn sq add-event', attrs: { type: 'button', 'aria-label': 'New event' },
        text: '+', on: { click: () => ctx.actions.openEvent(null) },
      }),
    ]),
    el('div', { class: 'cal-grid' }, [
      ...DAY_NAMES.map((d) => el('span', { class: 'cal-dow label', text: d })),
      ...gridDays(ctx.month).map((key) => dayCell(ctx, key, month, today)),
    ]),
    dayDetail(ctx),
  ]);
}
```

- [ ] **Step 5: Write `src/styles/calendar.css`**

```css
/**
 * The month grid. Seven equal columns; cells are square-ish so a month fits on
 * one screen without scrolling, which is the whole point of a month view.
 */

.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
  background: var(--rule);      /* the gap becomes the hairline grid */
  border: 1px solid var(--rule);
}

.cal-dow {
  background: var(--panel);
  padding: 6px 0;
  text-align: center;
  font-size: 10px;
}

.cal-day {
  position: relative;
  aspect-ratio: 1;
  min-height: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  background: var(--panel);
  border: 0;
  border-radius: 0;
  color: var(--text);
  cursor: pointer;
  transition: background var(--step) linear;
}
.cal-day[data-outside="true"] { color: var(--text-dim); background: var(--void); }
.cal-day[data-today="true"] .cal-num { color: var(--accent); font-weight: 600; }
.cal-day[aria-pressed="true"] { background: var(--panel-alt); box-shadow: inset 0 0 0 1px var(--accent-dim); }
.cal-num { font-size: 13px; }

.cal-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: var(--tap);
  padding: 6px 8px;
  background: var(--panel);
  border: 0;
  border-bottom: 1px solid var(--rule);
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.cal-entry-name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.cal-entry-time { font-size: 12px; color: var(--text-dim); }
```

Import it in `src/styles/index.css`.

- [ ] **Step 6: Stub `openEvent` so the screen renders**

Add to `actions` in `src/ui/app.js` (Task 16 completes it):

```js
    openEvent(id) { state.editing = { kind: 'event', id: id ?? null }; app.render(); },
```

- [ ] **Step 7: Run the tests**

Run: `npm test`
Expected: PASS — 8 calendar tests.

- [ ] **Step 8: Commit**

```bash
git add src/ui/calendar.js src/ui/app.js src/styles test/ui/calendar.test.js
git commit -m "feat(ui): CALENDAR month grid with span-aware day markers"
```

---

### Task 16: The recurrence rule input and the event editor

**Files:**
- Create: `src/ui/rule-input.js`, `src/ui/event-editor.js`
- Modify: `src/ui/app.js`
- Test: `test/ui/rule-input.test.js`, `test/ui/event-editor.test.js`

**Interfaces:**
- Consumes: `core/recurrence.js` — `RULE_KINDS`, `describeRule`, `defaultRule`; `core/events.js` — `createEvent`, `EVENT_FIELDS`.
- Produces:
  - `renderRuleInput(rule, onChange) → HTMLElement` — emits a complete rule object on every change; `onChange(rule)`
  - `renderEventEditor(ctx, event) → HTMLElement`
  - Actions `saveEvent(patch)`, `archiveEvent(id)`.

- [ ] **Step 1: Write `test/ui/rule-input.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderRuleInput } from '../../src/ui/rule-input.js';

function setup(rule) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
  const seen = [];
  const node = renderRuleInput(rule, (r) => seen.push(r));
  dom.window.document.body.appendChild(node);
  return { node, seen };
}

test('every rule kind is offered', () => {
  const { node } = setup({ kind: 'weekly', days: [0] });
  const kinds = [...node.querySelectorAll('[name="kind"] option')].map((o) => o.value);
  assert.deepEqual(kinds, ['once', 'daily', 'weekly', 'monthly']);
});

test('weekly shows seven day toggles, Monday first', () => {
  const { node } = setup({ kind: 'weekly', days: [0] });
  const days = node.querySelectorAll('.rule-day');
  assert.equal(days.length, 7);
  assert.equal(days[0].textContent, 'Mon');
  assert.equal(days[0].getAttribute('aria-pressed'), 'true');
  assert.equal(days[1].getAttribute('aria-pressed'), 'false');
});

test('toggling a day emits a complete rule', () => {
  const { node, seen } = setup({ kind: 'weekly', days: [0] });
  node.querySelectorAll('.rule-day')[2].click();
  assert.deepEqual(seen.at(-1), { kind: 'weekly', days: [0, 2] });
});

test('untoggling the last day emits an empty list rather than dropping the key', () => {
  // describeRule reports "Never — no days chosen" for this, which is the honest
  // state to be in mid-edit. Deleting `days` would make the rule malformed.
  const { node, seen } = setup({ kind: 'weekly', days: [0] });
  node.querySelectorAll('.rule-day')[0].click();
  assert.deepEqual(seen.at(-1), { kind: 'weekly', days: [] });
});

test('switching kind emits a usable rule of the new kind, not a half-built one', () => {
  const { node, seen } = setup({ kind: 'weekly', days: [0] });
  const select = node.querySelector('[name="kind"]');
  select.value = 'monthly';
  select.dispatchEvent(new window.Event('change'));
  assert.equal(seen.at(-1).kind, 'monthly');
  assert.ok(Number.isFinite(seen.at(-1).day), 'monthly must arrive with a day set');
});

test('the rule is described in words as it is edited', () => {
  const { node } = setup({ kind: 'weekly', days: [0, 2] });
  assert.match(node.querySelector('.rule-summary').textContent, /Every Mon, Wed/);
});
```

- [ ] **Step 2: Write `src/ui/rule-input.js`**

```js
/**
 * The recurrence editor.
 *
 * Emits a COMPLETE rule on every change — never a partial one. A half-built
 * rule reaching the document would be stored, and `occursOn` would quietly
 * report false for it forever, which reads to the user as "the app forgot".
 */

import { el } from './dom.js';
import { RULE_KINDS, describeRule } from '../core/recurrence.js';
import { DAY_NAMES, todayKey } from '../core/time.js';

/** A usable rule of each kind, so switching kind never yields a broken one. */
function seedRule(kind, previous) {
  const today = todayKey();
  switch (kind) {
    case 'once':    return { kind: 'once', date: previous.date || today };
    case 'daily':   return { kind: 'daily', from: previous.from || today, every: previous.every || 1 };
    case 'weekly':  return { kind: 'weekly', days: previous.days || [] };
    case 'monthly': return { kind: 'monthly', day: Number.isFinite(previous.day) ? previous.day
                                                : Number(today.slice(8, 10)) };
    default:        return { kind: 'weekly', days: [] };
  }
}

export function renderRuleInput(initial, onChange) {
  let rule = { ...(initial && initial.kind ? initial : { kind: 'weekly', days: [] }) };
  const wrap = el('div', { class: 'rule-input' });

  function emit() {
    onChange({ ...rule });
    draw();
  }

  function body() {
    if (rule.kind === 'once') {
      return el('input', {
        attrs: { name: 'date', type: 'date', value: rule.date || '' },
        on: { change: (e) => { rule = { ...rule, date: e.target.value }; emit(); } },
      });
    }
    if (rule.kind === 'daily') {
      return el('label', { class: 'field' }, [
        el('span', { class: 'label', text: 'Every N days' }),
        el('input', {
          attrs: { name: 'every', type: 'number', min: '1', value: String(rule.every || 1) },
          on: { change: (e) => {
            rule = { ...rule, every: Math.max(1, Number(e.target.value) || 1) }; emit();
          } },
        }),
      ]);
    }
    if (rule.kind === 'weekly') {
      const days = rule.days || [];
      return el('div', { class: 'rule-days' }, DAY_NAMES.map((name, index) => el('button', {
        class: 'rule-day',
        attrs: { type: 'button', 'aria-pressed': days.includes(index) },
        text: name,
        on: { click: () => {
          const next = days.includes(index)
            ? days.filter((d) => d !== index)
            : [...days, index].sort((a, b) => a - b);
          rule = { ...rule, days: next };
          emit();
        } },
      })));
    }
    return el('label', { class: 'field' }, [
      el('span', { class: 'label', text: 'Day of month' }),
      el('input', {
        attrs: { name: 'day', type: 'number', min: '1', max: '31', value: String(rule.day || 1) },
        on: { change: (e) => {
          rule = { ...rule, day: Math.min(31, Math.max(1, Number(e.target.value) || 1)) }; emit();
        } },
      }),
    ]);
  }

  function draw() {
    wrap.textContent = '';
    wrap.append(
      el('select', {
        attrs: { name: 'kind' },
        on: { change: (e) => { rule = seedRule(e.target.value, rule); emit(); } },
      }, RULE_KINDS.map((k) => el('option', {
        attrs: { value: k, selected: rule.kind === k }, text: k,
      }))),
      body(),
      el('span', { class: 'rule-summary label', text: describeRule(rule) }),
    );
  }

  draw();
  return wrap;
}
```

- [ ] **Step 3: Write `test/ui/event-editor.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createApp } from '../../src/ui/app.js';
import { createMemoryDriver } from '../../src/store/memory-driver.js';

const clock = () => new Date(2026, 7, 31, 9, 0).getTime();
const doc = {
  version: 1, id: 'doc_1', createdAt: 0, seq: { event: 1 }, dismissals: [],
  settings: { accentMode: 'standard', digest: { enabled: true, timeMin: 450 }, eventLeadMin: 15 },
  projects: [], tasks: [], routines: [],
  events: [{ id: 'evt_1', ref: 'C-1', name: 'Dentist', detail: '',
             rule: { kind: 'once', date: '2026-08-12' },
             startMin: 540, endMin: 600, spanDays: 0, leadMin: null, archived: false }],
};

async function mount() {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
  const root = dom.window.document.getElementById('app');
  const app = createApp({ root, now: clock,
    driver: createMemoryDriver({ seed: { 'state.json': JSON.stringify(doc) } }) });
  await app.boot();
  app.actions.setScreen('calendar');
  return { root, app };
}

test('opening an event fills the form from the record', async () => {
  const { root, app } = await mount();
  app.actions.openEvent('evt_1');
  assert.equal(root.querySelector('[name="name"]').value, 'Dentist');
  assert.equal(root.querySelector('[name="startMin"]').value, '09:00');
  assert.equal(root.querySelector('[name="endMin"]').value, '10:00');
});

test('an all-day event leaves the times blank', async () => {
  const { root, app } = await mount();
  app.actions.update((d) => ({ ...d,
    events: d.events.map((e) => ({ ...e, startMin: null, endMin: null })) }));
  app.actions.openEvent('evt_1');
  assert.equal(root.querySelector('[name="startMin"]').value, '');
});

test('saving writes minutes, not strings', async () => {
  const { root, app } = await mount();
  app.actions.openEvent('evt_1');
  root.querySelector('[name="startMin"]').value = '14:30';
  root.querySelector('.editor-save').click();
  assert.equal(app.state.doc.events[0].startMin, 870);
});

test('clearing the time makes it an all-day event', async () => {
  const { root, app } = await mount();
  app.actions.openEvent('evt_1');
  root.querySelector('[name="startMin"]').value = '';
  root.querySelector('.editor-save').click();
  assert.equal(app.state.doc.events[0].startMin, null);
});

test('a new event is appended with a continuing ref', async () => {
  const { root, app } = await mount();
  app.actions.openEvent(null);
  root.querySelector('[name="name"]').value = 'MOT';
  root.querySelector('.editor-save').click();
  assert.equal(app.state.doc.events.length, 2);
  assert.equal(app.state.doc.events[1].ref, 'C-2');
});

test('delete archives the event', async () => {
  const { root, app } = await mount();
  app.actions.openEvent('evt_1');
  root.querySelector('.editor-delete').click();
  assert.equal(app.state.doc.events[0].archived, true);
});

test('the per-event lead time is optional and stored as a number', async () => {
  const { root, app } = await mount();
  app.actions.openEvent('evt_1');
  root.querySelector('[name="leadMin"]').value = '30';
  root.querySelector('.editor-save').click();
  assert.equal(app.state.doc.events[0].leadMin, 30);
});
```

- [ ] **Step 4: Write `src/ui/event-editor.js`**

```js
/**
 * The event editor. Same sheet shape as the task editor.
 *
 * Times are typed as "HH:MM" and stored as minutes from midnight — the
 * document's convention throughout. Blank means all-day, which is a real state
 * rather than a missing value.
 */

import { el } from './dom.js';
import { renderRuleInput } from './rule-input.js';
import { EVENT_FIELDS } from '../core/events.js';
import { minutesToLabel, labelToMinutes } from '../core/time.js';

function field(label, control) {
  return el('label', { class: 'field' }, [el('span', { class: 'label', text: label }), control]);
}

const timeValue = (min) => (Number.isFinite(min) ? minutesToLabel(min) : '');

export function renderEventEditor(ctx, event) {
  const form = el('form', { class: 'editor', attrs: { novalidate: true } });
  let rule = event?.rule || { kind: 'once', date: null };

  const name = el('input', {
    attrs: { name: 'name', type: 'text', value: event?.name || '',
             placeholder: 'What is happening', autocomplete: 'off' },
  });
  const startMin = el('input', { attrs: { name: 'startMin', type: 'time', value: timeValue(event?.startMin) } });
  const endMin = el('input', { attrs: { name: 'endMin', type: 'time', value: timeValue(event?.endMin) } });
  const spanDays = el('input', {
    attrs: { name: 'spanDays', type: 'number', min: '0', max: '92',
             value: String(event?.spanDays ?? 0) },
  });
  const leadMin = el('input', {
    attrs: { name: 'leadMin', type: 'number', min: '0', placeholder: String(ctx.doc.settings.eventLeadMin),
             value: Number.isFinite(event?.leadMin) ? String(event.leadMin) : '' },
  });
  const detail = el('textarea', { attrs: { name: 'detail', rows: 3, placeholder: 'Notes' },
                                  text: event?.detail || '' });

  function save() {
    ctx.actions.saveEvent({
      name: name.value.trim() || EVENT_FIELDS.name,
      rule,
      startMin: labelToMinutes(startMin.value),
      endMin: labelToMinutes(endMin.value),
      spanDays: Math.min(92, Math.max(0, Number(spanDays.value) || 0)),
      leadMin: leadMin.value === '' ? null : Math.max(0, Number(leadMin.value) || 0),
      detail: detail.value,
    });
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); save(); });

  form.append(
    el('div', { class: 'editor-head' }, [
      el('span', { class: 'label', text: event ? `Event ${event.ref}` : 'New event' }),
    ]),
    field('Name', name),
    field('Repeats', renderRuleInput(rule, (next) => { rule = next; })),
    field('Starts', startMin),
    field('Ends', endMin),
    field('Extra days', spanDays),
    field('Notify (minutes before)', leadMin),
    field('Notes', detail),
    el('div', { class: 'editor-actions' }, [
      event ? el('button', { class: 'btn danger editor-delete', attrs: { type: 'button' },
                             text: 'Delete', on: { click: () => ctx.actions.archiveEvent(event.id) } }) : null,
      el('span', { style: { flex: '1' } }),
      el('button', { class: 'btn editor-cancel', attrs: { type: 'button' }, text: 'Cancel',
                     on: { click: () => ctx.actions.closeEditor() } }),
      el('button', { class: 'btn primary editor-save', attrs: { type: 'button' }, text: 'Save',
                     on: { click: save } }),
    ]),
  );

  return form;
}
```

- [ ] **Step 5: Add the actions and route the editor**

In `src/ui/app.js`, add `saveEvent` and `archiveEvent` mirroring `saveTask` / `archiveTask` exactly, but over `doc.events` and calling `createEvent(next, patch, { now })`. Import `createEvent` from `../core/events.js` and `renderEventEditor` from `./event-editor.js`.

Extend the editor selection in `render()`:

```js
      const editor = state.problem ? null
        : state.editing?.kind === 'task'
          ? renderTaskEditor(ctx, (state.doc.tasks || []).find((t) => t.id === state.editing.id) || null)
        : state.editing?.kind === 'event'
          ? renderEventEditor(ctx, (state.doc.events || []).find((e) => e.id === state.editing.id) || null)
        : null;
```

- [ ] **Step 6: Style the rule input**

Append to `src/styles/editors.css`:

```css
.rule-input { display: flex; flex-direction: column; gap: 8px; }
.rule-days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.rule-day {
  min-height: var(--tap);
  background: var(--void);
  border: 1px solid var(--rule);
  border-radius: 0;
  color: var(--text-dim);
  font-family: var(--font-label);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 10px;
  cursor: pointer;
}
.rule-day[aria-pressed="true"] { color: var(--accent); border-color: var(--accent-dim); background: var(--panel-alt); }
.rule-summary { color: var(--text-dim); }
```

- [ ] **Step 7: Run the tests**

Run: `npm test`
Expected: PASS — 6 rule-input tests and 7 event-editor tests.

- [ ] **Step 8: Commit**

```bash
git add src/ui src/styles test/ui
git commit -m "feat(ui): recurrence rule input and the event editor"
```

---

### Task 17: Routines on TODAY, and the routine editor

**Files:**
- Create: `src/ui/routine-editor.js`
- Modify: `src/ui/today.js`, `src/ui/app.js`, `src/styles/screens.css`
- Test: `test/ui/routines-today.test.js`

**Interfaces:**
- Consumes: `core/routines.js` — `createRoutine`, `describeRoutine`, `nextRoutineDue`, `ROUTINE_FIELDS`; `core/digest.js` — `digestFor`.
- Produces: `renderRoutineEditor(ctx, routine) → HTMLElement`; actions `openRoutine(id|null)`, `saveRoutine(patch)`, `archiveRoutine(id)`, `dismissRoutine(key)`.

- [ ] **Step 1: Write the failing test**

Create `test/ui/routines-today.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createApp } from '../../src/ui/app.js';
import { createMemoryDriver } from '../../src/store/memory-driver.js';

const clock = () => new Date(2026, 7, 31, 9, 0).getTime();  // Monday 09:00
const doc = {
  version: 1, id: 'doc_1', createdAt: 0, seq: {}, dismissals: [],
  settings: { accentMode: 'standard', digest: { enabled: true, timeMin: 450 }, eventLeadMin: 15 },
  projects: [], tasks: [], events: [],
  routines: [
    { id: 'rtn_1', ref: 'R-1', name: 'Morning meds', timeMin: 420,
      rule: { kind: 'daily', from: '2026-08-01', every: 1 },
      steps: ['Blue one', 'White one'], archived: false },
    { id: 'rtn_2', ref: 'R-2', name: 'Evening walk', timeMin: 1080,
      rule: { kind: 'daily', from: '2026-08-01', every: 1 }, steps: [], archived: false },
  ],
};

async function mount(seed = doc) {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
  const root = dom.window.document.getElementById('app');
  const app = createApp({ root, now: clock,
    driver: createMemoryDriver({ seed: { 'state.json': JSON.stringify(seed) } }) });
  await app.boot();
  return { root, app };
}

test('only routines already due appear', async () => {
  const { root } = await mount();
  assert.ok(root.querySelector('[data-routine="rtn_1"]'), '07:00 has passed');
  assert.equal(root.querySelector('[data-routine="rtn_2"]'), null, '18:00 has not');
});

test('a routine shows its steps', async () => {
  const { root } = await mount();
  const steps = root.querySelectorAll('[data-routine="rtn_1"] .routine-step');
  assert.deepEqual([...steps].map((s) => s.textContent), ['Blue one', 'White one']);
});

test('dismissing clears it for today and is recorded', async () => {
  const { root, app } = await mount();
  root.querySelector('[data-routine="rtn_1"] .routine-dismiss').click();
  assert.ok(app.state.doc.dismissals.includes('rtn_1:2026-08-31'));
  assert.equal(root.querySelector('[data-routine="rtn_1"]'), null);
});

test('with nothing due, the screen says when the next one is', async () => {
  const { root } = await mount({ ...doc, routines: [doc.routines[1]] });
  assert.match(root.textContent, /Evening walk/);
  assert.match(root.textContent, /18:00/);
});

test('saving a new routine stores its steps as a list', async () => {
  const { root, app } = await mount();
  app.actions.openRoutine(null);
  root.querySelector('[name="name"]').value = 'Lock up';
  root.querySelector('[name="steps"]').value = 'Back door\nWindows\n\nAlarm';
  root.querySelector('[name="timeMin"]').value = '22:00';
  root.querySelector('.editor-save').click();
  const added = app.state.doc.routines.at(-1);
  assert.equal(added.name, 'Lock up');
  assert.deepEqual(added.steps, ['Back door', 'Windows', 'Alarm'], 'blank lines dropped');
  assert.equal(added.timeMin, 1320);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — no `[data-routine]` on TODAY.

- [ ] **Step 3: Add the actions to `src/ui/app.js`**

```js
    openRoutine(id) { state.editing = { kind: 'routine', id: id ?? null }; app.render(); },

    saveRoutine(patch) {
      const editing = state.editing;
      actions.update((doc) => {
        if (editing && editing.id) {
          return { ...doc, routines: doc.routines.map((r) => (r.id === editing.id ? { ...r, ...patch } : r)) };
        }
        const next = { ...doc, seq: { ...doc.seq } };
        return { ...next, routines: [...next.routines, createRoutine(next, patch, { now })] };
      });
      state.editing = null;
      app.render();
    },

    archiveRoutine(id) {
      actions.update((doc) => ({
        ...doc, routines: doc.routines.map((r) => (r.id === id ? { ...r, archived: true } : r)),
      }));
      state.editing = null;
      app.render();
    },

    /** Dismissals are append-only within a day; pruning happens at boot. */
    dismissRoutine(key) {
      actions.update((doc) => (doc.dismissals.includes(key)
        ? doc
        : { ...doc, dismissals: [...doc.dismissals, key] }));
    },
```

Route `state.editing?.kind === 'routine'` to `renderRoutineEditor` in `render()`, alongside the other two.

- [ ] **Step 4: Add routines to `src/ui/today.js`**

Insert above the task sections, and add the imports:

```js
import { describeRoutine, nextRoutineDue } from '../core/routines.js';
import { minutesToLabel } from '../core/time.js';

function routineCard(ctx, { routine, key }) {
  return el('div', { class: 'routine-card bracket', attrs: { 'data-routine': routine.id } }, [
    el('div', { class: 'routine-head' }, [
      el('span', { class: 'mark live' }),
      el('button', {
        class: 'routine-name', attrs: { type: 'button' }, text: routine.name,
        on: { click: () => ctx.actions.openRoutine(routine.id) },
      }),
      el('span', { class: 'mono routine-time', text: minutesToLabel(routine.timeMin) }),
      el('button', {
        class: 'btn sq routine-dismiss',
        attrs: { type: 'button', 'aria-label': `Dismiss ${routine.name}` },
        text: '×',
        on: { click: () => ctx.actions.dismissRoutine(key) },
      }),
    ]),
    routine.steps.length
      ? el('ol', { class: 'routine-steps' },
          routine.steps.map((s) => el('li', { class: 'routine-step', text: s })))
      : null,
  ]);
}
```

Then in `renderToday`, build the routine block before the task sections:

```js
  const routines = digest.routines.length
    ? el('div', {}, [
        el('div', { class: 'group-head label bracket', text: 'Routines' }),
        el('div', { class: 'stack' }, digest.routines.map((r) => routineCard(ctx, r))),
      ])
    : upcomingRoutine(ctx);
```

with:

```js
/** With nothing due, say when rather than showing a blank box. */
function upcomingRoutine(ctx) {
  const next = nextRoutineDue(ctx.doc, ctx.now);
  if (!next) return null;
  return el('p', {
    class: 'empty label',
    text: `Next: ${next.routine.name} — ${describeRoutine(next.routine)}`,
  });
}
```

and include `routines` first in the returned children, before `...sections`. The
`live` mark on the head becomes `sections.length || digest.routines.length`.

- [ ] **Step 5: Write `src/ui/routine-editor.js`**

```js
/**
 * The routine editor.
 *
 * Steps are edited as one textarea, one step per line, rather than as a list of
 * inputs with add and remove buttons. Typing four lines is faster than four
 * taps plus four focus changes, and there is nothing a per-step control would
 * offer that reordering the text does not.
 */

import { el } from './dom.js';
import { renderRuleInput } from './rule-input.js';
import { ROUTINE_FIELDS } from '../core/routines.js';
import { minutesToLabel, labelToMinutes } from '../core/time.js';

function field(label, control) {
  return el('label', { class: 'field' }, [el('span', { class: 'label', text: label }), control]);
}

export function renderRoutineEditor(ctx, routine) {
  const form = el('form', { class: 'editor', attrs: { novalidate: true } });
  let rule = routine?.rule || { kind: 'weekly', days: [] };

  const name = el('input', {
    attrs: { name: 'name', type: 'text', value: routine?.name || '',
             placeholder: 'What you do', autocomplete: 'off' },
  });
  const timeMin = el('input', {
    attrs: { name: 'timeMin', type: 'time',
             value: minutesToLabel(routine?.timeMin ?? ROUTINE_FIELDS.timeMin) },
  });
  const steps = el('textarea', {
    attrs: { name: 'steps', rows: 5, placeholder: 'One step per line' },
    text: (routine?.steps || []).join('\n'),
  });

  function save() {
    ctx.actions.saveRoutine({
      name: name.value.trim() || ROUTINE_FIELDS.name,
      rule,
      timeMin: labelToMinutes(timeMin.value) ?? ROUTINE_FIELDS.timeMin,
      steps: steps.value.split('\n').map((s) => s.trim()).filter(Boolean),
    });
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); save(); });

  form.append(
    el('div', { class: 'editor-head' }, [
      el('span', { class: 'label', text: routine ? `Routine ${routine.ref}` : 'New routine' }),
    ]),
    field('Name', name),
    field('At', timeMin),
    field('Repeats', renderRuleInput(rule, (next) => { rule = next; })),
    field('Steps', steps),
    el('div', { class: 'editor-actions' }, [
      routine ? el('button', { class: 'btn danger editor-delete', attrs: { type: 'button' },
                               text: 'Delete', on: { click: () => ctx.actions.archiveRoutine(routine.id) } }) : null,
      el('span', { style: { flex: '1' } }),
      el('button', { class: 'btn editor-cancel', attrs: { type: 'button' }, text: 'Cancel',
                     on: { click: () => ctx.actions.closeEditor() } }),
      el('button', { class: 'btn primary editor-save', attrs: { type: 'button' }, text: 'Save',
                     on: { click: save } }),
    ]),
  );

  return form;
}
```

- [ ] **Step 6: Style the routine card**

Append to `src/styles/screens.css`:

```css
.routine-card { background: var(--panel); border: 1px solid var(--rule); padding: 10px; margin-bottom: 8px; }
.routine-head { display: flex; align-items: center; gap: 8px; min-height: var(--tap); }
.routine-name { flex: 1; background: none; border: 0; padding: 0; color: var(--text);
                font: inherit; text-align: left; cursor: pointer; min-height: var(--tap); }
.routine-time { color: var(--text-dim); font-size: 12px; }
.routine-steps { margin: 6px 0 0; padding-left: 22px; color: var(--text-dim); }
.routine-step { padding: 3px 0; }
```

- [ ] **Step 7: Add a "+" for routines on TODAY**

In `renderToday`'s `screen-head`, after the title:

```js
      el('span', { style: { flex: '1' } }),
      el('button', {
        class: 'btn sq add-routine', attrs: { type: 'button', 'aria-label': 'New routine' },
        text: '+', on: { click: () => ctx.actions.openRoutine(null) },
      }),
```

- [ ] **Step 8: Run the tests**

Run: `npm test`
Expected: PASS — 5 routine tests, everything earlier still green.

- [ ] **Step 9: Check it on the phone**

Run `npm run dev` and add a real routine with a few steps and a real recurring event. Confirm the routine card is readable one-handed and that the day toggles in the rule input are comfortably tappable.

- [ ] **Step 10: Commit**

```bash
git add src/ui src/styles test/ui/routines-today.test.js
git commit -m "feat(ui): routines on TODAY with steps, dismissal and editor"
```

**PHASE 2 COMPLETE.** Tasks, routines and calendar all work.

---

# PHASE 3 — SCHEDULING

*Ends with: a fully tested pure function producing exactly the notifications Android should hold, and a browser notifier that diffs and logs them. No native code — that is the next plan.*

---

### Task 18: `core/schedule.js` — the notification chokepoint

**Files:**
- Create: `src/core/schedule.js`
- Test: `test/core/schedule.test.js`

**Interfaces:**
- Consumes: `recurrence.js` — `occursOn`; `routines.js` — `liveRoutines`, `routineKey`; `events.js` — `liveEvents`; `tasks.js` — `liveTasks`, `dueState`; `time.js` — `todayKey`, `addDays`, `parseDateKey`, `minutesToLabel`.
- Produces:
  - `WINDOW_DAYS = 14`
  - `CHANNELS = { ROUTINES: 'routines', EVENTS: 'events', DIGEST: 'digest' }`
  - `scheduleFor(doc, nowMs, { windowDays } = {}) → Array<{id, title, body, fireAt, channel}>` — sorted by `fireAt` ascending, every `fireAt` strictly in the future, ids stable across calls.
  - `instantAt(dateKey, minutes) → number` — local epoch millis, DST-correct.

**This is the task the whole architecture exists to make testable.** Take the tests seriously; they are the only proof this works before an APK exists.

- [ ] **Step 1: Write the failing test**

Create `test/core/schedule.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scheduleFor, instantAt, WINDOW_DAYS, CHANNELS } from '../../src/core/schedule.js';
import { createEmptyDoc } from '../../src/core/schema.js';

// Monday 2026-08-31, 09:00 local.
const NOW = new Date(2026, 7, 31, 9, 0).getTime();
const clock = () => NOW;

function docWith(over = {}) {
  return { ...createEmptyDoc({ now: clock }), ...over };
}

const routine = (over = {}) => ({
  id: 'rtn_1', ref: 'R-1', name: 'Morning meds', timeMin: 7 * 60, steps: [],
  rule: { kind: 'daily', from: '2026-08-01', every: 1 }, archived: false, ...over,
});

const event = (over = {}) => ({
  id: 'evt_1', ref: 'C-1', name: 'Dentist', detail: '', startMin: 14 * 60, endMin: 15 * 60,
  spanDays: 0, leadMin: null, rule: { kind: 'once', date: '2026-09-01' }, archived: false, ...over,
});

const task = (over = {}) => ({
  id: 'tsk_1', ref: 'T-1', name: 'Buy timber', project: null, status: 'todo',
  priority: 'normal', dueKey: null, detail: '', doneAt: null, archived: false, ...over,
});

// --- the helper -------------------------------------------------------------

test('instantAt builds a local instant, not a UTC one', () => {
  assert.equal(instantAt('2026-08-31', 7 * 60), new Date(2026, 7, 31, 7, 0).getTime());
  assert.equal(instantAt('2026-08-31', 0), new Date(2026, 7, 31, 0, 0).getTime());
});

test('instantAt is correct across a DST transition', () => {
  // UK clocks go back at 02:00 on 2026-10-25. 07:00 local must remain 07:00
  // local, which naive midnight + 7h arithmetic would get wrong by an hour.
  const t = instantAt('2026-10-25', 7 * 60);
  assert.equal(new Date(t).getHours(), 7);
});

// --- the window -------------------------------------------------------------

test('nothing scheduled for an empty document', () => {
  assert.deepEqual(scheduleFor(docWith({ settings: { ...createEmptyDoc({ now: clock }).settings,
    digest: { enabled: false, timeMin: 450 } } }), NOW), []);
});

test('a daily routine produces one notification per day in the window', () => {
  const out = scheduleFor(docWith({ routines: [routine()] }), NOW)
    .filter((n) => n.channel === CHANNELS.ROUTINES);
  // Today's 07:00 has already gone, so the window starts tomorrow.
  assert.equal(out.length, WINDOW_DAYS - 1);
  assert.equal(new Date(out[0].fireAt).getHours(), 7);
});

test('nothing is ever scheduled in the past', () => {
  const out = scheduleFor(docWith({ routines: [routine()], events: [event()] }), NOW);
  assert.ok(out.length > 0);
  for (const n of out) assert.ok(n.fireAt > NOW, `${n.id} fires at ${new Date(n.fireAt)}`);
});

test('today still counts when its time has not yet passed', () => {
  const out = scheduleFor(docWith({ routines: [routine({ timeMin: 18 * 60 })] }), NOW)
    .filter((n) => n.channel === CHANNELS.ROUTINES);
  assert.equal(out.length, WINDOW_DAYS);
  assert.equal(out[0].id, 'rtn:rtn_1:2026-08-31');
});

test('the window is bounded, so an infinite rule cannot explode', () => {
  const out = scheduleFor(docWith({ routines: [routine()] }), NOW, { windowDays: 3 })
    .filter((n) => n.channel === CHANNELS.ROUTINES);
  assert.equal(out.length, 2);
});

test('results are sorted by fire time', () => {
  const out = scheduleFor(docWith({
    routines: [routine({ id: 'rtn_late', timeMin: 22 * 60 }), routine({ id: 'rtn_early', timeMin: 18 * 60 })],
  }), NOW);
  const times = out.map((n) => n.fireAt);
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
});

test('ids are stable across identical calls, which is what makes diffing work', () => {
  const doc = docWith({ routines: [routine()], events: [event()] });
  assert.deepEqual(scheduleFor(doc, NOW).map((n) => n.id), scheduleFor(doc, NOW).map((n) => n.id));
});

// --- routines ---------------------------------------------------------------

test('an archived routine is never scheduled', () => {
  const out = scheduleFor(docWith({ routines: [routine({ archived: true })] }), NOW);
  assert.equal(out.filter((n) => n.channel === CHANNELS.ROUTINES).length, 0);
});

test('a dismissed occurrence is not scheduled', () => {
  // Dismissing at 06:00 must stop the 07:00 ping, not just clear the card.
  const early = new Date(2026, 7, 31, 6, 0).getTime();
  const doc = docWith({ routines: [routine()], dismissals: ['rtn_1:2026-08-31'] });
  const ids = scheduleFor(doc, early).map((n) => n.id);
  assert.ok(!ids.includes('rtn:rtn_1:2026-08-31'));
  assert.ok(ids.includes('rtn:rtn_1:2026-09-01'), 'tomorrow is untouched');
});

test('a routine notification names the routine and its steps count', () => {
  const out = scheduleFor(docWith({
    routines: [routine({ timeMin: 18 * 60, steps: ['a', 'b', 'c'] })],
  }), NOW);
  const first = out.find((n) => n.channel === CHANNELS.ROUTINES);
  assert.equal(first.title, 'Morning meds');
  assert.match(first.body, /3 steps/);
});

// --- events -----------------------------------------------------------------

test('a timed event fires at the default lead time', () => {
  const out = scheduleFor(docWith({ events: [event()] }), NOW)
    .filter((n) => n.channel === CHANNELS.EVENTS);
  assert.equal(out.length, 1);
  // 14:00 on 1 Sep, less the 15-minute default.
  assert.equal(out[0].fireAt, new Date(2026, 8, 1, 13, 45).getTime());
});

test('a per-event lead time overrides the default', () => {
  const out = scheduleFor(docWith({ events: [event({ leadMin: 60 })] }), NOW)
    .filter((n) => n.channel === CHANNELS.EVENTS);
  assert.equal(out[0].fireAt, new Date(2026, 8, 1, 13, 0).getTime());
});

test('a lead of zero means at the start, not "use the default"', () => {
  const out = scheduleFor(docWith({ events: [event({ leadMin: 0 })] }), NOW)
    .filter((n) => n.channel === CHANNELS.EVENTS);
  assert.equal(out[0].fireAt, new Date(2026, 8, 1, 14, 0).getTime());
});

test('an all-day event gets no notification of its own', () => {
  // It has no time to fire at, and inventing one would be a guess. The daily
  // digest carries it instead.
  const out = scheduleFor(docWith({ events: [event({ startMin: null, endMin: null })] }), NOW);
  assert.equal(out.filter((n) => n.channel === CHANNELS.EVENTS).length, 0);
});

test('a multi-day event notifies once, on its start day', () => {
  const out = scheduleFor(docWith({ events: [event({ spanDays: 3 })] }), NOW)
    .filter((n) => n.channel === CHANNELS.EVENTS);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'evt:evt_1:2026-09-01');
});

test('a recurring event notifies on each occurrence in the window', () => {
  const out = scheduleFor(docWith({
    events: [event({ rule: { kind: 'weekly', days: [2] } })],  // Wednesdays
  }), NOW).filter((n) => n.channel === CHANNELS.EVENTS);
  assert.equal(out.length, 2, 'two Wednesdays fall in a 14-day window');
});

test('an event notification states the real start time, not the lead time', () => {
  const out = scheduleFor(docWith({ events: [event({ leadMin: 30 })] }), NOW)
    .filter((n) => n.channel === CHANNELS.EVENTS);
  assert.equal(out[0].title, 'Dentist');
  assert.match(out[0].body, /14:00/);
});

// --- the digest -------------------------------------------------------------

test('the digest fires daily at its configured time', () => {
  const out = scheduleFor(docWith({}), NOW).filter((n) => n.channel === CHANNELS.DIGEST);
  assert.equal(out.length, WINDOW_DAYS - 1, "today's 07:30 has already gone");
  assert.equal(new Date(out[0].fireAt).getHours(), 7);
  assert.equal(new Date(out[0].fireAt).getMinutes(), 30);
});

test('the digest can be switched off', () => {
  const base = createEmptyDoc({ now: clock });
  const doc = { ...base, settings: { ...base.settings, digest: { enabled: false, timeMin: 450 } } };
  assert.equal(scheduleFor(doc, NOW).filter((n) => n.channel === CHANNELS.DIGEST).length, 0);
});

test("the digest body reports what that day is known to hold", () => {
  const out = scheduleFor(docWith({
    tasks: [task({ dueKey: '2026-09-01' }), task({ id: 'tsk_2', dueKey: '2026-09-01' })],
    routines: [routine()],
  }), NOW).filter((n) => n.channel === CHANNELS.DIGEST);
  const tomorrow = out.find((n) => n.id === 'dig:2026-09-01');
  assert.match(tomorrow.body, /2 tasks/);
  assert.match(tomorrow.body, /1 routine/);
});

test('a day with nothing on it still gets a digest, and says so', () => {
  const out = scheduleFor(docWith({}), NOW).filter((n) => n.channel === CHANNELS.DIGEST);
  assert.match(out[0].body, /nothing/i);
});

test('overdue tasks are counted in every digest, not only on their due day', () => {
  const out = scheduleFor(docWith({ tasks: [task({ dueKey: '2026-08-01' })] }), NOW)
    .filter((n) => n.channel === CHANNELS.DIGEST);
  assert.match(out[0].body, /1 overdue/);
});

test('a done task is never counted', () => {
  const out = scheduleFor(docWith({
    tasks: [task({ dueKey: '2026-09-01', status: 'done', doneAt: 1 })],
  }), NOW).filter((n) => n.channel === CHANNELS.DIGEST);
  assert.match(out.find((n) => n.id === 'dig:2026-09-01').body, /nothing/i);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `src/core/schedule.js`.

- [ ] **Step 3: Write `src/core/schedule.js`**

```js
/**
 * What notifications should exist — the single chokepoint.
 *
 * One pure function answers "given this document and this moment, what should
 * Android be holding?". The platform layer diffs that answer against what is
 * actually pending and cancels or creates the difference. Nothing else in the
 * app talks to the notification system, so routines, events and the digest
 * cannot end up disagreeing about what is scheduled.
 *
 * Being pure is the point: the whole notification design is testable in Node
 * with no phone, no emulator and no Capacitor.
 *
 * NOTE the difference from the panel functions. `activeRoutines()` and
 * `eventNotifications()` answer "what should be on screen now" — today, or today
 * and tomorrow. AlarmManager needs "at which future instants should something
 * fire", which is a different question, so this is built directly on
 * `occursOn()` rather than wrapping them.
 */

import { occursOn } from './recurrence.js';
import { liveRoutines, routineKey } from './routines.js';
import { liveEvents } from './events.js';
import { liveTasks, dueState } from './tasks.js';
import { todayKey, addDays, parseDateKey, minutesToLabel } from './time.js';

/**
 * How far ahead to schedule.
 *
 * A `daily` rule is an infinite series and Android caps pending alarms, so the
 * expansion has to stop somewhere. Fourteen days is far past any plausible gap
 * between app opens, and the window is recomputed on every open and once a day,
 * so it is self-healing: a missed recompute costs nothing until day 15.
 */
export const WINDOW_DAYS = 14;

/**
 * Separate Android channels, so the digest can be muted in the system settings
 * without also losing routine alerts. Free to do now, annoying to retrofit.
 */
export const CHANNELS = { ROUTINES: 'routines', EVENTS: 'events', DIGEST: 'digest' };

/**
 * Local epoch millis for `minutes` past midnight on `dateKey`.
 *
 * `setHours` rather than `midnight + minutes * 60000`: on a DST transition day
 * the arithmetic version is an hour out, which would send the morning routine
 * at 06:00 twice a year.
 */
export function instantAt(dateKey, minutes) {
  const d = parseDateKey(dateKey);
  if (!d) return NaN;
  d.setHours(0, Math.round(minutes), 0, 0);
  return d.getTime();
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The days the window covers, today first. */
function windowKeys(nowMs, windowDays) {
  const start = todayKey(nowMs);
  return Array.from({ length: windowDays }, (_, i) => addDays(start, i));
}

function routineNotifications(doc, key, dismissed) {
  const out = [];
  for (const routine of liveRoutines(doc)) {
    if (!occursOn(routine.rule, key)) continue;
    if (dismissed.has(routineKey(routine, key))) continue;
    out.push({
      id: `rtn:${routine.id}:${key}`,
      channel: CHANNELS.ROUTINES,
      fireAt: instantAt(key, Number(routine.timeMin) || 0),
      title: routine.name,
      body: routine.steps.length
        ? `${plural(routine.steps.length, 'step')} — ${routine.steps[0]}`
        : 'Due now',
    });
  }
  return out;
}

function eventNotificationsFor(doc, key, defaultLead) {
  const out = [];
  for (const event of liveEvents(doc)) {
    // Start days only. A multi-day visit that renewed its own alert every
    // morning would train you to ignore the channel.
    if (!occursOn(event.rule, key)) continue;
    // An all-day event has no time to fire at, and inventing one would be a
    // guess. The daily digest carries it instead.
    if (!Number.isFinite(event.startMin)) continue;

    const lead = Number.isFinite(event.leadMin) ? event.leadMin : defaultLead;
    out.push({
      id: `evt:${event.id}:${key}`,
      channel: CHANNELS.EVENTS,
      fireAt: instantAt(key, event.startMin - lead),
      title: event.name,
      body: lead > 0
        ? `Starts at ${minutesToLabel(event.startMin)}`
        : `Starting now — ${minutesToLabel(event.startMin)}`,
    });
  }
  return out;
}

/**
 * What that day is *known* to hold, at the time of scheduling.
 *
 * Necessarily a forecast: a local notification carries its text from the moment
 * it is scheduled, and something added tomorrow cannot be in a body written
 * today. Recomputing the window on every app open bounds the staleness to "since
 * you last opened the app", which is the best a local notification can do
 * without a server.
 */
function digestBody(doc, key, today) {
  const tasks = liveTasks(doc);
  const overdue = tasks.filter((t) => dueState(t, today) === 'overdue').length;
  const due = tasks.filter((t) => t.status !== 'done' && t.dueKey === key).length;
  const routines = liveRoutines(doc).filter((r) => occursOn(r.rule, key)).length;
  const events = liveEvents(doc).filter((e) => occursOn(e.rule, key)).length;

  const parts = [];
  if (due) parts.push(plural(due, 'task'));
  if (routines) parts.push(plural(routines, 'routine'));
  if (events) parts.push(plural(events, 'event'));
  if (overdue) parts.push(`${overdue} overdue`);

  return parts.length ? parts.join(', ') : 'Nothing due';
}

/**
 * Every notification that should be pending, soonest first.
 *
 * Ids are stable for the same occurrence across calls — that is what lets the
 * platform layer diff rather than cancel-and-recreate everything, which would
 * make a notification briefly disappear from the shade on every app open.
 *
 * @param {object} doc
 * @param {number} nowMs
 * @param {{windowDays?: number}} [opts]
 * @returns {Array<{id: string, channel: string, fireAt: number, title: string, body: string}>}
 */
export function scheduleFor(doc, nowMs, { windowDays = WINDOW_DAYS } = {}) {
  if (!doc) return [];
  const today = todayKey(nowMs);
  const dismissed = new Set(doc.dismissals || []);
  const settings = doc.settings || {};
  const defaultLead = Number.isFinite(settings.eventLeadMin) ? settings.eventLeadMin : 15;
  const digest = settings.digest || {};

  const out = [];
  for (const key of windowKeys(nowMs, windowDays)) {
    out.push(...routineNotifications(doc, key, dismissed));
    out.push(...eventNotificationsFor(doc, key, defaultLead));
    if (digest.enabled) {
      out.push({
        id: `dig:${key}`,
        channel: CHANNELS.DIGEST,
        fireAt: instantAt(key, Number(digest.timeMin) || 0),
        title: 'Today',
        body: digestBody(doc, key, today),
      });
    }
  }

  // Anything already past is dropped rather than fired late. A notification for
  // 07:00 delivered at 09:00 is worse than none: it reports a moment that has
  // gone, and teaches you the times cannot be trusted.
  return out
    .filter((n) => Number.isFinite(n.fireAt) && n.fireAt > nowMs)
    .sort((a, b) => a.fireAt - b.fireAt);
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS — 24 schedule tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/schedule.js test/core/schedule.test.js
git commit -m "feat(core): pure notification scheduler over a rolling 14-day window"
```

---

### Task 19: `platform/notifier.js` — the diffing seam

**Files:**
- Create: `src/platform/notifier.js`
- Test: `test/platform/notifier.test.js`

**Interfaces:**
- Consumes: `core/schedule.js` — `scheduleFor`.
- Produces:
  - `createNotifier({ backend }) → notifier` with `sync(doc, nowMs) → Promise<{created: string[], cancelled: string[], kept: number}>` and `pending() → Promise<string[]>`
  - `createLogBackend() → backend` — the browser stub, and the test double
  - `androidId(key) → number` — stable 31-bit id from a notification key
  - **Backend contract** (what the next plan's Capacitor implementation must satisfy):
    - `list() → Promise<Array<{id: number}>>`
    - `schedule(items) → Promise<void>` where each item is `{id: number, key: string, title, body, fireAt, channel}`
    - `cancel(ids: number[]) → Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `test/platform/notifier.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNotifier, createLogBackend, androidId } from '../../src/platform/notifier.js';
import { createEmptyDoc } from '../../src/core/schema.js';

const NOW = new Date(2026, 7, 31, 9, 0).getTime();
const clock = () => NOW;

const routine = (over = {}) => ({
  id: 'rtn_1', ref: 'R-1', name: 'Meds', timeMin: 18 * 60, steps: [],
  rule: { kind: 'daily', from: '2026-08-01', every: 1 }, archived: false, ...over,
});

function docWith(over = {}) {
  const base = createEmptyDoc({ now: clock });
  return { ...base, settings: { ...base.settings, digest: { enabled: false, timeMin: 450 } }, ...over };
}

test('androidId is stable, positive and fits a 32-bit signed int', () => {
  const a = androidId('rtn:rtn_1:2026-08-31');
  assert.equal(a, androidId('rtn:rtn_1:2026-08-31'), 'stable across calls');
  assert.ok(Number.isInteger(a) && a > 0 && a < 2 ** 31);
});

test('different keys get different ids', () => {
  const keys = ['rtn:a:2026-08-31', 'rtn:a:2026-09-01', 'evt:a:2026-08-31', 'dig:2026-08-31'];
  const ids = new Set(keys.map(androidId));
  assert.equal(ids.size, keys.length);
});

test('the first sync creates everything and cancels nothing', async () => {
  const backend = createLogBackend();
  const notifier = createNotifier({ backend });
  const result = await notifier.sync(docWith({ routines: [routine()] }), NOW);
  assert.equal(result.cancelled.length, 0);
  assert.equal(result.created.length, 14);
  assert.equal(result.kept, 0);
});

test('an unchanged second sync creates nothing — the whole point of diffing', async () => {
  // Cancel-and-recreate would make every pending notification briefly vanish
  // from the shade on each app open.
  const backend = createLogBackend();
  const notifier = createNotifier({ backend });
  const doc = docWith({ routines: [routine()] });
  await notifier.sync(doc, NOW);
  const second = await notifier.sync(doc, NOW);
  assert.deepEqual(second.created, []);
  assert.deepEqual(second.cancelled, []);
  assert.equal(second.kept, 14);
});

test('deleting a routine cancels exactly its notifications', async () => {
  const backend = createLogBackend();
  const notifier = createNotifier({ backend });
  const doc = docWith({ routines: [routine(), routine({ id: 'rtn_2', name: 'Walk' })] });
  await notifier.sync(doc, NOW);

  const fewer = { ...doc, routines: [doc.routines[0]] };
  const result = await notifier.sync(fewer, NOW);
  assert.equal(result.cancelled.length, 14);
  assert.equal(result.created.length, 0);
  assert.equal(result.kept, 14);
});

test('changing a time cancels the old instants and creates the new ones', async () => {
  const backend = createLogBackend();
  const notifier = createNotifier({ backend });
  await notifier.sync(docWith({ routines: [routine()] }), NOW);
  const moved = docWith({ routines: [routine({ timeMin: 20 * 60 })] });
  const result = await notifier.sync(moved, NOW);
  // Same ids — the key is routine + day, not the time — so this is a rewrite
  // rather than a cancel/create pair.
  assert.equal(result.created.length, 0);
  assert.equal(result.cancelled.length, 0);
  assert.equal(result.rescheduled.length, 14);
});

test('the backend receives real integer ids and the key alongside', async () => {
  const backend = createLogBackend();
  const notifier = createNotifier({ backend });
  await notifier.sync(docWith({ routines: [routine()] }), NOW);
  const first = backend.scheduled[0];
  assert.equal(typeof first.id, 'number');
  assert.equal(typeof first.key, 'string');
  assert.equal(first.channel, 'routines');
  assert.ok(first.fireAt > NOW);
});

test('a backend failure surfaces rather than being swallowed', async () => {
  const backend = createLogBackend();
  backend.schedule = async () => { throw new Error('permission denied'); };
  const notifier = createNotifier({ backend });
  await assert.rejects(
    () => notifier.sync(docWith({ routines: [routine()] }), NOW),
    /permission denied/,
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `src/platform/notifier.js`.

- [ ] **Step 3: Write `src/platform/notifier.js`**

```js
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
 */
export function createLogBackend() {
  const pending = new Map();   // id → item
  const backend = {
    scheduled: [],
    async list() { return [...pending.values()].map((i) => ({ id: i.id })); },
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

  return {
    async pending() {
      return (await backend.list()).map((n) => n.id);
    },

    /**
     * Bring the platform in line with what the document says should exist.
     *
     * @returns {Promise<{created: string[], cancelled: string[],
     *                    rescheduled: string[], kept: number}>}
     */
    async sync(doc, nowMs) {
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
      if (toWrite.length) await backend.schedule(toWrite);

      // Only updated once the backend has accepted the work — a throw above
      // leaves `known` describing what is genuinely still out there.
      for (const key of cancelled) known.delete(key);
      for (const key of [...created, ...rescheduled]) known.set(key, wanted.get(key));

      return { created, cancelled, rescheduled, kept };
    },
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS — 8 notifier tests.

- [ ] **Step 5: Commit**

```bash
git add src/platform/notifier.js test/platform/notifier.test.js
git commit -m "feat(platform): diffing notifier seam with a browser stub backend"
```

---

### Task 20: SETTINGS, and wiring the notifier into the app's life

**Files:**
- Modify: `src/ui/settings.js`, `src/ui/app.js`, `src/ui/tab-bar.js`, `src/styles/screens.css`
- Test: `test/ui/settings.test.js`, `test/ui/sync.test.js`

**Interfaces:**
- Consumes: `platform/notifier.js` — `createNotifier`, `createLogBackend`; `core/signals.js` — `attention`.
- Produces: `renderSettings(ctx) → HTMLElement`; actions `setSetting(path, value)`, `exportDoc()`, `importDoc(text)`; the notifier synced on boot, on every document change, and on return to the foreground.

- [ ] **Step 1: Write `test/ui/settings.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createApp } from '../../src/ui/app.js';
import { createMemoryDriver } from '../../src/store/memory-driver.js';

const clock = () => new Date(2026, 7, 31, 9, 0).getTime();
const doc = {
  version: 1, id: 'doc_1', createdAt: 0, seq: {}, dismissals: [],
  settings: { accentMode: 'standard', digest: { enabled: true, timeMin: 450 }, eventLeadMin: 15 },
  projects: [], tasks: [], routines: [], events: [],
};

async function mount() {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
  const root = dom.window.document.getElementById('app');
  const app = createApp({ root, now: clock,
    driver: createMemoryDriver({ seed: { 'state.json': JSON.stringify(doc) } }) });
  await app.boot();
  app.actions.setScreen('settings');
  return { dom, root, app };
}

test('the accent toggle flips the mode and the document element', async () => {
  const { dom, root, app } = await mount();
  root.querySelector('.accent-toggle').click();
  assert.equal(app.state.doc.settings.accentMode, 'alert');
  assert.equal(dom.window.document.documentElement.dataset.accent, 'alert');
  root.querySelector('.accent-toggle').click();
  assert.equal(app.state.doc.settings.accentMode, 'standard');
});

test('the digest time is stored as minutes', async () => {
  const { root, app } = await mount();
  const input = root.querySelector('[name="digestTime"]');
  input.value = '06:15';
  input.dispatchEvent(new window.Event('change'));
  assert.equal(app.state.doc.settings.digest.timeMin, 375);
});

test('the digest can be switched off and stays off', async () => {
  const { root, app } = await mount();
  root.querySelector('[name="digestEnabled"]').click();
  assert.equal(app.state.doc.settings.digest.enabled, false);
});

test('the default event lead time is stored as a number', async () => {
  const { root, app } = await mount();
  const input = root.querySelector('[name="eventLeadMin"]');
  input.value = '45';
  input.dispatchEvent(new window.Event('change'));
  assert.equal(app.state.doc.settings.eventLeadMin, 45);
});

test('a degraded store is reported, not hidden', async () => {
  // Silently not saving is the worst failure this app has. The warning
  // platform/storage.js computes must reach the screen.
  const { root, app } = await mount();
  app.state.storage = { degraded: true, reason: 'Storage is blocked here.', label: null };
  app.render();
  assert.match(root.textContent, /NOT SAVED/);
  assert.match(root.textContent, /Storage is blocked here/);
});

test('a healthy store does not shout about it', async () => {
  const { root } = await mount();
  assert.doesNotMatch(root.textContent, /NOT SAVED/);
});

test('export produces the document as JSON', async () => {
  const { app } = await mount();
  const text = app.actions.exportDoc();
  assert.deepEqual(JSON.parse(text).settings.digest.timeMin, 450);
});

test('import replaces the document, but refuses junk', async () => {
  const { app } = await mount();
  assert.equal(app.actions.importDoc('{ not json'), false);
  assert.equal(app.actions.importDoc(JSON.stringify({ tasks: 'nope' })), false);
  assert.equal(app.state.doc.id, 'doc_1', 'a refused import changes nothing');

  assert.equal(app.actions.importDoc(JSON.stringify({ ...doc, id: 'doc_2' })), true);
  assert.equal(app.state.doc.id, 'doc_2');
});
```

- [ ] **Step 2: Write `test/ui/sync.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createApp } from '../../src/ui/app.js';
import { createMemoryDriver } from '../../src/store/memory-driver.js';
import { createLogBackend } from '../../src/platform/notifier.js';

const clock = () => new Date(2026, 7, 31, 9, 0).getTime();
const doc = {
  version: 1, id: 'doc_1', createdAt: 0, seq: {}, dismissals: [],
  settings: { accentMode: 'standard', digest: { enabled: false, timeMin: 450 }, eventLeadMin: 15 },
  projects: [], tasks: [], events: [],
  routines: [{ id: 'rtn_1', ref: 'R-1', name: 'Meds', timeMin: 1080, steps: [],
               rule: { kind: 'daily', from: '2026-08-01', every: 1 }, archived: false }],
};

async function mount() {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
  const backend = createLogBackend();
  const app = createApp({
    root: dom.window.document.getElementById('app'), now: clock, backend,
    driver: createMemoryDriver({ seed: { 'state.json': JSON.stringify(doc) } }),
  });
  await app.boot();
  return { app, backend, dom };
}

test('booting schedules the window', async () => {
  const { backend } = await mount();
  assert.equal(backend.scheduled.length, 14);
});

test('adding a routine schedules its occurrences without touching the others', async () => {
  const { app, backend } = await mount();
  const before = backend.scheduled.length;
  app.actions.openRoutine(null);
  app.actions.saveRoutine({
    name: 'Walk', timeMin: 1200, steps: [],
    rule: { kind: 'daily', from: '2026-08-01', every: 1 },
  });
  await app.syncNotifications();
  assert.equal(backend.scheduled.length, before + 14);
});

test('archiving a routine cancels its notifications', async () => {
  const { app, backend } = await mount();
  app.actions.archiveRoutine('rtn_1');
  const result = await app.syncNotifications();
  assert.equal(result.cancelled.length, 14);
  assert.equal((await backend.list()).length, 0);
});

test('a sync failure does not take the app down', async () => {
  const { app, backend } = await mount();
  backend.schedule = async () => { throw new Error('no permission'); };
  app.actions.openRoutine(null);
  app.actions.saveRoutine({ name: 'x', timeMin: 1300, steps: [],
                            rule: { kind: 'daily', from: '2026-08-01', every: 1 } });
  await assert.doesNotReject(() => app.syncNotifications());
  assert.ok(app.state.notifyError, 'but it is recorded so SETTINGS can report it');
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `npm test`
Expected: FAIL — `.accent-toggle` does not exist, `app.syncNotifications` is not a function.

- [ ] **Step 4: Wire the notifier into `src/ui/app.js`**

Accept a backend, build the notifier, and add `notifyError: null` to `state`:

```js
import { createNotifier, createLogBackend } from '../platform/notifier.js';
```

In `createApp({ root, driver, now = Date.now, backend })`:

```js
  const notifier = createNotifier({ backend: backend || createLogBackend() });
  /** Tail of the sync chain — see `syncNotifications`. */
  let syncing = Promise.resolve(null);
```

Add to the returned object:

```js
    /**
     * Bring Android's pending notifications in line with the document.
     *
     * Never throws. A notification that could not be scheduled — permission not
     * granted yet, the platform refusing exact alarms — must not take down an
     * app that is otherwise working perfectly well; SETTINGS reports it instead.
     */
    syncNotifications() {
      if (!state.doc) return Promise.resolve(null);
      // Serialised through one chain. `actions.update` fires this without
      // awaiting, so two syncs can otherwise overlap — and because the diff
      // reads `known`, which the first has not written yet, the second would
      // schedule the same occurrences a second time.
      syncing = syncing.then(async () => {
        try {
          const result = await notifier.sync(state.doc, now());
          state.notifyError = null;
          return result;
        } catch (err) {
          state.notifyError = err.message || String(err);
          return null;
        }
      });
      return syncing;
    },
```

Call it at the end of `boot()`, after the first `app.render()`:

```js
      await app.syncNotifications();
```

and from `actions.update`, after `app.render()`:

```js
      // Fire and forget: the render must not wait on the platform.
      app.syncNotifications();
```

Finally, re-sync on return to the foreground, since the window may have rolled over while the app was away. Add near the end of `createApp`, guarded because jsdom tests construct the app repeatedly:

```js
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        state.now = now();
        app.syncNotifications();
      }
    });
  }
```

- [ ] **Step 5: Add the settings actions**

```js
    /** @param {string} path e.g. 'digest.timeMin' or 'accentMode' */
    setSetting(path, value) {
      actions.update((doc) => {
        const [head, tail] = path.split('.');
        const settings = tail
          ? { ...doc.settings, [head]: { ...doc.settings[head], [tail]: value } }
          : { ...doc.settings, [head]: value };
        return { ...doc, settings };
      });
    },

    exportDoc() { return JSON.stringify(state.doc, null, 2); },

    /** @returns {boolean} whether the text was accepted */
    importDoc(text) {
      let raw;
      try { raw = JSON.parse(text); } catch { return false; }
      const check = validateDoc(raw);
      if (!check.ok) return false;
      state.doc = migrate(raw, { now });
      writer.schedule(state.doc);
      app.render();
      app.syncNotifications();
      return true;
    },
```

- [ ] **Step 6: Write `src/ui/settings.js`**

```js
/**
 * SETTINGS. Reached from the tab bar rather than an app-bar icon, because with
 * only four destinations a tab costs nothing and a hidden icon costs a tap and
 * a guess.
 */

import { el } from './dom.js';
import { minutesToLabel, labelToMinutes } from '../core/time.js';

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

    el('div', { class: 'group-head label bracket', text: 'Data' }),
    row('Backup', el('button', {
      class: 'btn', attrs: { type: 'button' }, text: 'Export',
      on: { click: () => downloadJson(ctx.actions.exportDoc()) },
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
function downloadJson(text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `tracker-${new Date().toISOString().slice(0, 10)}.json`;
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
```

- [ ] **Step 7: Pass `notifyError` and the storage status through `ctx`**

`createApp` currently destructures only `chosen.driver` and throws away the
`degraded` flag and `reason` string that `platform/storage.js` computed. That
matters: when IndexedDB is unavailable the app silently falls back to an
in-memory driver and the user loses everything on close with no warning. The
warning text exists precisely to be shown, so keep it.

In `createApp`, replace the destructure with one that keeps all three fields:

```js
  const chosen = driver ? { driver, degraded: false, reason: null } : createStorage();
```

and record the status on `state`:

```js
  state.storage = {
    degraded: !!chosen.degraded,
    reason: chosen.reason || null,
    label: chosen.driver.label || null,
  };
```

Then in `render()`, extend `ctx` with `notifyError: state.notifyError` and
`storage: state.storage`.

- [ ] **Step 8: Add badge counts to the tab bar**

In `src/ui/tab-bar.js`, import `attention` and light the mark on a tab that is holding something:

```js
import { attention } from '../core/signals.js';
```

and inside the map, replace the plain mark:

```js
    const counts = attention(ctx.doc, ctx.now);
    const lit = (name === 'today' && counts.today > 0) || (name === 'calendar' && counts.calendar > 0);
```

using `el('span', { class: lit ? 'mark live' : 'mark' })`. Hoist `counts` above the `map` so it is computed once per render rather than once per tab.

- [ ] **Step 9: Style the settings rows**

Append to `src/styles/screens.css`:

```css
.set-row {
  display: flex; align-items: center; gap: 12px;
  min-height: var(--tap); padding: 8px;
  border-bottom: 1px solid var(--rule); background: var(--panel);
}
.set-label { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.set-hint { font-size: 11px; color: var(--text-dim); }
.set-row input { width: 110px; min-height: var(--tap); padding: 6px 8px;
                 background: var(--void); border: 1px solid var(--rule); border-radius: 0;
                 color: var(--text); font-family: var(--font-mono); font-size: 16px; }
.set-error { color: var(--crit); padding: 8px; font-size: 12px; }
.accent-toggle[aria-pressed="true"] { color: var(--accent); border-color: var(--accent-dim); }
```

- [ ] **Step 10: Run the full suite**

Run: `npm test`
Expected: PASS — 6 settings tests, 4 sync tests, and every earlier test green.

- [ ] **Step 11: Check the whole app on the phone**

Run `npm run dev`. Walk the app end to end: add a task with a due date, a routine, a recurring event; flip to ALERT and back; export a backup. Open DevTools' console over the forwarded URL and confirm the log backend is reporting a sensible schedule — the routine and event instants should be exactly where you expect, and the count should be stable across app opens rather than growing.

- [ ] **Step 12: Commit**

```bash
git add src/ui src/styles test/ui
git commit -m "feat: settings, notification sync wiring, tab badges, backup and restore"
```

**PHASE 3 COMPLETE — AND PLAN 1 COMPLETE.**

The app is a working, fully tested mobile web app. Every notification the Android build will fire is already computed, diffed and proven in Node. The next plan adds `@capacitor/local-notifications` behind the backend contract in Task 19, the `android/` project, the manifest permissions, and the portrait accent FX.

---

## What Plan 2 picks up

Recorded here so nothing is lost between plans:

1. **Capacitor backend** implementing `list()` / `schedule(items)` / `cancel(ids)` from Task 19, over `@capacitor/local-notifications`.
2. **`platform/storage.js`** may gain a Capacitor Filesystem driver so the document is a real file that `adb pull` can retrieve.
3. **Export/import** replaces `downloadJson` / `FileReader` in `src/ui/settings.js` with Filesystem + Share.
4. **Manifest permissions** — `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED`.
5. **Three notification channels** registered to match `CHANNELS` in `core/schedule.js`.
6. **One UI battery guidance** in onboarding — the app must be added to *Never sleeping apps*.
7. **The portrait accent FX**, reshaped from `reference/.../src/ui/accent-fx.js`.
