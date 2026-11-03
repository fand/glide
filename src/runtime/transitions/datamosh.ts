import type { Effect } from "@vfx-js/core";
import type { DatamoshEffect } from "@vfx-js/effects";
import type { TransitionDef } from "./types.ts";

const HOLD = 0.25;
const CHROMA_GAIN = 1.5;
/** Frames after the cut that skip the residual, so the old picture stays. */
const CUT_FRAMES = 2;

export function parseDatamoshArgs(args: string[]): { blockSize: number } {
  const n = Number(args[0]);
  return { blockSize: Number.isFinite(n) && n >= 2 ? Math.round(n) : 32 };
}

let frames = 0;
let healSec = 1;

/**
 * Hard cut to the new slide through a datamosh: the old slide's blocks are
 * moved to match the new one, held for 25% of the duration, then healed
 * block by block.
 */
export const datamosh: TransitionDef = {
  name: "datamosh",
  // The cut always lands on the new slide, in both directions.
  frag: `
vec4 transition(vec2 uv, float t) {
  return readNew(uv);
}
`,
  async effects(): Promise<Effect[]> {
    // Loaded on first use: datamosh allocates several float render targets.
    const { DatamoshEffect } = await import("@vfx-js/effects");
    return [new DatamoshEffect({ dup: 0, blockSize: 32 })];
  },
  prepare(run, fx) {
    const mosh = fx[0] as DatamoshEffect;
    mosh.params.blockSize = parseDatamoshArgs(run.args).blockSize;
    mosh.params.chromaGain = CHROMA_GAIN;
    mosh.params.useResidual = false;
    mosh.params.healRate = 0;
    frames = 0;
    healSec = Math.max(run.duration * (1 - HOLD), 1e-3);
    // Enable while the old slide is still the frame, so the mosh starts from it.
    mosh.enable();
  },
  onFrame(_t, x, dt, fx) {
    const mosh = fx[0] as DatamoshEffect;
    const h = Math.min(Math.max((x - HOLD) / (1 - HOLD), 0), 1);
    mosh.params.useResidual = ++frames > CUT_FRAMES;
    mosh.params.chromaGain = CHROMA_GAIN + (1 - CHROMA_GAIN) * h;
    // Per-frame refresh chance that leaves ~1% of blocks moshed when the
    // heal ends; disable() then shows the clean frame.
    mosh.params.healRate = x < HOLD ? 0 : 1 - 0.01 ** (dt / healSec);
  },
  onEnd(fx) {
    (fx[0] as DatamoshEffect).disable();
  },
};
