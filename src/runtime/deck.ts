import { isHicCanvas } from "@vfx-js/core";
import { parse, type ParsedDeck, type Slide } from "./parse.ts";
import slideCss from "./slide.css?inline";
import themesCss from "./themes.css?inline";
import hljsCss from "highlight.js/styles/github-dark.css?inline";
import { attachTransitions, type Transitions } from "./stage.ts";
import { customTransitions } from "./transitions/custom.ts";
import { mountScripts, unmountScripts } from "./scripts.ts";

export const DEFAULT_THEME = "mocha";

export type RunOpts = {
  /** Element to mount into. Default: `document.body`. */
  root?: HTMLElement;
  /** Theme name. Beats the frontmatter `theme`. */
  theme?: string;
  /** Base URL for relative image/video/css paths in the markdown. Default: the page URL. */
  baseUrl?: string;
  /** Sync the slide number with `location.hash`. Default: true. */
  hash?: boolean;
  /** Run WebGL transitions. Default: true. */
  transitions?: boolean;
  /**
   * Custom transitions for this deck: name -> GLSL body defining
   * `vec4 transition(vec2 uv, float t)`. They shadow built-ins of the same name.
   */
  shaders?: Record<string, string>;
};

export type Direction = 1 | -1;

export type SwapContext = {
  from: number;
  to: number;
  direction: Direction;
  stage: HTMLElement;
  /** The section showing now (slide `from`). */
  current: HTMLElement | null;
  /**
   * Replace the stage content with slide `to` and return its section.
   * Does nothing (returns the mounted section) if another navigation already
   * moved past `to`.
   */
  mount: () => HTMLElement;
};

/**
 * Replaces the old slide with the new one. The default calls `mount()` right away.
 * A transition can snapshot `ctx.current` first, then call `mount()` and animate.
 * Resolve the returned promise when the animation ends: the overlay (header,
 * page counter) switches to the new slide's theme then.
 */
export type SwapHandler = (ctx: SwapContext) => void | Promise<void>;

export type ChangeDetail = { from: number; to: number; direction: Direction };

export type Deck = ParsedDeck & {
  readonly current: number;
  readonly length: number;
  readonly el: HTMLElement;
  readonly stage: HTMLElement;
  next(): void;
  prev(): void;
  goto(index: number): void;
  setSwapHandler(fn: SwapHandler | null): void;
  /**
   * Choose which slides mount outside the GPU stage, as plain DOM above it
   * (used by the transition layer for content it cannot capture).
   */
  setPlainDom(fn: ((index: number) => boolean) | null): void;
  /** The layer that holds plain-DOM slides. */
  readonly domLayer: HTMLElement;
  destroy(): void;
};

const STYLE_ID = "glide-style";

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = [hljsCss, themesCss, slideCss].join("\n");
  document.head.appendChild(style);
}

function isAbsoluteUrl(s: string): boolean {
  return /^([a-z][\w+.-]*:|\/\/|\/|#)/i.test(s);
}

/** Resolve relative URLs against `base`, and collect image URLs for preload. */
function resolveMedia(html: string, base: URL): { html: string; images: string[] } {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const images: string[] = [];
  for (const el of tpl.content.querySelectorAll<HTMLElement>(
    "img[src], video[src], video[poster], audio[src], source[src], track[src], script[src], iframe[src], link[href], embed[src], object[data]",
  )) {
    for (const attr of ["src", "poster", "href", "data"]) {
      const v = el.getAttribute(attr);
      if (v === null) {
        continue;
      }
      const url = isAbsoluteUrl(v) ? v : new URL(v, base).href;
      el.setAttribute(attr, url);
      if (el.tagName === "IMG" && attr === "src") {
        images.push(url);
      }
    }
  }
  return { html: tpl.innerHTML, images };
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    e.setAttribute(k, v);
  }
  return e;
}

const MIN_CODE_SCALE = 0.6;

/**
 * Shrink code blocks (down to MIN_CODE_SCALE) until the slide fits.
 * Whatever still overflows can be scrolled with ↓/↑.
 */
function fitCode(section: HTMLElement): void {
  if (!section.querySelector("pre")) {
    return;
  }
  let scale = 1;
  section.style.removeProperty("--code-scale");
  while (section.scrollHeight > section.clientHeight + 1 && scale > MIN_CODE_SCALE) {
    scale = Math.max(MIN_CODE_SCALE, scale - 0.05);
    section.style.setProperty("--code-scale", String(scale));
  }
}

