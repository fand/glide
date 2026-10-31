import { VFX, supportsHtmlInCanvas } from "@vfx-js/core";
import type { Deck } from "./deck.ts";
import { TransitionEffect } from "./transitions/base.ts";
import { buildFrag } from "./transitions/glsl.ts";
import { resolveTransition, type TransitionDef } from "./transitions/index.ts";

export type Transitions = { destroy(): void };

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** Resolve on the wrapper canvas's next `paint` event (a new capture), or after `ms`. */
function nextPaint(canvas: HTMLCanvasElement | null, ms = 300): Promise<void> {
  if (!canvas) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      canvas.removeEventListener("paint", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    canvas.addEventListener("paint", done);
  });
}

/**
 * Wrap `deck.stage` with HTML-in-Canvas and run slide transitions on it.
 * Without HTML-in-Canvas, vfx-js falls back to dom-to-canvas capture.
 */
export async function attachTransitions(deck: Deck): Promise<Transitions> {
  const hic = supportsHtmlInCanvas();
  if (!hic) {
    console.info(
      "glide: HTML-in-Canvas is off, using a slower fallback. Enable chrome://flags/#canvas-draw-element in Chrome.",
    );
  }

  const vfx = new VFX({ scrollPadding: false, wrapper: deck.el, zIndex: 0 });
  const effect = new TransitionEffect();
  const stage = deck.stage;
  await vfx.addHTML(stage, { effect });

  const wrapper =
    hic && stage.parentElement instanceof HTMLCanvasElement ? stage.parentElement : null;

  const fragCache = new Map<TransitionDef, string>();
  const fragOf = (def: TransitionDef) => {
    let f = fragCache.get(def);
    if (!f) {
      f = buildFrag(def.frag);
      fragCache.set(def, f);
    }
    return f;
  };

  let destroyed = false;
  let updating = false;
  /** Ask for a new capture. Resolves once it has landed (best effort). */
  async function recapture(): Promise<void> {
    if (destroyed) {
      return;
    }
    if (hic) {
      const painted = nextPaint(wrapper);
      await vfx.update(stage);
      await painted;
    } else {
      // dom-to-canvas is slow; skip if one is in flight.
      if (updating) {
        return;
      }
      updating = true;
      try {
        await vfx.update(stage);
      } finally {
        updating = false;
      }
    }
  }

  // Re-capture when late content (images, fonts) lands, and every frame on live slides.
  let liveRaf = 0;
  const liveLoop = () => {
    void recapture();
    liveRaf = requestAnimationFrame(liveLoop);
  };
  function onMounted(): void {
    cancelAnimationFrame(liveRaf);
    liveRaf = 0;
    const section = stage.firstElementChild;
    if (!section) {
      return;
    }
    for (const m of section.querySelectorAll<HTMLImageElement | HTMLVideoElement>("img, video")) {
      const ready = m instanceof HTMLImageElement ? m.complete : m.readyState >= 2;
      if (!ready) {
        m.addEventListener(m instanceof HTMLImageElement ? "load" : "loadeddata", () => void recapture(), {
          once: true,
        });
      }
    }
    const i = Number((section as HTMLElement).dataset.index);
    if (deck.slides[i]?.live) {
      liveRaf = requestAnimationFrame(liveLoop);
    }
  }
  onMounted();
  // Scrolling a tall slide changes what is painted.
  const onScroll = () => void recapture();
  stage.addEventListener("scroll", onScroll, true);
  void document.fonts?.ready.then(() => recapture());
  void recapture();

  let seq = 0;
  deck.setSwapHandler(async (ctx) => {
    const id = ++seq;
    const leaving = deck.slides[ctx.from];
    const entering = deck.slides[ctx.to];
    const owner = ctx.direction === 1 ? entering : leaving;
    const resolved = resolveTransition(owner.transition);

    if (!resolved || owner.duration <= 0) {
      effect.cancel();
      ctx.mount();
      onMounted();
      await recapture();
      return;
    }

    await effect.snapshot();
    if (id !== seq || deck.current !== ctx.to) {
      return;
    }
    ctx.mount();
    onMounted();
    await recapture();
    if (id !== seq) {
      return;
    }
    await nextFrame();
    if (id !== seq) {
      return;
    }
    await effect.start({
      frag: fragOf(resolved.def),
      uniforms: resolved.uniforms,
      duration: owner.duration,
      reverse: ctx.direction === -1,
    });
  });

  return {
    destroy() {
      destroyed = true;
      stage.removeEventListener("scroll", onScroll, true);
      cancelAnimationFrame(liveRaf);
      deck.setSwapHandler(null);
      vfx.remove(stage);
      vfx.destroy();
    },
  };
}
