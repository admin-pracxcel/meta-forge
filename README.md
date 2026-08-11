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
