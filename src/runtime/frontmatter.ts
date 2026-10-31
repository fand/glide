export type Layout = "normal" | "center" | "two-column";

export type HeaderItem = { text: string; url?: string };

export type Transition = { name: string; args: string[] };

export type Frontmatter = {
  title?: string;
  theme?: string;
  transition?: Transition;
  duration?: number;
  layout?: Layout;
  header: HeaderItem[];
  css?: string;
  data: Record<string, string>;
};

export const DEFAULT_TRANSITION = "crossfade";
export const DEFAULT_DURATION = 0.5;

const LAYOUTS: Layout[] = ["normal", "center", "two-column"];

function unquote(s: string): string {
  const m = s.match(/^(["'])(.*)\1$/);
  return m ? m[2] : s;
}

export function parseHeaderItem(s: string): HeaderItem {
  const t = unquote(s.trim());
  const m = t.match(/^\[(.*)\]\((.*)\)$/);
  return m ? { text: m[1], url: m[2] } : { text: t };
}

export function parseTransition(s: string): Transition {
  const [name, ...args] = s.trim().split(/\s+/);
  return { name: name || DEFAULT_TRANSITION, args };
}

export function parseLayout(s: string): Layout | undefined {
  return (LAYOUTS as string[]).includes(s) ? (s as Layout) : undefined;
}

export function parseNumber(s: string): number | undefined {
  const n = Number(s);
  return s.trim() !== "" && Number.isFinite(n) ? n : undefined;
}

/** Split a leading `---` block off the input. Only flat `key: value` and the `header:` list are supported. */
export function parseFrontmatter(md: string): { meta: Frontmatter; body: string } {
  const meta: Frontmatter = { header: [], data: {} };
  const src = md.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const m = src.match(/^\s*---[ \t]*\n([\s\S]*?\n)?---[ \t]*(?:\n|$)/);
  if (!m) {
    return { meta, body: src };
  }

  let inHeader = false;
  for (const line of (m[1] ?? "").split("\n")) {
    const t = line.trim();
    if (t === "" || t.startsWith("#")) {
      continue;
    }
    if (inHeader) {
      if (t.startsWith("-")) {
        const item = t.slice(1).trim();
        if (item) {
          meta.header.push(parseHeaderItem(item));
        }
        continue;
      }
      inHeader = false;
    }
    const kv = t.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!kv) {
      continue;
    }
    const key = kv[1];
    const value = unquote(kv[2].trim());
    switch (key) {
      case "title":
        meta.title = value;
        break;
      case "theme":
        meta.theme = value || undefined;
        break;
      case "transition":
        meta.transition = value ? parseTransition(value) : undefined;
        break;
      case "duration":
        meta.duration = parseNumber(value);
        break;
      case "layout":
        meta.layout = parseLayout(value);
        break;
      case "css":
        meta.css = value || undefined;
        break;
      case "header":
        if (value) {
          meta.header = value
            .split("|")
            .map(parseHeaderItem)
            .filter((h) => h.text);
        } else {
          inHeader = true;
        }
        break;
      default:
        meta.data[key] = value;
    }
  }

  return { meta, body: src.slice(m[0].length) };
}
