import { useMemo } from "react";
import type { FontOutliner } from "../../core/geometry/types.ts";
import { ringsToPath } from "./FramePreview.tsx";

// Drawn from the loaded font's outlines, so added library fonts preview without registering a web font.
export function FontSample({ font, text }: { font: FontOutliner; text: string }) {
  const outline = useMemo(() => {
    const sample = text.trim();
    if (sample === "" || !font.hasGlyphs(sample)) return null;
    try {
      return font.outline(sample, 10);
    } catch {
      return null;
    }
  }, [font, text]);
  if (!outline) return null;
  const { minX, minY, maxX, maxY } = outline.bounds;
  const pad = 0.5;
  return (
    <svg
      className="font-sample-svg"
      viewBox={`${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`}
      aria-hidden="true"
    >
      <path d={ringsToPath(outline.rings)} fill="currentColor" fillRule="nonzero" />
    </svg>
  );
}
