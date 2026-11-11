import type { Transition } from "../frontmatter.ts";
import type { TransitionDef, TransitionParams } from "./types.ts";
import type { TransitionMap } from "./custom.ts";

export type { TransitionDef, TransitionParams } from "./types.ts";
export { customTransition, customTransitions, type TransitionMap } from "./custom.ts";

type Presets = typeof import("@vfx-js/transitions");

/** A built-in from `@vfx-js/transitions`, loaded on first use. */
function preset(
  name: string,
  key: keyof Presets,
  parseArgs?: TransitionDef["parseArgs"],
): TransitionDef {
  return {
    name,
    load: async () => (await import("@vfx-js/transitions"))[key] as never,
    parseArgs,
  };
}

const DIRECTIONS = ["left", "right", "up", "down"];

/** First arg that names a direction, else `fallback`. */
export function parseDirection(args: string[], fallback: string): { direction: string } {
  return { direction: args.find((a) => DIRECTIONS.includes(a)) ?? fallback };
}

export function parseDatamoshArgs(args: string[]): { blockSize: number } {
  const n = Number(args[0]);
  return { blockSize: Number.isFinite(n) && n >= 2 ? Math.round(n) : 32 };
}

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

registerTransition(preset("crossfade", "Crossfade"));
registerTransition(preset("swipe", "Swipe", (args) => parseDirection(args, "left")));
registerTransition(preset("zoom", "Zoom"));
registerTransition(preset("zoom_blur", "ZoomBlur"), ["zoom-blur"]);
registerTransition(preset("crosszoom", "Crosszoom"), ["cross-zoom", "cross_zoom"]);
registerTransition(preset("glitch_slide", "GlitchSlide"), ["glitch-slide"]);
registerTransition(preset("glitch", "Glitch"));
registerTransition(preset("datamosh", "Datamosh", parseDatamoshArgs));
registerTransition(preset("pixelsort", "Pixelsort", (args) => parseDirection(args, "up")));

/** Names of all registered transitions (not aliases). */
export function transitionNames(): string[] {
  return [...REGISTRY.keys()];
}

export type ResolvedTransition = { def: TransitionDef; params: TransitionParams | undefined };

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
    def = REGISTRY.get("crossfade") as TransitionDef;
  }
  return { def, params: def.parseArgs?.(t.args) };
}
