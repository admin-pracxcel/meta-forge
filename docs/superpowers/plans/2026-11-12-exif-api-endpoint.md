# EXIF API Endpoint + n8n Worker Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose Metaforge's strip-and-stamp EXIF code as an authenticated Vercel endpoint and make the n8n "Fal.ai Image Generator - Worker" call it before uploading to Drive.

**Architecture:** One Vercel Node serverless function at `api/process.ts` using the web-standard `Request`/`Response` handler signature. It parses `multipart/form-data` with the built-in `request.formData()`, builds a `Metadata` object from the `author`/`latitude`/`longitude` fields, and calls the existing `stripAndApply` from `src/lib/exif`. The n8n Worker gets one new HTTP Request node ("Stamp EXIF") between "Download Image" and "Upload to Drive".

**Tech Stack:** Vite + React + TypeScript (existing), Vercel Functions (Node 18+ web handler), `node:test` via `tsx`, n8n public API via the n8n MCP tools.

**Spec:** `docs/superpowers/specs/2026-11-12-exif-api-endpoint-design.md`

## Global Constraints

- Route is exactly `POST /api/process`; auth header `Authorization: Bearer <key>`; env var `METAFORGE_API_KEY`.
- Form fields are exactly `file`, `author`, `latitude`, `longitude`.
- Status codes: 200, 400, 401, 405, 413, 415, 500, 503 as in spec §1. Every non-200 body is JSON `{ "error": "<human readable>" }`.
- Success headers: `Content-Type` from `mimeFor(format)`, `Content-Disposition: inline; filename="image.<ext>"`, `X-Metaforge-Format`.
- Fail closed: env var unset → 503 on every request, checked before auth.
- Body limit 4.5 MB (4 718 592 bytes): reject larger `Content-Length` with 413.
- No new runtime dependencies. `tsx` as a devDependency is allowed.
- `npm run build` (`tsc -b && vite build`) must keep passing and must type-check `api/`.
- The endpoint must import `src/lib/exif`; it must not re-implement any EXIF logic.
- Dispatcher workflow `9OrGyT0Mnwb2wxbx` is not modified.
- n8n node must not contain the API key; it references a Header Auth credential the owner attaches.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. A `Content-Length` just over 4.5 MB must return 413 JSON, not a Vercel HTML error or a crash. (Task 3 test `rejects oversized body with 413`.)
2. The `file` field sent as plain text instead of a file part must return 400, not 500. (Task 3 test `rejects non-file "file" field with 400`.)
3. Latitude `91` or longitude `-181` must return 400 even though they parse as numbers. (Task 3 test `rejects out-of-range coordinates with 400`.)
4. Whitespace-only `author` must be treated as blank and omitted, not written as `"   "`. (Task 3 test `omits whitespace-only author`.)
5. A WebP input must come back as `image/webp` with a `.webp` filename, not `.png`. (Task 3 test `processes WebP and returns image/webp`.)

---

### Task 1: Attach git history and install dependencies

**Files:**
- Create: `.git/` (init), commit of `docs/superpowers/specs/2026-11-12-exif-api-endpoint-design.md` and this plan.

**Interfaces:**
- Produces: a working tree on branch `main` whose history is `origin/main`, with `node_modules` installed.

- [ ] **Step 1: Initialise and attach the remote**

```bash
cd /Users/bilalshaikh/Downloads/Pracxcel/meta-forge-main
git init -b main
git remote add origin git@github.com-work:admin-pracxcel/meta-forge.git
git fetch origin main
git reset origin/main
git status --short
```
Expected: `git status --short` lists only `?? docs/` (the spec and plan). Anything else means the folder differs from `main`; stop and report the diff.

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: exits 0, `node_modules/piexifjs` exists.

- [ ] **Step 3: Confirm the baseline builds**

Run: `npm run build`
Expected: exits 0, `dist/index.html` exists.

- [ ] **Step 4: Commit the design and plan**

```bash
git add docs/
git commit -m "docs: design and plan for EXIF API endpoint + n8n integration

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Library exports, API type-checking, and test harness

**Files:**
- Modify: `src/lib/exif/index.ts` (add exports)
- Create: `tsconfig.api.json`
- Modify: `tsconfig.json` (add reference)
- Modify: `package.json` (add `tsx` devDependency, `test` script)
- Create: `test/fixtures/tiny.png`, `test/fixtures/tiny.jpg`, `test/fixtures/tiny.webp`
- Create: `scripts/make-fixtures.mjs`
- Create: `test/exports.test.ts`

**Interfaces:**
- Produces: `src/lib/exif/index.ts` exports `stripAndApply`, `detectFormat`, `mimeFor`, `extensionFor`, and types `Metadata`, `ImageFormat`, `ProcessResult`.
- Produces: `npm test` runs `tsx --test "test/**/*.test.ts"`.
- Produces: three fixture images, each a valid 2x2 image of its format, smaller than 2 KB, with no EXIF.

- [ ] **Step 1: Write the failing export test**

`test/exports.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectFormat, mimeFor, extensionFor } from "../src/lib/exif/index.ts";

