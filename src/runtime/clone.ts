/**
 * A still copy of a slide, shown in the plain-DOM layer while the real slide
 * moves back into the GPU stage and its first capture lands.
 *
 * - Scripts are dropped; `autoplay` is removed.
 * - `<canvas>` and `<video>` become canvases holding their current picture.
 *   Call this inside a rAF callback that runs after the page's own, so a
 *   WebGL canvas still has its frame (no preserveDrawingBuffer needed).
 * - `<iframe>` becomes an empty box of the same size (black if cross-origin):
 *   a cloned iframe would load again.
 * - Form values and scroll positions are copied over.
 */
export function staticClone(section: HTMLElement, isCrossOrigin: (src: string | null) => boolean): {
  el: HTMLElement;
  /** Restore scroll positions; call once the clone is in the document. */
  restoreScroll(): void;
} {
  const clone = section.cloneNode(true) as HTMLElement;
  const from = [section, ...section.querySelectorAll<HTMLElement>("*")];
  const to = [clone, ...clone.querySelectorAll<HTMLElement>("*")];
  const scrolls: [HTMLElement, number, number][] = [];
  const swaps: [Element, Node][] = [];

  for (let i = 0; i < from.length && i < to.length; i++) {
    const a = from[i];
    const b = to[i];
    if (a.scrollTop || a.scrollLeft) {
      scrolls.push([b, a.scrollTop, a.scrollLeft]);
    }
    if (a instanceof HTMLScriptElement) {
      swaps.push([b, document.createComment("script")]);
    } else if (a instanceof HTMLCanvasElement || a instanceof HTMLVideoElement) {
      swaps.push([b, still(a)]);
    } else if (a instanceof HTMLIFrameElement) {
      swaps.push([b, box(a, isCrossOrigin(a.getAttribute("src")) ? "#000" : "transparent")]);
    } else if (a instanceof HTMLInputElement && b instanceof HTMLInputElement) {
      b.value = a.value;
      b.checked = a.checked;
    } else if (a instanceof HTMLTextAreaElement && b instanceof HTMLTextAreaElement) {
      b.value = a.value;
    } else if (a instanceof HTMLSelectElement && b instanceof HTMLSelectElement) {
      b.selectedIndex = a.selectedIndex;
    } else if (a instanceof HTMLMediaElement) {
      b.removeAttribute("autoplay");
    }
  }
  for (const [old, next] of swaps) {
    old.replaceWith(next);
  }
  clone.dataset.glideClone = "";
  clone.style.pointerEvents = "none";
  return {
    el: clone,
    restoreScroll() {
      for (const [el, top, left] of scrolls) {
        el.scrollTop = top;
        el.scrollLeft = left;
      }
    },
  };
}

/** Copy class and inline style, and pin the laid-out size. */
function sameBox(from: HTMLElement, to: HTMLElement): void {
  const r = from.getBoundingClientRect();
  const cs = getComputedStyle(from);
  to.className = from.className;
  to.style.cssText = from.style.cssText;
  to.style.width = `${r.width}px`;
  to.style.height = `${r.height}px`;
  to.style.display = cs.display === "inline" ? "inline-block" : cs.display;
  to.style.boxSizing = "border-box";
}

function still(src: HTMLCanvasElement | HTMLVideoElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const w = src instanceof HTMLVideoElement ? src.videoWidth : src.width;
  const h = src instanceof HTMLVideoElement ? src.videoHeight : src.height;
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  sameBox(src, c);
  try {
    c.getContext("2d")?.drawImage(src, 0, 0, c.width, c.height);
  } catch {
    // A tainted or not-ready source stays empty.
  }
  return c;
}

function box(src: HTMLElement, background: string): HTMLElement {
  const d = document.createElement("div");
  sameBox(src, d);
  d.style.background = background;
  return d;
}
