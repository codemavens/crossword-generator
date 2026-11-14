import { useState } from "react";
import type { KeyboardEvent } from "react";
import type { FrameGeometry, Point, Ring } from "../../core/geometry/types.ts";
import type { LayoutTile } from "../crosswordTiles.ts";

export interface OverlayDecoration {
  id: string;
  x: number;
  y: number;
  source: "automatic" | "manual";
  label: string;
}

export interface OverlaySpot {
  nameId: string;
  end: "start" | "end";
  x: number;
  y: number;
  label: string;
}

// Present only while end-tile editing is on.
export interface OverlayEditing {
  spots: OverlaySpot[];
  onAdd: (spot: OverlaySpot) => void;
  onRemove: (id: string) => void;
}

export interface CrosswordOverlay {
  tiles: LayoutTile[];
  decorations: OverlayDecoration[];
  editing: OverlayEditing | null;
  originMm: Point;
  tileSizeMm: number;
  outside: Set<string>;
}

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

export function FramePreview({ geometry, crossword }: { geometry: FrameGeometry | null; crossword: CrosswordOverlay | null }) {
  const [show, setShow] = useState({ frame: true, backer: true, cuts: true, engraving: true, crossword: true });
  const toggle = (key: keyof typeof show) => setShow({ ...show, [key]: !show[key] });

  const checks: [keyof typeof show, string][] = [
    ["frame", "Frame"],
    ["backer", "Backer"],
    ["cuts", "Cut lines"],
    ["engraving", "Engraving"],
    ["crossword", "Crossword"],
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
        <FrameSvg geometry={geometry} show={show} crossword={crossword} />
      )}
    </div>
  );
}

function FrameSvg({
  geometry,
  show,
  crossword,
}: {
  geometry: FrameGeometry;
  show: { frame: boolean; backer: boolean; cuts: boolean; engraving: boolean; crossword: boolean };
  crossword: CrosswordOverlay | null;
}) {
  const { outer, backer, innerCut, engraving } = geometry;
  let extent = Math.max(outer.r, backer.r) + MARGIN_MM;
  // Tiles and "+" spots can sit past the frame; never clip them.
  if (crossword) {
    const t = crossword.tileSizeMm;
    const cells = [...crossword.tiles, ...crossword.decorations, ...(crossword.editing?.spots ?? [])];
    for (const c of cells) {
      const x0 = crossword.originMm.x + c.x * t;
      const y0 = crossword.originMm.y + c.y * t;
      const far = Math.max(
        Math.abs(x0 - outer.cx), Math.abs(x0 + t - outer.cx),
        Math.abs(y0 - outer.cy), Math.abs(y0 + t - outer.cy),
      );
      extent = Math.max(extent, far + MARGIN_MM / 2);
    }
  }
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
      {show.crossword && crossword && <CrosswordTiles crossword={crossword} />}
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

function activate(action: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: action,
    onKeyDown: (e: KeyboardEvent<SVGGElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        action();
      }
    },
  };
}

// Placeholder heart outline, drawn in a unit square.
const HEART_PATH = "M0.5 0.78 C0.2 0.58 0.18 0.3 0.36 0.28 C0.44 0.27 0.5 0.34 0.5 0.4 C0.5 0.34 0.56 0.27 0.64 0.28 C0.82 0.3 0.8 0.58 0.5 0.78 Z";

function CrosswordTiles({ crossword }: { crossword: CrosswordOverlay }) {
  const { tiles, decorations, editing, originMm, tileSizeMm: t, outside } = crossword;
  return (
    <g aria-label="Crossword tiles">
      {tiles.map((tile) => {
        const x = originMm.x + tile.x * t;
        const y = originMm.y + tile.y * t;
        const bad = outside.has(`${tile.x},${tile.y}`);
        return (
          <g key={`${tile.x},${tile.y}`}>
            <rect
              x={x}
              y={y}
              width={t}
              height={t}
              fill={bad ? "#f8c4c4" : "#f4ead5"}
              stroke={bad ? "#d00000" : "#5a4a2a"}
              strokeWidth={bad ? t * 0.08 : t * 0.04}
            />
            <text
              x={x + t / 2}
              y={y + t / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={t * 0.6}
              fontFamily="system-ui, sans-serif"
              fill="#2b2112"
            >
              {tile.char}
            </text>
          </g>
        );
      })}
      {decorations.map((d) => {
        const x = originMm.x + d.x * t;
        const y = originMm.y + d.y * t;
        const bad = outside.has(`${d.x},${d.y}`);
        const body = (
          <>
            <title>{d.label}</title>
            <rect
              x={x}
              y={y}
              width={t}
              height={t}
              fill={bad ? "#f8c4c4" : "#f4ead5"}
              stroke={bad ? "#d00000" : "#5a4a2a"}
              strokeWidth={bad ? t * 0.08 : t * 0.04}
            />
            <path
              d={HEART_PATH}
              transform={`translate(${x} ${y}) scale(${t})`}
              fill="none"
              stroke="#8a3b3b"
              strokeWidth={0.05}
              strokeLinejoin="round"
            />
          </>
        );
        if (editing && d.source === "manual") {
          return (
            <g key={d.id} className="deco-action" aria-label={d.label} {...activate(() => editing.onRemove(d.id))}>
              {body}
            </g>
          );
        }
        return <g key={d.id}>{body}</g>;
      })}
      {editing?.spots.map((spot) => {
        const x = originMm.x + spot.x * t;
        const y = originMm.y + spot.y * t;
        return (
          <g
            key={`${spot.nameId}-${spot.end}`}
            className="deco-action"
            aria-label={spot.label}
            {...activate(() => editing.onAdd(spot))}
          >
            <title>{spot.label}</title>
            <rect
              x={x}
              y={y}
              width={t}
              height={t}
              fill="#fff"
              fillOpacity={0.6}
              stroke="#5a4a2a"
              strokeWidth={t * 0.04}
              strokeDasharray={`${t * 0.12} ${t * 0.1}`}
            />
            <text
              x={x + t / 2}
              y={y + t / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={t * 0.6}
              fontFamily="system-ui, sans-serif"
              fill="#5a4a2a"
            >
              +
            </text>
          </g>
        );
      })}
    </g>
  );
}
