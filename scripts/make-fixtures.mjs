// One-off: generate tiny 2x2 fixture images for the test suite.
// PNG is built by hand; JPEG and WebP are converted from it with macOS `sips`
// (falls back to `cwebp` for WebP if sips cannot write it).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { crc32 } from "../src/lib/exif/binary.ts";

const outDir = path.resolve("test/fixtures");
fs.mkdirSync(outDir, { recursive: true });

function u32(n) {
  return Buffer.from([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}
function chunk(name, data) {
  const nameBuf = Buffer.from(name, "ascii");
  const crc = crc32(new Uint8Array(Buffer.concat([nameBuf, data])));
  return Buffer.concat([u32(data.length), nameBuf, data, u32(crc)]);
}

const ihdr = Buffer.concat([u32(2), u32(2), Buffer.from([8, 2, 0, 0, 0])]); // 2x2, 8-bit RGB
const raw = Buffer.from([
  0, 255, 0, 0, 0, 255, 0, // filter 0, red, green
  0, 0, 0, 255, 255, 255, 0, // filter 0, blue, yellow
]);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);
const pngPath = path.join(outDir, "tiny.png");
fs.writeFileSync(pngPath, png);

const jpgPath = path.join(outDir, "tiny.jpg");
execFileSync("sips", ["-s", "format", "jpeg", pngPath, "--out", jpgPath], { stdio: "ignore" });

const webpPath = path.join(outDir, "tiny.webp");
try {
  execFileSync("sips", ["-s", "format", "webp", pngPath, "--out", webpPath], { stdio: "ignore" });
  if (!fs.existsSync(webpPath)) throw new Error("sips produced no webp");
} catch {
  try {
    execFileSync("cwebp", ["-quiet", pngPath, "-o", webpPath], { stdio: "ignore" });
  } catch {
    console.error("Could not write tiny.webp: neither sips nor cwebp could produce WebP.");
    process.exit(1);
  }
}

for (const f of ["tiny.png", "tiny.jpg", "tiny.webp"]) {
  console.log(f, fs.statSync(path.join(outDir, f)).size, "bytes");
}
