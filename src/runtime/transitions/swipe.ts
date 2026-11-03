import type { TransitionDef } from "./types.ts";

// Direction the content moves, in uv space (y up).
const MOVES: Record<string, [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, 1],
  down: [0, -1],
};

/** `swipe left` (default): content moves left, the new slide enters from the right. */
export const swipe: TransitionDef = {
  name: "swipe",
  frag: `
uniform vec2 move;
vec4 transition(vec2 uv, float t) {
  vec2 p = uv - move * t;
  return inRange(p) ? readFrom(p) : readTo(p + move);
}
`,
  parseArgs(args) {
    const dir = args.find((a) => a in MOVES);
    for (const a of args) {
      if (!(a in MOVES)) {
        console.warn(`glide: unknown swipe arg "${a}"`);
      }
    }
    return { move: MOVES[dir ?? "left"] };
  },
};
