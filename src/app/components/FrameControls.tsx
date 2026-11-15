import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { FrameSettings } from "../../core/models/project.ts";
import { frameCrossFieldProblems, inLimit, limitMessage } from "../../core/models/validation.ts";
import type { FrameNumericKey } from "../../core/models/validation.ts";

type NumericKey =
  | "outerDiameterMm"
  | "ringWidthMm"
  | "familyNameFontSizeMm"
  | "yearFontSizeMm"
  | "nameBufferMm"
  | "bottomLineHeightMm"
  | "nameDropMm"
  | "bottomCornerRadiusMm"
  | "crosswordClearanceMm";

const DIAMETER_LABEL = "Outer diameter (mm)";
// Slider range only; the number field accepts the full validated range.
export const DIAMETER_SLIDER = { min: 100, max: 800 };

type FieldDef = { key: NumericKey; label: string };
// Grouped as in the brief (AC15); labels carry no unit, the unit sits inside the field.
const GROUPS: { title: string; fields: FieldDef[] }[] = [
  {
    title: "Ring and clearance",
    fields: [
      { key: "ringWidthMm", label: "Ring width" },
      { key: "crosswordClearanceMm", label: "Gap between crossword and frame" },
    ],
  },
  {
    title: "Family name and year",
    fields: [
      { key: "familyNameFontSizeMm", label: "Family name font size" },
      { key: "yearFontSizeMm", label: "Year font size" },
      { key: "nameBufferMm", label: "Name buffer" },
      { key: "nameDropMm", label: "Name drop below line" },
    ],
  },
  {
    title: "Base",
    fields: [
      { key: "bottomLineHeightMm", label: "Bottom line height" },
      { key: "bottomCornerRadiusMm", label: "Bottom corner radius" },
    ],
  },
];

// Field names as used in cross-field messages, unchanged from before the redesign.
const LABELS: Partial<Record<FrameNumericKey, string>> = {
  outerDiameterMm: DIAMETER_LABEL,
  ...Object.fromEntries(GROUPS.flatMap((g) => g.fields).map((f) => [f.key, `${f.label} (mm)`])),
};

// Same rules as validateProject: the field's own limits, then any cross-field rule this value would newly break.
function problemFor(frame: FrameSettings, key: NumericKey, raw: string): string | null {
  const n = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(n)) return "Enter a number.";
  if (!inLimit(key, n)) return limitMessage(key);
  const before = new Set(frameCrossFieldProblems({ ...frame }).map((p) => p.key));
  const added = frameCrossFieldProblems({ ...frame, [key]: n }).find((p) => !before.has(p.key));
  if (!added) return null;
  return added.key === key ? added.message : `${LABELS[added.key] ?? added.key}: ${added.message}`;
}

// Whether the saved frame itself breaks a field limit or a cross-field rule (the same checks as validateProject).
export function savedFrameProblem(frame: FrameSettings): boolean {
  const keys = ["outerDiameterMm", ...GROUPS.flatMap((g) => g.fields.map((f) => f.key))] as NumericKey[];
  return keys.some((k) => !inLimit(k, frame[k])) || frameCrossFieldProblems({ ...frame }).length > 0;
}

interface NumberFieldProps {
  id: string;
  label: string;
  value: number | undefined;
  check: (raw: string) => string | null;
  onValid: (value: number) => void;
  // Shown inside the field; the label keeps it for screen readers (AC19).
  unit?: string;
  // Spoken form of the unit when it differs, e.g. "% of tile".
  unitName?: string;
  // Arrow-key step of the number input; free-form when absent.
  step?: string;
  // Told whenever the field starts or stops showing a problem.
  onProblem?: (id: string, hasProblem: boolean) => void;
}

