import { arcPoints } from "./ringMath.ts";
import type { Point, Ring } from "./types.ts";

// Max chord sagitta for tessellated arcs of the inner cut, in mm (spec: <= 0.02).
export const ARC_SAGITTA_MM = 0.01;

// Largest corner radius that still leaves a fillet on each side of the line.
export function maxCornerRadius(rin: number, yLine: number): number {
  return 0.9 * ((rin + yLine) / 2);
}

// Inner disc cut off below y = yLine, with the two line/circle corners rounded to radius rc.
// Same shape as a morphological opening of the disc segment, built analytically for exact arcs.
// This is the replaceable bottom-edge step (a curved bottom edge would swap in here).
export function buildBaseOpening(rin: number, yLine: number, rc: number): Ring {
  if (rc <= 0) return sharpOpening(rin, yLine);
  const cy = yLine - rc;
  const cx = Math.sqrt((rin - rc) ** 2 - cy ** 2);
  const aR = Math.atan2(cy, cx);
  const right = arcPoints(cx, cy, rc, Math.PI / 2, aR, ARC_SAGITTA_MM);
  const top = arcPoints(0, 0, rin, aR, -Math.PI - aR, ARC_SAGITTA_MM);
  const left = arcPoints(-cx, cy, rc, Math.PI - aR, Math.PI / 2, ARC_SAGITTA_MM);
  return joinPolylines([right, top, left]);
}

function sharpOpening(rin: number, yLine: number): Ring {
  const a = Math.asin(yLine / rin);
  return joinPolylines([arcPoints(0, 0, rin, a, -Math.PI - a, ARC_SAGITTA_MM)]);
}

// Concatenates polylines that share end points into one ring; the closing edge is the bottom line.
function joinPolylines(parts: Point[][]): Ring {
  const ring: Ring = [];
  for (const part of parts) {
    for (const p of part) {
      const prev = ring[ring.length - 1];
      if (!prev || Math.hypot(prev.x - p.x, prev.y - p.y) > 1e-9) ring.push(p);
    }
  }
  return ring;
}
