import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import piexif from "piexifjs";
import extractChunks from "png-chunks-extract";
import encodeChunks from "png-chunks-encode";
import handler, { MAX_BODY_BYTES, parseCoordinate } from "../api/process.ts";
import { detectFormat } from "../src/lib/exif/index.ts";

const KEY = "test-key";
const URL_ = "http://localhost/api/process";

type Chunk = { name: string; data: Uint8Array };

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
}

function formWith(name: string, fields: Record<string, string>, bytes = fixture(name)): FormData {
  const form = new FormData();
  const mime = name.endsWith(".png") ? "image/png" : name.endsWith(".jpg") ? "image/jpeg" : "image/webp";
  form.append("file", new File([bytes as BlobPart], name, { type: mime }));
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return form;
}

async function post(
  form: FormData | null,
  opts: { key?: string | null; method?: string; headers?: Record<string, string> } = {},
): Promise<Response> {
  const headers = new Headers(opts.headers ?? {});
  const key = opts.key === undefined ? KEY : opts.key;
  if (key !== null) headers.set("authorization", `Bearer ${key}`);
  const req = new Request(URL_, {
    method: opts.method ?? "POST",
    headers,
    body: opts.method === "GET" ? undefined : form ?? undefined,
  });
  return handler(req);
}

function binaryString(u8: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return s;
}

function pngChunks(bytes: Uint8Array): Chunk[] {
  return extractChunks(bytes) as Chunk[];
}

type Ifd = Record<number, unknown>;
type ExifDicts = { zeroth: Ifd; gps: Ifd };

function dicts(exif: ReturnType<typeof piexif.load>): ExifDicts {
  return { zeroth: (exif["0th"] ?? {}) as Ifd, gps: (exif.GPS ?? {}) as Ifd };
}

function readPngExif(bytes: Uint8Array): ExifDicts | null {
  const exif = pngChunks(bytes).find((c) => c.name === "eXIf");
  if (!exif) return null;
  return dicts(piexif.load("Exif\0\0" + binaryString(exif.data)));
}

function readJpegExif(bytes: Uint8Array): ExifDicts {
  return dicts(piexif.load(binaryString(bytes)));
}

function dmsToDeg(v: unknown, ref: string): number {
  return piexif.GPSHelper.dmsRationalToDeg(v as number[], ref);
}

function pngHasXmp(bytes: Uint8Array): boolean {
  return pngChunks(bytes).some(
    (c) => c.name === "iTXt" && binaryString(c.data).startsWith("XML:com.adobe.xmp"),
  );
}

async function bodyBytes(res: Response): Promise<Uint8Array> {
  return new Uint8Array(await res.arrayBuffer());
}

async function expectJsonError(res: Response, status: number) {
  assert.equal(res.status, status);
  assert.match(res.headers.get("content-type") ?? "", /application\/json/);
  const body = (await res.json()) as { error?: string };
  assert.equal(typeof body.error, "string");
  return body.error as string;
}

const SYDNEY = { latitude: "-33.8688", longitude: "151.2093" };

beforeEach(() => {
  process.env.METAFORGE_API_KEY = KEY;
});

test("MAX_BODY_BYTES is 4.5 MB", () => {
  assert.equal(MAX_BODY_BYTES, 4_718_592);
});

test("parseCoordinate: blank, whitespace and null are undefined", () => {
  assert.equal(parseCoordinate("", -90, 90), undefined);
  assert.equal(parseCoordinate("  ", -90, 90), undefined);
  assert.equal(parseCoordinate(null, -90, 90), undefined);
});

test("parseCoordinate: parses a decimal and rejects garbage and out-of-range", () => {
  assert.equal(parseCoordinate("-33.8688", -90, 90), -33.8688);
  assert.equal(parseCoordinate("abc", -90, 90), "invalid");
  assert.equal(parseCoordinate("91", -90, 90), "invalid");
  assert.equal(parseCoordinate("-181", -180, 180), "invalid");
});

test("returns 405 for GET", async () => {
  const res = await post(null, { method: "GET" });
  await expectJsonError(res, 405);
});

test("returns 503 when METAFORGE_API_KEY is unset", async () => {
  delete process.env.METAFORGE_API_KEY;
  const res = await post(formWith("tiny.png", { author: "Jane Doe" }));
  const err = await expectJsonError(res, 503);
  assert.equal(err, "API key not configured");
});

test("returns 401 without key", async () => {
  const res = await post(formWith("tiny.png", {}), { key: null });
  await expectJsonError(res, 401);
});

test("returns 401 with wrong key", async () => {
  const res = await post(formWith("tiny.png", {}), { key: "wrong-key" });
  await expectJsonError(res, 401);
});

test("rejects oversized body with 413", async () => {
  const res = await post(formWith("tiny.png", {}), {
    headers: { "content-length": String(MAX_BODY_BYTES + 1) },
  });
  await expectJsonError(res, 413);
});

test("rejects missing file with 400", async () => {
  const form = new FormData();
  form.append("author", "Jane Doe");
  await expectJsonError(await post(form), 400);
});