// Keeps the raw text so the field can be cleared and retyped; refused values are never pushed up.
export function NumberField({ id, label, value, check, onValid, unit, unitName, step, onProblem }: NumberFieldProps) {
  const [text, setText] = useState<string | null>(null);
  const problem = text === null ? null : check(text);
  // Show the typed text unless the value was changed from outside (e.g. a reset).
  const shown = text !== null && (problem || Number(text) === value) ? text : String(value ?? "");
  const hasProblem = problem !== null;
  const report = useRef(onProblem);
  report.current = onProblem;
  useEffect(() => {
    report.current?.(id, hasProblem);
  }, [id, hasProblem]);
  useEffect(() => () => report.current?.(id, false), [id]);
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {unit && <span className="sr-only"> ({unitName ?? unit})</span>}
      </label>
      <div className={unit ? "unit-input" : undefined}>
        <input
          id={id}
          type="number"
          step={step ?? "any"}
          value={shown}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `${id}-problem` : undefined}
          onChange={(e) => {
            const raw = e.target.value;
            setText(raw);
            if (!check(raw)) onValid(Number(raw));
          }}
          onBlur={() => {
            if (!problem) setText(null);
          }}
        />
        {unit && (
          <span className="unit" aria-hidden="true">
            {unit}
          </span>
        )}
      </div>
      {problem && (
        <small id={`${id}-problem`} className="field-problem" role="alert">
          {problem}
        </small>
      )}
    </div>
  );
}

interface Props {
  frame: FrameSettings;
  onChange: (frame: FrameSettings) => void;
  // Lowest diameter the slider offers (the frame's own rules may need more than DIAMETER_SLIDER.min).
  diameterSliderMin: number;
  // Shown under the diameter, e.g. the "Smallest that fits" button and its message.
  diameterAction?: ReactNode;
  onFieldProblem?: (id: string, hasProblem: boolean) => void;
}

export function FrameControls({ frame, onChange, diameterSliderMin, diameterAction, onFieldProblem }: Props) {
  const sliderMin = Math.min(Math.max(DIAMETER_SLIDER.min, diameterSliderMin), DIAMETER_SLIDER.max);
  return (
    <div className="frame-controls">
      <fieldset className="group">
        <legend className="group-title">Size</legend>
        <div className="size-control">
          <NumberField
            id="frame-outerDiameterMm"
            label="Outer diameter"
            unit="mm"
            value={frame.outerDiameterMm}
            check={(raw) => problemFor(frame, "outerDiameterMm", raw)}
            onValid={(n) => onChange({ ...frame, outerDiameterMm: n })}
            onProblem={onFieldProblem}
          />
          <input
            type="range"
            aria-label="Outer diameter slider (mm)"
            min={sliderMin}
            max={DIAMETER_SLIDER.max}
            step="1"
            value={Math.min(DIAMETER_SLIDER.max, Math.max(sliderMin, frame.outerDiameterMm))}
            onChange={(e) => {
              const raw = e.target.value;
              if (!problemFor(frame, "outerDiameterMm", raw)) onChange({ ...frame, outerDiameterMm: Number(raw) });
            }}
          />
        </div>
        {diameterAction}
      </fieldset>
      {GROUPS.map((g) => (
        <fieldset className="group" key={g.title}>
          <legend className="group-title">{g.title}</legend>
          <div className="field-grid two">
            {g.fields.map((f) => (
              <NumberField
                key={f.key}
                id={`frame-${f.key}`}
                label={f.label}
                unit="mm"
                value={frame[f.key]}
                check={(raw) => problemFor(frame, f.key, raw)}
                onValid={(n) => onChange({ ...frame, [f.key]: n })}
                onProblem={onFieldProblem}
              />
            ))}
          </div>
        </fieldset>
      ))}
      <div className="field">
        <div className="row between">
          <label htmlFor="frame-smoothness">Outline: close ↔ loose</label>
          <output htmlFor="frame-smoothness" className="muted small tabular">
            {frame.contourSmoothness.toFixed(2)}
          </output>
        </div>
        <input
          id="frame-smoothness"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={frame.contourSmoothness}
          onChange={(e) => onChange({ ...frame, contourSmoothness: Number(e.target.value) })}
        />
        <div className="range-ends" aria-hidden="true">
          <span>Close</span>
          <span>Loose</span>
        </div>
      </div>
    </div>
  );
}
