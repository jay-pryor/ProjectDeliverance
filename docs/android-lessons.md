# Building an Android app from a web app — lessons

Notes from wrapping a web app into a sideloaded Android app with Capacitor.
Everything here is general: none of it depends on what the app does.

Each entry says *why*, because the reasoning transfers even when the specific
API does not.

---

## 1. The decision that comes first: PWA or native wrapper

**An installed PWA on Android cannot schedule a local notification for later.**

The API for it — Notification Triggers, `TimestampTrigger` — was a Chrome origin
trial that never shipped and was withdrawn. A PWA can only raise a notification
while its service worker is awake, which in practice means a server push. If your
app needs to remind someone of something at a time, with the app closed, and you
do not want to run a push server, a PWA cannot do it.

That single fact decides the architecture. Everything else — offline storage,
home-screen install, full-screen chrome — a PWA does fine.

If you don't need scheduled notifications, prefer the PWA. It is dramatically
less work than what follows.

---

## 2. Notifications on Android

This is where nearly all the sharp edges are.

### Channels are immutable after first creation

Importance, vibration, sound and lock-screen visibility are frozen when a channel
is first created. Changing the code afterwards does nothing — the only way to
change them is to uninstall the app, which takes the user's data with it.

**Get channels right before the first install anyone keeps.** Write them down
deliberately, and put a test on the values so the intent is pinned:

- **Importance 4 (HIGH)** — makes a sound and shows a heads-up banner.
- **Importance 3 (DEFAULT)** — makes a sound, no banner.
- **`vibration`** defaults to **off** in at least one popular plugin. If you want
  a reminder to be felt in a pocket, set it explicitly. This is the easiest
  irreversible mistake to make.

Use **more than one channel** if your app has more than one kind of notification.
Separate channels are what let a user mute the chatty kind in Android's own
settings without losing the important kind. This cannot be retrofitted: a
notification's channel is fixed when it is posted, so alarms already scheduled
under one channel stay there.

### Three permissions, and they are not interchangeable

| Permission | Why |
|---|---|
| `POST_NOTIFICATIONS` | Required at runtime from Android 13. Without it the app is silent, with no error. |
| `SCHEDULE_EXACT_ALARM` | Lets you ask for exact timing. **The user must grant it.** |
| `USE_EXACT_ALARM` | Grants exact timing outright at install. Restricted by Play *policy* — which does not apply to a sideloaded app. |
| `RECEIVE_BOOT_COMPLETED` | Re-arm alarms after a reboot; they do not survive one by themselves. |

If you are sideloading, `USE_EXACT_ALARM` saves the user hunting through
*Settings → Apps → … → Alarms & reminders*. Without exact alarms your 09:00
reminder can arrive at 09:15, which quietly teaches people the times cannot be
trusted.

**Check what your plugin's own manifest already declares.** Android merges
library manifests into the app's, so a good notification plugin may supply most
of these and a boot receiver too. Redeclaring them is noise; assuming they are
missing wastes an afternoon.

### `allowWhileIdle` is not optional

Without it, at least one plugin schedules a **non-wakeup** alarm, and Doze defers
it to the next maintenance window — which on a phone left alone overnight can be
hours. Set it for anything that must arrive at a particular time.

Note the cost: `setExactAndAllowWhileIdle` is throttled in Doze (documented as
roughly once every nine minutes per app), so two alarms landing close together
overnight may not both be punctual.

### "Pending" may not mean pending

At least one plugin's `getPending()` returns **every saved notification record,
including ones already delivered** — cancelling a delivered notification marks it
rather than deleting it. If you use that list to reconcile state, you will
re-adopt and re-cancel already-fired notifications on every launch, forever.

