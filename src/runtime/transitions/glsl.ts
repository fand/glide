/**
 * Shared GLSL around each transition body.
 * `readFrom` / `readTo` already swap roles when playing in reverse, so a
 * transition only writes the forward animation.
 * Reads outside [0, 1] return transparent black.
 */
export const PRELUDE = `#version 300 es
precision highp float;
in vec2 uvContent;
out vec4 outColor;
uniform sampler2D from;
uniform sampler2D src;
uniform vec4 srcRectUv;
uniform float t;
uniform float reverse;
uniform vec2 resolution;
uniform float time;

bool inRange(vec2 p) {
  return all(greaterThanEqual(p, vec2(0.0))) && all(lessThanEqual(p, vec2(1.0)));
}
vec4 readOld(vec2 p) {
  return inRange(p) ? texture(from, p) : vec4(0.0);
}
vec4 readNew(vec2 p) {
  return inRange(p) ? texture(src, srcRectUv.xy + p * srcRectUv.zw) : vec4(0.0);
}
vec4 readFrom(vec2 p) {
  return reverse > 0.5 ? readNew(p) : readOld(p);
}
vec4 readTo(vec2 p) {
  return reverse > 0.5 ? readOld(p) : readNew(p);
}
`;

export const MAIN = `
void main() {
  outColor = transition(uvContent, reverse > 0.5 ? 1.0 - t : t);
}
`;

export function buildFrag(body: string): string {
  return `${PRELUDE}\n${body}\n${MAIN}`;
}
