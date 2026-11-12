import piexif from "piexifjs";
import type { Metadata } from "./types.js";
import { binaryStringToU8 } from "./binary.js";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatExifDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear()}:${pad(d.getUTCMonth() + 1)}:${pad(d.getUTCDate())} ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/**
 * Builds a raw TIFF-based EXIF payload from Metadata (without the "Exif\0\0" prefix).
 * Returns null if no EXIF-writable fields are present.
 */
export function buildExifPayload(meta: Metadata): Uint8Array | null {
  // piexif types are loose — use `any` for its IFD dicts to keep this compact.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zeroth: Record<number, any> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exif: Record<number, any> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gps: Record<number, any> = {};

  if (meta.author) zeroth[piexif.ImageIFD.Artist] = meta.author;
  if (meta.copyright) zeroth[piexif.ImageIFD.Copyright] = meta.copyright;
  if (meta.caption) zeroth[piexif.ImageIFD.ImageDescription] = meta.caption;
  if (meta.cameraMake) zeroth[piexif.ImageIFD.Make] = meta.cameraMake;
  if (meta.cameraModel) zeroth[piexif.ImageIFD.Model] = meta.cameraModel;
  if (meta.software) zeroth[piexif.ImageIFD.Software] = meta.software;

  if (meta.dateTaken) {
    const d = formatExifDate(meta.dateTaken);
    zeroth[piexif.ImageIFD.DateTime] = d;
    exif[piexif.ExifIFD.DateTimeOriginal] = d;
    exif[piexif.ExifIFD.DateTimeDigitized] = d;
  }

  const hasGps =
    typeof meta.gpsLatitude === "number" && typeof meta.gpsLongitude === "number";
  if (hasGps) {
    const lat = meta.gpsLatitude as number;
    const lng = meta.gpsLongitude as number;
    gps[piexif.GPSIFD.GPSLatitudeRef] = lat >= 0 ? "N" : "S";
    gps[piexif.GPSIFD.GPSLatitude] = piexif.GPSHelper.degToDmsRational(Math.abs(lat));
    gps[piexif.GPSIFD.GPSLongitudeRef] = lng >= 0 ? "E" : "W";
    gps[piexif.GPSIFD.GPSLongitude] = piexif.GPSHelper.degToDmsRational(Math.abs(lng));
    if (typeof meta.gpsAltitude === "number") {
      gps[piexif.GPSIFD.GPSAltitudeRef] = meta.gpsAltitude >= 0 ? 0 : 1;
      gps[piexif.GPSIFD.GPSAltitude] = [
        Math.round(Math.abs(meta.gpsAltitude) * 100),
        100,
      ];
    }
  }

  const hasAny =
    Object.keys(zeroth).length > 0 ||
    Object.keys(exif).length > 0 ||
    Object.keys(gps).length > 0;
  if (!hasAny) return null;

  const exifObj = { "0th": zeroth, Exif: exif, GPS: gps };
  // piexif.dump returns a binary string of the form: "Exif\0\0" + TIFF header + IFDs
  const dumped = piexif.dump(exifObj);
  const full = binaryStringToU8(dumped);
  // Strip the "Exif\0\0" prefix (first 6 bytes) — callers add it back only for JPEG APP1.
  return full.subarray(6);
}

/**
 * Builds an XMP packet string covering IPTC-style fields not writable via EXIF.
 * Returns null if there's nothing to write.
 */
export function buildXmpPacket(meta: Metadata): string | null {
  const parts: string[] = [];

  if (meta.author) {
    parts.push(
      `<dc:creator><rdf:Seq><rdf:li>${escapeXml(meta.author)}</rdf:li></rdf:Seq></dc:creator>`,
    );
  }
  if (meta.title) {
    parts.push(
      `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(meta.title)}</rdf:li></rdf:Alt></dc:title>`,
    );
  }
  if (meta.caption) {
    parts.push(
      `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(meta.caption)}</rdf:li></rdf:Alt></dc:description>`,
    );
  }
  if (meta.copyright) {
    parts.push(
      `<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(meta.copyright)}</rdf:li></rdf:Alt></dc:rights>`,
    );
  }
  if (meta.keywords && meta.keywords.length > 0) {
    const items = meta.keywords
      .map((k) => `<rdf:li>${escapeXml(k)}</rdf:li>`)
      .join("");
    parts.push(`<dc:subject><rdf:Bag>${items}</rdf:Bag></dc:subject>`);
  }
  if (meta.credit) parts.push(`<photoshop:Credit>${escapeXml(meta.credit)}</photoshop:Credit>`);
  if (meta.source) parts.push(`<photoshop:Source>${escapeXml(meta.source)}</photoshop:Source>`);
  if (meta.city) parts.push(`<photoshop:City>${escapeXml(meta.city)}</photoshop:City>`);
  if (meta.state) parts.push(`<photoshop:State>${escapeXml(meta.state)}</photoshop:State>`);
  if (meta.country) parts.push(`<photoshop:Country>${escapeXml(meta.country)}</photoshop:Country>`);
  if (meta.dateTaken) {
    parts.push(`<photoshop:DateCreated>${escapeXml(meta.dateTaken)}</photoshop:DateCreated>`);
  }

  if (parts.length === 0) return null;

  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"
    xmlns:xmp="http://ns.adobe.com/xap/1.0/">
${parts.map((p) => `   ${p}`).join("\n")}
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}
