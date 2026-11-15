import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { FontSummary } from "../../core/api.ts";
import { MAX_FONT_BYTES } from "../../core/api.ts";
import { ApiRequestError, api } from "../api/client.ts";
import type { FontOption } from "../fonts.ts";
import { removeFontConfirm } from "../confirmations.ts";
import type { Confirm } from "./ConfirmDialog.tsx";

export type FontSettingKey = "name" | "year" | "tile";

export const FONT_SETTING_LABELS: Record<FontSettingKey, string> = {
  name: "Family name font",
  year: "Year font",
  tile: "Tile letter font",
};

interface UploadResult {
  file: string;
  outcome: "added" | "exists" | "refused";
  message: string;
}

interface Props {
  options: FontOption[];
  values: Record<FontSettingKey, string>;
  library: FontSummary[] | null;
  libraryError: string;
  onChange: (key: FontSettingKey, id: string) => void;
  onLibraryChanged: () => Promise<void>;
  onRemove: (font: FontSummary) => Promise<void>;
  confirm: Confirm;
  // A sample of each chosen font, and any message about it, shown with its select.
  samples?: Partial<Record<FontSettingKey, ReactNode>>;
  notes?: Partial<Record<FontSettingKey, ReactNode>>;
}

const MB = 1024 * 1024;

export function FontPanel({ options, values, library, libraryError, onChange, onLibraryChanged, onRemove, confirm, samples, notes }: Props) {
  const [results, setResults] = useState<UploadResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [removeError, setRemoveError] = useState("");
  // After a removal the Remove button is gone; focus the Manage fonts summary instead of losing it.
  const summaryRef = useRef<HTMLElement>(null);
  const refocusAfterRemove = useRef(false);
  useEffect(() => {
    if (!refocusAfterRemove.current) return;
    refocusAfterRemove.current = false;
    const active = document.activeElement;
    if (!active || active === document.body || !active.isConnected) summaryRef.current?.focus();
  }, [library]);

  const upload = async (files: File[]) => {
    setBusy(true);
    setResults([]);
    const out: UploadResult[] = [];
    try {
      for (const file of files) {
        if (file.size > MAX_FONT_BYTES) {
          out.push({ file: file.name, outcome: "refused", message: `Larger than ${MAX_FONT_BYTES / MB} MB.` });
          continue;
        }
        try {
          const { font, added } = await api.addFont(await file.arrayBuffer());
          out.push(
            added
              ? { file: file.name, outcome: "added", message: `Added as "${font.name}".` }
              : { file: file.name, outcome: "exists", message: `Already in the library as "${font.name}".` },
          );
        } catch (err) {
          const message = err instanceof ApiRequestError ? err.message : "The font library could not be reached.";
          out.push({ file: file.name, outcome: "refused", message });
        }
        setResults([...out]);
      }
    } finally {
      setResults(out);
      setBusy(false);
      await onLibraryChanged();
    }
  };

  const loading = library === null && !libraryError;
  const picker = (key: FontSettingKey) => {
    const id = values[key];
    const known = options.some((o) => o.id === id);
    const bundled = options.filter((o) => !o.library);
    const added = options.filter((o) => o.library);
    return (
      <div className="field" key={key}>
        <label htmlFor={`font-${key}`}>{FONT_SETTING_LABELS[key]}</label>
        <div className="font-pick">
        <select id={`font-${key}`} value={id} onChange={(e) => onChange(key, e.target.value)}>
          {!known && <option value={id}>{loading ? "Loading…" : "Missing font (choose another)"}</option>}
          <optgroup label="Bundled">
            {bundled.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </optgroup>
          {added.length > 0 && (
            <optgroup label="Added">
              {added.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          )}
        </select>
          <span className="font-sample" aria-hidden="true">
            {samples?.[key]}
          </span>
        </div>
        {notes?.[key]}
      </div>
    );
  };

  return (
    <div className="font-panel">
      <div className="font-fields">{(["name", "year", "tile"] as const).map(picker)}</div>
      <div className="upload-box">
      <div className="row wrap">
        <label className="file-button">
          <input
            type="file"
            multiple
            accept=".ttf,.otf,font/ttf,font/otf"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length > 0) void upload(files);
            }}
          />
          <span className="button-like" aria-disabled={busy || undefined}>
            {busy ? "Adding fonts…" : "Add fonts…"}
          </span>
        </label>
        <span className="muted small">TrueType (.ttf) or OpenType (.otf), up to {MAX_FONT_BYTES / MB} MB each.</span>
      </div>
      {results.length > 0 && (
        <ul className="upload-results" aria-live="polite">
          {results.map((r, i) => (
            <li key={i} className={r.outcome === "refused" ? "error" : "ok"}>
              <strong>{r.file}</strong>: {r.outcome === "refused" ? `Refused. ${r.message}` : r.message}
            </li>
          ))}
        </ul>
      )}
      </div>
      {libraryError && (
        <p className="banner warn" role="alert">
          {libraryError}
        </p>
      )}
      <details className="disclosure manage-fonts">
        <summary ref={summaryRef}>Manage fonts ({library?.length ?? 0} added)</summary>
        {removeError && (
          <p className="banner error" role="alert">
            {removeError}
          </p>
        )}
        {library && library.length === 0 && <p className="muted small">No fonts added yet.</p>}
        {library && library.length > 0 && (
          <ul className="upload-list">
            {library.map((f) => (
              <li key={f.id}>
                <span>
                  {f.name} <span className="muted small">({f.format.toUpperCase()}, {Math.ceil(f.sizeBytes / 1024)} KB)</span>
                </span>
                <button
                  type="button"
                  className="danger"
                  onClick={async () => {
                    if (!(await confirm(removeFontConfirm(f.name)))) return;
                    setRemoveError("");
                    onRemove(f)
                      .then(() => {
                        refocusAfterRemove.current = true;
                      })
                      .catch((err: unknown) => {
                      setRemoveError(err instanceof Error ? err.message : String(err));
                    });
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
