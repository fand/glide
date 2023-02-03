import "./style.css";
import { marked } from "marked";
import frontmatter from "front-matter";

import hljs from "highlight.js";
import "highlight.js/styles/dark.css";

const el = document.querySelector("#app")!;

window.electronAPI.onLoad((event: any, value: number) => {
  load(event, value);
});

async function load(event: any, index: number) {
  const filename = `/page-${index.toString().padStart(2, "0")}.md`;

  const md = await fetch(filename).then((r) => r.text());
  const fm = frontmatter(md);

  el.innerHTML = marked(fm.body, {
    gfm: true,
    highlight: (code, lang) => {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language }).value;
    },
    langPrefix: "hljs language-",
  });

  event.sender.send(
    "set-transition",
    index,
    fm.attributes["transition"] ?? "crossfade",
    fm.attributes["duration"] ?? 1.0
  );
}
