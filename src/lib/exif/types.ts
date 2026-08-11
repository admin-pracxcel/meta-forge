export type Metadata = {
  author?: string;
  copyright?: string;
  credit?: string;
  source?: string;

  title?: string;
  caption?: string;
  keywords?: string[];

  gpsLatitude?: number;
  gpsLongitude?: number;
  gpsAltitude?: number;
  city?: string;
  state?: string;
  country?: string;

  dateTaken?: string;
  cameraMake?: string;
  cameraModel?: string;
  software?: string;
};

export type ImageFormat = "jpeg" | "png" | "webp" | "tiff" | "unknown";

export type FormatHandler = {
  strip: (bytes: Uint8Array) => Uint8Array;
  apply: (stripped: Uint8Array, meta: Metadata) => Uint8Array;
};

export function isMetadataEmpty(m: Metadata): boolean {
  if (!m) return true;
  const keys = Object.keys(m) as (keyof Metadata)[];
  return keys.every((k) => {
    const v = m[k];
    if (v == null) return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === "string") return v.trim() === "";
    return false;
  });
}