test("library re-exports format helpers", () => {
  assert.equal(mimeFor("png"), "image/png");
  assert.equal(extensionFor("jpeg"), "jpg");
});

for (const [file, fmt] of [["tiny.png", "png"], ["tiny.jpg", "jpeg"], ["tiny.webp", "webp"]] as const) {
  test(`fixture ${file} is detected as ${fmt}`, () => {
    const bytes = new Uint8Array(readFileSync(new URL(`./fixtures/${file}`, import.meta.url)));
    assert.equal(detectFormat(bytes), fmt);
  });
}
```

- [ ] **Step 2: Add `tsx` and the test script, run the test to see it fail**

```bash
npm install --save-dev tsx
```
Add to `package.json` scripts: `"test": "tsx --test \"test/**/*.test.ts\""`.
Run: `npm test`
Expected: FAIL. `mimeFor` is not exported from `../src/lib/exif/index.ts`; fixture files not found.

- [ ] **Step 3: Add the exports**

In `src/lib/exif/index.ts` change the `detectFormat` re-export line to
`export { detectFormat, mimeFor, extensionFor } from "./formats";` and export `ProcessResult` as a type alongside `Metadata` and `ImageFormat`.

- [ ] **Step 4: Write `scripts/make-fixtures.mjs` and generate fixtures**

The script writes `test/fixtures/tiny.png` by hand (PNG signature + IHDR 2x2 RGB 8-bit + IDAT from `zlib.deflateSync` of 2 filtered scanlines + IEND, using `crc32` from `../src/lib/exif/binary.ts` via `tsx` or a local copy), then runs macOS `sips` to convert it: `sips -s format jpeg tiny.png --out tiny.jpg` and `sips -s format webp tiny.png --out tiny.webp`. If `sips` cannot write WebP, fall back to `cwebp` if present; otherwise print instructions and exit 1. Fixtures are committed, so the script runs once on this machine.

Run: `npx tsx scripts/make-fixtures.mjs && ls -la test/fixtures`
Expected: three files, each under 2 KB.

- [ ] **Step 5: Run the test to see it pass**

Run: `npm test`
Expected: 4 tests PASS.

- [ ] **Step 6: Create `tsconfig.api.json` and reference it**

`tsconfig.api.json`: copy `tsconfig.app.json`'s `compilerOptions`, then set `"lib": ["ES2023", "DOM"]`, `"types": ["node"]`, remove `jsx`, set `"tsBuildInfoFile": "./node_modules/.tmp/tsconfig.api.tsbuildinfo"`, and `"include": ["api", "test", "src/lib", "src/types"]`. Add `{ "path": "./tsconfig.api.json" }` to `tsconfig.json` references.

Run: `npm run build`
Expected: exits 0 (test file type-checks; `api/` is still empty).

- [ ] **Step 7: Commit**

```bash
git add src/lib/exif/index.ts tsconfig.api.json tsconfig.json package.json package-lock.json test/ scripts/make-fixtures.mjs
git commit -m "chore: export format helpers, add tsx test harness and image fixtures

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `api/process.ts` handler

**Files:**
- Create: `api/process.ts`
- Create: `test/api-process.test.ts`

**Interfaces:**
- Consumes: `stripAndApply(bytes: Uint8Array, meta: Metadata): ProcessResult`, `mimeFor`, `extensionFor` from `../src/lib/exif/index.ts`.
- Produces: `export default async function handler(request: Request): Promise<Response>` in `api/process.ts`. Also exports `export const MAX_BODY_BYTES = 4_718_592;` and `export function parseCoordinate(raw: string | null, min: number, max: number): number | undefined | "invalid"` for direct unit testing.

- [ ] **Step 1: Write the failing tests**

`test/api-process.test.ts` uses `node:test`, imports `handler` and `parseCoordinate`, and a helper `post(form: FormData | null, opts?: { key?: string; method?: string; headers?: Record<string,string> })` that builds `new Request("http://x/api/process", ...)`, sets `Authorization: Bearer <key>` when given, and calls `handler`. `beforeEach` sets `process.env.METAFORGE_API_KEY = "test-key"`. Fixtures loaded as in Task 2; a form helper `formWith(fixture: string, fields: Record<string,string>)` appends `file` as `new File([bytes], fixture, { type: mime })`.

