import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import type { FrameGeometry, Point, Ring } from "../../core/geometry/types.ts";
import type { CrosswordGeometry, Segment } from "../../core/geometry/crossword.ts";
import { PROOF_COLOURS } from "../../core/export/proofSvg.ts";

export interface OverlayDecoration {
  id: string;
  x: number;
  y: number;
  source: "automatic" | "manual";
  label: string;
  selected: boolean;
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
  onSelect: (id: string) => void;
}

// Moving the whole crossword; present only when dragging is allowed (not while editing end tiles).
export interface OverlayDrag {
  onStart: () => void;
  // Deltas are in mm from where the drag started.
  onMove: (dxMm: number, dyMm: number) => void;
  onEnd: (dxMm: number, dyMm: number, commit: boolean) => void;
  onNudge: (dxMm: number, dyMm: number) => void;
}

export interface CrosswordOverlay {
  // Piece 1 as cut, scored and engraved; the preview draws only from this.
  piece: CrosswordGeometry;
  decorations: OverlayDecoration[];
  editing: OverlayEditing | null;
  originMm: Point;
  tileSizeMm: number;
  outside: Set<string>;
  // Temporary shift (mm) while a drag is in progress; the piece geometry is built at the saved position.
  translate: Point;
  drag: OverlayDrag | null;
}

export function ringsToPath(rings: Ring[]): string {
  return rings
    .filter((r) => r.length > 0)
    .map((r) => "M" + r.map((p) => `${p.x.toFixed(3)} ${p.y.toFixed(3)}`).join(" L") + " Z")
    .join(" ");
}

function segmentsToPath(segments: Segment[]): string {
  const f = (n: number) => n.toFixed(3);
  return segments.map((s) => `M${f(s.a.x)} ${f(s.a.y)} L${f(s.b.x)} ${f(s.b.y)}`).join(" ");
}

// Circle as two arcs so it stays exact.
function circlePath(cx: number, cy: number, r: number): string {
  const f = (n: number) => n.toFixed(3);
  return `M${f(cx - r)} ${f(cy)} A${f(r)} ${f(r)} 0 1 0 ${f(cx + r)} ${f(cy)} A${f(r)} ${f(r)} 0 1 0 ${f(cx - r)} ${f(cy)} Z`;
}

const MARGIN_MM = 8;
const CUT_COLOUR = "#e00000";
const SCORE_COLOUR = "#1f4fe0";
const ENGRAVE_COLOUR = PROOF_COLOURS.engraving;
const PIECE_COLOUR = PROOF_COLOURS.piece;

export interface Layers {
  frame: boolean;
  backer: boolean;
  cuts: boolean;
  score: boolean;
  engraving: boolean;
  crossword: boolean;
}

export const ALL_LAYERS_ON: Layers = { frame: true, backer: true, cuts: true, score: true, engraving: true, crossword: true };

// Toggle order, labels and the colour each layer is drawn in.
export const LAYERS: { key: keyof Layers; label: string; colour: string }[] = [
  { key: "frame", label: "Frame", colour: PROOF_COLOURS.frame },
  { key: "backer", label: "Backer", colour: PROOF_COLOURS.backer },
  { key: "cuts", label: "Cut lines", colour: CUT_COLOUR },
  { key: "score", label: "Score lines", colour: SCORE_COLOUR },
  { key: "engraving", label: "Engraving", colour: ENGRAVE_COLOUR },
  { key: "crossword", label: "Crossword", colour: PIECE_COLOUR },
];

export function FramePreview({
  geometry,
  crossword,
  layers,
  backerMark = NO_RINGS,
}: {
  geometry: FrameGeometry | null;
  crossword: CrosswordOverlay | null;
  layers: Layers;
  // Placement mark on the backer, in frame mm.
  backerMark?: Ring[];
}) {
  return geometry ? <FrameSvg geometry={geometry} show={layers} crossword={crossword} backerMark={backerMark} /> : null;
}

const NO_RINGS: Ring[] = [];

