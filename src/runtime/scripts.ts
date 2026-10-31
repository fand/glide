/**
 * Slide scripts and their lifecycle.
 *
 * Slides are mounted with innerHTML, so their <script> tags would never run.
 * After a slide mounts, glide replaces each <script> with a fresh copy, in
 * document order:
 * - Inline scripts run on every mount. Classic ones are wrapped in a block so
 *   top-level `let` / `const` do not clash with the previous mount.
 * - External scripts (`src`) load once per page; later mounts skip them.
 * - A classic script waits for the external scripts before it.
 *
 * Slide code cleans up with `Glide.onUnmount(fn)` (also `glide:unmount` on the
 * section). `Glide.currentSlide()` returns the mounted section.
 */

type Cleanup = () => void;

const cleanups = new WeakMap<HTMLElement, Cleanup[]>();
let current: HTMLElement | null = null;
const loaded = new Set<string>();

/** The section mounted most recently (the one whose scripts are running). */
export function currentSlide(): HTMLElement | null {
  return current;
}

/**
 * Run `fn` when the current slide unmounts. If no slide is mounted (or the
 * calling slide is already gone), nothing is registered and `fn` runs now.
 */
export function onUnmount(fn: Cleanup, slide: HTMLElement | null = current): void {
  if (!slide || !slide.isConnected) {
    fn();
    return;
  }
  const list = cleanups.get(slide) ?? [];
  list.push(fn);
  cleanups.set(slide, list);
}

/** Wrap an inline classic script so a second run does not redeclare its top-level bindings. */
export function wrapClassic(code: string): string {
  return `{\n${code}\n}`;
}

function isModule(s: HTMLScriptElement): boolean {
  return s.type === "module";
}

function isClassic(s: HTMLScriptElement): boolean {
  const t = s.type.trim().toLowerCase();
  return t === "" || t === "text/javascript" || t === "application/javascript";
}

function copy(old: HTMLScriptElement): HTMLScriptElement {
  const s = document.createElement("script");
  for (const a of old.attributes) {
    s.setAttribute(a.name, a.value);
  }
  return s;
}

function waitLoad(s: HTMLScriptElement): Promise<void> {
  return new Promise((resolve) => {
    s.addEventListener("load", () => resolve(), { once: true });
    s.addEventListener("error", () => {
      console.error(`glide: failed to load script ${s.src}`);
      resolve();
    }, { once: true });
  });
}

/** Mark `section` as mounted and run its scripts. Resolves when they have all started. */
export async function mountScripts(section: HTMLElement): Promise<void> {
  current = section;
  for (const old of [...section.querySelectorAll("script")]) {
    if (!section.isConnected) {
      return;
    }
    if (!isClassic(old) && !isModule(old)) {
      continue; // data blocks (e.g. type="x-shader/x-fragment") stay as they are
    }
    const src = old.getAttribute("src");
    if (src) {
      const url = new URL(src, document.baseURI).href;
      if (loaded.has(url)) {
        old.remove();
        continue;
      }
      loaded.add(url);
      const s = copy(old);
      s.async = false;
      const done = waitLoad(s);
      old.replaceWith(s);
      await done;
      continue;
    }
    const s = copy(old);
    s.textContent = isModule(old) ? old.textContent : wrapClassic(old.textContent ?? "");
    old.replaceWith(s);
  }
}

/** Run the cleanups registered for `section` and fire `glide:unmount` on it. */
export function unmountScripts(section: HTMLElement): void {
  section.dispatchEvent(new CustomEvent("glide:unmount"));
  const list = cleanups.get(section) ?? [];
  cleanups.delete(section);
  for (const fn of list) {
    try {
      fn();
    } catch (e) {
      console.error("glide: unmount cleanup failed:", e);
    }
  }
  if (current === section) {
    current = null;
  }
}
