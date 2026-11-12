import type { FormatHandler, ImageFormat, Metadata } from "./types";
import { detectFormat } from "./formats";
import { jpegHandler } from "./jpeg";
import { pngHandler } from "./png";
import { webpHandler } from "./webp";

export type ProcessResult = {
  bytes: Uint8Array;
  format: ImageFormat;
};

const HANDLERS: Partial<Record<ImageFormat, FormatHandler>> = {
  jpeg: jpegHandler,
  png: pngHandler,
  webp: webpHandler,
  // tiff: implemented later — see README
};

export function stripAndApply(bytes: Uint8Array, meta: Metadata): ProcessResult {
  const format = detectFormat(bytes);
  const handler = HANDLERS[format];
  if (!handler) {
    if (format === "tiff") {
      throw new Error("TIFF support is coming soon. Try JPEG, PNG or WebP.");
    }
    if (format === "unknown") {
      throw new Error("Unrecognized image format.");
    }
    throw new Error(`No handler for format: ${format}`);
  }
  const stripped = handler.strip(bytes);
  const finalBytes = handler.apply(stripped, meta);
  return { bytes: finalBytes, format };
}

export { detectFormat, mimeFor, extensionFor } from "./formats";
export type { Metadata, ImageFormat } from "./types";
