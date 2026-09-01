/**
 * Generate the app icon and splash source images.
 *
 * Writes plain PNGs with no image library — just zlib and the PNG container —
 * so this runs anywhere Node does and adds no dependency for something that is
 * regenerated about twice a project.
 *
 * The mark is the corner-bracket device from `reference/ui-design.md`: four thin
 * L-shaped accents at the corners of a square. It is the app's signature detail,
 * and it survives being scaled to a launcher tile better than anything with fine
 * interior structure would.
 *
 * Run: node tools/make-icons.mjs
 * Then: npx capacitor-assets generate --android
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

// From src/styles/tokens.css. Kept literal here on purpose: this script emits
// binary pixels, not CSS, so there is no token to reference.
const VOID = [0x0a, 0x0c, 0x10];
const ACCENT = [0x57, 0xc7, 0xe3];

// --- PNG container ----------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** @param {number} size @param {(x:number,y:number)=>number[]} shade RGBA 0-255 */
function png(size, shade) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = shade(x, y);
      raw[o++] = r; raw[o++] = g; raw[o++] = b; raw[o++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- the mark ---------------------------------------------------------------

/**
 * Four corner brackets around a square of side `span`, centred in `size`.
 *
 * @param size   canvas edge
 * @param span   fraction of the canvas the bracket square occupies
 * @param weight stroke width as a fraction of the canvas
 * @param arm    bracket arm length as a fraction of `span`
 */
function bracketMask(size, span, weight, arm) {
  const side = size * span;
  const x0 = (size - side) / 2;
  const y0 = x0;
  const x1 = x0 + side;
  const y1 = y0 + side;
  const w = size * weight;
  const a = side * arm;

  return (x, y) => {
    // A pixel is in the mark if it lies in the stroke of any corner's two arms.
    const inX = (lo, hi) => x >= lo && x < hi;
    const inY = (lo, hi) => y >= lo && y < hi;
    return (
      // top-left
      (inX(x0, x0 + a) && inY(y0, y0 + w)) || (inX(x0, x0 + w) && inY(y0, y0 + a))
      // top-right
      || (inX(x1 - a, x1) && inY(y0, y0 + w)) || (inX(x1 - w, x1) && inY(y0, y0 + a))
      // bottom-left
      || (inX(x0, x0 + a) && inY(y1 - w, y1)) || (inX(x0, x0 + w) && inY(y1 - a, y1))
      // bottom-right
      || (inX(x1 - a, x1) && inY(y1 - w, y1)) || (inX(x1 - w, x1) && inY(y1 - a, y1))
    );
  };
}

// --- outputs ----------------------------------------------------------------

mkdirSync('assets', { recursive: true });

const ICON = 1024;
const SPLASH = 2732;

// Full icon: mark on the app's ground.
const iconMark = bracketMask(ICON, 0.58, 0.055, 0.34);
writeFileSync('assets/icon.png', png(ICON, (x, y) =>
  iconMark(x, y) ? [...ACCENT, 255] : [...VOID, 255]));

// Adaptive foreground: transparent, and pulled in tighter — Android crops an
// adaptive icon to a circle/squircle, and only the central ~66% is guaranteed
// to survive it.
const fgMark = bracketMask(ICON, 0.42, 0.042, 0.34);
writeFileSync('assets/icon-foreground.png', png(ICON, (x, y) =>
  fgMark(x, y) ? [...ACCENT, 255] : [0, 0, 0, 0]));

writeFileSync('assets/icon-background.png', png(ICON, () => [...VOID, 255]));

// Splash: the same mark, small and centred, on the same ground — so the launch
// screen and the app's first paint are the same colour and nothing flashes.
const splashMark = bracketMask(SPLASH, 0.18, 0.014, 0.34);
const splash = png(SPLASH, (x, y) => (splashMark(x, y) ? [...ACCENT, 255] : [...VOID, 255]));
writeFileSync('assets/splash.png', splash);
writeFileSync('assets/splash-dark.png', splash);

console.log('wrote assets/: icon.png, icon-foreground.png, icon-background.png, splash.png, splash-dark.png');
