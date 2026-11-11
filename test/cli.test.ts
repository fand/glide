import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveStatic } from "../src/cli/serve.ts";
import { rewriteMedia } from "../src/cli/build.ts";

test("resolveStatic stays inside root", async () => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "glide-")));
  const root = path.join(tmp, "root");
  fs.mkdirSync(path.join(root, "img"), { recursive: true });
  fs.writeFileSync(path.join(root, "img", "a b.png"), "x");
  fs.writeFileSync(path.join(tmp, "secret.txt"), "x");
  fs.symlinkSync(path.join(tmp, "secret.txt"), path.join(root, "link.txt"));

  assert.equal(await resolveStatic(root, "/img/a%20b.png"), path.join(root, "img", "a b.png"));
  assert.equal(await resolveStatic(root, "/../secret.txt"), null);
  assert.equal(await resolveStatic(root, "/%2e%2e/secret.txt"), null);
  assert.equal(await resolveStatic(root, "/..%2fsecret.txt"), null);
  assert.equal(await resolveStatic(root, "/link.txt"), null);
  assert.equal(await resolveStatic(root, "/img"), null);
  assert.equal(await resolveStatic(root, "/%E0%A4%A"), null);
  fs.rmSync(tmp, { recursive: true });
});

test("rewriteMedia touches local media only, outside code fences", () => {
  const md = [
    '![a](img/a.png "t") ![b](https://x/b.png) ![c](<c d.png>)',
    '<img class="w" src="e.gif"/> <video poster=\'p.jpg\' src=v.mp4></video>',
    '<img src="data:image/png;base64,AAA">',
    "```md",
    "![z](z.png)",
    "```",
  ].join("\n");
  const seen: string[] = [];
  const out = rewriteMedia(md, (u) => {
    seen.push(u);
    return `NEW(${u})`;
  });
  assert.deepEqual(seen, ["img/a.png", "c d.png", "e.gif", "p.jpg", "v.mp4"]);
  assert.match(out, /!\[c\]\(<NEW\(c d\.png\)>\)/);
  assert.match(out, /!\[a\]\(NEW\(img\/a\.png\) "t"\)/);
  assert.match(out, /!\[z\]\(z\.png\)/);
  assert.match(out, /https:\/\/x\/b\.png/);
});
