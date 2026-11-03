import { VFX, supportsHtmlInCanvas, type Effect } from "@vfx-js/core";
import type { Deck } from "./deck.ts";
import { TransitionEffect } from "./transitions/base.ts";
import { buildFrag } from "./transitions/glsl.ts";
import {
  resolveTransition,
  type TransitionDef,
  type TransitionMap,
} from "./transitions/index.ts";

export type Transitions = { destroy(): void };

/** Content that keeps changing on its own, so the slide needs a capture every frame. */
const MOVING =
  "video, canvas, iframe, img[src$='.gif' i], animate, animateTransform, animateMotion";

function wantsFrames(section: HTMLElement, deck: Deck, hic: boolean): boolean {
  const live = deck.slides[Number(section.dataset.index)]?.live;
  if (live !== undefined) {
    return live;
  }
  // dom-to-canvas draws only the first GIF frame, so skip the cost there.
  if (hic && section.querySelector(MOVING)) {
    return true;
  }
  return section.getAnimations({ subtree: true }).some((a) => a.playState === "running");
}

function isCrossOrigin(src: string | null): boolean {
  if (!src) {
    return false;
  }
  try {
    return new URL(src, document.baseURI).origin !== location.origin;
  } catch {
    return true;
  }
}

/** Move `node` to the end of `parent`, keeping iframe, video and scroll state when the browser can. */
function moveNode(parent: Element, node: Element): void {
  const p = parent as Element & { moveBefore?: (node: Node, child: Node | null) => void };
  if (typeof p.moveBefore === "function") {
    try {
      p.moveBefore(node, null);
      return;
    } catch {
      // Fall through: a plain move reloads iframes and resets scroll.
    }
  }
  parent.appendChild(node);
}

/** Content the user clicks, types into or drags. */
const INTERACTIVE =
  "input, button, select, textarea, details, label, iframe, audio, video[controls], embed, object, [contenteditable], [data-glide-interactive], [onclick]";

/**
 * Slides the GPU stage cannot show, so they mount as plain DOM:
 * - cross-origin iframes (never captured);
 * - without HTML-in-Canvas, dom-to-canvas cannot draw video, canvas, iframes,
 *   GIF frames or SMIL, and scripts may add a canvas later;
 * - when the browser does not hit-test inside the capture canvas, or in the
 *   fallback, anything interactive.
 */
function needsPlainDom(html: string, hic: boolean, hitTest: boolean): boolean {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const doc = tpl.content;
  for (const f of doc.querySelectorAll("iframe[src]")) {
    if (isCrossOrigin(f.getAttribute("src"))) {
      return true;
    }
  }
  if (
    !hic &&
    doc.querySelector(
      "video, canvas, iframe, script, embed, object, img[src$='.gif' i], animate, animateTransform, animateMotion",
    )
  ) {
    return true;
  }
  // Without hit testing, pointer events never reach a canvas or a
  // script-built element in the stage; we can't tell which ones listen, so
  // park them all. Parked slides still animate their transitions.
  if (!hitTest && doc.querySelector("canvas, script")) {
    return true;
  }
  // dom-to-canvas also loses typed values, scroll positions and toggles.
  return (!hitTest || !hic) && doc.querySelector(INTERACTIVE) !== null;
}

