import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

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

test('watch mode starts without crashing', async () => {
  // Regression guard. `npm run dev` is the phone-testing loop, and it lives on
  // a code path the one-shot build tests never touch — which is exactly how a
  // broken watch entry point shipped once already.
  const child = spawn('node', ['build/build.js', '--watch'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  const exitCode = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 3000);
    child.on('exit', (code) => { clearTimeout(timer); resolve(code); });
  });
  child.kill('SIGTERM');

  assert.equal(exitCode, null, `watch exited early with code ${exitCode}\n${stderr}`);
  assert.doesNotMatch(stderr, /TypeError|is not a function/);
});
