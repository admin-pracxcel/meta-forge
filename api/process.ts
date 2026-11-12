// POST /api/process — strip all metadata from an image and stamp author + GPS.
// Vercel Node.js function using the web-standard Request/Response handler.
// See docs/superpowers/specs/2026-11-12-exif-api-endpoint-design.md.
import { timingSafeEqual } from "node:crypto";
import {
  stripAndApply,
  mimeFor,
  extensionFor,
  type Metadata,
} from "../src/lib/exif/index.ts";

/** Vercel serverless request-body limit. */
export const MAX_BODY_BYTES = 4_718_592;

/**
 * Parse a coordinate form field.
 * - blank / whitespace / missing → undefined (field omitted)
 * - non-numeric or outside [min, max] → "invalid"
 */
export function parseCoordinate(
  raw: string | null,
  min: number,
  max: number,
): number | undefined | "invalid" {
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < min || n > max) return "invalid";
  return n;
}

function json(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function isAuthorized(request: Request, expectedKey: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return false;
  const given = Buffer.from(match[1], "utf8");
  const expected = Buffer.from(expectedKey, "utf8");
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

function textField(form: FormData, name: string): string | null {
  const v = form.get(name);
  return typeof v === "string" ? v : null;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") return json(405, "Method not allowed. Use POST.");

  const expectedKey = process.env.METAFORGE_API_KEY;
  if (!expectedKey) return json(503, "API key not configured");

  if (!isAuthorized(request, expectedKey)) return json(401, "Missing or invalid API key.");

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json(413, `Request body exceeds ${MAX_BODY_BYTES} bytes.`);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(400, "Body must be multipart/form-data.");
  }

  const file = form.get("file");
  if (!file || typeof file === "string" || typeof (file as Blob).arrayBuffer !== "function") {
    return json(400, 'Missing "file" upload field.');
  }

  const latitude = parseCoordinate(textField(form, "latitude"), -90, 90);
  if (latitude === "invalid") return json(400, "latitude must be a number between -90 and 90.");
  const longitude = parseCoordinate(textField(form, "longitude"), -180, 180);
  if (longitude === "invalid") return json(400, "longitude must be a number between -180 and 180.");

  const author = (textField(form, "author") ?? "").trim();

  const meta: Metadata = {};
  if (author) meta.author = author;
  if (typeof latitude === "number" && typeof longitude === "number") {
    meta.gpsLatitude = latitude;
    meta.gpsLongitude = longitude;
  }

  const bytes = new Uint8Array(await (file as Blob).arrayBuffer());

  try {
    const result = stripAndApply(bytes, meta);
    const ext = extensionFor(result.format);
    return new Response(new Blob([result.bytes as BlobPart]), {
      status: 200,
      headers: {
        "content-type": mimeFor(result.format),
        "content-disposition": `inline; filename="image.${ext}"`,
        "x-metaforge-format": result.format,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/TIFF support|Unrecognized image format/.test(message)) return json(415, message);
    return json(500, `Processing failed: ${message}`);
  }
}
