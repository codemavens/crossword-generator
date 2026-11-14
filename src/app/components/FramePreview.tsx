import { useState } from "react";
import type { FrameGeometry, Ring } from "../../core/geometry/types.ts";

export function ringsToPath(rings: Ring[]): string {
  return rings
    .filter((r) => r.length > 0)
    .map((r) => "M" + r.map((p) => `${p.x.toFixed(3)} ${p.y.toFixed(3)}`).join(" L") + " Z")
    .join(" ");
}

// Circle as two arcs so it stays exact.
function circlePath(cx: number, cy: number, r: number): string {
  const f = (n: number) => n.toFixed(3);
  return `M${f(cx - r)} ${f(cy)} A${f(r)} ${f(r)} 0 1 0 ${f(cx + r)} ${f(cy)} A${f(r)} ${f(r)} 0 1 0 ${f(cx - r)} ${f(cy)} Z`;
}

const MARGIN_MM = 8;

export function FramePreview({ geometry }: { geometry: FrameGeometry | null }) {
  const [show, setShow] = useState({ frame: true, backer: true, cuts: true, engraving: true });
  const toggle = (key: keyof typeof show) => setShow({ ...show, [key]: !show[key] });

  const checks: [keyof typeof show, string][] = [
    ["frame", "Frame"],
    ["backer", "Backer"],
    ["cuts", "Cut lines"],
    ["engraving", "Engraving"],
  ];

  return (
    <div className="frame-preview">
      <div className="row toggles">
        {checks.map(([key, label]) => (
          <label key={key} className="check">
            <input type="checkbox" checked={show[key]} onChange={() => toggle(key)} /> {label}
          </label>
        ))}
      </div>
      {geometry && (
        <FrameSvg geometry={geometry} show={show} />
      )}
    </div>
  );
}

function FrameSvg({
  geometry,
  show,
}: {
  geometry: FrameGeometry;
  show: { frame: boolean; backer: boolean; cuts: boolean; engraving: boolean };
}) {
  const { outer, backer, innerCut, engraving } = geometry;
  const extent = Math.max(outer.r, backer.r) + MARGIN_MM;
  // An empty cut ("no-opening") leaves the frame layer as a solid disc.
  const innerD = innerCut.length > 0 ? ringsToPath([innerCut]) : "";
  const frameD = innerD ? `${circlePath(outer.cx, outer.cy, outer.r)} ${innerD}` : circlePath(outer.cx, outer.cy, outer.r);
  return (
    <svg
      className="frame-svg"
      viewBox={`${outer.cx - extent} ${outer.cy - extent} ${extent * 2} ${extent * 2}`}
      role="img"
      aria-label="Frame preview"
    >
      {show.backer && (
        <circle cx={backer.cx} cy={backer.cy} r={backer.r} fill="#ecd9b4" />
      )}
      {show.frame && <path d={frameD} fill="#c99a5b" fillRule="evenodd" />}
      {show.engraving && (
        <>
          <path d={ringsToPath(engraving.name)} fill="#3b2a18" fillRule="nonzero" />
          <path d={ringsToPath(engraving.year)} fill="#3b2a18" fillRule="nonzero" />
        </>
      )}
      {show.cuts && (
        <>
          <circle
            cx={outer.cx}
            cy={outer.cy}
            r={outer.r}
            fill="none"
            stroke="#e00000"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          {innerD && (
            <path
              d={innerD}
              fill="none"
              stroke="#e00000"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </>
      )}
    </svg>
  );
}
