import type { Effect } from "@vfx-js/core";
import type { PixelSortDirection, PixelSortEffect } from "@vfx-js/effects";
import type { TransitionDef } from "./types.ts";

const DIRECTIONS: PixelSortDirection[] = ["up", "down", "left", "right"];

export function parsePixelSortArgs(args: string[]): { direction: PixelSortDirection } {
  const d = args.find((a): a is PixelSortDirection => (DIRECTIONS as string[]).includes(a));
  return { direction: d ?? "up" };
}

/** The old slide melts into sorted streaks; the new one sorts back out of them. */
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
    e.params.direction = parsePixelSortArgs(run.args).direction;
    e.params.range[0] = 1;
    (e as Effect).enabled = true;
  },
  onFrame(t, _x, _dt, fx) {
    // Fully sorted at the halfway swap. Symmetric, so reverse needs nothing.
    (fx[0] as PixelSortEffect).params.range[0] = Math.abs(1 - 2 * t);
  },
  onEnd(fx) {
    const e = fx[0] as PixelSortEffect;
    (e as Effect).enabled = false;
    e.params.range[0] = 1;
  },
};
