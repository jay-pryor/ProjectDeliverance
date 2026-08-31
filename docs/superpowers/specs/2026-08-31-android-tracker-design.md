# Design — TRACKER for Android

**Date:** 2026-08-31
**Status:** approved design, not yet implemented
**Target device:** Samsung Galaxy A73 5G (One UI, Android 12 → 14, 120Hz Super AMOLED Plus, 1080×2400)

## The question

Can the personal-use subset of the PC task tracker in
`reference/2026-08-16-task-tracker/` become a sideloaded Android app with real
scheduled notifications — reminders that fire on the lock screen with the app
closed — while keeping the HTML/CSS/JS the PC app is written in?

## Decision: Capacitor, not a PWA

**An installed PWA on Android cannot schedule a local notification for later.**
The API for it (Notification Triggers, `TimestampTrigger`) was a Chrome origin
trial that never shipped and was withdrawn. A PWA can only raise a notification
while its service worker is awake, which in practice means a server push. For a
single-user offline tracker, standing up a push service with VAPID keys to
deliver "routine due at 09:00" is disproportionate and adds a network dependency
to an app that otherwise needs none.

Capacitor wraps the same web app in an Android WebView and produces a real
sideloadable APK. `@capacitor/local-notifications` sits on Android's
`AlarmManager`, so notifications fire with the app closed and survive reboot.

Rejected alternatives:

- **PWA** — see above. Fails the primary requirement.
- **Native Kotlin/Compose rewrite** — discards a working, well-factored codebase
  to solve a problem Capacitor already solves.
- **Tauri v2 mobile** — plausible, but a less mature Android notification story
  than Capacitor's, for no benefit here.

## Scope

### In

| Area | What it is |
|---|---|
| **Tasks** | Two levels: project → task. Name, status, due date, priority, notes. |
| **Routines** | Recurring obligations with printed steps, appearing at their time. |
| **Calendar** | One-off and recurring events, including multi-day, in a month view. |
| **Notifications** | Routines at their time; events at a lead time; one daily digest. |
| **Accent modes** | STANDARD / ALERT token swap, with the full transition FX. |

### Out

Cut deliberately, because this is a personal tracker rather than a work one:

- **Week grid / timesheet** — drag-to-create 15-minute blocks, confirm-week,
  transcription panel, contracted hours. The most work-oriented feature and the
  worst fit for touch.
- **The deep hierarchy** — opportunity, effort and subtask levels. Two levels
  only.
- **The property and views system** — user-defined fields, saved views, filters,
  sorts, colour rules. The single largest body of code in the reference, and
  awkward to configure on a phone.
- **Portfolio tree, relationship map, Gantt/plan, insights and charts, lessons,
  check-ins, attachments.**
- **Outlook import** — `core/cfb.js` (Compound File Binary reader), `core/
  appointment.js`, `core/msg-recurrence.js`, `ui/calendar-drop.js`. Self-contained;
  deleted outright.
- **Teams links** — the `teamsLink` event field and `isHttpsTeamsLink()`.

### Explicitly not in scope, but designed for

A **budget module**, harvested from a separate existing app, to be added later.
It is not built here. The architecture must accept it as a peer of tasks,
routines and calendar without restructuring — see "Extensibility" below.

### Data

**Completely standalone.** No sync with the PC tracker, no shared document, no
cloud account, no network permission. The phone holds the only copy, with manual
JSON export/import as the backup path.

## Architecture

```
src/
├── core/            pure domain logic — no DOM, no Capacitor, no I/O
│   ├── ids.js           harvested verbatim
│   ├── time.js          harvested verbatim
│   ├── recurrence.js    harvested verbatim  ◄ drives events AND scheduling
│   ├── routines.js      harvested, trimmed
│   ├── events.js        harvested, minus teamsLink
│   ├── tasks.js         new — project → task, no properties, no views
│   ├── schedule.js      new — the notification chokepoint
│   └── schema.js        new — trimmed document shape + migration
├── store/           harvested near-verbatim; FSA driver deleted
├── platform/        the ONLY folder that knows Capacitor exists
│   ├── notifier.js      native impl + browser stub
│   └── storage.js       Capacitor Filesystem impl + IndexedDB stub
└── ui/              new — mobile-first, touch-first
```

Three load-bearing properties:

**`platform/` is the only Capacitor-aware folder.** Everything above it is plain
web code. In a browser, `notifier.js` resolves to a stub that logs instead of
scheduling, so the entire app runs and is developable with no Android toolchain
present. This is what makes the browser-first development loop viable and what
keeps the deferred APK work cheap.

**`core/schedule.js` is a single chokepoint.** Rather than routines, events and
the digest each doing their own notification bookkeeping, one pure function
answers *"given this document and this moment, what notifications should
exist?"*:

```
scheduleFor(doc, now) → [{ id, title, body, fireAt, channel }]
```

