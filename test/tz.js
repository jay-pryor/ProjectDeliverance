/**
 * Pin the timezone for the whole test suite.
 *
 * Almost every date rule in this app is about LOCAL calendar components versus
 * UTC — and in a UTC container those tests are vacuous, because the two agree.
 * A `toISOString()` regression, or a DST-naive `midnight + minutes` calculation,
 * passes silently. Running in a zone that is offset from UTC and observes DST
 * makes both classes of bug actually fail a test.
 *
 * Loaded via `--import` rather than a `TZ=` prefix so it works on Windows too,
 * where `npm test` runs through cmd and inline env assignment does not.
 */
process.env.TZ = 'Europe/London';
