import extractChunks from "png-chunks-extract";
import encodeChunks from "png-chunks-encode";
import type { FormatHandler, Metadata } from "./types.js";
import { concat, textEncode } from "./binary.js";
import { buildExifPayload, buildXmpPacket } from "./builders.js";

type Chunk = { name: string; data: Uint8Array };

// PNG chunks we always keep (structural + colorimetry). Everything else is metadata.
const KEEP = new Set([
  "IHDR",
  "PLTE",
  "IDAT",
  "IEND",
  "tRNS",
  "gAMA",
  "cHRM",
  "sRGB",
  "iCCP",
  "sBIT",
  "bKGD",
  "hIST",
  "pHYs",
  "sPLT",
  // Animation
  "acTL",
  "fcTL",
  "fdAT",
]);

function stripPng(bytes: Uint8Array): Uint8Array {
  const chunks = extractChunks(bytes) as Chunk[];
  const kept = chunks.filter((c) => KEEP.has(c.name));
  return new Uint8Array(encodeChunks(kept));
}

function applyPng(stripped: Uint8Array, meta: Metadata): Uint8Array {
  const chunks = extractChunks(stripped) as Chunk[];

  const additions: Chunk[] = [];

  const exifPayload = buildExifPayload(meta);
  if (exifPayload) {
    // PNG 1.5 (2017) eXIf chunk: raw EXIF data starting with the TIFF header,
    // no "Exif\0\0" prefix. buildExifPayload already strips the prefix.
    additions.push({ name: "eXIf", data: exifPayload });
  }

  const xmp = buildXmpPacket(meta);
  if (xmp) {
    // iTXt chunk with keyword "XML:com.adobe.xmp"
    const keyword = "XML:com.adobe.xmp";
    const nullByte = new Uint8Array([0]);
    const compressionFlag = new Uint8Array([0]);
    const compressionMethod = new Uint8Array([0]);
    const languageTag = new Uint8Array(0);
    const translatedKeyword = new Uint8Array(0);
    const data = concat(
      textEncode(keyword),
      nullByte,
      compressionFlag,
      compressionMethod,
      languageTag,
      nullByte,
      translatedKeyword,
      nullByte,
      textEncode(xmp),
    );
    additions.push({ name: "iTXt", data });
  }

  if (additions.length === 0) return stripped;

  // Insert additions before IEND
  const iendIdx = chunks.findIndex((c) => c.name === "IEND");
  const withMeta =
    iendIdx === -1
      ? [...chunks, ...additions]
      : [...chunks.slice(0, iendIdx), ...additions, ...chunks.slice(iendIdx)];
  return new Uint8Array(encodeChunks(withMeta));
}

export const pngHandler: FormatHandler = {
  strip: stripPng,
  apply: applyPng,
};