`platform/notifier.js` diffs that desired list against what Android currently has
pending, then cancels what is gone and creates what is new. Pure function in,
native calls out. The consequence is that the three notification sources cannot
disagree about state, and the whole of the notification logic is testable in Node
with no phone, no emulator and no Capacitor — the same reasoning that made the
reference app's single `derive(state, now)` work.

**Domain modules are peers.** `tasks`, `routines` and `calendar` each own one
top-level key in the document and each contribute to `schedule.js` through the
same small interface.

### Extensibility

The future budget module is a fifth document key, a new `core/budget.js`, and a
new tab. If it needs to notify, it implements the same contributor interface that
routines and events already use and inherits scheduling, diffing, channels and
reboot survival unchanged. Nothing above it moves.

## The document

One JSON file:

```js
{
  version: 1, id, createdAt,
  settings: {
    accentMode: 'standard',           // | 'alert'
    digest: { enabled: true, time: '07:30' },
    eventLeadMin: 15,                 // default; per-event override
  },
  projects: [{ id, name, colour, archived }],
  tasks:    [{ id, name, project, status, due, priority, notes, archived, doneAt }],
  routines: [{ id, name, rule, time, steps: [], archived }],
  events:   [{ id, name, dateKey, time, endTime, span, rule, notes, leadMin, archived }],
  dismissed: { /* notificationKey → timestamp; clears one occurrence from TODAY
                  for the rest of the day without archiving the record itself */ },
}
```

`rule` on routines and events is `recurrence.js`'s existing shape, unchanged:
`once` / `daily` / `weekly` / `monthly`. Status is `todo` / `doing` / `done`.
Priority is `low` / `normal` / `high`.

Every collection carries `archived`; nothing is hard-deleted. This matters more
on a phone than on a desktop because there is no keyboard undo stack to fall back
on after a mis-tap.

`migrate()` runs on every load and must be safe to apply to an already-current
document, following the reference's pattern.

## Notifications

### What fires

- **Routines** — at their scheduled time, repeating per their rule.
- **Events** — at `leadMin` before start, defaulting to `settings.eventLeadMin`.
  Multi-day events fire on the first day only.
- **Daily digest** — one notification at `settings.digest.time` summarising what
  is due today.

Per-task reminders are deliberately **not** included; tasks reach you through the
digest. This keeps the notification volume low enough that the notifications stay
worth reading.

### Rolling 14-day window

A `daily` routine is an infinite series and Android caps pending alarms, so
`scheduleFor` expands recurrence rules only 14 days ahead. The window is
recomputed on every app open and once per day. It is bounded, self-healing, and a
missed recompute costs nothing until day 15.

### Android specifics

- **Three notification channels** — Routines, Events, Digest — registered
  separately, so the digest can be muted in Android's own settings without losing
  routine alerts. Free now, annoying to retrofit.
- **`POST_NOTIFICATIONS`** runtime permission, requested on first launch.
  Required on Android 13+, which includes this device.
- **`SCHEDULE_EXACT_ALARM`** declared, so alarms do not drift. Sideloading avoids
  the Play Store's restriction on it.
- **`RECEIVE_BOOT_COMPLETED`**, since alarms do not persist across a restart.
- **One UI battery management.** Samsung is more aggressive than stock Android
  and will delay or drop alarms. The app must be added to
  Settings → Battery → Background usage limits → *Never sleeping apps*. This is a
  documented device setting, not a code fix; onboarding should say so plainly.

### Accepted risk

Notification behaviour is being verified late rather than through an upfront
spike, at the user's decision (2026-08-31). The mitigations are that One UI's
behaviour is well documented and settings-fixable, and that the `platform/` seam
means introducing Capacitor is filling in one file rather than restructuring. If
the device proves hostile, the fix is expected to be device settings and
manifest flags, not architecture.

## Screens

Four, with navigation at the bottom where thumbs are.

- **TODAY** — the home screen and the app's centre of gravity. Routines due now
  with their steps, today's events on a time spine, tasks due today or overdue.
  This is the daily digest rendered as a screen; the notification is a pointer to
  it.
- **TASKS** — grouped by project, collapsible. Swipe right to complete,
  long-press to open. Filter chips for project and status, in place of a saved
  views system.
- **CALENDAR** — month grid, tap a day for its events. Compact enough that a
  month fits without scrolling.
- **SETTINGS** — reached from the app bar, not a tab. Digest time, default lead
  time, notification permission state, accent mode, export/import.

## Visual design

`reference/ui-design.md` applies in full: near-monochrome dark instrument panel,
one accent, hairlines rather than shadows, chamfered or square corners, IBM Plex
Sans Condensed for labels, IBM Plex Mono with tabular numerals for all figures,
mechanical motion at 80–160ms.

Four phone-specific adaptations:

1. **44px minimum touch targets**, even where the density guidance would say
   tighter. Density is achieved through type scale and hairlines, not by shrinking
   hit areas below what a thumb can hit.
2. **IBM Plex is bundled with the app**, not fetched from Google Fonts. An offline
   app cannot rely on a stylesheet request.