Check what your plugin actually filters. There is usually a call that means what
you wanted (`getAll({ state: 'SCHEDULED' })` in that plugin's case).

### Notification ids are 32-bit ints — plan for that

Your domain almost certainly identifies things with strings. Android wants a
signed 32-bit integer. So you need a hash, and it must be:

- **stable across releases** — an id that changes between versions orphans every
  alarm the previous version scheduled, and you can never cancel them;
- **one-way is fine, but then you cannot map ids back to meaning.**

That last point has a consequence people miss, below.

### You cannot reconcile after a restart unless you plan for it

If your app tracks what it has scheduled in memory only, then on a cold start it
knows nothing — and "cancel what is no longer wanted" silently cancels nothing.
Delete a recurring item, close the app, reopen it, and its alarms keep firing
forever for something that no longer exists.

**Round-trip your own identifier through the notification's `extra` payload**, so
that on startup you can read back what the platform is holding and adopt it. The
integer ids alone will not do, because the hash is one-way.

Two details worth copying:

- Adopt entries with a **null payload**, so anything still wanted is simply
  re-scheduled over itself (harmless — the same id replaces the alarm) and
  anything no longer wanted is cancelled.
- **Skip records with no identifier of yours.** Something scheduled by native
  code is not yours to cancel. Failing safe here is the right direction.

### The plugin may request permission behind your back

At least one plugin's `schedule()` requests `POST_NOTIFICATIONS` itself if it is
not yet granted. If your own startup code is also requesting it, two dialogs race
through one bridge and the loser returns an empty result — producing a spurious
failure or a spurious "user declined".

Worse, that plugin **rejects the entire `schedule()` call** when notifications are
disabled. If your first sync happens during that window and nothing retries, a
first launch where the user grants permission and then does nothing can end with
**no alarms scheduled at all**.

**Order your startup explicitly.** Channels and permissions must complete before
the first schedule. Firing both and hoping is not ordering — gate the first
schedule on a promise.

### Set a status-bar icon

With no `smallIcon` configured, notifications show a stock Android glyph.
It needs to be a **monochrome** drawable (Android tints it); a full-colour app
icon renders as a white blob.

### OEM battery management will break you, and it is not a code fix

Samsung's One UI, Xiaomi, OnePlus, Huawei and others are more aggressive than
stock Android and will delay or kill scheduled alarms regardless of your
permissions.

The user must add the app to the vendor's allowlist — on Samsung, *Settings →
Battery → Background usage limits → Never sleeping apps.* **Tell them this during
onboarding.** Otherwise it looks like your app is broken, and it is the single
most common cause of "notifications don't work".

---

## 3. Time and dates — the bugs that hide

### Never build a date key with `toISOString()`

`toISOString()` returns UTC. If you slice a `"YYYY-MM-DD"` out of it, then for
anyone whose local time is on the other side of midnight from UTC, you get the
wrong day. Build date keys from **local** calendar components.

### `setHours` beats arithmetic across DST

For "07:00 on this day", use `d.setHours(0, minutes, 0, 0)` — not
`midnight + minutes * 60_000`. On a DST transition day the arithmetic version is
an hour out, so a morning reminder arrives an hour early twice a year.

### Store times as integers, not strings

Minutes from local midnight. It sorts, compares and arithmetics cleanly, and it
avoids a whole family of parse bugs. Convert to `"HH:MM"` only at the edges.

### Never schedule anything in the past

A reminder for 07:00 delivered at 09:00 is worse than none: it reports a moment
that has gone, and teaches the user that the times are unreliable. Filter them
out at the point of scheduling.

---

## 4. Testing — the part that surprised us most

### Run your test suite in a timezone that is not UTC

**This is the single most valuable thing in this document.** CI containers run in
UTC. In UTC:

- every "local components, not UTC" test is **vacuous**, because the two answers
  are identical — the exact bug the test exists to catch passes silently;
- every DST test is **vacuous**, because UTC has no DST.

We had both. Breaking the DST calculation left the entire suite green.

Pin a zone that is offset from UTC *and* observes DST. Load it before the tests
run, and **add a guard test asserting the zone**, so nobody silently loses the
coverage later:

```js
// test/tz.js — loaded with `node --import ./test/tz.js --test …`
process.env.TZ = 'Europe/London';
```

Prefer `--import` over a `TZ=` shell prefix if anyone will run the suite on
Windows, where inline env assignment does not work through `cmd`.

Then check your fixtures actually *cross* a boundary in that zone. A late-evening
local time in a UTC+1 zone still agrees with UTC — it proves nothing.

### A green test is not evidence. Mutation is.

Over this project, **seven** tests were found that passed against broken code:
the DST one, the local-date one, a flush-ordering one (the fake was too fast for
the race to exist), a digest one (the fixture satisfied both the right and wrong
answer), a touch-target one (it asserted that elements selected by a class had
that class), and two more.

The method that found them: **break the implementation in the specific way the
test claims to guard against, and confirm that test fails.** If it stays green,
the test is decorative. Do this for every test you actually care about — not all
of them, but certainly the ones standing in for something you cannot otherwise
verify.

### Your fake must not be able to certify code the real thing would reject

If you test a platform integration against a fake, the fake's **shapes** are the
whole basis of the claim. Ours echoed back more fields than the real plugin
returns, so it would have happily validated code the real plugin breaks.

Model the projection, not just the storage: return exactly the fields the real
API returns, in the types it returns them.

### Read the API definitions. Do not write from memory.

We shipped a call to an API that had been removed three major versions earlier.
It broke the dev server, and the tests did not catch it because they never
exercised that path.

Both times we went and read the actual `.d.ts` — and once the plugin's **Kotlin
source** — we found things the TypeScript alone did not tell us: that `getPending`
returns delivered records, that vibration defaults to off, that `schedule()`
requests permission itself.

---

## 5. The web layer on a phone

Small things, each of which is obvious afterwards.

- **`font-size: 16px` on form inputs.** Anything smaller makes Chrome on Android
  zoom the page when the field takes focus — jarring, and hard to undo one-handed.
- **`100dvh`, not `100vh`.** Chrome collapses its URL bar on scroll; `vh` does not
  account for it, so a bottom bar ends up cropped or floating.
- **`viewport-fit=cover` plus `env(safe-area-inset-*)`.** Without the meta tag the
  insets report zero, and your content sits under the status bar or the gesture
  pill.
- **`visibilitychange`, not `beforeunload`.** `beforeunload` does not fire on
  mobile at all. Android can kill a backgrounded WebView without warning, so
  `visibilitychange → hidden` is your last reliable chance to flush state — and
  whatever you do there must actually complete before it resolves.
- **Navigation belongs at the bottom.** Thumbs do not reach the top of a modern
  phone.
- **44px minimum touch targets**, and do not waive it for "small" controls in a
  header row.
- **Test on the real device early.** An emulator will not tell you whether a
  control is comfortable one-handed.

---

## 6. Architecture that paid for itself

### One seam for everything platform-specific

Put every host-aware call behind a single folder with a plain interface, and give
that interface a **stub implementation for the browser**.

The payoff is large: the entire app — including all of the notification
scheduling logic — stays developable and testable with no Android toolchain
present at all. We built and proved every notification the app would ever fire
before the first APK existed.

### Make the scheduling logic a pure function

`schedule(document, now) → [{id, fireAt, title, body, channel}]`, with no I/O and
the clock passed in. The platform layer diffs that against what is actually
pending and creates or cancels the difference.

This means the hard part — recurrence, lead times, DST, "never in the past" — is
testable in plain Node, and the untestable part is reduced to a thin adapter.

### Diff; do not cancel-and-recreate

Rewriting every alarm on each app open makes pending notifications briefly
disappear from the shade, which users notice. Diffing needs stable ids per
occurrence, which is why the id scheme above matters.

### Never let notification failure take the app down

Permission refused, exact alarms denied, a bridge not ready — none of these mean
the app is broken. Record the reason, show it somewhere the user can find it, and
carry on.

Two traps we hit:

- **A nullish rejection.** `err.message` on `throw null` throws *inside* your
  catch handler, before you record anything. Guard it: `(err && err.message) || String(err ?? 'Unknown')`.
- **A poisoned promise chain.** If you serialise operations through
  `chain = chain.then(fn)` and the chain head ever rejects, every later `.then(fn)`
  **skips `fn` entirely** and re-propagates. One failure disables the feature for
  the rest of the session, silently. Attach your handler to both settle paths and
  keep the chain head un-rejected.

### Serialise operations that read shared state

If two syncs can overlap, and each diffs against state the other has not written
yet, they will both schedule the same thing. Chain them.

---

## 7. Toolchain and packaging

- **JDK 17 specifically.** Newer JDKs break the Android Gradle Plugin. This is
  also the thing most likely to be blocked on an IT-managed machine.
- **`adb` installs APKs; it does not build them.** Building needs the SDK
  platform and build-tools. `platform-tools` alone is only enough if someone
  hands you a finished APK.
- **You do not need the full IDE.** `cmdline-tools` plus `sdkmanager` will fetch
  just the SDK platform, build-tools and platform-tools — a few hundred MB
  instead of several GB.
- **Generate a release keystore before the first install you keep.** Debug builds
  cannot be updated in place; replacing one means uninstalling, and uninstalling
  takes the app's data with it. Back the keystore up — losing it means you can
  never update that app again.
- **Your web build output is probably git-ignored**, so a fresh clone cannot run
  `cap sync` until it has built. Add a script that does both.
- **Scaffolding does not need the SDK.** `cap add android` is file generation and
  runs anywhere; only the Gradle build needs the toolchain.
- **Commit the generated `android/` project** if you hand-edit its manifest —
  otherwise your edits are one regeneration away from vanishing.
- **Watch the APK for accidental weight.** Self-hosted font packages ship every
  subset — Cyrillic, Greek, Vietnamese — and both `.woff` and `.woff2`. Ours was
  788KB across 60 files where six would have done.

### Testing on a phone without any of the above

A cloud dev environment cannot see a USB device — but it can forward a port. Open
the forwarded URL in the phone's browser and you get the real app at real size on
real glass, with no SDK, no cable and no APK. That covers layout, interaction and
anything that is not platform-specific, which is most of the work.

Once the APK is installed, `chrome://inspect/#devices` gives full DevTools
attached to the WebView **inside the running app** — the real thing, not a
simulation.

---

## 8. Storage

- **IndexedDB in a browser is evictable. Inside a WebView it is app-private** and
  cleared only by uninstalling or clearing app data. Same API, materially
  different guarantee — treat data as disposable while testing in the browser,
  and as real once it is an installed app.
- **Save on a short debounce and flush on backgrounding.** The OS can kill a
  backgrounded WebView without warning, so the flush must genuinely complete
  before it resolves.
- **Keep rolling snapshots if the data matters.** Cheap, and it protects against
  the user breaking their own data — which no amount of correctness protects
  against.
- **A phone-only app means the phone holds the only copy.** Snapshots don't help
  with a lost handset. Provide an export.
