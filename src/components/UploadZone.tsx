import { useCallback } from "react";
import { useDropzone } from "react-dropzone";

type Props = {
  onFilesAdded: (files: File[]) => void;
  disabled?: boolean;
};

export function UploadZone({ onFilesAdded, disabled }: Props) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length > 0) onFilesAdded(accepted);
    },
    [onFilesAdded],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled,
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
      "image/tiff": [".tif", ".tiff"],
    },
    multiple: true,
  });

  return (
    <div
      {...getRootProps()}
      className={[
        "group relative flex flex-col items-center justify-center rounded-xl2 border-2 border-dashed p-10 text-center transition",
        isDragActive
          ? "border-ember-500 bg-ember-50/60"
          : "border-ink-900/15 bg-white/60 hover:border-ember-500/50 hover:bg-cream-100/70",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
      ].join(" ")}
    >
      <input {...getInputProps()} />
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ember-50 text-ember-600">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12" />
          <path d="m6 9 6-6 6 6" />
          <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
      </div>
      <p className="font-serif text-2xl leading-tight text-ink-900">
        {isDragActive ? "Drop them right here" : "Drop images to strip & rewrite metadata"}
      </p>
      <p className="mt-1.5 text-sm text-ink-500">
        or <span className="text-ember-600 underline decoration-ember-300 underline-offset-4">click to browse</span> — JPEG, PNG, WebP supported (TIFF coming soon)
      </p>
      <p className="mt-4 text-xs text-ink-300">Files never leave your browser.</p>
    </div>
  );
}