3. **Safe-area insets** (`env(safe-area-inset-*)`) respected for the status bar
   and the gesture bar.
4. The palette's `--void: #0A0C10` is a genuine advantage on this device's AMOLED
   panel rather than merely an aesthetic choice.

### Accent modes and the transition FX

`settings.accentMode` switches `--accent` `#57C7E3` → `#FF5A47` and `--accent-dim`
`#2A6B7D` → `#7A2E24`. Nothing else moves: surfaces, text and the semantic set
stay put, so "this is live" and "this is wrong" remain distinguishable signals.
The toggle lives in the app bar.

The full transition sequence from `reference/.../src/ui/accent-fx.js` is ported —
band wipe, hazard conveyor, two CRT retraces, wash, strobing bracket frame, word
plate — preserving its beats (`BAND_MS 620`, `ACCENT_FLIP_MS 205`, `WORD_MS 190`,
`TOTAL_MS 1250`). It is **reshaped for portrait** rather than copied:

- The band wipe traverses the **long axis** (vertical). A horizontal wipe crosses
  only ~1080px of a 20:9 portrait screen and reads as a flicker rather than a
  traversal.
- The word plate restacks for a narrow column.
- The bracket frame insets to the safe area rather than the viewport edge.
- **Compositor-only** — `transform` and `opacity` exclusively, no layout or paint
  in the animated path. The A73's 120Hz panel gives an 8.3ms frame budget and the
  Exynos 1280 will not forgive layout thrash.
- `prefers-reduced-motion` skips the sequence outright and flips the tokens
  instantly, following the reference's own precedent for infinite and long-running
  animations.

The FX layer is appended once to `document.body` and driven by its own timers,
outside the app's render cycle, so an unrelated re-render cannot tear it down
mid-sequence. This is the reason the reference structures it that way and the
constraint holds here.

## Build

esbuild, many small modules, one command — as the reference does, including
`build.js`'s **400-line-per-file cap** that warns before any file becomes a
monolith.

One deliberate divergence. The reference inlines everything into a single
`dist/index.html` because ES modules are blocked by CORS on `file://` and the
artifact had to open by double-click on a locked-down machine. **Neither
constraint exists here** — Capacitor serves from `capacitor://localhost`, a real
origin. So the build emits a normal `www/` (`index.html` + `app.js` + `app.css`)
**with source maps**, which means remote-debugging the phone over
`chrome://inspect` shows the original modules rather than one large inlined blob.

The generated `android/` Gradle project is **committed**, not gitignored, because
`AndroidManifest.xml` is hand-edited for the notification permissions above and
must not be regenerable-away.

## Development loops

**Loop A — layout and interaction.** The web build served from the dev
environment, opened in Chrome on the phone over a forwarded HTTPS URL. No cable,
no Android SDK, no APK. Covers everything except the native notification layer.
This is where the majority of the work happens.

**Loop B — the APK.** Requires a local machine with JDK 17, the Android SDK and
`adb`; a Codespace cannot see a USB device. `npm install && npx cap sync android
&& npx cap run android`. `chrome://inspect/#devices` then attaches full DevTools
to the WebView inside the installed app. `npx cap run android --livereload
--external` points that WebView at a dev server for a tight loop, and
`adb reverse tcp:5173 tcp:5173` carries it over the cable.

## Testing

- **`core/` is pure and tested in Node** with `node --test` — recurrence
  expansion, `scheduleFor` output, document migration, task and routine
  operations. No browser required.
- **`store/` is tested against the memory driver**, as the reference does; that
  driver exists precisely because the real ones cannot be driven headlessly.
- **`platform/` is tested through its stubs**, with the native path verified by
  hand on the device.
- **UI** is checked in Loop A on the real handset.

## Implementation phases

Ordered so that something runnable exists early and the riskiest integration is
isolated in one phase rather than threaded through all of them.

0. **Skeleton.** Build pipeline (esbuild, line cap, source maps, `www/` output),
   `tokens.css` including both accent palettes, app shell with the bottom tab
   bar, `store/` with the IndexedDB driver, empty document and `migrate()`.
   Runs in a browser; shows four empty screens.
1. **Tasks.** `core/tasks.js`, projects, the TASKS screen, and the task portion
   of TODAY.
2. **Routines and calendar.** Harvest `recurrence.js`, `routines.js` and
   `events.js`; build the CALENDAR screen and the routine portion of TODAY.
3. **Scheduling.** `core/schedule.js` and the browser stub notifier. Fully
   tested in Node; observable in the console. No native code yet.
4. **Capacitor.** `platform/` native implementations, the `android/` project,
   manifest permissions, the three channels, boot receiver. First real APK, and
   the first time notifications fire on the device.
5. **Accent FX.** The portrait-reshaped transition sequence. Last because it is
   polish and because it depends on a stable shell.

The STANDARD/ALERT token swap itself lands in phase 0 with the rest of the
palette; only the transition sequence waits for phase 5.

## Open questions

None blocking. The budget module's own shape is deferred to its own design.
