import { useCallback, useEffect, useMemo, useState } from "react";
import { UploadZone } from "./components/UploadZone";
import { MetadataForm } from "./components/MetadataForm";
import { ImageList } from "./components/ImageList";
import { ActionBar } from "./components/ActionBar";
import { detectFormat, stripAndApply, type Metadata } from "./lib/exif";
import type { ImageEntry } from "./lib/imageEntry";
import { nextId } from "./lib/imageEntry";
import { buildZip, triggerDownload } from "./lib/zip";
import { isMetadataEmpty } from "./lib/exif/types";

const EMPTY_META: Metadata = {};

function App() {
  const [entries, setEntries] = useState<ImageEntry[]>([]);
  const [meta, setMeta] = useState<Metadata>(EMPTY_META);
  const [isProcessing, setIsProcessing] = useState(false);
  const [zipBuilding, setZipBuilding] = useState(false);

  // Revoke object URLs when entries leave the list
  useEffect(() => {
    return () => {
      for (const e of entries) URL.revokeObjectURL(e.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = useCallback(async (files: File[]) => {
    const additions: ImageEntry[] = [];
    for (const file of files) {
      const buf = new Uint8Array(await file.arrayBuffer());
      const format = detectFormat(buf);
      additions.push({
        id: nextId(),
        file,
        format,
        originalSize: file.size,
        status: "pending",
        previewUrl: URL.createObjectURL(file),
      });
    }
    setEntries((prev) => [...prev, ...additions]);
  }, []);

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => {
      const target = prev.find((e) => e.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((e) => e.id !== id);
    });
  }, []);

  const clearAll = useCallback(() => {
    setEntries((prev) => {
      for (const e of prev) URL.revokeObjectURL(e.previewUrl);
      return [];
    });
  }, []);

  const processAll = useCallback(async () => {
    setIsProcessing(true);
    // Snapshot current entries; process sequentially so we can update UI per item.
    const ids = entries.map((e) => e.id);
    for (const id of ids) {
      // Mark processing
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: "processing", error: undefined } : e)),
      );
      // Read file fresh
      const target = entries.find((e) => e.id === id);
      if (!target) continue;
      try {
        const bytes = new Uint8Array(await target.file.arrayBuffer());
        const result = stripAndApply(bytes, meta);
        setEntries((prev) =>
          prev.map((e) =>
            e.id === id
              ? {
                  ...e,
                  status: "done",
                  processedBytes: result.bytes,
                  processedSize: result.bytes.byteLength,
                }
              : e,
          ),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setEntries((prev) =>
          prev.map((e) => (e.id === id ? { ...e, status: "error", error: message } : e)),
        );
      }
    }
    setIsProcessing(false);
  }, [entries, meta]);

  const downloadZip = useCallback(async () => {
    const done = entries.filter((e) => e.status === "done" && e.processedBytes);
    if (done.length === 0) return;
    setZipBuilding(true);
    try {
      const blob = await buildZip(done);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      triggerDownload(blob, `metaforge-${stamp}.zip`);
    } finally {
      setZipBuilding(false);
    }
  }, [entries]);

  const stats = useMemo(() => {
    const total = entries.length;
    const processed = entries.filter((e) => e.status === "done").length;
    return { total, processed };
  }, [entries]);

  const canProcess = entries.length > 0 && !isMetadataEmpty(meta);
  const canDownload =
    !zipBuilding && entries.some((e) => e.status === "done");

  return (
    <div className="mx-auto max-w-5xl px-4 pt-10 pb-24 sm:px-6">
      <header className="mb-10">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-ink-900/[0.08] bg-white/70 px-3 py-1 text-xs font-medium text-ink-700 shadow-soft backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-ember-500" />
          Runs entirely in your browser · no uploads
        </div>
        <h1 className="font-serif text-5xl leading-[1.05] tracking-tight text-ink-900 sm:text-6xl">
          Metaforge
        </h1>
        <p className="mt-3 max-w-xl text-lg text-ink-500">
          Strip everything out of your images, then stamp on exactly the metadata you
          want. Bulk. Fast. Private.
        </p>
      </header>

      <div className="grid gap-6">
        <UploadZone onFilesAdded={addFiles} disabled={isProcessing} />

        {entries.length > 0 && (
          <ImageList entries={entries} onRemove={removeEntry} onClear={clearAll} />
        )}

        <MetadataForm value={meta} onChange={setMeta} />

        <ActionBar
          onProcess={processAll}
          onDownload={downloadZip}
          canProcess={canProcess}
          isProcessing={isProcessing}
          canDownload={canDownload}
          processedCount={stats.processed}
          totalCount={stats.total}
        />

        {entries.length > 0 && isMetadataEmpty(meta) && (
          <p className="text-center text-xs text-ink-500">
            Fill at least one metadata field to enable processing. Empty fields are
            stripped from the output.
          </p>
        )}
      </div>

      <footer className="mt-16 text-center text-xs text-ink-300">
        Metaforge · client-side EXIF/XMP editor
      </footer>
    </div>
  );
}

export default App;
