/**
 * Regenerate `spotter-engine.ico` — a 32×32 flat icon: Spotter green (#16a34a)
 * ground with a white "run" triangle. Committed to the repo; re-run only to
 * change the art.
 *
 *   node engine/launcher/make-icon.mjs
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const S = 32;
const GREEN = [0x4a, 0xa3, 0x16]; // B, G, R for #16a34a
const WHITE = [0xff, 0xff, 0xff];

// XOR pixel buffer, bottom-up BGRA.
const xor = Buffer.alloc(S * S * 4);
for (let y = 0; y < S; y += 1) {
  for (let x = 0; x < S; x += 1) {
    // Triangle pointing right, roughly centred.
    const inTri =
      x >= 11 &&
      x <= 23 &&
      y >= 6 + (x - 11) &&
      y <= 26 - (x - 11);
    const [b, g, r] = inTri ? WHITE : GREEN;
    const row = S - 1 - y; // bottom-up
    const o = (row * S + x) * 4;
    xor[o] = b;
    xor[o + 1] = g;
    xor[o + 2] = r;
    xor[o + 3] = 0xff; // opaque
  }
}
const andMask = Buffer.alloc(S * 4); // 32 rows × 4 bytes, all zero = fully opaque

const dib = Buffer.alloc(40);
dib.writeUInt32LE(40, 0); // header size
dib.writeInt32LE(S, 4); // width
dib.writeInt32LE(S * 2, 8); // height (XOR + AND)
dib.writeUInt16LE(1, 12); // planes
dib.writeUInt16LE(32, 14); // bpp
// rest zero (BI_RGB)

const image = Buffer.concat([dib, xor, andMask]);

const dir = Buffer.alloc(6);
dir.writeUInt16LE(0, 0);
dir.writeUInt16LE(1, 2); // type: icon
dir.writeUInt16LE(1, 4); // count

const entry = Buffer.alloc(16);
entry.writeUInt8(S, 0);
entry.writeUInt8(S, 1);
entry.writeUInt8(0, 2); // palette
entry.writeUInt8(0, 3);
entry.writeUInt16LE(1, 4); // planes
entry.writeUInt16LE(32, 6); // bpp
entry.writeUInt32LE(image.length, 8);
entry.writeUInt32LE(6 + 16, 12); // offset

const ico = Buffer.concat([dir, entry, image]);
const out = join(dirname(fileURLToPath(import.meta.url)), "spotter-engine.ico");
writeFileSync(out, ico);
// eslint-disable-next-line no-console
console.log(`wrote ${out} (${ico.length} bytes)`);
