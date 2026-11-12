import type { FormatHandler, Metadata } from "./types.js";
import { concat, textEncode } from "./binary.js";
import { buildExifPayload, buildXmpPacket } from "./builders.js";

/*
 * WebP is a RIFF container:
 *   "RIFF" <u32 LE fileSize-8> "WEBP" <chunks...>
 * Each chunk:
 *   <4-byte FourCC> <u32 LE payloadSize> <payload...> <optional 1 pad byte>
 *
 * Metadata lives in "EXIF" and "XMP " chunks. A simple (VP8/VP8L) file must
 * be upgraded to extended (VP8X) format before it can carry metadata, and
 * the VP8X header has flag bits for EXIF (0x08) and XMP (0x04).
 */

function readU32LE(b: Uint8Array, off: number): number {
  return (
    (b[off] | (b[off + 1] << 8) | (b[off + 2] << 16) | (b[off + 3] << 24)) >>> 0
  );
}

function writeU32LE(n: number): Uint8Array {
  return new Uint8Array([
    n & 0xff,
    (n >>> 8) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 24) & 0xff,
  ]);
}

function fourcc(s: string): Uint8Array {
  if (s.length !== 4) throw new Error("FourCC must be 4 chars");
  return textEncode(s);
}

function parseChunks(bytes: Uint8Array): { fourcc: string; payload: Uint8Array }[] {
  if (
    bytes[0] !== 0x52 ||
    bytes[1] !== 0x49 ||
    bytes[2] !== 0x46 ||
    bytes[3] !== 0x46 ||
    bytes[8] !== 0x57 ||
    bytes[9] !== 0x45 ||
    bytes[10] !== 0x42 ||
    bytes[11] !== 0x50
  ) {
    throw new Error("Not a WebP");
  }
  const out: { fourcc: string; payload: Uint8Array }[] = [];
  let i = 12;
  while (i + 8 <= bytes.length) {
    const cc = String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]);
    const size = readU32LE(bytes, i + 4);
    const payload = bytes.subarray(i + 8, i + 8 + size);
    out.push({ fourcc: cc, payload });
    let next = i + 8 + size;
    if (size % 2 === 1) next += 1; // pad
    i = next;
  }
  return out;
}

function buildChunk(cc: string, payload: Uint8Array): Uint8Array {
  const size = payload.length;
  const pad = size % 2 === 1 ? new Uint8Array([0]) : new Uint8Array(0);
  return concat(fourcc(cc), writeU32LE(size), payload, pad);
}

function buildWebP(chunks: { fourcc: string; payload: Uint8Array }[]): Uint8Array {
  const body = concat(...chunks.map((c) => buildChunk(c.fourcc, c.payload)));
  const totalMinusRiff = 4 + body.length; // "WEBP" + body
  return concat(fourcc("RIFF"), writeU32LE(totalMinusRiff), fourcc("WEBP"), body);
}

/**
 * Ensure the file is in VP8X extended form. Returns the chunk list rearranged
 * so that VP8X is first, ANIM/ANMF chunks (if any) preserved, then the image
 * data chunks (VP8/VP8L/ANMF). Sets/clears EXIF & XMP flag bits per params.
 */
