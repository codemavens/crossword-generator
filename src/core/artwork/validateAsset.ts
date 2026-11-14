// Rule checks for stored artwork; used by validateProject on every save (CHG-0007 AC13).
import { MAX_ARTWORK_COORDINATE, MAX_ARTWORK_ID_LENGTH, MAX_ARTWORK_NAME_LENGTH, MAX_ARTWORK_PATH_CHARS, MAX_ARTWORK_SHAPES } from "./constants.ts";
import { hasDrawing, parsePathData } from "./pathData.ts";

const ASSET_KEYS = new Set(["id", "name", "source", "shapes", "bounds"]);
const SHAPE_KEYS = new Set(["d", "fillRule"]);
const BOUNDS_KEYS = ["minX", "minY", "maxX", "maxY"];
// Custom ids are short and plain; "builtin:" ids cannot be formed because ":" is not allowed.
const ID_PATTERN = new RegExp(`^[A-Za-z0-9_-]{1,${MAX_ARTWORK_ID_LENGTH}}$`);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every((k) => allowed.has(k));
}

export function isCustomArtworkId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

// The first problem with one stored custom picture, or null when it is safe to keep.
export function artworkAssetProblem(value: unknown): string | null {
  if (!isRecord(value)) return "Must be an object.";
  if (!onlyKeys(value, ASSET_KEYS)) return "Contains properties other than shape data.";
  if (!isCustomArtworkId(value.id)) return "Has an invalid id.";
  if (value.source !== "custom") return "Must be an uploaded picture.";
  if (typeof value.name !== "string" || value.name.trim() === "" || Array.from(value.name).length > MAX_ARTWORK_NAME_LENGTH) {
    return `Name must be 1 to ${MAX_ARTWORK_NAME_LENGTH} characters.`;
  }
  const b = value.bounds;
  if (
    !isRecord(b) ||
    !onlyKeys(b, new Set(BOUNDS_KEYS)) ||
    !BOUNDS_KEYS.every((k) => typeof b[k] === "number" && Number.isFinite(b[k]) && Math.abs(b[k] as number) <= MAX_ARTWORK_COORDINATE) ||
    (b.minX as number) > (b.maxX as number) ||
    (b.minY as number) > (b.maxY as number)
  ) {
    return "Has invalid bounds.";
  }
  const shapes = value.shapes;
  if (!Array.isArray(shapes) || shapes.length === 0 || shapes.length > MAX_ARTWORK_SHAPES) {
    return `Must have 1 to ${MAX_ARTWORK_SHAPES} shapes.`;
  }
  let chars = 0;
  for (const s of shapes) {
    if (!isRecord(s) || !onlyKeys(s, SHAPE_KEYS) || typeof s.d !== "string" || (s.fillRule !== "nonzero" && s.fillRule !== "evenodd")) {
      return "Has an invalid shape.";
    }
    chars += s.d.length;
    if (chars > MAX_ARTWORK_PATH_CHARS) return "Shape data is too large.";
    const parsed = parsePathData(s.d, { strict: true });
    if (!parsed.ok || !hasDrawing(parsed.segments)) return "Has shape data that is not in the stored form.";
  }
  return null;
}
