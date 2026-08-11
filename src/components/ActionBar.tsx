type Props = {
  onProcess: () => void;
  onDownload: () => void;
  canProcess: boolean;
  isProcessing: boolean;
  canDownload: boolean;
  processedCount: number;
  totalCount: number;
};

export function ActionBar({
  onProcess,
  onDownload,
  canProcess,
  isProcessing,
  canDownload,
  processedCount,
  totalCount,
}: Props) {
  return (
    <div className="sticky bottom-4 z-10">
      <div className="card flex items-center justify-between gap-4 px-5 py-3 shadow-pop">
        <div className="text-sm text-ink-500">
          {totalCount === 0 ? (
            <>Add images to get started.</>
          ) : isProcessing ? (
            <>
              Processing… {processedCount}/{totalCount}
            </>
          ) : processedCount === totalCount && totalCount > 0 ? (
            <>All {totalCount} image{totalCount === 1 ? "" : "s"} processed.</>
          ) : (
            <>
              {processedCount}/{totalCount} processed
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-secondary"
            onClick={onProcess}
            disabled={!canProcess || isProcessing}
          >
            {isProcessing ? "Processing…" : "Apply metadata"}
          </button>
          <button
            className="btn-primary"
            onClick={onDownload}
            disabled={!canDownload}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download ZIP
          </button>
        </div>
      </div>
    </div>
  );
}