/** Whether clicks reach elements inside the capture canvas (needs Chrome's experimental platform features). */
function probeHitTest(stage: HTMLElement): boolean {
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;left:0;top:0;width:4px;height:4px;z-index:2147483647";
  stage.appendChild(probe);
  const r = probe.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + 2, r.top + 2);
  probe.remove();
  return hit === probe;
}

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
export async function attachTransitions(
  deck: Deck,
  local: TransitionMap = new Map(),
): Promise<Transitions> {
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

  const hitTest = !hic || probeHitTest(stage);
  if (!hitTest) {
    console.info(
      "glide: this browser does not send clicks into HTML-in-Canvas, so interactive slides show as plain DOM. Enable chrome://flags/#enable-experimental-web-platform-features to fix.",
    );
  }

  // `gpu: false` slides always live in the plain-DOM layer (cut transitions).
  // Slides the stage cannot show live (cross-origin iframes, interactive
  // content without hit testing, ...) are "parked": they sit in the GPU
  // stage while a transition runs and move to the plain-DOM layer when idle.
  const isPlain = (i: number) => deck.slides[i]?.gpu === false;
  const parks = deck.slides.map(
    (s) => s.gpu === undefined && needsPlainDom(s.html + (s.htmlRight ?? ""), hic, hitTest),
  );
  const parksIdle = (i: number) => parks[i] ?? false;
  deck.setPlainDom(isPlain);
  const first = stage.firstElementChild;
  if (first && isPlain(deck.current)) {
    deck.domLayer.replaceChildren(first);
    deck.domLayer.classList.add("active");
  }

  /**
   * Move the idle slide to the plain-DOM layer. The GPU output keeps showing
   * its last frame underneath, so moving it back later does not flash.
   */
  async function park(id: number): Promise<void> {
    const section = stage.firstElementChild;
    if (!section) {
      return;
    }
    await effect.snapshot();
    if (id !== seq || stage.firstElementChild !== section) {
      return;
    }
    moveNode(deck.domLayer, section);
    deck.domLayer.classList.add("active");
  }

  /** Bring a parked slide back into the GPU stage and wait for its capture. */
  async function unpark(): Promise<void> {
    const section = deck.domLayer.firstElementChild;
    if (!section || !parksIdle(Number((section as HTMLElement).dataset.index))) {
      return;
    }
    moveNode(stage, section);
    deck.domLayer.classList.remove("active");
    onMounted();
    await recapture();
  }

  // Without hit testing, links inside the capture canvas would turn the page; open them by hand.
  const onLinkClick = (e: MouseEvent) => {
    if (hitTest || e.button !== 0 || !(e.target instanceof HTMLCanvasElement)) {
      return;
    }
    for (const a of stage.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      for (const r of a.getClientRects()) {
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          e.stopImmediatePropagation();
          if (a.target && a.target !== "_self") {
            window.open(a.href, a.target, a.rel.includes("noopener") ? "noopener" : undefined);
          } else {
            location.href = a.href;
          }
          return;
        }
      }
    }
  };
  deck.el.addEventListener("click", onLinkClick, true);

  // Re-capture every frame while the slide moves: `live` slides, slides with
  // video / canvas / iframe / GIF / SMIL, running CSS animations, and for a
  // short while after any user input.
  let kickUntil = 0;
  const kick = () => {
    kickUntil = performance.now() + 250;
  };
  const KICK_EVENTS = [
    "pointermove",
    "pointerdown",
    "pointerup",
    "pointerleave",
    "input",
    "change",
    "focusin",
    "focusout",
    "keydown",
    "keyup",
    "toggle",
  ];
  for (const t of KICK_EVENTS) {
    stage.addEventListener(t, kick, true);
  }
  let pumpRaf = 0;
  const pump = () => {
    pumpRaf = requestAnimationFrame(pump);
    const section = stage.firstElementChild as HTMLElement | null;
    if (section && (performance.now() < kickUntil || wantsFrames(section, deck, hic))) {
      void recapture();
    }
  };
  pumpRaf = requestAnimationFrame(pump);

  // Re-capture when late content (images, fonts) lands.
  function onMounted(): void {
    const section = stage.firstElementChild;
    if (!section) {
      return;
    }
    // A cross-origin iframe is captured blank; show black there, not the slide behind.
    for (const f of section.querySelectorAll("iframe")) {
      if (isCrossOrigin(f.getAttribute("src"))) {
        f.dataset.glideXo = "";
      }
    }
    for (const m of section.querySelectorAll<HTMLImageElement | HTMLVideoElement>("img, video")) {
      const ready = m instanceof HTMLImageElement ? m.complete : m.readyState >= 2;
      if (!ready) {
        m.addEventListener(m instanceof HTMLImageElement ? "load" : "loadeddata", () => void recapture(), {
          once: true,
        });
      }
    }
  }
  onMounted();
  // Scrolling a tall slide changes what is painted.
  const onScroll = () => void recapture();
  stage.addEventListener("scroll", onScroll, true);
  void document.fonts?.ready.then(() => recapture());
  void recapture();

  // Driver effects (datamosh, pixelsort, ...) are created on first use and
  // appended to the chain after `effect`. They pass through while idle.
  const driverFx = new Map<TransitionDef, Effect[]>();
  const chain: Effect[] = [effect];
  async function ensureFx(def: TransitionDef): Promise<Effect[]> {
    let fx = driverFx.get(def);
    if (!fx) {
      fx = def.effects ? await def.effects() : [];
      driverFx.set(def, fx);
      if (fx.length > 0) {
        chain.push(...fx);
        await vfx.updateEffects(stage, [...chain]);
      }
    }
    return fx;
  }

  // The driver run that owns the driver effects right now.
  let active: { id: number; def: TransitionDef; fx: Effect[] } | null = null;
  function endActive(id?: number): void {
    if (active && (id === undefined || active.id === id)) {
      const { def, fx } = active;
      active = null;
      def.onEnd?.(fx);
    }
  }

  let seq = 0;
  deck.setSwapHandler(async (ctx) => {
    const id = ++seq;
    const leaving = deck.slides[ctx.from];
    const entering = deck.slides[ctx.to];
    const owner = ctx.direction === 1 ? entering : leaving;
    const resolved = resolveTransition(owner.transition, local);

    // `gpu: false` slides are never captured, so there is nothing to animate.
    if (!resolved || owner.duration <= 0 || isPlain(ctx.from) || isPlain(ctx.to)) {
      endActive();
      effect.cancel();
      ctx.mount();
      onMounted();
      await recapture();
      if (id === seq && parksIdle(ctx.to)) {
        await park(id);
      }
      return;
    }

    const { def, uniforms } = resolved;
    const fx = await ensureFx(def);
    if (id !== seq) {
      return;
    }
    await unpark();
    if (id !== seq) {
      return;
    }

    await effect.snapshot();
    if (id !== seq || deck.current !== ctx.to) {
      return;
    }
    endActive();
    const reverse = ctx.direction === -1;
    if (fx.length > 0 || def.prepare) {
      active = { id, def, fx };
      def.prepare?.({ reverse, args: owner.transition.args, uniforms, duration: owner.duration }, fx);
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
      name: def.name,
      frag: fragOf(def),
      uniforms,
      duration: owner.duration,
      reverse,
      onFrame: def.onFrame ? (t, x, dt) => def.onFrame?.(t, x, dt, fx) : undefined,
      onEnd: () => endActive(id),
    });
    if (id === seq && parksIdle(ctx.to)) {
      await park(id);
    }
  });
  if (parksIdle(deck.current)) {
    void recapture().then(() => park(seq));
  }

  return {
    destroy() {
      destroyed = true;
      stage.removeEventListener("scroll", onScroll, true);
      cancelAnimationFrame(pumpRaf);
      deck.el.removeEventListener("click", onLinkClick, true);
      for (const t of KICK_EVENTS) {
        stage.removeEventListener(t, kick, true);
      }
      deck.setSwapHandler(null);
      deck.setPlainDom(null);
      vfx.remove(stage);
      vfx.destroy();
    },
  };
}
