import type { Effect, EffectContext, EffectRenderTarget } from "@vfx-js/core";
import type { TransitionUniforms } from "./types.ts";

export type TransitionSpec = {
  frag: string;
  uniforms?: TransitionUniforms;
  /** Seconds. */
  duration: number;
  /** Play backwards with the roles of the old and new slide swapped. */
  reverse: boolean;
};

const smoothstep = (x: number) => x * x * (3 - 2 * x);

/**
 * One effect for the whole deck. States:
 * - idle: disabled, the chain passes the capture through.
 * - hold: shows the snapshot of the old slide while the new one is captured.
 * - running: mixes the snapshot (`from`) and the live capture (`src`).
 */
export class TransitionEffect implements Effect {
  enabled = false;

  #from: EffectRenderTarget | null = null;
  #snapshotWaiters: (() => void)[] = [];
  #hold = false;
  #spec: TransitionSpec | null = null;
  #startTime: number | null = null;

  init(ctx: EffectContext): void {
    this.#from = ctx.createRenderTarget();
  }

  /** Copy the current capture into `from` on the next frame and hold it on screen. */
  snapshot(): Promise<void> {
    this.enabled = true;
    return new Promise((resolve) => this.#snapshotWaiters.push(resolve));
  }

  start(spec: TransitionSpec): void {
    this.#spec = spec;
    this.#startTime = null;
    this.#hold = false;
    this.enabled = true;
  }

  /** Stop any transition and pass the capture through. */
  cancel(): void {
    this.#spec = null;
    this.#hold = false;
    if (this.#snapshotWaiters.length === 0) {
      this.enabled = false;
    }
  }

  get running(): boolean {
    return this.#spec !== null;
  }

  render(ctx: EffectContext): void {
    const from = this.#from;
    if (!from) {
      ctx.blit(ctx.src);
      return;
    }

    if (this.#snapshotWaiters.length > 0) {
      ctx.blit(ctx.src, from);
      this.#spec = null;
      this.#hold = true;
      const waiters = this.#snapshotWaiters;
      this.#snapshotWaiters = [];
      for (const w of waiters) {
        w();
      }
    }

    const spec = this.#spec;
    if (spec) {
      if (this.#startTime === null) {
        this.#startTime = ctx.time;
      }
      const x = spec.duration > 0 ? (ctx.time - this.#startTime) / spec.duration : 1;
      const t = smoothstep(Math.min(Math.max(x, 0), 1));
      if (x >= 1) {
        this.#spec = null;
        this.enabled = false;
        ctx.blit(ctx.src);
        return;
      }
      ctx.draw({
        frag: spec.frag,
        uniforms: {
          ...spec.uniforms,
          from,
          src: ctx.src,
          t,
          reverse: spec.reverse ? 1 : 0,
          resolution: [ctx.dims.elementPixel[0], ctx.dims.elementPixel[1]],
          time: ctx.time,
        },
        target: ctx.target,
      });
      return;
    }

    if (this.#hold) {
      ctx.blit(from);
      return;
    }

    this.enabled = false;
    ctx.blit(ctx.src);
  }

  dispose(): void {
    this.#from = null;
    for (const w of this.#snapshotWaiters) {
      w();
    }
    this.#snapshotWaiters = [];
  }
}