test('rejects non-file "file" field with 400', async () => {
  const form = new FormData();
  form.append("file", "not a file");
  await expectJsonError(await post(form), 400);
});

test("rejects out-of-range coordinates with 400", async () => {
  await expectJsonError(await post(formWith("tiny.png", { latitude: "91", longitude: "10" })), 400);
  await expectJsonError(await post(formWith("tiny.png", { latitude: "10", longitude: "-181" })), 400);
  await expectJsonError(await post(formWith("tiny.png", { latitude: "abc", longitude: "10" })), 400);
});

test("returns 415 for unrecognised format", async () => {
  const res = await post(formWith("tiny.png", {}, new Uint8Array(64)));
  await expectJsonError(res, 415);
});

test("processes PNG with author and GPS", async () => {
  const res = await post(formWith("tiny.png", { author: "Jane Doe", ...SYDNEY }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
  assert.equal(res.headers.get("content-disposition"), 'inline; filename="image.png"');
  assert.equal(res.headers.get("x-metaforge-format"), "png");
  const out = await bodyBytes(res);
  const exif = readPngExif(out);
  assert.ok(exif, "eXIf chunk present");
  assert.equal(exif.zeroth[piexif.ImageIFD.Artist], "Jane Doe");
  assert.equal(exif.gps[piexif.GPSIFD.GPSLatitudeRef], "S");
  assert.equal(exif.gps[piexif.GPSIFD.GPSLongitudeRef], "E");
  const lat = dmsToDeg(exif.gps[piexif.GPSIFD.GPSLatitude], "S");
  const lng = dmsToDeg(exif.gps[piexif.GPSIFD.GPSLongitude], "E");
  assert.ok(Math.abs(lat - -33.8688) < 1e-4, `lat ${lat}`);
  assert.ok(Math.abs(lng - 151.2093) < 1e-4, `lng ${lng}`);
  assert.equal(pngHasXmp(out), true);
});

test("processes JPEG with author and GPS", async () => {
  const res = await post(formWith("tiny.jpg", { author: "Jane Doe", ...SYDNEY }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/jpeg");
  assert.equal(res.headers.get("content-disposition"), 'inline; filename="image.jpg"');
  assert.equal(res.headers.get("x-metaforge-format"), "jpeg");
  const exif = readJpegExif(await bodyBytes(res));
  assert.equal(exif.zeroth[piexif.ImageIFD.Artist], "Jane Doe");
  assert.equal(exif.gps[piexif.GPSIFD.GPSLatitudeRef], "S");
  assert.equal(exif.gps[piexif.GPSIFD.GPSLongitudeRef], "E");
  const lat = dmsToDeg(exif.gps[piexif.GPSIFD.GPSLatitude], "S");
  assert.ok(Math.abs(lat - -33.8688) < 1e-4, `lat ${lat}`);
});

test("processes WebP and returns image/webp", async () => {
  const res = await post(formWith("tiny.webp", { author: "Jane Doe", ...SYDNEY }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/webp");
  assert.equal(res.headers.get("content-disposition"), 'inline; filename="image.webp"');
  assert.equal(res.headers.get("x-metaforge-format"), "webp");
  assert.equal(detectFormat(await bodyBytes(res)), "webp");
});

test("omits GPS when only latitude given", async () => {
  const res = await post(formWith("tiny.jpg", { author: "Jane Doe", latitude: "-33.8688" }));
  assert.equal(res.status, 200);
  const exif = readJpegExif(await bodyBytes(res));
  assert.equal(exif.zeroth[piexif.ImageIFD.Artist], "Jane Doe");
  assert.deepEqual(exif.gps, {});
});

test("omits whitespace-only author", async () => {
  const res = await post(formWith("tiny.jpg", { author: "   ", ...SYDNEY }));
  assert.equal(res.status, 200);
  const exif = readJpegExif(await bodyBytes(res));
  assert.equal(piexif.ImageIFD.Artist in exif.zeroth, false);
  assert.equal(exif.gps[piexif.GPSIFD.GPSLatitudeRef], "S");
});

test("strips when all fields blank", async () => {
  const chunks = pngChunks(fixture("tiny.png"));
  const iend = chunks.findIndex((c) => c.name === "IEND");
  const tEXt = { name: "tEXt", data: new TextEncoder().encode("Comment\0hello") };
  const dirty = new Uint8Array(encodeChunks([...chunks.slice(0, iend), tEXt, ...chunks.slice(iend)]));
  assert.ok(pngChunks(dirty).some((c) => c.name === "tEXt"), "fixture has tEXt before processing");

  const res = await post(formWith("tiny.png", { author: "", latitude: "", longitude: "" }, dirty));
  assert.equal(res.status, 200);
  const names = pngChunks(await bodyBytes(res)).map((c) => c.name);
  assert.equal(names.includes("tEXt"), false);
  assert.equal(names.includes("eXIf"), false);
  assert.equal(names.includes("iTXt"), false);
});
