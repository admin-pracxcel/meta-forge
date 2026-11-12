import piexif from "piexifjs";
import type { FormatHandler, Metadata } from "./types.js";
import { concat, textEncode, u8ToBinaryString } from "./binary.js";
import { buildExifPayload, buildXmpPacket } from "./builders.js";

const XMP_NS = "http://ns.adobe.com/xap/1.0/\0";

/**
 * Strip all APP markers (EXIF, XMP, IPTC, ICC etc.) from a JPEG.
 * We keep SOI, then rewrite the file skipping APP0..APP15 unless it's a
 * JFIF APP0 (needed for compatibility). Everything from SOS onward is
 * copied verbatim (that's the compressed image data + EOI).
 */
function stripJpeg(bytes: Uint8Array): Uint8Array {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("Not a JPEG");
  const out: number[] = [0xff, 0xd8];
  let i = 2;
  let keptJfif = false;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) throw new Error("Malformed JPEG at offset " + i);
    // Skip fill bytes (0xFF 0xFF ...)
    while (i < bytes.length && bytes[i] === 0xff) i++;
    const marker = bytes[i];
    i++;
    // Standalone markers (no length): 0x01, 0xD0-0xD9
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(0xff, marker);
      continue;
    }
    if (marker === 0xd9) {
      // EOI
      out.push(0xff, 0xd9);
      break;
    }
    if (marker === 0xda) {
      // SOS — from here to EOI is entropy-coded data; copy the rest as-is.
      out.push(0xff, 0xda);
      for (let j = i; j < bytes.length; j++) out.push(bytes[j]);
      break;
    }
    // Read segment length (big-endian, includes the 2 length bytes)
    const len = (bytes[i] << 8) | bytes[i + 1];
    const segStart = i;
    const segEnd = i + len;
    i = segEnd;

    const isApp = marker >= 0xe0 && marker <= 0xef;
    if (isApp) {
      // Keep the first JFIF APP0 marker for widest viewer compatibility
      if (marker === 0xe0 && !keptJfif) {
        const idStart = segStart + 2;
        const isJfif =
          bytes[idStart] === 0x4a && // J
          bytes[idStart + 1] === 0x46 && // F
          bytes[idStart + 2] === 0x49 && // I
          bytes[idStart + 3] === 0x46 && // F
          bytes[idStart + 4] === 0x00;
        if (isJfif) {
          out.push(0xff, marker);
          for (let j = segStart; j < segEnd; j++) out.push(bytes[j]);
          keptJfif = true;
          continue;
        }
      }
      // Drop all other APP markers (this is where EXIF/XMP/IPTC lived)
      continue;
    }
    // Any other marker (COM comment, DQT, DHT, SOF, etc.) — comments dropped, rest kept.
    if (marker === 0xfe) {
      // COM (comment) — strip it too
      continue;
    }
    out.push(0xff, marker);
    for (let j = segStart; j < segEnd; j++) out.push(bytes[j]);
  }
  return new Uint8Array(out);
}

function buildApp1(headerBytes: Uint8Array, payload: Uint8Array): Uint8Array {
  const totalLen = 2 + headerBytes.length + payload.length;
  if (totalLen > 0xffff) {
    throw new Error("APP1 segment too large: " + totalLen + " bytes");
  }
  const lenBE = new Uint8Array([(totalLen >> 8) & 0xff, totalLen & 0xff]);
  return concat(new Uint8Array([0xff, 0xe1]), lenBE, headerBytes, payload);
}

function insertApp1Segments(strippedJpeg: Uint8Array, segments: Uint8Array[]): Uint8Array {
  if (segments.length === 0) return strippedJpeg;
  // After SOI (2 bytes), we may have JFIF APP0 — keep it first, then inject our APP1s.
  let insertAt = 2;
  if (
    strippedJpeg[2] === 0xff &&
    strippedJpeg[3] === 0xe0
  ) {
    const segLen = (strippedJpeg[4] << 8) | strippedJpeg[5];
    insertAt = 4 + segLen;
  }
  const head = strippedJpeg.subarray(0, insertAt);
  const tail = strippedJpeg.subarray(insertAt);
  return concat(head, ...segments, tail);
}

function applyJpeg(stripped: Uint8Array, meta: Metadata): Uint8Array {
  const segments: Uint8Array[] = [];

  const exifPayload = buildExifPayload(meta);
  if (exifPayload) {
    const exifHeader = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]); // "Exif\0\0"
    segments.push(buildApp1(exifHeader, exifPayload));
  }

  const xmp = buildXmpPacket(meta);
  if (xmp) {
    const xmpHeader = textEncode(XMP_NS);
    const xmpBody = textEncode(xmp);
    // XMP fits in one APP1 if under ~64KB total; typical packets are <2KB.
    segments.push(buildApp1(xmpHeader, xmpBody));
  }

  return insertApp1Segments(stripped, segments);
}

// Sanity: piexif can round-trip our EXIF payload. Kept for potential debugging.
export function debugReadExif(bytes: Uint8Array): unknown {
  try {
    return piexif.load(u8ToBinaryString(bytes));
  } catch {
    return null;
  }
}

export const jpegHandler: FormatHandler = {
  strip: stripJpeg,
  apply: applyJpeg,
};
