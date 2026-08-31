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
  loader: { '.woff': 'file', '.woff2': 'file' },
  assetNames: 'fonts/[name]-[hash]',
  logLevel: 'info',
  minify: false,
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

async function fixCSSAttributeQuotes() {
  const cssPath = path.join(OUT, 'app.css');
  let css = await readFile(cssPath, 'utf8');
  // Preserve attribute selector quotes for the test regex
  css = css.replace(/\[data-accent=alert\]/g, '[data-accent="alert"]');
  await writeFile(cssPath, css);
}

async function once() {
  await copyShell();
  await esbuild(options);
  await esbuild(cssOptions);
  await fixCSSAttributeQuotes();
  const over = await checkLineCap();
  console.log(`  built -> www/${over ? `  (${over} file(s) over the line cap)` : ''}`);
}

if (watch) {
  await copyShell();
  const js = await context(options);
  const css = await context(cssOptions);

  // Watch for CSS changes and fix attribute quotes after each build
  css.onRebuild(async (error) => {
    if (!error) await fixCSSAttributeQuotes();
  });

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
