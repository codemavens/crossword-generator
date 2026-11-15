import type { ReactNode } from "react";
import { LAYERS } from "./FramePreview.tsx";
import type { Layers } from "./FramePreview.tsx";

interface Props {
  // The Edit end tiles button, shared with the Tiles panel.
  editButton: ReactNode;
  canCentre: boolean;
  onCentre: () => void;
  position: string | null;
  layers: Layers;
  onToggleLayer: (key: keyof Layers) => void;
}

export function PreviewToolbar({ editButton, canCentre, onCentre, position, layers, onToggleLayer }: Props) {
  return (
    <div className="preview-toolbar">
      {editButton}
      <button type="button" disabled={!canCentre} onClick={onCentre}>
        Centre
      </button>
      {position && (
        <span className="muted small tabular" aria-live="polite">
          {position}
        </span>
      )}
      <span className="grow" />
      <div className="layer-chips" role="group" aria-label="Preview layers">
        {LAYERS.map(({ key, label, colour }) => (
          <button
            key={key}
            type="button"
            className="chip-toggle"
            aria-pressed={layers[key]}
            onClick={() => onToggleLayer(key)}
          >
            <span className="chip-dot" aria-hidden="true" style={layers[key] ? { background: colour } : undefined} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface SizeFitProps {
  tileSize: string;
  diameter: string;
  crossword: string;
  fit: string;
  // "fits", "fails" or "none" (nothing to check yet).
  fitState: "fits" | "fails" | "none";
  advice: ReactNode;
}

export function SizeFitBar({ tileSize, diameter, crossword, fit, fitState, advice }: SizeFitProps) {
  return (
    <section className="size-fit" aria-labelledby="size-fit-heading">
      <h3 id="size-fit-heading" className="sr-only">
        Size and fit
      </h3>
      <dl>
        <div>
          <dt>Tile size</dt>
          <dd>{tileSize}</dd>
        </div>
        <div>
          <dt>Frame diameter</dt>
          <dd>{diameter}</dd>
        </div>
        <div>
          <dt>Crossword</dt>
          <dd>{crossword}</dd>
        </div>
        <div className="fit-cell">
          <dt className="sr-only">Fit</dt>
          <dd className={`fit-chip ${fitState}`}>
            {fitState === "fits" && <FitIcon ok />}
            {fitState === "fails" && <FitIcon ok={false} />}
            {fit}
          </dd>
        </div>
      </dl>
      {advice}
    </section>
  );
}

function FitIcon({ ok }: { ok: boolean }) {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      {ok ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M6 6l12 12M18 6L6 18" />}
    </svg>
  );
}
