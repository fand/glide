import { Marked } from "marked";
import hljs from "highlight.js/lib/common";
import {
  DEFAULT_DURATION,
  DEFAULT_TRANSITION,
  parseFrontmatter,
  parseLayout,
  parseNumber,
  parseTransition,
  type Frontmatter,
  type Layout,
  type Transition,
} from "./frontmatter.ts";

export type Slide = {
  index: number;
  html: string;
  htmlRight?: string;
  transition: Transition;
  duration: number;
  layout: Layout;
  theme?: string;
  /**
   * Re-capture every frame. Unset = automatic (on when the slide has
   * <script>, <video>, <canvas>, <iframe> or a GIF).
   */
  live?: boolean;
  /** false: show as plain DOM above the GPU stage (no capture, no transition). Unset = automatic. */
  gpu?: boolean;
  data: Record<string, string | true>;
};

export type ParsedDeck = { meta: Frontmatter; slides: Slide[] };

const marked = new Marked({
  gfm: true,
  renderer: {
    code({ text, lang }) {
      const name = (lang ?? "").match(/^\S*/)?.[0] ?? "";
      const language = name && hljs.getLanguage(name) ? name : "plaintext";
      const html =
        language === "plaintext"
          ? escapeHtml(text)
          : hljs.highlight(text, { language }).value;
      return `<pre><code class="hljs language-${language}">${html}</code></pre>\n`;
    },
  },
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Split `src` on lines equal to `sep`, ignoring lines inside fenced code blocks. */
export function splitOutsideFences(src: string, sep: string): string[] {
  const parts: string[] = [];
  let cur: string[] = [];
  let fence: string | null = null;
  for (const line of src.split("\n")) {
    const f = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence === null && f) {
      fence = f[1];
    } else if (
      fence !== null &&
      f &&
      f[1][0] === fence[0] &&
      f[1].length >= fence.length &&
      f[2].trim() === ""
    ) {
      fence = null;
    } else if (fence === null && line.trimEnd() === sep) {
      parts.push(cur.join("\n"));
      cur = [];
      continue;
    }
    cur.push(line);
  }
  parts.push(cur.join("\n"));
  return parts;
}

/** Read leading `<!-- key: value -->` / `<!-- key -->` lines. */
export function parseDirectives(src: string): {
  directives: Record<string, string | true>;
  body: string;
} {
  const directives: Record<string, string | true> = {};
  const lines = src.split("\n");
  let i = 0;
  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === "") {
      continue;
    }
    const m = t.match(/^<!--\s*([\w-]+)\s*(?::\s*(.*?))?\s*-->$/);
    if (!m) {
      break;
    }
    directives[m[1]] = m[2] === undefined || m[2] === "" ? true : m[2];
  }
  return { directives, body: lines.slice(i).join("\n") };
}

/**
 * Replace a `transitionDefs` name with its def. Words and params written
 * with the name win over the def's.
 */
export function expandTransition(t: Transition, defs: Record<string, Transition>): Transition {
  const def = defs[t.name.toLowerCase()];
  if (!def) {
    return t;
  }
  const out: Transition = { name: def.name, args: t.args.length > 0 ? t.args : def.args };
  if (def.params || t.params) {
    out.params = { ...def.params, ...t.params };
  }
  const duration = t.duration ?? def.duration;
  if (duration !== undefined) {
    out.duration = duration;
  }
  const ease = t.ease ?? def.ease;
  if (ease) {
    out.ease = ease;
  }
  return out;
}

function renderMarkdown(src: string): string {
  return marked.parse(src, { async: false }) as string;
}

export function parse(md: string): ParsedDeck {
  const { meta, body } = parseFrontmatter(md);
  const chunks = splitOutsideFences(body, "---");

  const slides: Slide[] = [];
  for (const chunk of chunks) {
    const { directives, body: src } = parseDirectives(chunk);
    if (src.trim() === "" && Object.keys(directives).length === 0) {
      continue;
    }

    const slide: Slide = {
      index: slides.length,
      html: "",
      transition: meta.transition ?? { name: DEFAULT_TRANSITION, args: [] },
      duration: DEFAULT_DURATION,
      layout: meta.layout ?? "normal",
      theme: undefined,
      data: {},
    };

    let duration: number | undefined;
    for (const [key, value] of Object.entries(directives)) {
      const str = value === true ? "" : value;
      switch (key) {
        case "transition":
          if (str) {
            slide.transition = parseTransition(str);
          }
          break;
        case "duration":
          duration = parseNumber(str) ?? duration;
          break;
        case "layout":
          slide.layout = parseLayout(str) ?? slide.layout;
          break;
        case "theme":
          slide.theme = str || undefined;
          break;
        case "live":
          slide.live = value === true || str !== "false";
          break;
        case "gpu":
          slide.gpu = value === true || str !== "false";
          break;
        case "no-gpu":
          slide.gpu = false;
          break;
        default:
          slide.data[key] = value;
      }
    }

    slide.transition = expandTransition(slide.transition, meta.transitionDefs);
    // Slide directive, then the transition's own, then the deck's.
    slide.duration = duration ?? slide.transition.duration ?? meta.duration ?? DEFAULT_DURATION;

    if (slide.layout === "two-column") {
      const [left, ...rest] = splitOutsideFences(src, "|||");
      slide.html = renderMarkdown(left);
      slide.htmlRight = renderMarkdown(rest.join("\n"));
    } else {
      slide.html = renderMarkdown(src);
    }
    slides.push(slide);
  }

  return { meta, slides };
}
