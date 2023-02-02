import "./style.css";
import { marked } from "marked";

import hljs from "highlight.js";
import "highlight.js/styles/dark.css";

async function init() {
  let el = document.querySelector("#app")!;

  let md = await fetch("/page1.md").then((r) => r.text());
  el.innerHTML = marked(md, {
    gfm: true,
    highlight: (code, lang) => {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language }).value;
    },
    langPrefix: "hljs language-",
  });
}
init();

postMessage({ payload: "removeLoading" }, "*");
