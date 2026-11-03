import type { TransitionDef } from "./types.ts";

export type TransitionMap = Map<string, TransitionDef>;

/**
 * Make a transition from a user shader body. Returns null (and logs why)
 * when the body is not usable.
 */
export function customTransition(name: string, src: string): TransitionDef | null {
  if (/^\s*#\s*version\b/m.test(src)) {
    console.error(
      `glide: custom transition "${name}" must not contain #version; glide adds "#version 300 es" and precision itself.`,
    );
    return null;
  }
  if (!/\bvec4\s+transition\s*\(/.test(src)) {
    console.error(`glide: custom transition "${name}" must define vec4 transition(vec2 uv, float t).`);
    return null;
  }
  let warned = false;
  return {
    name,
    frag: src,
    parseArgs(args) {
      if (args.length > 0 && !warned) {
        warned = true;
        console.warn(`glide: custom transition "${name}" takes no args; ignoring "${args.join(" ")}".`);
      }
      return {};
    },
  };
}

/** Build a per-deck map of custom transitions from name -> GLSL source. */
export function customTransitions(shaders: Record<string, string> = {}): TransitionMap {
  const map: TransitionMap = new Map();
  for (const [name, src] of Object.entries(shaders)) {
    const def = customTransition(name.toLowerCase(), src);
    if (def) {
      map.set(def.name, def);
    }
  }
  return map;
}