Read-back helpers: `readPngExif(bytes)` returns `piexif.load("Exif\0\0" + binaryString(eXIfChunk.data))` using `png-chunks-extract`; `readJpegExif(bytes)` returns `piexif.load(binaryString(bytes))`; `pngHasXmp(bytes)` is true if any `iTXt` chunk starts with `XML:com.adobe.xmp`.

Tests and assertions:
- `parseCoordinate` unit: `("", -90, 90)` → `undefined`; `("  ", ...)` → `undefined`; `(null, ...)` → `undefined`; `("-33.8688", -90, 90)` → `-33.8688`; `("abc", ...)` → `"invalid"`; `("91", -90, 90)` → `"invalid"`; `("-181", -180, 180)` → `"invalid"`.
- `returns 405 for GET` → status 405, JSON body has `error`.
- `returns 503 when METAFORGE_API_KEY is unset` → delete env, POST valid form with key → 503, body `{ error: "API key not configured" }`.
- `returns 401 without key` and `returns 401 with wrong key` → 401.
- `rejects oversized body with 413` → header `Content-Length: 4718593` → 413.
- `rejects missing file with 400` → form with only `author` → 400.
- `rejects non-file "file" field with 400` → `form.append("file", "not a file")` → 400.
- `rejects out-of-range coordinates with 400` → latitude `91` → 400; longitude `-181` → 400; latitude `abc` → 400.
- `returns 415 for unrecognised format` → file of 64 zero bytes → 415.
- `processes PNG with author and GPS` → 200; `content-type` = `image/png`; `content-disposition` = `inline; filename="image.png"`; `x-metaforge-format` = `png`; `readPngExif` `0th[piexif.ImageIFD.Artist]` = `"Jane Doe"`; `GPS[GPSLatitudeRef]` = `"S"`, `GPS[GPSLongitudeRef]` = `"E"`; `GPSLatitude` DMS converts back to `-33.8688` within 1e-4 (use `piexif.GPSHelper.dmsRationalToDeg`); `pngHasXmp` true.
- `processes JPEG with author and GPS` → same assertions via `readJpegExif`; `content-type` = `image/jpeg`; filename `image.jpg`.
- `processes WebP and returns image/webp` → 200, `content-type` = `image/webp`, filename `image.webp`, `x-metaforge-format` = `webp`, and `detectFormat(outBytes) === "webp"`.
- `omits GPS when only latitude given` → 200 and read-back has Artist but `GPS` is empty `{}`.
- `omits whitespace-only author` → author `"   "`, lat/long given → read-back has no `Artist` key and has GPS.
- `strips when all fields blank` → PNG fixture that first had an extra `tEXt` chunk injected (build it in the test with `png-chunks-encode`) → 200 and output has no `tEXt`, no `eXIf`, no `iTXt` chunk.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL, `Cannot find module '../api/process.ts'`.

- [ ] **Step 3: Implement `api/process.ts`**

Export `MAX_BODY_BYTES`, `parseCoordinate`, and `default async function handler(request: Request): Promise<Response>`. Order of checks: method → env var → auth (constant-time compare via `crypto.timingSafeEqual` on equal-length buffers; length mismatch is a failure) → `Content-Length` → `request.formData()` inside try/catch (parse failure → 400) → `file` must be an instance with `arrayBuffer` (a `Blob`/`File`), else 400 → coordinates via `parseCoordinate` (`"invalid"` → 400) → `author` trimmed, empty → omitted → GPS pair only if both numbers → `stripAndApply` inside try/catch mapping the `"TIFF support is coming soon..."` and `"Unrecognized image format."` messages to 415 and anything else to 500. Success: `new Response(new Blob([result.bytes]), { status: 200, headers })` with the three success headers. A small `json(status, error)` helper builds every error response with `Content-Type: application/json`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Build and lint**

Run: `npm run build && npm run lint`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add api/process.ts test/api-process.test.ts
git commit -m "feat: add POST /api/process endpoint for strip-and-stamp EXIF

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: README API section

**Files:**
- Modify: `README.md` (new `## API` section after `## Format support`)

- [ ] **Step 1: Write the section**

