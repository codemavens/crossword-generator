import { useState } from "react";
import type { FrameSettings } from "../../core/models/project.ts";

type NumericKey =
  | "outerDiameterMm"
  | "ringWidthMm"
  | "familyNameFontSizeMm"
  | "yearFontSizeMm"
  | "nameBufferMm"
  | "bottomLineHeightMm"
  | "bottomCornerRadiusMm";

const FIELDS: { key: NumericKey; label: string; allowZero: boolean }[] = [
  { key: "outerDiameterMm", label: "Outer diameter (mm)", allowZero: false },
  { key: "ringWidthMm", label: "Ring width (mm)", allowZero: false },
  { key: "familyNameFontSizeMm", label: "Family name font size (mm)", allowZero: false },
  { key: "yearFontSizeMm", label: "Year font size (mm)", allowZero: false },
  { key: "nameBufferMm", label: "Name buffer (mm)", allowZero: true },
  { key: "bottomLineHeightMm", label: "Bottom line height (mm)", allowZero: true },
  { key: "bottomCornerRadiusMm", label: "Bottom corner radius (mm)", allowZero: true },
];

interface NumberFieldProps {
  id: string;
  label: string;
  value: number | undefined;
  allowZero: boolean;
  onValid: (value: number) => void;
}

// Keeps the raw text so the field can be cleared and retyped.
function NumberField({ id, label, value, allowZero, onValid }: NumberFieldProps) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? String(value ?? "");
  const parsed = Number(shown);
  const valid = shown.trim() !== "" && Number.isFinite(parsed) && (allowZero ? parsed >= 0 : parsed > 0);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        step="any"
        value={shown}
        aria-invalid={valid ? undefined : true}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const n = Number(raw);
          if (raw.trim() !== "" && Number.isFinite(n) && (allowZero ? n >= 0 : n > 0)) onValid(n);
        }}
        onBlur={() => setText(null)}
      />
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
            allowZero={f.allowZero}
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
