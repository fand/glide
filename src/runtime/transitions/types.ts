export type TransitionUniforms = Record<string, number | [number, number]>;

export type TransitionDef = {
  name: string;
  /** GLSL that defines `vec4 transition(vec2 uv, float t)`. See PRELUDE in glsl.ts. */
  frag: string;
  parseArgs?(args: string[]): TransitionUniforms;
};
