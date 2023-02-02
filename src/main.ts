import "./style.css";
import { marked } from "marked";
import frontmatter from "front-matter";

import hljs from "highlight.js";
import "highlight.js/styles/dark.css";

async function init() {
  const el = document.querySelector("#app")!;

  const md = await fetch("/page1.md").then((r) => r.text());
  const fm = frontmatter(md);

  el.innerHTML = marked(fm.body, {
    gfm: true,
    highlight: (code, lang) => {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language }).value;
    },
    langPrefix: "hljs language-",
  });
}
init();
