import { useState } from "react";
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
  | "bottomCornerRadiusMm";

const FIELDS: { key: NumericKey; label: string }[] = [
  { key: "outerDiameterMm", label: "Outer diameter (mm)" },
  { key: "ringWidthMm", label: "Ring width (mm)" },
  { key: "familyNameFontSizeMm", label: "Family name font size (mm)" },
  { key: "yearFontSizeMm", label: "Year font size (mm)" },
  { key: "nameBufferMm", label: "Name buffer (mm)" },
  { key: "bottomLineHeightMm", label: "Bottom line height (mm)" },
  { key: "nameDropMm", label: "Name drop below line (mm)" },
  { key: "bottomCornerRadiusMm", label: "Bottom corner radius (mm)" },
];

const LABELS: Partial<Record<FrameNumericKey, string>> = Object.fromEntries(FIELDS.map((f) => [f.key, f.label]));

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

interface NumberFieldProps {
  id: string;
  label: string;
  value: number | undefined;
  check: (raw: string) => string | null;
  onValid: (value: number) => void;
}

// Keeps the raw text so the field can be cleared and retyped; refused values are never pushed up.
function NumberField({ id, label, value, check, onValid }: NumberFieldProps) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? String(value ?? "");
  const problem = text === null ? null : check(text);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        step="any"
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
}

export function FrameControls({ frame, onChange }: Props) {
  return (
    <div className="frame-controls">
      <div className="field-grid">
        {FIELDS.map((f) => (
          <NumberField
            key={f.key}
            id={`frame-${f.key}`}
            label={f.label}
            value={frame[f.key]}
            check={(raw) => problemFor(frame, f.key, raw)}
            onValid={(n) => onChange({ ...frame, [f.key]: n })}
          />
        ))}
      </div>
      <div className="field">
        <label htmlFor="frame-smoothness">Outline: close ↔ loose</label>
        <input
          id="frame-smoothness"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={frame.contourSmoothness}
          onChange={(e) => onChange({ ...frame, contourSmoothness: Number(e.target.value) })}
        />
      </div>
    </div>
  );
}
