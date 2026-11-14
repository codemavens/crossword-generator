export const MIN_NODE_VERSION = "24.11.0";

// True when `version` (e.g. "24.11.1") is at least `minimum`.
export function isNodeVersionSupported(version: string, minimum: string = MIN_NODE_VERSION): boolean {
  const parse = (value: string) => value.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const actual = parse(version);
  const required = parse(minimum);
  for (let i = 0; i < 3; i++) {
    const a = actual[i] ?? 0;
    const r = required[i] ?? 0;
    if (a !== r) return a > r;
  }
  return true;
}
