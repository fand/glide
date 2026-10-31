import type { Effect, EffectContext, EffectRenderTarget } from "@vfx-js/core";

/** Pass-through that keeps a copy of its input, so a later stage can read the clean frame. */
export class TapEffect implements Effect {
  enabled = false;
  rt: EffectRenderTarget | null = null;

  init(ctx: EffectContext): void {
    this.rt = ctx.createRenderTarget();
  }

  render(ctx: EffectContext): void {
    if (this.rt) {
      ctx.blit(ctx.src, this.rt);
    }
    ctx.blit(ctx.src);
  }

  dispose(): void {
    this.rt = null;
  }
}

const FRAG_HEAL = `#version 300 es
precision highp float;
in vec2 uvContent;
in vec2 uvSrc;
out vec4 outColor;
uniform sampler2D src;
uniform sampler2D clean;
uniform float heal;
uniform vec2 cells;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  float h = hash(floor(uvContent * cells));
  outColor = h < heal ? texture(clean, uvContent) : texture(src, uvSrc);
}
`;

/**
 * Replaces random blocks of its input with the clean frame from a TapEffect.
 * `heal` = share of blocks replaced (0..1).
 */
export class HealEffect implements Effect {
  enabled = false;
  heal = 0;
  blockSize = 32;

  #tap: TapEffect;

  constructor(tap: TapEffect) {
    this.#tap = tap;
  }

  render(ctx: EffectContext): void {
    const clean = this.#tap.rt;
    if (!clean) {
      ctx.blit(ctx.src);
      return;
    }
    const [w, h] = ctx.dims.element;
    const b = Math.max(1, this.blockSize);
    ctx.draw({
      frag: FRAG_HEAL,
      uniforms: {
        src: ctx.src,
        clean,
        heal: this.heal,
        cells: [Math.ceil(w / b), Math.ceil(h / b)],
      },
      target: ctx.target,
    });
  }
}