const HELP_HTML = `<div class="panel">
<h2>Keys</h2>
<dl>
<dt>→ l Space PageDown</dt><dd>Next slide</dd>
<dt>← h PageUp</dt><dd>Previous slide</dd>
<dt>Home / End</dt><dd>First / last slide</dd>
<dt>↓ j / ↑ k</dt><dd>Scroll a tall slide</dd>
<dt>f</dt><dd>Fullscreen</dd>
<dt>?</dt><dd>This help</dd>
<dt>Esc</dt><dd>Leave a focused control, exit fullscreen</dd>
</dl>
<p>Click or tap the left / right side to go back / forward. Press any key to close.</p>
</div>`;

/** Clicks on these do not turn the page. */
const INTERACTIVE = [
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "label",
  "summary",
  "details",
  "video",
  "audio",
  "canvas",
  "iframe",
  "embed",
  "object",
  "[contenteditable]",
  "[tabindex]",
  "[data-glide-interactive]",
].join(", ");

/** Minimum horizontal travel (CSS px) of a touch swipe. */
const SWIPE_MIN = 50;

/**
 * Whether a click or swipe at (x, y) on `t` belongs to the slide content.
 * The capture canvas that wraps the stage is not content. Without hit
 * testing every event lands on it, so look for content under the point.
 */
function isInteractive(t: EventTarget | null, x: number, y: number): boolean {
  if (!(t instanceof Element)) {
    return false;
  }
  if (isHicCanvas(t)) {
    for (const el of t.querySelectorAll(INTERACTIVE)) {
      for (const r of el.getClientRects()) {
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          return true;
        }
      }
    }
    return false;
  }
  const hit = t.closest(INTERACTIVE);
  return hit !== null && !isHicCanvas(hit);
}

/** Keys that these elements use themselves while focused. */
function keyBelongsToTarget(t: HTMLElement, key: string): boolean {
  if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) {
    return true;
  }
  if (t.closest("[data-glide-interactive]")) {
    return true;
  }
  // Space / Enter press a focused button, link or summary.
  if ((key === " " || key === "Enter") && t.closest("button, a, summary, [role=button]")) {
    return true;
  }
  return false;
}

