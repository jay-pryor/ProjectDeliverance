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
