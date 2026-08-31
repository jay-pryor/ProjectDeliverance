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
  const block = /\[data-accent="alert"\][^{]*\{([^}]*)\}/.exec(css);
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