function ensureVp8x(
  chunks: { fourcc: string; payload: Uint8Array }[],
  hasExif: boolean,
  hasXmp: boolean,
): { fourcc: string; payload: Uint8Array }[] {
  const findIdx = (name: string) => chunks.findIndex((c) => c.fourcc === name);

  // Determine canvas size
  let width = 1;
  let height = 1;

  const existingVp8x = chunks.find((c) => c.fourcc === "VP8X");
  const vp8Idx = findIdx("VP8 ");
  const vp8lIdx = findIdx("VP8L");

  if (existingVp8x) {
    // VP8X payload: 4 flag bytes + 3-byte canvas width-1 + 3-byte canvas height-1
    const p = existingVp8x.payload;
    width = 1 + ((p[4] | (p[5] << 8) | (p[6] << 16)) >>> 0);
    height = 1 + ((p[7] | (p[8] << 8) | (p[9] << 16)) >>> 0);
  } else if (vp8Idx !== -1) {
    // Lossy VP8: width/height at offsets 6/8 in payload (14-bit each with 2-bit scale we ignore)
    const p = chunks[vp8Idx].payload;
    // Skip 3-byte frame tag, 3-byte start code (0x9D 0x01 0x2A)
    if (p.length >= 10) {
      width = (p[6] | (p[7] << 8)) & 0x3fff;
      height = (p[8] | (p[9] << 8)) & 0x3fff;
    }
  } else if (vp8lIdx !== -1) {
    // VP8L: signature 0x2F then 14-bit width-1, 14-bit height-1
    const p = chunks[vp8lIdx].payload;
    if (p.length >= 5 && p[0] === 0x2f) {
      const w14 = (p[1] | (p[2] << 8)) & 0x3fff;
      const h14 = ((p[2] >> 6) | (p[3] << 2) | (p[4] << 10)) & 0x3fff;
      width = w14 + 1;
      height = h14 + 1;
    }
  }

  // Build new VP8X payload
  let flags = 0;
  if (hasExif) flags |= 0x08;
  if (hasXmp) flags |= 0x04;
  // Preserve alpha/ICC/anim flags from an existing VP8X (but clear EXIF/XMP)
  if (existingVp8x) {
    const existingFlags = existingVp8x.payload[0];
    flags |= existingFlags & ~(0x08 | 0x04);
  }

  const vp8xPayload = new Uint8Array(10);
  vp8xPayload[0] = flags;
  // bytes 1-3 reserved (0)
  const w = (width - 1) & 0xffffff;
  const h = (height - 1) & 0xffffff;
  vp8xPayload[4] = w & 0xff;
  vp8xPayload[5] = (w >> 8) & 0xff;
  vp8xPayload[6] = (w >> 16) & 0xff;
  vp8xPayload[7] = h & 0xff;
  vp8xPayload[8] = (h >> 8) & 0xff;
  vp8xPayload[9] = (h >> 16) & 0xff;

  // Reassemble in the order required by the WebP container spec:
  // VP8X, ICCP, ANIM+ANMF or VP8/VP8L (+ ALPH), EXIF, XMP
  const ordered: { fourcc: string; payload: Uint8Array }[] = [];
  ordered.push({ fourcc: "VP8X", payload: vp8xPayload });
  const takeOne = (name: string) => {
    const c = chunks.find((c) => c.fourcc === name && c !== existingVp8x);
    if (c) ordered.push(c);
  };
  const takeAll = (name: string) => {
    for (const c of chunks) if (c.fourcc === name && c !== existingVp8x) ordered.push(c);
  };
  takeOne("ICCP");
  takeOne("ANIM");
  takeAll("ANMF");
  takeOne("ALPH");
  takeOne("VP8 ");
  takeOne("VP8L");
  // EXIF & XMP added later by caller
  return ordered;
}

function stripWebp(bytes: Uint8Array): Uint8Array {
  const chunks = parseChunks(bytes);
  // Drop EXIF/XMP; keep everything else. Clear the flag bits on any existing VP8X.
  const kept = chunks.filter((c) => c.fourcc !== "EXIF" && c.fourcc !== "XMP ");
  const reordered = ensureVp8x(kept, false, false);
  return buildWebP(reordered);
}

function applyWebp(stripped: Uint8Array, meta: Metadata): Uint8Array {
  const chunks = parseChunks(stripped);

  const exifPayload = buildExifPayload(meta);
  const xmp = buildXmpPacket(meta);

  const base = ensureVp8x(
    chunks.filter((c) => c.fourcc !== "EXIF" && c.fourcc !== "XMP "),
    !!exifPayload,
    !!xmp,
  );

  if (exifPayload) base.push({ fourcc: "EXIF", payload: exifPayload });
  if (xmp) base.push({ fourcc: "XMP ", payload: textEncode(xmp) });

  return buildWebP(base);
}

export const webpHandler: FormatHandler = {
  strip: stripWebp,
  apply: applyWebp,
};
