// Smoke test the EXIF pipeline against a real image.
// Runs the same code path the browser uses.

import fs from "node:fs";
import path from "node:path";
import piexif from "piexifjs";
import extractChunks from "png-chunks-extract";

import { stripAndApply, detectFormat } from "../src/lib/exif/index.ts";

const testMeta = {
  author: "Test Author",
  copyright: "© 2026 Metaforge Smoke",
  credit: "Metaforge",
  source: "smoke test",
  title: "Test Title",
  caption: "A caption from smoke test",
  keywords: ["alpha", "beta"],
  gpsLatitude: -33.8688,
  gpsLongitude: 151.2093,
  gpsAltitude: 42,
  city: "Sydney",
  state: "NSW",
  country: "Australia",
  dateTaken: "2026-08-11T10:30:00",
  cameraMake: "Metaforge",
  cameraModel: "Virtual",
  software: "Metaforge 1.0",
};

function u8ToBinaryString(u8) {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  return s;
}

function testJpeg(filepath) {
  console.log(`\n--- JPEG: ${path.basename(filepath)} ---`);
  const original = new Uint8Array(fs.readFileSync(filepath));
  console.log(`  format detected: ${detectFormat(original)} (${original.length} bytes)`);

  // Read original EXIF (if any)
  let origHadExif = false;
  try {
    const orig = piexif.load(u8ToBinaryString(original));
    origHadExif = Object.keys(orig["0th"] || {}).length > 0 || Object.keys(orig.Exif || {}).length > 0;
    console.log(`  original had EXIF: ${origHadExif}`);
  } catch {}

  const result = stripAndApply(original, testMeta);
  const outPath = filepath.replace(/(\.[^.]+)$/, ".processed$1");
  fs.writeFileSync(outPath, result.bytes);
  console.log(`  wrote: ${outPath} (${result.bytes.length} bytes)`);

  const roundtrip = piexif.load(u8ToBinaryString(result.bytes));
  const artist = roundtrip["0th"][piexif.ImageIFD.Artist];
  const copyright = roundtrip["0th"][piexif.ImageIFD.Copyright];
  const gpsLatRef = roundtrip.GPS[piexif.GPSIFD.GPSLatitudeRef];
  const dt = roundtrip.Exif[piexif.ExifIFD.DateTimeOriginal];

  console.log(`  read-back Artist: ${JSON.stringify(artist)}`);
  console.log(`  read-back Copyright: ${JSON.stringify(copyright)}`);
  console.log(`  read-back GPS Lat Ref: ${JSON.stringify(gpsLatRef)}`);
  console.log(`  read-back DateTimeOriginal: ${JSON.stringify(dt)}`);

  const ok =
    artist === testMeta.author &&
    copyright === testMeta.copyright &&
    gpsLatRef === "S" && // -33.8688 is south
    typeof dt === "string";
  console.log(`  ✅ EXIF roundtrip: ${ok ? "PASS" : "FAIL"}`);

  // Check XMP is present — search for the header signature anywhere
  const bytes = result.bytes;
  const needle = "http://ns.adobe.com/xap/1.0/";
  const haystack = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 20000)));
  const foundXmp = haystack.includes(needle) && haystack.includes("<x:xmpmeta");
  console.log(`  ✅ XMP present: ${foundXmp ? "PASS" : "FAIL"}`);

  return ok && foundXmp;
}

function testPng(filepath) {
  console.log(`\n--- PNG: ${path.basename(filepath)} ---`);
  const original = new Uint8Array(fs.readFileSync(filepath));
  console.log(`  format detected: ${detectFormat(original)} (${original.length} bytes)`);

  const result = stripAndApply(original, testMeta);
  const outPath = filepath.replace(/(\.[^.]+)$/, ".processed$1");
  fs.writeFileSync(outPath, result.bytes);
  console.log(`  wrote: ${outPath} (${result.bytes.length} bytes)`);

  const chunks = extractChunks(result.bytes);
  const names = chunks.map((c) => c.name);
  console.log(`  chunks: ${names.join(", ")}`);
  const hasExif = names.includes("eXIf");
  const hasXmp = chunks.some((c) => {
    if (c.name !== "iTXt") return false;
    const text = new TextDecoder().decode(c.data);
    return text.startsWith("XML:com.adobe.xmp");
  });
  console.log(`  ✅ eXIf chunk: ${hasExif ? "PASS" : "FAIL"}`);
  console.log(`  ✅ iTXt XMP:   ${hasXmp ? "PASS" : "FAIL"}`);

  // Verify EXIF chunk contents can be read
  if (hasExif) {
    const exifChunk = chunks.find((c) => c.name === "eXIf");
    // eXIf chunk data begins with TIFF header; piexif expects "Exif\0\0" prefix.
    const prefixed = new Uint8Array(6 + exifChunk.data.length);
    prefixed.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 0);
    prefixed.set(exifChunk.data, 6);
    try {
      const parsed = piexif.load(u8ToBinaryString(prefixed));
      const artist = parsed["0th"][piexif.ImageIFD.Artist];
      console.log(`  read-back Artist from eXIf: ${JSON.stringify(artist)}`);
      if (artist !== testMeta.author) console.log("  ⚠️ Artist mismatch");
    } catch (e) {
      console.log(`  ⚠️ Could not parse eXIf: ${e.message}`);
    }
  }

  return hasExif && hasXmp;
}

const jpeg = "/Users/bilalshaikh/Downloads/IMG_5186.JPG";
const png = "/Users/bilalshaikh/Downloads/zeller.png";

let allPass = true;
if (fs.existsSync(jpeg)) allPass = testJpeg(jpeg) && allPass;
if (fs.existsSync(png)) allPass = testPng(png) && allPass;

console.log(`\n${allPass ? "✅ ALL PASS" : "❌ FAILURES"}`);
process.exit(allPass ? 0 : 1);