function readHash(): number | null {
  const m = location.hash.match(/^#(\d+)$/);
  return m ? Number(m[1]) - 1 : null;
}

export function run(md: string, opts: RunOpts = {}): Deck {
  const { meta, slides } = parse(md);
  const root = opts.root ?? document.body;
  const base = new URL(opts.baseUrl ?? "./", document.baseURI);
  const useHash = opts.hash ?? true;
  const deckTheme = opts.theme ?? meta.theme ?? DEFAULT_THEME;

  injectStyle();
  if (meta.title && !document.title) {
    document.title = meta.title;
  }

  let cssLink: HTMLLinkElement | null = null;
  if (meta.css) {
    cssLink = el("link", { rel: "stylesheet", href: new URL(meta.css, base).href });
    document.head.appendChild(cssLink);
  }

  const rendered = slides.map((s) => {
    const left = resolveMedia(s.html, base);
    const right = s.htmlRight === undefined ? null : resolveMedia(s.htmlRight, base);
    return {
      html: left.html,
      htmlRight: right?.html,
      images: [...left.images, ...(right?.images ?? [])],
    };
  });

  const glide = el("div", { id: "glide", class: `theme-${deckTheme}` });
  const stage = el("div", { id: "stage" });
  const domLayer = el("div", { id: "stage-dom" });
  const overlay = el("div", { id: "overlay", class: `theme-${deckTheme}` });
  const header = el("div", { class: "header" });
  const counter = el("div", { class: "counter" });

  for (const item of meta.header) {
    const node = item.url
      ? el("a", { href: item.url, target: "_blank", rel: "noopener" })
      : el("span");
    node.textContent = item.text;
    header.appendChild(node);
  }
  if (meta.header.length > 0) {
    overlay.appendChild(header);
  }
  overlay.appendChild(counter);
  const help = el("div", { id: "glide-help", role: "dialog", "aria-label": "Keyboard shortcuts" });
  help.innerHTML = HELP_HTML;
  help.hidden = true;
  glide.append(stage, domLayer, overlay, help);
  root.appendChild(glide);

  const preloaded = new Set<string>();
  function preload(i: number): void {
    for (const src of rendered[i]?.images ?? []) {
      if (!preloaded.has(src)) {
        preloaded.add(src);
        new Image().src = src;
      }
    }
  }

  function buildSection(i: number): HTMLElement {
    const s: Slide = slides[i];
    const r = rendered[i];
    const theme = s.theme ?? deckTheme;
    const section = el("section", {
      class: `slide layout-${s.layout} theme-${theme}`,
      "data-index": String(i),
    });
    if (r.htmlRight !== undefined) {
      const l = el("div", { class: "col" });
      const rr = el("div", { class: "col" });
      l.innerHTML = r.html;
      rr.innerHTML = r.htmlRight;
      section.append(l, rr);
    } else {
      section.innerHTML = r.html;
    }
    return section;
  }

  let current = -1;
  let mounted: HTMLElement | null = null;
  let swap: SwapHandler | null = null;
  let plainDom: ((index: number) => boolean) | null = null;

  /** The overlay follows the current slide's theme once its swap has finished. */
  function applyOverlayTheme(): void {
    overlay.className = `theme-${slides[current]?.theme ?? deckTheme}`;
    help.className = overlay.className;
  }

  function mountSlide(i: number): HTMLElement {
    const section = buildSection(i);
    if (mounted) {
      unmountScripts(mounted);
    }
    const inDom = plainDom?.(i) ?? false;
    (inDom ? domLayer : stage).replaceChildren(section);
    (inDom ? stage : domLayer).replaceChildren();
    domLayer.classList.toggle("active", inDom);
    mounted = section;
    void mountScripts(section).then(() => {
      if (section.isConnected) {
        section.dispatchEvent(new CustomEvent("glide:mount", { bubbles: true }));
      }
    });
    fitCode(section);
    for (const img of section.querySelectorAll("img")) {
      if (!img.complete) {
        img.addEventListener("load", () => fitCode(section), { once: true });
      }
    }
    counter.textContent = `${i + 1} / ${slides.length}`;
    preload(i + 1);
    preload(i - 1);
    return section;
  }

  function scrollSlide(dir: 1 | -1): void {
    mounted?.scrollBy({ top: dir * mounted.clientHeight * 0.25 });
  }

  // Scroll by hand: native wheel scrolling does not reach children of an
  // HTML-in-Canvas wrapper.
  function onWheel(e: WheelEvent): void {
    if (!mounted || e.ctrlKey || mounted.scrollHeight <= mounted.clientHeight) {
      return;
    }
    e.preventDefault();
    const line = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? mounted.clientHeight : 1;
    mounted.scrollBy({ top: e.deltaY * line });
  }

  function onResize(): void {
    if (mounted) {
      fitCode(mounted);
    }
  }

  function goto(index: number): void {
    if (slides.length === 0) {
      return;
    }
    const to = Math.max(0, Math.min(slides.length - 1, Math.trunc(index)));
    if (to === current) {
      return;
    }
    const from = current;
    current = to;
    if (useHash) {
      history.replaceState(null, "", `#${to + 1}`);
    }

    if (from < 0) {
      mountSlide(to);
      applyOverlayTheme();
      return;
    }

    const direction: Direction = to > from ? 1 : -1;
    const ctx: SwapContext = {
      from,
      to,
      direction,
      stage,
      current: mounted,
      mount: () => (current === to ? mountSlide(to) : (mounted as HTMLElement)),
    };
    const handler = swap;
    if (handler) {
      (async () => handler(ctx))()
        .catch((e) => {
          console.error(e);
          ctx.mount();
        })
        .finally(() => {
          // A stale swap ending early must not repaint the overlay mid-transition.
          if (current === to) {
            applyOverlayTheme();
          }
        });
    } else {
      ctx.mount();
      applyOverlayTheme();
    }

    const detail: ChangeDetail = { from, to, direction };
    glide.dispatchEvent(new CustomEvent("glide:change", { detail, bubbles: true }));
  }

  const next = () => goto(current + 1);
  const prev = () => goto(current - 1);

  function toggleHelp(open = help.hidden): void {
    help.className = overlay.className;
    help.hidden = !open;
  }

  function toggleFullscreen(): void {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void glide.requestFullscreen?.().catch((err: unknown) => {
        console.warn("glide: fullscreen failed:", err);
      });
    }
  }

  function onKey(e: KeyboardEvent): void {
    if (!help.hidden) {
      // Any key closes the help; it must not turn the page.
      if (!["Shift", "Control", "Alt", "Meta"].includes(e.key)) {
        toggleHelp(false);
        e.preventDefault();
      }
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) {
      return;
    }
    const t = e.target as HTMLElement | null;
    if (e.key === "Escape" && t && t !== document.body && glide.contains(t)) {
      // Leave a focused control so the arrow keys turn pages again.
      t.blur();
      return;
    }
    if (t && t !== document.body && keyBelongsToTarget(t, e.key)) {
      return;
    }
    switch (e.key) {
      case "ArrowRight":
      case "l":
      case " ":
      case "PageDown":
        next();
        break;
      case "ArrowLeft":
      case "h":
      case "PageUp":
        prev();
        break;
      case "Home":
        goto(0);
        break;
      case "End":
        goto(slides.length - 1);
        break;
      case "ArrowDown":
      case "j":
        scrollSlide(1);
        break;
      case "ArrowUp":
      case "k":
        scrollSlide(-1);
        break;
      case "f":
        toggleFullscreen();
        break;
      case "?":
        toggleHelp(true);
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  // A drag (text selection, slider) ends with a click; it must not turn the page.
  // Touch: a horizontal swipe turns the page; vertical moves scroll natively
  // (`touch-action: pan-y` on #glide).
  let down: { x: number; y: number; touch: boolean; target: EventTarget | null } | null = null;
  let swiped = false;
  function onPointerDown(e: PointerEvent): void {
    down = { x: e.clientX, y: e.clientY, touch: e.pointerType === "touch", target: e.target };
    swiped = false;
  }
  function onPointerUp(e: PointerEvent): void {
    if (!down?.touch || e.pointerType !== "touch" || isInteractive(down.target, down.x, down.y)) {
      return;
    }
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swiped = true;
      if (dx < 0) {
        next();
      } else {
        prev();
      }
    }
  }
  function onPointerCancel(): void {
    down = null;
  }
  // Without hit testing, a vertical touch drag lands on the capture canvas,
  // which does not scroll; scroll the slide by hand.
  let touchY: number | null = null;
  function onTouchMove(e: TouchEvent): void {
    const y = e.touches[0]?.clientY;
    if (y === undefined || !mounted || !(e.target instanceof Element) || !isHicCanvas(e.target)) {
      return;
    }
    if (touchY !== null) {
      mounted.scrollBy({ top: touchY - y });
    }
    touchY = y;
  }
  function onTouchEnd(): void {
    touchY = null;
  }

  function onClick(e: MouseEvent): void {
    if (e.button !== 0 || swiped) {
      swiped = false;
      return;
    }
    const slop = down?.touch ? 10 : 6;
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > slop) {
      return;
    }
    if (String(window.getSelection() ?? "") !== "") {
      return;
    }
    if (isInteractive(e.target, e.clientX, e.clientY)) {
      return;
    }
    const x = e.clientX / window.innerWidth;
    if (x < 0.4) {
      prev();
    } else if (x > 0.6) {
      next();
    }
  }

  function onHashChange(): void {
    const i = readHash();
    if (i !== null) {
      goto(i);
    }
  }

  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", onResize);
  glide.addEventListener("pointerdown", onPointerDown);
  glide.addEventListener("pointerup", onPointerUp);
  glide.addEventListener("pointercancel", onPointerCancel);
  glide.addEventListener("touchmove", onTouchMove, { passive: true });
  glide.addEventListener("touchend", onTouchEnd);
  glide.addEventListener("touchcancel", onTouchEnd);
  glide.addEventListener("click", onClick);
  help.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleHelp(false);
  });
  glide.addEventListener("wheel", onWheel, { passive: false });
  if (useHash) {
    window.addEventListener("hashchange", onHashChange);
  }

  goto((useHash ? readHash() : null) ?? 0);

  let transitions: Transitions | null = null;
  let destroyed = false;

  const deck: Deck = {
    meta,
    slides,
    el: glide,
    stage,
    get current() {
      return current;
    },
    get length() {
      return slides.length;
    },
    next,
    prev,
    goto,
    setSwapHandler(fn) {
      swap = fn;
    },
    setPlainDom(fn) {
      plainDom = fn;
    },
    domLayer,
    destroy() {
      destroyed = true;
      if (mounted) {
        unmountScripts(mounted);
      }
      transitions?.destroy();
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("hashchange", onHashChange);
      glide.remove();
      cssLink?.remove();
    },
  };

  // On file:// every image is cross-origin, so HTML-in-Canvas captures drop them.
  const fileUrl = location.protocol === "file:";
  if (fileUrl && opts.transitions !== false) {
    console.info("glide: transitions are off on file://. Serve the folder over http to use them.");
  }
  if ((opts.transitions ?? true) && !fileUrl) {
    attachTransitions(deck, customTransitions(opts.shaders)).then(
      (t) => {
        if (destroyed) {
          t.destroy();
        } else {
          transitions = t;
        }
      },
      (e) => console.error("glide: transitions disabled:", e),
    );
  }

  return deck;
}
