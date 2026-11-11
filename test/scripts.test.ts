import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { wrapClassic } from "../src/runtime/scripts.ts";
import { rewriteMedia } from "../src/cli/build.ts";

test("wrapped classic scripts can run again", () => {
  const code = "const n = 1; let m = 2; function f() { return n + m; } globalThis.out = f();";
  const ctx = vm.createContext({});
  assert.throws(() => {
    vm.runInContext(code, ctx);
    vm.runInContext(code, ctx);
  }, /already been declared/);
  const ctx2 = vm.createContext({});
  vm.runInContext(wrapClassic(code), ctx2);
  vm.runInContext(wrapClassic(code), ctx2);
  assert.equal(vm.runInContext("out", ctx2), 3);
});

test("build rewrites script, iframe, audio, source, track, link, embed, object", () => {
  const md = [
    '<script src="lib/app.js"></script>',
    '<script src="https://cdn.example/p5.js"></script>',
    '<iframe src="frame.html" width="640"></iframe>',
    '<audio controls src="beep.m4a"></audio>',
    '<video><source src="clip.webm" type="video/webm"><track src="subs.vtt" kind="captions"></video>',
    '<link rel="stylesheet" href="slide.css">',
    '<embed src="doc.pdf"><object data="pic.svg"></object>',
    '<a href="other.html">not an asset</a>',
    '<div data-src="x.png" data-x="y"></div>',
  ].join("\n");
  const seen: string[] = [];
  const out = rewriteMedia(md, (u) => {
    seen.push(u);
    return `./assets/${u}`;
  });
  assert.deepEqual(seen, [
    "lib/app.js",
    "frame.html",
    "beep.m4a",
    "clip.webm",
    "subs.vtt",
    "slide.css",
    "doc.pdf",
    "pic.svg",
  ]);
  assert.match(out, /<a href="other.html">/);
  assert.match(out, /https:\/\/cdn.example\/p5.js/);
  assert.match(out, /<div data-src="x.png" data-x="y">/);
});
