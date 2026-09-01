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
  assert.ok(block, 'an [data-accent=alert] block must exist');
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

/**
 * Every rule in `css` whose selector list contains `selector` as a whole
 * compound — `.tab` matches `.tab` but not `.tab-bar` and not
 * `.tab[aria-current=page]`, which is a state, not the base control.
 */
function rulesFor(css, selector) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const parts = m[1].split(',').map((p) => p.trim());
    if (parts.includes(selector)) out.push(m[2]);
  }
  return out;
}

test('every tappable control declares the 44px touch-target floor', async () => {
  // Asserted against the stylesheet, not the DOM. jsdom does not lay out, so a
  // rendered element reports no height at all and a DOM test can only restate
  // the class it selected by — which is what the test this replaces did, and
  // why deleting `min-height: var(--tap)` left the suite green. --tap is 44px,
  // pinned by the palette tests above.
  const css = await readFile(CSS, 'utf8');
  // Either form is a floor: .task-check is a fixed 44x44 square rather than a
  // row that grows, so it sets `height` where the others set `min-height`.
  const floor = /(?:min-)?height:\s*var\(--tap\)/;
  for (const selector of ['.tab', '.task-check', '.chip', '.seg-btn', '.btn']) {
    const bodies = rulesFor(css, selector);
    assert.ok(bodies.length, `${selector} must exist in the stylesheet`);
    assert.ok(bodies.some((body) => floor.test(body)),
      `${selector} must declare a var(--tap) height floor — 44px is the spec's `
      + 'headline rule and this is the only test that checks it');
  }
});

test('--tap really is 44px', async () => {
  // The rule above is worth nothing if the token drifts.
  const css = await readFile(CSS, 'utf8');
  assert.match(css, /--tap:\s*44px/);
});
