// Diagonal wipe with a soft edge, from the bottom-left corner.
const float EDGE = 0.1;

vec4 transition(vec2 uv, float t) {
  // 0 at the bottom-left corner, 1 at the top-right.
  float d = (uv.x + uv.y) * 0.5;
  // Move the edge from just before 0 to just past 1, so both ends are clean.
  float p = t * (1.0 + 2.0 * EDGE) - EDGE;
  float m = smoothstep(p - EDGE, p + EDGE, d);
  return mix(readTo(uv), readFrom(uv), m);
}
