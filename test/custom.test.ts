import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseFrontmatter } from "../src/runtime/frontmatter.ts";
import { resolveTransition, customTransitions } from "../src/runtime/transitions/index.ts";
import { parseTransition } from "../src/runtime/frontmatter.ts";
import { loadShaders } from "../src/cli/shaders.ts";
import { serializeForScript } from "../src/cli/template.ts";

const BODY = "vec4 transition(vec2 uv, float t) { return readTo(uv); }";

test("frontmatter transitions map", () => {
  const { meta } = parseFrontmatter(
    ["---", "transitions:", "  wipe: ./wipe.frag", '  Burn: "shaders/burn.glsl"', "title: T", "---", "# A"].join("\n"),
  );
  assert.deepEqual(meta.transitions, { wipe: "./wipe.frag", burn: "shaders/burn.glsl" });
  assert.equal(meta.title, "T");

  const scalar = parseFrontmatter("---\ntransitions: ./wipe.frag\ntitle: T\n---\n").meta;
  assert.deepEqual(scalar.transitions, {});
  assert.equal(scalar.title, "T");
});

test("custom transition shadows a built-in only in its own deck", async () => {
  const local = customTransitions({ crossfade: BODY, Wipe: BODY });
  const frag = async (name: string, map?: typeof local) => {
    const cls = await resolveTransition(parseTransition(name), map)!.def.load();
    return (new cls() as unknown as { frag: string }).frag;
  };
  assert.equal(await frag("crossfade", local), BODY);
  assert.equal(await frag("wipe", local), BODY);
  // Next deck, no custom map: built-in again.
  assert.notEqual(await frag("crossfade"), BODY);
  assert.equal(resolveTransition(parseTransition("crossfade"))!.def.name, "crossfade");
});

test("custom transition rejects #version and missing transition()", (t) => {
  const err = t.mock.method(console, "error", () => {});
  const local = customTransitions({ a: "#version 300 es\n" + BODY, b: "void main() {}" });
  assert.equal(local.size, 0);
  assert.equal(err.mock.callCount(), 2);
  assert.match(String(err.mock.calls[0].arguments[0]), /#version/);
});

test("custom transition warns once on args", (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const local = customTransitions({ wipe: BODY });
  assert.equal(resolveTransition(parseTransition("wipe left"), local)?.params, undefined);
  resolveTransition(parseTransition("wipe left"), local);
  assert.equal(warn.mock.callCount(), 1);
});

test("loadShaders reads listed files inside the md folder only", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "glide-sh-")));
  const dir = path.join(tmp, "deck");
  fs.mkdirSync(path.join(dir, "shaders"), { recursive: true });
  const tricky = "// </script><!--  \n" + BODY;
  fs.writeFileSync(path.join(dir, "shaders", "ok.frag"), tricky);
  fs.writeFileSync(path.join(tmp, "secret.frag"), BODY);
  fs.symlinkSync(path.join(tmp, "secret.frag"), path.join(dir, "link.frag"));
  const md = [
    "---",
    "transitions:",
    "  ok: ./shaders/ok.frag",
    "  missing: ./nope.frag",
    "  escape: ../secret.frag",
    "  abs: " + path.join(tmp, "secret.frag"),
    "  link: ./link.frag",
    "---",
    "# A",
  ].join("\n");
  const mdPath = path.join(dir, "slides.md");
  fs.writeFileSync(mdPath, md);

  const shaders = await loadShaders(mdPath, md);
  assert.deepEqual(Object.keys(shaders), ["ok"]);
  assert.equal(shaders.ok, tricky);
  assert.equal(warn.mock.callCount(), 4);

  // Embedding in the page: no raw </script or <!--, and it round-trips.
  const json = serializeForScript({ shaders });
  assert.doesNotMatch(json, /<\/script|<!--/i);
  assert.deepEqual(JSON.parse(json), { shaders });
  fs.rmSync(tmp, { recursive: true });
});
