import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "../src/runtime/parse.ts";
import { parseFrontmatter } from "../src/runtime/frontmatter.ts";
import { escapeScriptText, unescapeScriptText } from "../src/cli/template.ts";

test("frontmatter", () => {
  const { meta, body } = parseFrontmatter(
    [
      "---",
      "title: My talk",
      "theme: latte",
      "transition: swipe left",
      "duration: 1.5",
      "layout: center",
      "css: ./style.css",
      "foo: bar",
      "header:",
      "  - Kyoto.js",
      "  - [GitHub](https://github.com/fand/glide)",
      "---",
      "# Hi",
    ].join("\n"),
  );
  assert.equal(meta.title, "My talk");
  assert.equal(meta.theme, "latte");
  assert.deepEqual(meta.transition, { name: "swipe", args: ["left"] });
  assert.equal(meta.duration, 1.5);
  assert.equal(meta.layout, "center");
  assert.equal(meta.css, "./style.css");
  assert.deepEqual(meta.data, { foo: "bar" });
  assert.deepEqual(meta.header, [
    { text: "Kyoto.js" },
    { text: "GitHub", url: "https://github.com/fand/glide" },
  ]);
  assert.equal(body, "# Hi");
});

test("inline header list", () => {
  const { meta } = parseFrontmatter("---\nheader: a | [b](c)\n---\n");
  assert.deepEqual(meta.header, [{ text: "a" }, { text: "b", url: "c" }]);
});

test("no frontmatter", () => {
  const { meta, body } = parseFrontmatter("# Hi\n");
  assert.deepEqual(meta, { header: [], transitions: {}, data: {} });
  assert.equal(body, "# Hi\n");
});

test("defaults", () => {
  const { slides } = parse("# One\n");
  assert.equal(slides.length, 1);
  const s = slides[0];
  assert.equal(s.index, 0);
  assert.deepEqual(s.transition, { name: "crossfade", args: [] });
  assert.equal(s.duration, 0.5);
  assert.equal(s.layout, "normal");
  assert.equal(s.theme, undefined);
  assert.equal(s.live, undefined);
  assert.equal(s.gpu, undefined);
  assert.deepEqual(s.data, {});
  assert.equal(s.htmlRight, undefined);
  assert.match(s.html, /<h1[^>]*>One<\/h1>/);
});

test("split ignores --- in code fences", () => {
  const md = [
    "# A",
    "```yaml",
    "---",
    "key: v",
    "---",
    "```",
    "~~~~",
    "---",
    "```",
    "---",
    "~~~~",
    "---",
    "# B",
    "---  ",
    "# C",
    "---",
    "",
  ].join("\n");
  const { slides } = parse(md);
  assert.equal(slides.length, 3);
  assert.match(slides[0].html, /hljs-attr">key:/);
  assert.match(slides[0].html, /---\n```\n---/);
  assert.match(slides[1].html, /B/);
  assert.match(slides[2].html, /C/);
  assert.deepEqual(
    slides.map((s) => s.index),
    [0, 1, 2],
  );
});

test("directives override frontmatter", () => {
  const md = [
    "---",
    "transition: zoom",
    "duration: 2",
    "theme: frappe",
    "---",
    "# A",
    "---",
    "<!-- transition: swipe left -->",
    "<!-- duration: 0.3 -->",
    "",
    "<!-- layout: center -->",
    "<!-- theme: red_white -->",
    "<!-- live -->",
    "<!-- note: hello world -->",
    "<!-- flag -->",
    "# B",
    "<!-- not: a directive -->",
  ].join("\n");
  const { meta, slides } = parse(md);
  assert.equal(meta.theme, "frappe");
  assert.deepEqual(slides[0].transition, { name: "zoom", args: [] });
  assert.equal(slides[0].duration, 2);
  assert.equal(slides[0].theme, undefined);

  const b = slides[1];
  assert.deepEqual(b.transition, { name: "swipe", args: ["left"] });
  assert.equal(b.duration, 0.3);
  assert.equal(b.layout, "center");
  assert.equal(b.theme, "red_white");
  assert.equal(b.live, true);
  assert.deepEqual(b.data, { note: "hello world", flag: true });
  assert.doesNotMatch(b.html, /transition/);
  assert.match(b.html, /<!-- not: a directive -->/);
});

test("bad directive values fall back", () => {
  const { slides } = parse("<!-- duration: abc -->\n<!-- layout: weird -->\n# A");
  assert.equal(slides[0].duration, 0.5);
  assert.equal(slides[0].layout, "normal");
});

test("two-column split", () => {
  const md = [
    "<!-- layout: two-column -->",
    "# Left",
    "```",
    "|||",
    "```",
    "|||",
    "# Right",
  ].join("\n");
  const { slides } = parse(md);
  assert.match(slides[0].html, /Left/);
  assert.match(slides[0].html, /\|\|\|/);
  assert.match(slides[0].htmlRight ?? "", /Right/);
});

test("code highlight and raw html", () => {
  const { slides } = parse('```js\nconst a = 1;\n```\n\n<img src="a.png" class="center w-20"/>');
  assert.match(slides[0].html, /<code class="hljs language-js">/);
  assert.match(slides[0].html, /hljs-keyword/);
  assert.match(slides[0].html, /<img src="a.png" class="center w-20"\/>/);
});

test("script text escaping round-trips", () => {
  for (const s of ["a</script>b", "<!-- x -->", "<\\/script", "<\\\\!--", "plain"]) {
    const e = escapeScriptText(s);
    assert.doesNotMatch(e, /<\/script|<!--/i);
    assert.equal(unescapeScriptText(e), s);
  }
});
