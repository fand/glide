import type { Effect } from "@vfx-js/core";

export type TransitionUniforms = Record<string, number | [number, number]>;

/** One run of a transition, passed to the driver hooks. */
export type TransitionRun = {
  reverse: boolean;
  args: string[];
  uniforms: TransitionUniforms;
  /** Seconds. */
  duration: number;
};

export type TransitionDef = {
  name: string;
  /** GLSL that defines `vec4 transition(vec2 uv, float t)`. See PRELUDE in glsl.ts. */
  frag: string;
  parseArgs?(args: string[]): TransitionUniforms;

  // Optional JS driver for transitions built on extra effects.

  /**
   * Extra effects placed after the transition effect in the chain. Created
   * once, on first use, and kept for the deck's lifetime. They must pass
   * through (disabled) until `prepare`.
   */
  effects?(): Promise<Effect[]>;
  /** Called while the old slide is held on screen, before the new one mounts. */
  prepare?(run: TransitionRun, fx: Effect[]): void;
  /** Called every frame while running. `t` is eased, `x` is linear, both 0..1. `dt` is seconds. */
  onFrame?(t: number, x: number, dt: number, fx: Effect[]): void;
  /** Called once when the run ends, finishes or is replaced. Must leave `fx` passing through. */
  onEnd?(fx: Effect[]): void;
};
