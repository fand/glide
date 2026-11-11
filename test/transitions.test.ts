import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTransition, transitionNames } from "../src/runtime/transitions/index.ts";
import { parseTransition } from "../src/runtime/frontmatter.ts";
import { parseDatamoshArgs, parseDirection } from "../src/runtime/transitions/index.ts";

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
    crosszoom: "crosszoom",
    "cross-zoom": "crosszoom",
    cross_zoom: "crosszoom",
    glitch_slide: "glitch_slide",
    "glitch-slide": "glitch_slide",
    glitch: "glitch",
    datamosh: "datamosh",
    pixelsort: "pixelsort",
  };
  for (const [name, def] of Object.entries(expected)) {
    assert.equal(resolve(name)?.def.name, def, name);
  }
  assert.deepEqual(transitionNames().sort(), [
    "crossfade",
    "crosszoom",
    "datamosh",
    "glitch",
    "glitch_slide",
    "pixelsort",
    "swipe",
    "zoom",
    "zoom_blur",
  ]);
  assert.equal(warn.mock.callCount(), 0);
});

test("built-ins load their @vfx-js/transitions class", async () => {
  for (const name of transitionNames()) {
    const cls = await resolve(name)!.def.load();
    assert.equal(new cls().name, name);
  }
});

test("unknown falls back to crossfade with a warning", (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  assert.equal(resolve("wobble")?.def.name, "crossfade");
  assert.equal(warn.mock.callCount(), 1);
});

test("swipe and pixelsort args", (t) => {
  t.mock.method(console, "warn", () => {});
  assert.deepEqual(resolve("swipe")?.params, { direction: "left" });
  assert.deepEqual(resolve("swipe right")?.params, { direction: "right" });
  assert.deepEqual(resolve("slide up")?.params, { direction: "up" });
  assert.deepEqual(resolve("swipe sideways")?.params, { direction: "left" });
  assert.deepEqual(resolve("pixelsort")?.params, { direction: "up" });
  assert.deepEqual(resolve("pixelsort left")?.params, { direction: "left" });
  assert.equal(resolve("crossfade whatever")?.params, undefined);
});

test("arg parsers", () => {
  assert.deepEqual(parseDatamoshArgs([]), { blockSize: 32 });
  assert.deepEqual(parseDatamoshArgs(["16"]), { blockSize: 16 });
  assert.deepEqual(parseDatamoshArgs(["big"]), { blockSize: 32 });
  assert.deepEqual(parseDatamoshArgs(["1"]), { blockSize: 32 });
  assert.deepEqual(parseDirection([], "up"), { direction: "up" });
  assert.deepEqual(parseDirection(["x", "down"], "up"), { direction: "down" });
});
