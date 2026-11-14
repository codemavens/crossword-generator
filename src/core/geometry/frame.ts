import type { FrameSettings } from "../models/project.ts";
import type { FontOutliner, FrameGeometry } from "./types.ts";

export interface FrameInput {
  familyName: string;
  year?: string;
  settings: FrameSettings;
  nameFont: FontOutliner;
  yearFont: FontOutliner;
}

// STUB: replaced by the geometry worker. Signature is fixed.
export function buildFrameGeometry(input: FrameInput): FrameGeometry {
  void input;
  throw new Error("not implemented");
}
