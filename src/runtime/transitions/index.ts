import type { Transition } from "../frontmatter.ts";
import type { TransitionDef, TransitionUniforms } from "./types.ts";
import { crossfade } from "./crossfade.ts";
import { swipe } from "./swipe.ts";
import { zoom } from "./zoom.ts";
import { zoomBlur } from "./zoom-blur.ts";
import { glitchSlide } from "./glitch-slide.ts";
import { glitch } from "./glitch.ts";
import { datamosh } from "./datamosh.ts";
import { pixelsort } from "./pixelsort.ts";
import type { TransitionMap } from "./custom.ts";

export type { TransitionDef, TransitionRun, TransitionUniforms } from "./types.ts";
export { customTransition, customTransitions, type TransitionMap } from "./custom.ts";

const REGISTRY = new Map<string, TransitionDef>();
const ALIASES = new Map<string, string>([
  ["fade", "crossfade"],
  ["slide", "swipe"],
]);

export function registerTransition(def: TransitionDef, aliases: string[] = []): void {
  REGISTRY.set(def.name, def);
  for (const a of aliases) {
    ALIASES.set(a, def.name);
  }
}

registerTransition(crossfade);
registerTransition(swipe);
registerTransition(zoom);
registerTransition(zoomBlur, ["zoom-blur"]);
registerTransition(glitchSlide, ["glitch-slide"]);
registerTransition(glitch);
registerTransition(datamosh);
registerTransition(pixelsort);

/** Names of all registered transitions (not aliases). */
export function transitionNames(): string[] {
  return [...REGISTRY.keys()];
}

export type ResolvedTransition = { def: TransitionDef; uniforms: TransitionUniforms };

const warned = new Set<string>();

/**
 * Look up a transition: the deck's own (`local`) first, then the built-ins.
 * Returns null for `none`. Unknown names fall back to crossfade.
 */
export function resolveTransition(t: Transition, local?: TransitionMap): ResolvedTransition | null {
  const name = t.name.toLowerCase();
  if (name === "none") {
    return null;
  }
  let def = local?.get(name) ?? REGISTRY.get(ALIASES.get(name) ?? name);
  if (!def) {
    if (!warned.has(name)) {
      warned.add(name);
      console.warn(`glide: unknown transition "${t.name}", using crossfade`);
    }
    def = crossfade;
  }
  return { def, uniforms: def.parseArgs?.(t.args) ?? {} };
}
