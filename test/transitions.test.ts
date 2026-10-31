import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTransition, transitionNames } from "../src/runtime/transitions/index.ts";
import { buildFrag } from "../src/runtime/transitions/glsl.ts";
import { parseTransition } from "../src/runtime/frontmatter.ts";

const resolve = (s: string) => resolveTransition(parseTransition(s));

test("registry and aliases", () => {
  assert.equal(resolve("crossfade")?.def.name, "crossfade");
  assert.equal(resolve("fade")?.def.name, "crossfade");
  assert.equal(resolve("swipe")?.def.name, "swipe");
  assert.equal(resolve("slide")?.def.name, "swipe");
  assert.equal(resolve("SWIPE")?.def.name, "swipe");
  assert.equal(resolve("none"), null);
});

test("all transitions and aliases resolve", (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const expected: Record<string, string> = {
    crossfade: "crossfade",
    fade: "crossfade",
    swipe: "swipe",
    slide: "swipe",
    zoom: "zoom",
    zoom_blur: "zoom_blur",
    "zoom-blur": "zoom_blur",
    glitch_slide: "glitch_slide",
    "glitch-slide": "glitch_slide",
    glitch: "glitch",
  };
  for (const [name, def] of Object.entries(expected)) {
    assert.equal(resolve(name)?.def.name, def, name);
  }
  assert.deepEqual(transitionNames().sort(), [
    "crossfade",
    "glitch",
    "glitch_slide",
    "swipe",
    "zoom",
    "zoom_blur",
  ]);
  for (const name of transitionNames()) {
    assert.match(buildFrag(resolve(name)!.def.frag), /vec4 transition\(vec2 uv, float t\)/);
  }
  assert.equal(warn.mock.callCount(), 0);
});

test("unknown falls back to crossfade with a warning", (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  assert.equal(resolve("wobble")?.def.name, "crossfade");
  assert.equal(warn.mock.callCount(), 1);
});

test("swipe args", (t) => {
  t.mock.method(console, "warn", () => {});
  assert.deepEqual(resolve("swipe")?.uniforms, { move: [-1, 0] });
  assert.deepEqual(resolve("swipe left")?.uniforms, { move: [-1, 0] });
  assert.deepEqual(resolve("swipe right")?.uniforms, { move: [1, 0] });
  assert.deepEqual(resolve("slide up")?.uniforms, { move: [0, 1] });
  assert.deepEqual(resolve("swipe down")?.uniforms, { move: [0, -1] });
  assert.deepEqual(resolve("swipe sideways")?.uniforms, { move: [-1, 0] });
  assert.deepEqual(resolve("crossfade whatever")?.uniforms, {});
});

test("frag has the prelude, body and main", () => {
  const f = buildFrag(resolve("swipe")!.def.frag);
  assert.ok(f.startsWith("#version 300 es"));
  assert.match(f, /vec4 readFrom\(vec2 p\)/);
  assert.match(f, /vec4 transition\(vec2 uv, float t\)/);
  assert.match(f, /void main\(\)/);
});
