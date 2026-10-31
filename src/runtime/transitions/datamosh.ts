import type { Effect } from "@vfx-js/core";
import type { DatamoshEffect } from "@vfx-js/effects";
import type { TransitionDef } from "./types.ts";
import { HealEffect, TapEffect } from "./heal.ts";

const HOLD = 0.25;
const CHROMA_GAIN = 1.5;
/** Frames after the cut that skip the residual, so the old picture stays. */
const CUT_FRAMES = 2;

export function parseDatamoshArgs(args: string[]): { blockSize: number } {
  const n = Number(args[0]);
  return { blockSize: Number.isFinite(n) && n >= 2 ? Math.round(n) : 32 };
}

type Fx = [TapEffect, DatamoshEffect, HealEffect];

let frames = 0;

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
    const tap = new TapEffect();
    return [tap, new DatamoshEffect({ dup: 0, blockSize: 32 }), new HealEffect(tap)];
  },
  prepare(run, fx) {
    const [tap, mosh, heal] = fx as Fx;
    const { blockSize } = parseDatamoshArgs(run.args);
    mosh.params.blockSize = blockSize;
    mosh.params.chromaGain = CHROMA_GAIN;
    mosh.params.useResidual = false;
    heal.blockSize = blockSize;
    heal.heal = 0;
    frames = 0;
    // Enable while the old slide is still the frame, so the mosh starts from it.
    mosh.enable();
    tap.enabled = true;
    heal.enabled = true;
  },
  onFrame(_t, x, _dt, fx) {
    const [, mosh, heal] = fx as Fx;
    const h = Math.min(Math.max((x - HOLD) / (1 - HOLD), 0), 1);
    mosh.params.useResidual = ++frames > CUT_FRAMES;
    mosh.params.chromaGain = CHROMA_GAIN + (1 - CHROMA_GAIN) * h;
    // Fast at first, slow at the end, like a 1%-per-step refresh.
    heal.heal = (1 - 0.01 ** h) / 0.99;
  },
  onEnd(fx) {
    const [tap, mosh, heal] = fx as Fx;
    mosh.disable();
    tap.enabled = false;
    heal.enabled = false;
  },
};
