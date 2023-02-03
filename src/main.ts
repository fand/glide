import "./style.css";
import { marked } from "marked";
import frontmatter from "front-matter";

import hljs from "highlight.js";
import "highlight.js/styles/dark.css";

type Theme = { fg: string; bg: string };

const defaultTheme = {
  fg: "#073B4C",
  bg: "#FFFFFF",
};

const WHITE = "#EDEDFF";
const RED = "#EF476F";
const YELLOW = "#FFD166";
const GREEN = "#06D6A0";
const BLUE = "#118AB2";
const BLACK = "#073B4C";

const themes: Record<string, Theme> = {
  red_white: {
    fg: WHITE,
    bg: RED,
  },
  red_black: {
    fg: BLACK,
    bg: RED,
  },
  blue_white: {
    fg: WHITE,
    bg: BLUE,
  },
  blue_black: {
    fg: BLACK,
    bg: BLUE,
  },
  yellow_white: {
    fg: WHITE,
    bg: YELLOW,
  },
  yellow_black: {
    fg: BLACK,
    bg: YELLOW,
  },
  green_white: {
    fg: WHITE,
    bg: GREEN,
  },
  green_black: {
    fg: BLACK,
    bg: GREEN,
  },
  black_white: {
    fg: WHITE,
    bg: BLACK,
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
    fm.attributes["transition"] ?? "swipe",
    fm.attributes["duration"] ?? 0.3
  );
}
