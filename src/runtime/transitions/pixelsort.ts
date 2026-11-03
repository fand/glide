import type { Effect } from "@vfx-js/core";
import type { PixelSortDirection, PixelSortEffect } from "@vfx-js/effects";
import type { TransitionDef } from "./types.ts";

const DIRECTIONS: PixelSortDirection[] = ["up", "down", "left", "right"];
const OPPOSITE: Record<PixelSortDirection, PixelSortDirection> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

// The current run. Only one driver run owns the effect at a time.
let outDir: PixelSortDirection = "up";
let reverse = false;

export function parsePixelSortArgs(args: string[]): { direction: PixelSortDirection } {
  const d = args.find((a): a is PixelSortDirection => (DIRECTIONS as string[]).includes(a));
  return { direction: d ?? "up" };
}

/**
 * The old slide melts into sorted streaks toward `direction`; the new one
 * sorts back out of them from the opposite side.
 */
export const pixelsort: TransitionDef = {
  name: "pixelsort",
  frag: `
vec4 transition(vec2 uv, float t) {
  return t < 0.5 ? readFrom(uv) : readTo(uv);
}
`,
  async effects(): Promise<Effect[]> {
    const { PixelSortEffect } = await import("@vfx-js/effects");
    const e: Effect = new PixelSortEffect({ range: [1, 1] });
    e.enabled = false;
    return [e];
  },
  prepare(run, fx) {
    const e = fx[0] as PixelSortEffect;
    outDir = parsePixelSortArgs(run.args).direction;
    reverse = run.reverse;
    e.params.direction = reverse ? OPPOSITE[outDir] : outDir;
    e.params.range[0] = 1;
    (e as Effect).enabled = true;
  },
  onFrame(t, _x, _dt, fx) {
    const e = fx[0] as PixelSortEffect;
    // Reverse plays the forward run backward, so its halves swap directions.
    const forwardT = reverse ? 1 - t : t;
    e.params.direction = forwardT < 0.5 ? outDir : OPPOSITE[outDir];
    // Fully sorted at the halfway swap.
    // Cubed so the threshold spends most of the time in the dark range,
    // where slide backgrounds live; linear crosses it in a few frames.
    e.params.range[0] = Math.abs(1 - 2 * t) ** 3;
  },
  onEnd(fx) {
    const e = fx[0] as PixelSortEffect;
    (e as Effect).enabled = false;
    e.params.range[0] = 1;
  },
};