function FrameSvg({
  geometry,
  show,
  crossword,
  backerMark,
}: {
  geometry: FrameGeometry;
  show: Layers;
  crossword: CrosswordOverlay | null;
  backerMark: Ring[];
}) {
  const { outer, backer, innerCut, engraving } = geometry;
  let extent = Math.max(outer.r, backer.r) + MARGIN_MM;
  // The piece and "+" spots can sit past the frame; never clip them.
  if (crossword) {
    const t = crossword.tileSizeMm;
    const b = crossword.piece.bounds;
    const corners: [number, number][] = [[b.minX, b.minY], [b.maxX, b.maxY]];
    for (const spot of crossword.editing?.spots ?? []) {
      const x0 = crossword.originMm.x + spot.x * t;
      const y0 = crossword.originMm.y + spot.y * t;
      corners.push([x0, y0], [x0 + t, y0 + t]);
    }
    for (const [x, y] of corners) {
      extent = Math.max(extent, Math.abs(x - outer.cx) + MARGIN_MM / 2, Math.abs(y - outer.cy) + MARGIN_MM / 2);
    }
  }
  // An empty cut ("no-opening") leaves the frame layer as a solid disc. Memoised: re-rendered on every drag move.
  const paths = useMemo(() => {
    const innerD = innerCut.length > 0 ? ringsToPath([innerCut]) : "";
    const disc = circlePath(outer.cx, outer.cy, outer.r);
    return {
      innerD,
      frameD: innerD ? `${disc} ${innerD}` : disc,
      nameD: ringsToPath(engraving.name),
      yearD: ringsToPath(engraving.year),
      markD: ringsToPath(backerMark),
    };
  }, [innerCut, outer, engraving, backerMark]);
  const { innerD, frameD } = paths;
  return (
    <svg
      className="frame-svg"
      viewBox={`${outer.cx - extent} ${outer.cy - extent} ${extent * 2} ${extent * 2}`}
      role="img"
      aria-label="Frame preview"
    >
      {show.backer && (
        <circle cx={backer.cx} cy={backer.cy} r={backer.r} fill={PROOF_COLOURS.backer} />
      )}
      {show.backer && show.score && paths.markD && (
        <path d={paths.markD} fill="none" stroke={SCORE_COLOUR} strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
      )}
      {show.frame && <path d={frameD} fill={PROOF_COLOURS.frame} fillRule="evenodd" />}
      {show.engraving && (
        <>
          <path d={paths.nameD} fill={ENGRAVE_COLOUR} fillRule="nonzero" />
          <path d={paths.yearD} fill={ENGRAVE_COLOUR} fillRule="nonzero" />
        </>
      )}
      {show.crossword && crossword && <CrosswordPiece crossword={crossword} show={show} />}
      {show.cuts && (
        <>
          <circle
            cx={outer.cx}
            cy={outer.cy}
            r={outer.r}
            fill="none"
            stroke={CUT_COLOUR}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          {innerD && (
            <path
              d={innerD}
              fill="none"
              stroke={CUT_COLOUR}
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

const NUDGE_MM = 1;
const NUDGE_FAST_MM = 5;
const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

interface DragState {
  pointerId: number;
  // Screen to SVG user units (mm), fixed for the whole drag.
  inverse: DOMMatrix;
  start: Point;
  last: Point;
}

function CrosswordPiece({ crossword, show }: { crossword: CrosswordOverlay; show: Layers }) {
  const { piece, decorations, editing, originMm, tileSizeMm: t, outside, translate, drag } = crossword;
  const paths = useMemo(
    () => ({
      cutD: ringsToPath([piece.cut.outer, ...piece.cut.holes]),
      letterD: ringsToPath([...piece.engraving.letters, ...piece.engraving.scores]),
      artwork: piece.engraving.artwork.map((shape) => ({ d: ringsToPath(shape.rings), fillRule: shape.fillRule })),
      scoreD: segmentsToPath(piece.score),
    }),
    [piece],
  );
  const { cutD, letterD } = paths;
  const outsideTiles = piece.tiles.filter((tile) => outside.has(`${tile.x},${tile.y}`));

  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);
  // Latest callbacks, so a drag that outlives a render (or the component) reports to current code.
  const dragProp = useRef(drag);
  dragProp.current = drag;
  useEffect(
    () => () => {
      const d = dragRef.current;
      dragRef.current = null;
      if (d) dragProp.current?.onEnd(d.last.x, d.last.y, false);
    },
    [],
  );

  const toMm = (d: DragState, e: ReactPointerEvent): Point => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(d.inverse);
    return { x: p.x - d.start.x, y: p.y - d.start.y };
  };
  const finish = (e: ReactPointerEvent<SVGGElement>, commit: boolean) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    const delta = commit ? toMm(d, e) : d.last;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    dragProp.current?.onEnd(delta.x, delta.y, commit);
  };
  const dragHandlers = drag
    ? {
        className: dragging ? "crossword-drag dragging" : "crossword-drag",
        tabIndex: 0,
        role: "group" as const,
        "aria-label": "Crossword position; use arrow keys to move",
        onPointerDown: (e: ReactPointerEvent<SVGGElement>) => {
          if (e.button !== 0 || dragRef.current) return;
          const ctm = e.currentTarget.ownerSVGElement?.getScreenCTM();
          if (!ctm) return;
          const inverse = ctm.inverse();
          const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(inverse);
          e.preventDefault();
          e.currentTarget.focus();
          e.currentTarget.setPointerCapture(e.pointerId);
          dragRef.current = { pointerId: e.pointerId, inverse, start: { x: p.x, y: p.y }, last: { x: 0, y: 0 } };
          setDragging(true);
          drag.onStart();
        },
        onPointerMove: (e: ReactPointerEvent<SVGGElement>) => {
          const d = dragRef.current;
          if (!d || d.pointerId !== e.pointerId) return;
          d.last = toMm(d, e);
          dragProp.current?.onMove(d.last.x, d.last.y);
        },
        onPointerUp: (e: ReactPointerEvent<SVGGElement>) => finish(e, true),
        onPointerCancel: (e: ReactPointerEvent<SVGGElement>) => finish(e, false),
        onLostPointerCapture: (e: ReactPointerEvent<SVGGElement>) => finish(e, false),
        onKeyDown: (e: KeyboardEvent<SVGGElement>) => {
          const dir = ARROWS[e.key];
          if (!dir || dragRef.current) return;
          e.preventDefault();
          const step = e.shiftKey ? NUDGE_FAST_MM : NUDGE_MM;
          drag.onNudge(dir[0] * step, dir[1] * step);
        },
      }
    : { "aria-label": "Crossword tiles" };
  return (
    <g transform={translate.x !== 0 || translate.y !== 0 ? `translate(${translate.x} ${translate.y})` : undefined} {...dragHandlers}>
      <path className="piece-fill" d={cutD} fill={PIECE_COLOUR} fillRule="evenodd" />
      {outsideTiles.map((tile) => (
        <rect
          key={`out-${tile.x},${tile.y}`}
          x={tile.rect.x}
          y={tile.rect.y}
          width={t}
          height={t}
          fill="#f08080"
          fillOpacity={0.55}
          stroke="#d00000"
          strokeWidth={t * 0.08}
          pointerEvents="none"
        />
      ))}
      {show.engraving && (
        <g fill={ENGRAVE_COLOUR} stroke="none" pointerEvents="none">
          <path d={letterD} fillRule="nonzero" />
          {paths.artwork.map((shape, i) => (
            <path key={i} d={shape.d} fillRule={shape.fillRule} />
          ))}
        </g>
      )}
      {show.score && piece.score.length > 0 && (
        <path
          d={paths.scoreD}
          fill="none"
          stroke={SCORE_COLOUR}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
      {show.cuts && (
        <path
          d={cutD}
          fill="none"
          stroke={CUT_COLOUR}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
      {decorations.map((d) => {
        const x = originMm.x + d.x * t;
        const y = originMm.y + d.y * t;
        // Transparent hit area on top of the geometry; the picture itself is part of the engraving.
        const body = (
          <>
            <title>{d.label}</title>
            <rect x={x} y={y} width={t} height={t} fill="#000" fillOpacity={0} stroke="none" strokeWidth={t * 0.06} />
            {d.selected && (
              <rect
                x={x + t * 0.05}
                y={y + t * 0.05}
                width={t * 0.9}
                height={t * 0.9}
                fill="none"
                stroke="#e67700"
                strokeWidth={t * 0.1}
                pointerEvents="none"
              />
            )}
          </>
        );
        if (editing) {
          return (
            <g
              key={d.id}
              className="deco-action"
              aria-label={d.label}
              aria-pressed={d.selected}
              {...activate(() => editing.onSelect(d.id))}
            >
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
