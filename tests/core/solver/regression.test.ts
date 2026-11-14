import { test } from "node:test";
import assert from "node:assert/strict";
import { hashString } from "../../../src/core/solver/rng.ts";
import type { SolverOpening } from "../../../src/core/solver/index.ts";
import type { SearchMode } from "../../../src/core/models/project.ts";
import { TEN_NAMES, circleOpening, run } from "./helpers.ts";

// Pinned from the solver before connectors were added (CHG-0006 AC6): fully joinable inputs must not change.
const PINNED: { texts: string[]; mode: SearchMode; seed: number; opening: boolean; digest: string; ids: string[]; totals: number[] }[] = [
  { texts: ["ANNA", "BEN"], mode: "quick", seed: 1, opening: false, digest: "bdisvs", ids: ["layout-1-1cy80h"], totals: [0.6125126288404669] },
  {
    texts: ["MARIA", "TOMAS"],
    mode: "balanced",
    seed: 3,
    opening: false,
    digest: "1v0tonq",
    ids: ["layout-3-1cc45fh", "layout-3-1mctkll", "layout-3-1gcvyye"],
    totals: [0.6298736864001778, 0.6203905723905724, 0.6072415725987685],
  },
  {
    texts: TEN_NAMES,
    mode: "quick",
    seed: 1,
    opening: true,
    digest: "ponhew",
    ids: ["layout-1-bqksba", "layout-1-1i1vghg", "layout-1-1nx36iz", "layout-1-18eq729", "layout-1-1quxcsd", "layout-1-y4udn2", "layout-1-xv5wr3", "layout-1-1ezhdgv"],
    totals: [
      0.796045998905735, 0.7947278948767744, 0.7947148129850601, 0.7908337183818004, 0.7907916987805851, 0.7906410026071745,
      0.7898585624518656, 0.7887959297408457,
    ],
  },
  {
    texts: TEN_NAMES,
    mode: "balanced",
    seed: 7,
    opening: true,
    digest: "1sgj22x",
    ids: ["layout-7-kvsur3", "layout-7-11g21th", "layout-7-65awe2", "layout-7-15u3lzj", "layout-7-1s9jmd6", "layout-7-11j1vvq", "layout-7-9dii0a", "layout-7-1qy3q0o"],
    totals: [
      0.8011866006114278, 0.7978695999650453, 0.796419898993082, 0.7963161270905539, 0.7960407910803455, 0.7957969750276842,
      0.7953381254351107, 0.7947278948767744,
    ],
  },
  {
    texts: TEN_NAMES,
    mode: "thorough",
    seed: 2,
    opening: false,
    digest: "15srm5t",
    ids: ["layout-2-b0u96x", "layout-2-1b9f5q3", "layout-2-15qc06i", "layout-2-11g21th", "layout-2-h8fgs6", "layout-2-1nx36iz", "layout-2-1astpk0", "layout-2-1wxkxie"],
    totals: [
      0.6884815324979854, 0.6869031272059316, 0.6860930392043612, 0.6856754830394249, 0.6847644514768205, 0.6847618532836861,
      0.684705049231785, 0.6843853435640841,
    ],
  },
];

for (const p of PINNED) {
  test(`fully joinable input is unchanged: ${p.texts.length} names, ${p.mode}, seed ${p.seed}`, () => {
    const options: { seed: number; mode: SearchMode; opening?: SolverOpening } = { seed: p.seed, mode: p.mode };
    if (p.opening) options.opening = circleOpening(12, 0.4);
    const { result } = run(p.texts, options);
    assert.deepEqual(result.layouts.map((l) => l.layout.id), p.ids);
    assert.deepEqual(result.layouts.map((l) => l.score.total), p.totals);
    assert.ok(result.layouts.every((l) => l.connectorCount === 0 && l.layout.decorativeTiles.length === 0));
    const projected = result.layouts.map((l) => ({
      layout: l.layout,
      bounds: l.bounds,
      tileCount: l.tileCount,
      intersectionCount: l.intersectionCount,
      connectorCount: l.connectorCount,
      score: l.score,
      fit: l.fit,
      issues: l.issues,
    }));
    assert.equal(hashString(JSON.stringify(projected)).toString(36), p.digest);
  });
}
