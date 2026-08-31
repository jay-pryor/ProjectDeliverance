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
