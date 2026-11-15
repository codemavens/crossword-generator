import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { Design, ExportDesignResult } from "../../core/design/buildDesign.ts";
import { exportDesign, operationColours } from "../../core/design/buildDesign.ts";
import { safeFileStem } from "../../core/export/fileName.ts";
import type { ExportedFile } from "../../core/export/svgExport.ts";
import type { ExportSettings } from "../../core/models/project.ts";
import { EXPORT_COLOUR_KEYS } from "../../core/models/validation.ts";

const COLOUR_LABELS: Record<keyof ExportSettings, string> = {
  cutColour: "Cut",
  scoreColour: "Score",
  engraveColour: "Engrave",
};

// Gap between the three downloads of "Download all three", so the browser does not drop any.
const DOWNLOAD_GAP_MS = 400;
// Object URLs are revoked once the browser has had time to start the download.
const REVOKE_AFTER_MS = 10_000;

const fmtMm = (n: number) => String(Math.round(n * 10) / 10);

function downloadFile(file: ExportedFile, stem: string): void {
  const url = URL.createObjectURL(new Blob([file.svg], { type: "image/svg+xml" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${stem}-${file.fileName}`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}

interface ExportPanelProps {
  design: Design;
  // Reasons from outside the design (fonts loading or missing), already in plain language.
  extraBlockers: string[];
  colours: ExportSettings;
  projectName: string;
  // Changes whenever the fit confirmation must be given again.
  confirmKey: string;
  onColoursChange: (next: ExportSettings) => void;
  onResetColours: () => void;
}

export function ExportPanel({ design, extraBlockers, colours, projectName, confirmKey, onColoursChange, onResetColours }: ExportPanelProps) {
  const [confirmedKey, setConfirmedKey] = useState<string | null>(null);
  // A changed design clears the tick, even if it later changes back.
  useEffect(() => {
    setConfirmedKey((k) => (k === confirmKey ? k : null));
  }, [confirmKey]);
  const confirmed = confirmedKey === confirmKey;

  // Files are built at low priority so sliders stay responsive; buttons wait until they are current.
  const deferredDesign = useDeferredValue(design);
  const deferredColours = useDeferredValue(colours);
  const built = useMemo((): ExportDesignResult | { ok: false; error: string } => {
    try {
      return exportDesign(deferredDesign, operationColours(deferredColours));
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }, [deferredDesign, deferredColours]);
  const fresh = deferredDesign === design && deferredColours === colours;

  const blockers = [...extraBlockers, ...design.exportBlockers.map((b) => b.message)];
  if (fresh && !built.ok && blockers.length === 0) {
    if ("error" in built) blockers.push(`The files could not be made: ${built.error}`);
    else blockers.push(...built.blockers.map((b) => b.message));
  }
  const files = built.ok && fresh ? built.files : null;
  const needsConfirm = design.needsFitConfirmation && blockers.length === 0;
  const canDownload = blockers.length === 0 && files !== null && (!design.needsFitConfirmation || confirmed);
  const stem = safeFileStem(projectName);

  const downloadAll = () => {
    if (!files) return;
    files.forEach((f, i) => window.setTimeout(() => downloadFile(f, stem), i * DOWNLOAD_GAP_MS));
  };

  return (
    <div className="export-panel">
      <fieldset className="export-colours">
        <legend>Operation colours</legend>
        <div className="row wrap">
          {EXPORT_COLOUR_KEYS.map((key) => (
            <label key={key} className="colour-field">
              <span>{COLOUR_LABELS[key]}</span>
              <input
                type="color"
                value={colours[key].toLowerCase()}
                onChange={(e) => onColoursChange({ ...colours, [key]: e.target.value.toUpperCase() })}
              />
              <code>{colours[key].toUpperCase()}</code>
            </label>
          ))}
          <button type="button" onClick={onResetColours}>
            Reset colours
          </button>
        </div>
        <p className="muted small">
          Cut: outlines cut right through the wood. Score: light lines between crossword tiles. Engrave: letters, point
          values, pictures, the family name and the year.
        </p>
      </fieldset>

      {blockers.length > 0 && (
        <div className="banner warn" role="status">
          <p>Export is not available yet:</p>
          <ul>
            {blockers.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      )}
      {needsConfirm && (
        <div className="banner warn" role="alert">
          <p>The crossword does not fit inside the frame.</p>
          <label className="check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmedKey(e.target.checked ? confirmKey : null)}
            />{" "}
            Export anyway — I know the crossword does not fit inside the frame
          </label>
        </div>
      )}
      {blockers.length === 0 && !files && <p className="muted small">Preparing files…</p>}

      <ul className="export-files">
        {(["crossword.svg", "frame.svg", "backer.svg"] as const).map((name, i) => {
          const file = files?.[i];
          return (
            <li key={name}>
              <button type="button" disabled={!canDownload || !file} onClick={() => file && downloadFile(file, stem)}>
                Download {name}
              </button>
              <span className="muted small">{file ? `${fmtMm(file.widthMm)} × ${fmtMm(file.heightMm)} mm` : "—"}</span>
            </li>
          );
        })}
        <li>
          <button type="button" disabled={!canDownload} onClick={downloadAll}>
            Download all three
          </button>
          <span className="muted small">Three separate files: {stem}-crossword.svg, {stem}-frame.svg, {stem}-backer.svg</span>
        </li>
      </ul>
    </div>
  );
}
