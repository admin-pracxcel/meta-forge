import { useState } from "react";
import type { Metadata } from "../lib/exif";

type Props = {
  value: Metadata;
  onChange: (m: Metadata) => void;
};

type SectionProps = {
  title: string;
  description: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
};

function Section({ title, description, children, defaultOpen = false }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-ink-900/[0.06] last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between px-5 py-4 text-left transition hover:bg-cream-100/60"
      >
        <div>
          <h3 className="font-serif text-xl text-ink-900">{title}</h3>
          <p className="mt-0.5 text-xs text-ink-500">{description}</p>
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`mt-1.5 h-4 w-4 shrink-0 text-ink-500 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">{children}</div>}
    </div>
  );
}

export function MetadataForm({ value, onChange }: Props) {
  const [additionalOpen, setAdditionalOpen] = useState(false);

  const set = <K extends keyof Metadata>(k: K, v: Metadata[K]) =>
    onChange({ ...value, [k]: v });

  const textInput = (key: keyof Metadata, label: string, placeholder = "") => (
    <div>
      <label className="field-label">{label}</label>
      <input
        type="text"
        className="field-input"
        placeholder={placeholder}
        value={(value[key] as string) ?? ""}
        onChange={(e) => set(key, e.target.value as never)}
      />
    </div>
  );

  const numberInput = (key: keyof Metadata, label: string, placeholder = "") => (
    <div>
      <label className="field-label">{label}</label>
      <input
        type="number"
        step="any"
        className="field-input"
        placeholder={placeholder}
        value={value[key] == null ? "" : String(value[key])}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "") set(key, undefined as never);
          else {
            const n = Number(v);
            set(key, (Number.isNaN(n) ? undefined : n) as never);
          }
        }}
      />
    </div>
  );

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-ink-900/[0.06] bg-cream-100/50 px-5 py-4">
        <h2 className="font-serif text-2xl text-ink-900">Metadata to apply</h2>
        <p className="mt-1 text-sm text-ink-500">
          Any field you leave blank is stripped from the output. Nothing else survives.
        </p>
      </div>

      {/* Primary fields — the main focus */}
      <div className="grid gap-4 px-5 py-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="field-label">Author</label>
          <input
            type="text"
            className="field-input text-base"
            placeholder="Jane Photographer"
            value={value.author ?? ""}
            onChange={(e) => set("author", e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Latitude</label>
          <input
            type="number"
            step="any"
            className="field-input text-base"
            placeholder="-33.8688"
            value={value.gpsLatitude == null ? "" : String(value.gpsLatitude)}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") set("gpsLatitude", undefined);
              else {
                const n = Number(v);
                set("gpsLatitude", Number.isNaN(n) ? undefined : n);
              }
            }}
          />
          <p className="mt-1 text-xs text-ink-500">-90 to 90. Negative = South.</p>
        </div>
        <div>
          <label className="field-label">Longitude</label>
          <input
            type="number"
            step="any"
            className="field-input text-base"
            placeholder="151.2093"
            value={value.gpsLongitude == null ? "" : String(value.gpsLongitude)}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") set("gpsLongitude", undefined);
              else {
                const n = Number(v);
                set("gpsLongitude", Number.isNaN(n) ? undefined : n);
              }
            }}
          />
          <p className="mt-1 text-xs text-ink-500">-180 to 180. Negative = West.</p>
        </div>
      </div>

      {/* Additional options — everything else */}
      <div className="border-t border-ink-900/[0.06]">
        <button
          type="button"
          onClick={() => setAdditionalOpen((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-cream-100/60"
        >
          <div className="flex items-center gap-2">
            <span className="font-serif text-lg text-ink-900">Additional options</span>
            <span className="chip">optional</span>
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-4 w-4 shrink-0 text-ink-500 transition-transform ${additionalOpen ? "rotate-180" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {additionalOpen && (
          <div className="border-t border-ink-900/[0.06]">
            <Section title="Identity" description="Copyright, credit and source.">
              {textInput("copyright", "Copyright notice", "© 2026 Studio Name")}
              {textInput("credit", "Credit", "Studio Name / Client")}
              {textInput("source", "Source", "Original supplier")}
            </Section>

            <Section title="Geolocation" description="Altitude and location names.">
              {numberInput("gpsAltitude", "Altitude (m)", "58")}
              {textInput("city", "City", "Sydney")}
              {textInput("state", "State / Region", "NSW")}
              {textInput("country", "Country", "Australia")}
            </Section>

            <Section title="Description" description="Title, caption and keywords.">
              {textInput("title", "Title")}
              <div className="sm:col-span-2">
                <label className="field-label">Caption / Description</label>
                <textarea
                  className="field-textarea min-h-[80px]"
                  placeholder="What's in the image."
                  value={value.caption ?? ""}
                  onChange={(e) => set("caption", e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="field-label">Keywords</label>
                <input
                  type="text"
                  className="field-input"
                  placeholder="comma, separated, keywords"
                  value={(value.keywords ?? []).join(", ")}
                  onChange={(e) => {
                    const list = e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter((s) => s.length > 0);
                    set("keywords", list);
                  }}
                />
              </div>
            </Section>

            <Section title="Camera & date" description="Capture date, make, model and software.">
              <div>
                <label className="field-label">Date taken</label>
                <input
                  type="datetime-local"
                  className="field-input"
                  value={value.dateTaken ?? ""}
                  onChange={(e) => set("dateTaken", e.target.value)}
                />
              </div>
              {textInput("cameraMake", "Camera make", "Canon")}
              {textInput("cameraModel", "Camera model", "EOS R5")}
              {textInput("software", "Software", "Metaforge 1.0")}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
