# Metaforge

Bulk EXIF/IPTC metadata editor. Strip everything, stamp on exactly what you want, download as a ZIP. Runs entirely in the browser — files never touch a server.

## Stack

Vite + React + TypeScript, Tailwind. Client-side only.

## Dev

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ static site
npm run preview  # serve the build
npm test         # unit tests (node:test via tsx)
```

## Format support

| Format | Strip | Write EXIF | Write XMP | Notes                          |
| ------ | ----- | ---------- | --------- | ------------------------------ |
| JPEG   | ✅    | ✅         | ✅        | via piexifjs + JFIF-safe APP1  |
| PNG    | ✅    | ✅ (eXIf)  | ✅ (iTXt) | PNG 1.5 eXIf chunk             |
| WebP   | ✅    | ✅         | ✅        | Auto-upgrades to VP8X          |
| TIFF   | —     | —          | —         | Detected but not yet processed |

Fields written cover EXIF (Artist, Copyright, ImageDescription, Make/Model,
Software, DateTime, GPS lat/lng/altitude) and XMP (dc:creator/title/description/
rights/subject, photoshop:Credit/Source/City/State/Country/DateCreated).
Any field left blank is stripped from the output.

## API

The same strip-and-stamp pipeline is exposed as a Vercel serverless function so
automations (e.g. n8n) can call it. Source: `api/process.ts`.

```
POST https://meta-forge-ten.vercel.app/api/process
Authorization: Bearer <METAFORGE_API_KEY>
Content-Type: multipart/form-data
```

| field       | type | required | notes                                              |
| ----------- | ---- | -------- | -------------------------------------------------- |
| `file`      | file | yes      | JPEG, PNG or WebP (TIFF is rejected with 415)      |
| `author`    | text | no       | blank → not written                                |
| `latitude`  | text | no       | decimal degrees, -90..90, negative = South         |
| `longitude` | text | no       | decimal degrees, -180..180, negative = West        |

The file is **always fully stripped**. `author` is written to EXIF `Artist` and
XMP `dc:creator`; GPS is written only when **both** coordinates are present and
valid (one without the other is silently omitted). A non-numeric or
out-of-range coordinate is a `400`.

Note: EXIF `Artist` is an ASCII tag, so characters above U+00FF (e.g. CJK) are
mangled in the EXIF copy while the XMP copy is correct. Latin-script names,
including accents, are fine.

**Response:** `200` with the processed image bytes. Headers: `Content-Type`
(`image/jpeg`, `image/png` or `image/webp`), `Content-Disposition:
inline; filename="image.<ext>"`, `X-Metaforge-Format`.

| status | meaning                                                        |
| ------ | -------------------------------------------------------------- |
| 400    | no `file`, bad multipart, or invalid latitude / longitude      |
| 401    | missing or wrong `Authorization` bearer key                    |
| 405    | not POST                                                       |
| 413    | body over 4.5 MB (Vercel's serverless request limit)           |
| 415    | TIFF or unrecognised image format                              |
| 500    | processing error                                               |
| 503    | `METAFORGE_API_KEY` not set on the deployment (fails closed)   |

All error bodies are JSON: `{ "error": "<message>" }`.

```bash
curl -X POST \
  -H "Authorization: Bearer $METAFORGE_API_KEY" \
  -F file=@photo.jpg \
  -F author="Jane Doe" \
  -F latitude=-33.8688 \
  -F longitude=151.2093 \
  https://meta-forge-ten.vercel.app/api/process -o out.jpg
```

### Setup

1. Generate a key: `openssl rand -hex 32`.
2. Vercel project → Settings → Environment Variables → add `METAFORGE_API_KEY`
   (Production) and redeploy.
3. In n8n, create a **Header Auth** credential named `Metaforge API` with header
   `Authorization` and value `Bearer <key>`, and use it on the HTTP Request node
   that calls this endpoint.

## Smoke test

```bash
npx tsx scripts/smoke.mjs
```

Processes a real JPEG and PNG and asserts EXIF + XMP roundtrip correctly.
Update the file paths in the script for your machine.

## Layout

```
src/
  components/     UploadZone, MetadataForm, ImageList, ActionBar
  lib/
    exif/
      index.ts    stripAndApply(bytes, meta) → { bytes, format }
      jpeg.ts     APP0/APP1 walker; keeps JFIF, injects EXIF + XMP APP1s
      png.ts      chunk filter; adds eXIf + iTXt(XMP) before IEND
      webp.ts     RIFF chunk rewriter; ensures VP8X with EXIF/XMP flags
      builders.ts EXIF payload + XMP packet from Metadata
      formats.ts  magic-byte format detection
      binary.ts   Uint8Array ⇄ binary string, CRC32, concat
    zip.ts        JSZip bundle + download trigger
    imageEntry.ts per-file state model
  App.tsx         wires state, pipeline, and ZIP download
```
