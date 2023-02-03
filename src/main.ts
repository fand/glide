import "./style.css";
import { marked } from "marked";
import frontmatter from "front-matter";

import hljs from "highlight.js";
import "highlight.js/styles/dark.css";

type Theme = { fg: string; bg: string };

const defaultTheme = {
  fg: "#000022",
  bg: "#FFFFFF",
};

const themes: Record<string, Theme> = {
  red: {
    fg: "#FFFF00",
    bg: "#FF0000",
  },
  blue: {
    fg: "#FF0000",
    bg: "#0000FF",
  },
};

// ---------------------------------------------------------------------

const el = document.querySelector("#app")!;

window.electronAPI.onLoad((event: any, value: number) => {
  load(event, value);
});

async function load(event: any, index: number) {
  const filename = `/page-${index.toString().padStart(2, "0")}.md`;

  const md = await fetch(filename).then((r) => r.text());
  const fm = frontmatter(md);

  // Render Markdown
  el.innerHTML = marked(fm.body, {
    gfm: true,
    highlight: (code, lang) => {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language }).value;
    },
    langPrefix: "hljs language-",
  });

  // Update styles
  const theme = themes[fm.attributes["theme"]] ?? defaultTheme;
  document.documentElement.style.setProperty("color", theme.fg);
  document.documentElement.style.setProperty("background-color", theme.bg);

  // Send transition info to the main process
  event.sender.send(
    "set-transition",
    index,
    fm.attributes["transition"] ?? "crossfade",
    fm.attributes["duration"] ?? 1.0
  );
}
