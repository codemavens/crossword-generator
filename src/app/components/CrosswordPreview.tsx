import type { Tile } from "../../core/preview/sampleLayout.ts";

interface Props {
  tiles: Tile[];
  tileSizeMm: number;
}

export function CrosswordPreview({ tiles, tileSizeMm }: Props) {
  if (tiles.length === 0) return null;
  const minX = Math.min(...tiles.map((t) => t.x));
  const minY = Math.min(...tiles.map((t) => t.y));
  const cols = Math.max(...tiles.map((t) => t.x)) - minX + 1;
  const rows = Math.max(...tiles.map((t) => t.y)) - minY + 1;
  const widthMm = cols * tileSizeMm;
  const heightMm = rows * tileSizeMm;
  return (
    <svg
      className="preview-svg"
      width={`${widthMm}mm`}
      height={`${heightMm}mm`}
      viewBox={`0 0 ${widthMm} ${heightMm}`}
      role="img"
      aria-label="Sample crossword tile arrangement"
    >
      {tiles.map((t) => {
        const x = (t.x - minX) * tileSizeMm;
        const y = (t.y - minY) * tileSizeMm;
        return (
          <g key={`${t.x},${t.y}`}>
            <rect
              x={x}
              y={y}
              width={tileSizeMm}
              height={tileSizeMm}
              fill="#f4ead5"
              stroke="#5a4a2a"
              strokeWidth={tileSizeMm * 0.04}
            />
            <text
              x={x + tileSizeMm / 2}
              y={y + tileSizeMm / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={tileSizeMm * 0.6}
              fontFamily="system-ui, sans-serif"
              fill="#2b2112"
            >
              {t.char.toUpperCase()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
