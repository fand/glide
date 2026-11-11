export type Layout = "normal" | "center" | "two-column";

export type HeaderItem = { text: string; url?: string };

export type TransitionEase = "smoothstep" | "linear";

export type Transition = {
  name: string;
  /** Words after the name, e.g. `right` in `pixelsort right`. */
  args: string[];
  /** Constructor params for the transition class, e.g. `{ direction: "right" }`. */
  params?: Record<string, string | number | boolean>;
  /** Seconds. Beats the deck's `duration`, loses to a slide's `<!-- duration -->`. */
  duration?: number;
  ease?: TransitionEase;
};

export type Frontmatter = {
  title?: string;
  theme?: string;
  transition?: Transition;
  duration?: number;
  layout?: Layout;
  header: HeaderItem[];
  css?: string;
  /** Custom shaders from `transitionDefs`: name -> path, relative to the markdown. */
  shaderFiles: Record<string, string>;
  /** Named transitions from `transitionDefs`, e.g. `melt: { type: pixelsort, ... }`. */
  transitionDefs: Record<string, Transition>;
  data: Record<string, string>;
};

export const DEFAULT_TRANSITION = "swipe";
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

/** `true` / `false`, a number, or the string itself. */
export function parseValue(s: string): string | number | boolean {
  const t = unquote(s.trim());
  if (t === "true" || t === "false") {
    return t === "true";
  }
  return parseNumber(t) ?? t;
}

/**
 * A transition from block lines like `type: pixelsort`, `direction: right`.
 * `type`, `duration` and `ease` are reserved; other keys become params.
 */
export function parseTransitionBlock(entries: [string, string][]): Transition | undefined {
  let t: Transition | undefined;
  const rest: [string, string][] = [];
  for (const [k, v] of entries) {
    if (k === "type") {
      t = parseTransition(unquote(v));
    } else {
      rest.push([k, v]);
    }
  }
  if (!t) {
    return undefined;
  }
  for (const [k, v] of rest) {
    if (k === "duration") {
      t.duration = parseNumber(v);
    } else if (k === "ease") {
      const e = unquote(v);
      t.ease = e === "linear" || e === "smoothstep" ? e : undefined;
    } else {
      (t.params ??= {})[k] = parseValue(v);
    }
  }
  return t;
}

export function parseLayout(s: string): Layout | undefined {
  return (LAYOUTS as string[]).includes(s) ? (s as Layout) : undefined;
}

export function parseNumber(s: string): number | undefined {
  const n = Number(s);
  return s.trim() !== "" && Number.isFinite(n) ? n : undefined;
}

const indentOf = (line: string) => line.length - line.trimStart().length;

/**
 * Split a leading `---` block off the input. Supports flat `key: value`, the
 * `header:` list, and nested `key: value` blocks under `transition:` and
 * `transitionDefs:`.
 */
export function parseFrontmatter(md: string): { meta: Frontmatter; body: string } {
  const meta: Frontmatter = { header: [], shaderFiles: {}, transitionDefs: {}, data: {} };
  const src = md.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const m = src.match(/^\s*---[ \t]*\n([\s\S]*?\n)?---[ \t]*(?:\n|$)/);
  if (!m) {
    return { meta, body: src };
  }

  let inHeader = false;
  // Lines of the `transition:` block.
  let transitionBlock: [string, string][] | null = null;
  // Inside `transitionDefs:`: the indent of its entries, and the def being read.
  let defsIndent: number | null = null;
  let inDefs = false;
  let def: { name: string; entries: [string, string][] } | null = null;
  const endDef = () => {
    if (def) {
      const t = parseTransitionBlock(def.entries);
      if (t) {
        meta.transitionDefs[def.name] = t;
      } else {
        console.warn(`glide: transitionDefs "${def.name}" has no type; ignoring it.`);
      }
      def = null;
    }
  };
  for (const line of (m[1] ?? "").split("\n")) {
    const t = line.trim();
    if (t === "" || t.startsWith("#")) {
      continue;
    }
    const indent = indentOf(line);
    const nested = indent > 0 ? t.match(/^([\w-]+)\s*:\s*(.*)$/) : null;
    if (transitionBlock) {
      if (nested) {
        transitionBlock.push([nested[1], nested[2].trim()]);
        continue;
      }
      meta.transition = parseTransitionBlock(transitionBlock);
      transitionBlock = null;
    }
    if (inDefs) {
      if (nested) {
        defsIndent ??= indent;
        if (indent > defsIndent && def) {
          def.entries.push([nested[1], nested[2].trim()]);
          continue;
        }
        if (indent === defsIndent) {
          endDef();
          const name = nested[1].toLowerCase();
          const value = unquote(nested[2].trim());
          if (value) {
            meta.shaderFiles[name] = value;
          } else {
            def = { name, entries: [] };
          }
          continue;
        }
      }
      endDef();
      inDefs = false;
      defsIndent = null;
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
        if (value) {
          meta.transition = parseTransition(value);
        } else {
          transitionBlock = [];
        }
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
      case "transitionDefs":
        // Only the nested map form is supported; a scalar is ignored.
        inDefs = value === "";
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

  if (transitionBlock) {
    meta.transition = parseTransitionBlock(transitionBlock);
  }
  endDef();
  return { meta, body: src.slice(m[0].length) };
}
