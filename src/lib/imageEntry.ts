import type { ImageFormat } from "./exif";

export type ImageStatus = "pending" | "processing" | "done" | "error";

export type ImageEntry = {
  id: string;
  file: File;
  format: ImageFormat;
  originalSize: number;
  status: ImageStatus;
  processedBytes?: Uint8Array;
  processedSize?: number;
  previewUrl: string;
  error?: string;
};

let idCounter = 0;
export function nextId(): string {
  idCounter += 1;
  return `img-${Date.now().toString(36)}-${idCounter}`;
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
