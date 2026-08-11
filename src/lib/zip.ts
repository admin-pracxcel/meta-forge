import JSZip from "jszip";
import type { ImageEntry } from "./imageEntry";
import { extensionFor } from "./exif/formats";

export async function buildZip(entries: ImageEntry[]): Promise<Blob> {
  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (const e of entries) {
    if (!e.processedBytes) continue;
    const base = e.file.name.replace(/\.[^.]+$/, "");
    let name = `${base}.${extensionFor(e.format)}`;
    let i = 2;
    while (usedNames.has(name)) {
      name = `${base}-${i}.${extensionFor(e.format)}`;
      i += 1;
    }
    usedNames.add(name);
    // Convert Uint8Array -> ArrayBuffer slice so JSZip is happy under strict typings
    const buf = e.processedBytes.buffer.slice(
      e.processedBytes.byteOffset,
      e.processedBytes.byteOffset + e.processedBytes.byteLength,
    ) as ArrayBuffer;
    zip.file(name, buf);
  }

  return zip.generateAsync({ type: "blob", compression: "STORE" });
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}
