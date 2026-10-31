import { parse, type ParsedDeck, type Slide } from "./parse.ts";
import slideCss from "./slide.css?inline";
import themesCss from "./themes.css?inline";
import hljsCss from "highlight.js/styles/github-dark.css?inline";
import { attachTransitions, type Transitions } from "./stage.ts";

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

/** Resolve relative src attributes against `base`, and collect image URLs for preload. */
function resolveMedia(html: string, base: URL): { html: string; images: string[] } {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const images: string[] = [];
  for (const el of tpl.content.querySelectorAll<HTMLElement>(
    "img[src], video[src], source[src], video[poster]",
  )) {
    for (const attr of ["src", "poster"]) {
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
  glide.append(stage, overlay);
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

  /** The overlay follows the current slide's theme once its swap has finished. */
  function applyOverlayTheme(): void {
    overlay.className = `theme-${slides[current]?.theme ?? deckTheme}`;
  }

  function mountSlide(i: number): HTMLElement {
    const section = buildSection(i);
    stage.replaceChildren(section);
    mounted = section;
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

  function onKey(e: KeyboardEvent): void {
    if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) {
      return;
    }
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) {
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
      default:
        return;
    }
    e.preventDefault();
  }

  function onClick(e: MouseEvent): void {
    if (e.button !== 0) {
      return;
    }
    const t = e.target as HTMLElement | null;
    if (t?.closest("a, button, input, textarea, select, video, [contenteditable]")) {
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
  glide.addEventListener("click", onClick);
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
    destroy() {
      destroyed = true;
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
    attachTransitions(deck).then(
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