Cover: route, auth header, env var, the four form fields with the blank/omit rule and the both-coordinates rule, status codes table, response headers, the 4.5 MB limit, the Latin-1 limitation of EXIF `Artist` (XMP copy is correct), an example `curl -X POST -H "Authorization: Bearer $METAFORGE_API_KEY" -F file=@photo.jpg -F author="Jane Doe" -F latitude=-33.8688 -F longitude=151.2093 https://meta-forge-ten.vercel.app/api/process -o out.jpg`, and the owner setup steps (Vercel env var, n8n Header Auth credential named `Metaforge API`). Also add `npm test` to the Dev section.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document the /api/process endpoint

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Push and verify deployment

- [ ] **Step 1: Push**

Run: `git push origin main`
Expected: fast-forward push accepted. If rejected, stop and report; the owner pushes.

- [ ] **Step 2: Wait for Vercel, then probe the route**

Poll every 30 s for up to 5 min:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://meta-forge-ten.vercel.app/api/process
```
Expected: `503` (route built, key not yet set). `404` after 5 min means the function did not deploy; inspect Vercel build logs with the owner. `200` with HTML means an SPA rewrite is shadowing the route.

- [ ] **Step 3: Confirm the UI still works**

Run: `curl -s https://meta-forge-ten.vercel.app/ | grep -c Metaforge`
Expected: at least 1.

---

### Task 6: Owner secrets (owner steps, builder waits)

- [ ] **Step 1: Owner sets `METAFORGE_API_KEY` on Vercel (Production) and redeploys.**
- [ ] **Step 2: Builder verifies**: unauthenticated POST now returns `401`; POST with the key and the `tiny.png` fixture returns `200` with `content-type: image/png`.
- [ ] **Step 3: Owner creates the n8n Header Auth credential `Metaforge API` (header `Authorization`, value `Bearer <key>`) and adds columns `Author`, `Latitude`, `Longitude` to Sheet1.**

---

### Task 7: n8n Worker rewire

**Files:** n8n workflow `QHneqwqMa6AlUA5P` only.

**Interfaces:**
- Consumes: deployed endpoint from Task 5; credential from Task 6.

- [ ] **Step 1: Add the node and rewire** with `n8n_update_partial_workflow`, intent "Stamp EXIF via Metaforge before Drive upload":

- `addNode` name `Stamp EXIF`, type `n8n-nodes-base.httpRequest`, typeVersion `4.2`, position `[720, 0]`, `retryOnFail: true`, `maxTries: 2`, `waitBetweenTries: 3000`, parameters:
  - `method: "POST"`, `url: "https://meta-forge-ten.vercel.app/api/process"`
  - `authentication: "genericCredentialType"`, `genericAuthType: "httpHeaderAuth"`
  - `sendBody: true`, `contentType: "multipart-form-data"`, `bodyParameters.parameters`:
    - `{ parameterType: "formBinaryData", name: "file", inputDataFieldName: "data" }`
    - `{ name: "author", value: "={{ $('On Item From Parent').item.json.Author ?? '' }}" }`
    - `{ name: "latitude", value: "={{ $('On Item From Parent').item.json.Latitude ?? '' }}" }`
    - `{ name: "longitude", value: "={{ $('On Item From Parent').item.json.Longitude ?? '' }}" }`
  - `options: { timeout: 60000, response: { response: { responseFormat: "file", outputPropertyName: "data" } } }`
- `moveNode` `Upload to Drive` → `[960, 0]`; `moveNode` `Update Sheet` → `[1200, 0]`.
- `removeConnection` `Download Image` → `Upload to Drive`.
- `addConnection` `Download Image` → `Stamp EXIF`; `addConnection` `Stamp EXIF` → `Upload to Drive`.

- [ ] **Step 2: Validate**

Run `n8n_validate_workflow({ id: "QHneqwqMa6AlUA5P" })`.
Expected: no errors. A warning that `Stamp EXIF` has no credential selected is expected until Step 3.

- [ ] **Step 3: Owner attaches the credential**

Owner opens the Worker in n8n, opens `Stamp EXIF`, selects credential `Metaforge API`, saves. (The public API cannot look up credential IDs, so this is a UI step.)

- [ ] **Step 4: End-to-end test**

Owner sets one sheet row to `Processed = No` with `Author`, `Latitude`, `Longitude` filled, and runs the dispatcher once. Builder checks the execution via `n8n_executions` for the Worker: `Stamp EXIF` succeeded, `Upload to Drive` produced a `webViewLink`, `Update Sheet` wrote `Processed = Yes`. Owner downloads the Drive file; `exiftool` shows `Artist`, `Creator` (XMP), `GPS Latitude`/`GPS Longitude`, and no tags from the original generation.
