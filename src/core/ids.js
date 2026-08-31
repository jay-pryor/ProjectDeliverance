/**
 * Identifier generation.
 *
 * Deliberately avoids `Math.random()` so a seeded clock produces a reproducible
 * sequence and tests can assert on real ids rather than matching patterns.
 */

let counter = 0;

/** Opaque unique id, e.g. "blk_ldx9f2a007". */
export function makeId(prefix = 'id', now = Date.now) {
  counter = (counter + 1) % 46656;
  return `${prefix}_${now().toString(36)}${counter.toString(36).padStart(3, '0')}`;
}

/**
 * Short reference, e.g. "T-14". No longer shown anywhere in the UI — it once
 * appeared on rows and tooltips, but a bare number answered no question a
 * person actually had. Still generated and stored: the data model keeps one
 * per record, in case something needs a stable short handle for it later.
 */
export function nextRef(doc, kind, letter) {
  if (!doc.seq) doc.seq = {};
  const n = (doc.seq[kind] || 0) + 1;
  doc.seq[kind] = n;
  return `${letter}-${n}`;
}

/** Test-only: make id sequences reproducible across runs. */
export function __resetCounter() { counter = 0; }
