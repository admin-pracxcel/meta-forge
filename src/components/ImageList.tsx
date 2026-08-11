import type { ImageEntry } from "../lib/imageEntry";
import { humanSize } from "../lib/imageEntry";

type Props = {
  entries: ImageEntry[];
  onRemove: (id: string) => void;
  onClear: () => void;
};

function StatusChip({ entry }: { entry: ImageEntry }) {
  switch (entry.status) {
    case "pending":
      return <span className="chip">Ready</span>;
    case "processing":
      return (
        <span className="chip-processing">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ember-500" />
          Processing
        </span>
      );
    case "done":
      return (
        <span className="chip-success">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Done
        </span>
      );
    case "error":
      return <span className="chip-error" title={entry.error}>Failed</span>;
  }
}

export function ImageList({ entries, onRemove, onClear }: Props) {
  if (entries.length === 0) return null;

  const bytesSaved = entries.reduce((sum, e) => {
    if (e.processedSize == null) return sum;
    return sum + Math.max(0, e.originalSize - e.processedSize);
  }, 0);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink-900/[0.06] bg-cream-100/50 px-5 py-4">
        <div>
          <h2 className="font-serif text-2xl text-ink-900">
            {entries.length} image{entries.length === 1 ? "" : "s"}
          </h2>
          {bytesSaved > 0 && (
            <p className="mt-0.5 text-xs text-ink-500">
              Trimmed {humanSize(bytesSaved)} of metadata.
            </p>
          )}
        </div>
        <button onClick={onClear} className="btn-ghost text-xs">
          Clear all
        </button>
      </div>

      <ul className="divide-y divide-ink-900/[0.06]">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-center gap-4 px-5 py-3">
            <img
              src={entry.previewUrl}
              alt=""
              className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-ink-900/10"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink-900">
                {entry.file.name}
              </p>
              <p className="mt-0.5 text-xs text-ink-500">
                {entry.format.toUpperCase()} · {humanSize(entry.originalSize)}
                {entry.processedSize != null &&
                  ` → ${humanSize(entry.processedSize)}`}
              </p>
              {entry.error && (
                <p className="mt-1 text-xs text-red-700">{entry.error}</p>
              )}
            </div>
            <StatusChip entry={entry} />
            <button
              onClick={() => onRemove(entry.id)}
              className="rounded-md p-1.5 text-ink-500 transition hover:bg-cream-200 hover:text-ink-900"
              aria-label="Remove"
              title="Remove"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
