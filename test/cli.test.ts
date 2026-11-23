import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveStatic } from "../src/cli/serve.ts";
import { rewriteMedia } from "../src/cli/build.ts";
import { findChrome } from "../src/cli/pdf.ts";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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

test("findChrome: explicit path, CHROME_PATH, then common paths", () => {
  const has = (...ps: string[]) => (p: string) => ps.includes(p);
  const mac = "/Applications/Chromium.app/Contents/MacOS/Chromium";
  assert.equal(findChrome("/x/chrome", { platform: "darwin", env: {}, exists: has("/x/chrome", mac) }), "/x/chrome");
  assert.equal(findChrome("/x/chrome", { platform: "darwin", env: {}, exists: has(mac) }), null);
  assert.equal(findChrome(undefined, { platform: "darwin", env: { CHROME_PATH: "/y" }, exists: has("/y", mac) }), "/y");
  assert.equal(findChrome(undefined, { platform: "darwin", env: {}, exists: has(mac) }), mac);
  assert.equal(
    findChrome(undefined, { platform: "linux", env: { PATH: "/a:/b" }, exists: has("/b/chromium", "/a/chromium-browser") }),
    "/b/chromium",
  );
  assert.equal(findChrome(undefined, { platform: "linux", env: { PATH: "/a" }, exists: has() }), null);
});

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const chrome = findChrome();

test("glide pdf: one page per slide", { skip: !chrome ? "Chrome not found" : !fs.existsSync(cli) ? "run pnpm build first" : false }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "glide-pdf-"));
  const md = path.join(tmp, "deck.md");
  fs.writeFileSync(md, "---\nprintSize: 640x360\n---\n# One\n---\n# Two\n---\n<!-- layout: center -->\n# Three\n");
  const out = path.join(tmp, "deck.pdf");
  const r = spawnSync(process.execPath, [cli, "pdf", "-o", out, md], { encoding: "utf8", timeout: 60_000 });
  assert.equal(r.status, 0, r.stderr);
  const pdf = fs.readFileSync(out, "latin1");
  assert.equal(pdf.match(/\/Type\s*\/Page(?!s)/g)?.length, 3);
  // 640x360 px = 480x270 pt.
  assert.match(pdf, /\/MediaBox\s*\[0 0 480 270\]/);
  fs.rmSync(tmp, { recursive: true });
});
