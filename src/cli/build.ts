import fs from "node:fs";
import path from "node:path";
import { renderHtml } from "./template.ts";
import { loadShaders } from "./shaders.ts";
import { parseFrontmatter } from "../runtime/frontmatter.ts";
import { runtimePath } from "./paths.ts";

export type BuildOpts = {
  file: string;
  outDir: string;
  theme?: string;
  transitions?: boolean;
};

function isLocal(url: string): boolean {
  return url !== "" && !/^([a-z][\w+.-]*:|\/\/|#)/i.test(url);
}

/** Split markdown into text and fenced-code parts so code samples stay untouched. */
function splitFences(md: string): { text: string; code: boolean }[] {
  const parts: { text: string; code: boolean }[] = [];
  let buf: string[] = [];
  let fence: string | null = null;
  const flush = (code: boolean) => {
    if (buf.length > 0) {
      parts.push({ text: buf.join(""), code });
      buf = [];
    }
  };
  for (const line of md.split(/(?<=\n)/)) {
    const f = line.replace(/\r?\n$/, "").match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence === null && f) {
      flush(false);
      fence = f[1];
      buf.push(line);
    } else if (
      fence !== null &&
      f &&
      f[1][0] === fence[0] &&
      f[1].length >= fence.length &&
      f[2].trim() === ""
    ) {
      buf.push(line);
      flush(true);
      fence = null;
    } else {
      buf.push(line);
    }
  }
  flush(fence !== null);
  return parts;
}

const MD_IMAGE = /(!\[[^\]]*\]\(\s*)(?:<([^>\n]+)>|([^)\s]+))((?:\s+(?:"[^"]*"|'[^']*'))?\s*\))/g;
// Tags whose URL attributes point at files the page loads. `<a href>` is left
// alone: it links to a page rather than loading a file.
const HTML_TAG = /<(?:img|video|audio|source|track|script|iframe|embed|object|link)\b[^>]*>/gi;
const HTML_ATTR = /(\s(?:src|poster|href|data)\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;

/** Call `fn` on every local media URL outside code fences and replace it with the result. */
export function rewriteMedia(md: string, fn: (url: string) => string): string {
  const swap = (url: string) => (isLocal(url) ? fn(url) : url);
  return splitFences(md)
    .map(({ text, code }) =>
      code
        ? text
        : text
            .replace(MD_IMAGE, (_, pre: string, angle?: string, bare?: string, post?: string) =>
              angle !== undefined ? `${pre}<${swap(angle)}>${post}` : pre + swap(bare ?? "") + post,
            )
            .replace(HTML_TAG, (tag) =>
              tag.replace(HTML_ATTR, (_, pre: string, dq?: string, sq?: string, bare?: string) => {
                if (dq !== undefined) {
                  return `${pre}"${swap(dq)}"`;
                }
                if (sq !== undefined) {
                  return `${pre}'${swap(sq)}'`;
                }
                return pre + swap(bare ?? "");
              }),
            ),
    )
    .join("");
}

/** Replace `key: VALUE` and `- VALUE` lines in the frontmatter block. */
export function rewriteFrontmatterValue(md: string, from: string, to: string): string {
  const m = md.match(/^\s*---[ \t]*\r?\n[\s\S]*?\n---[ \t]*(?:\r?\n|$)/);
  if (!m) {
    return md;
  }
  const fm = m[0].replace(
    /^([ \t]*(?:[\w-]+[ \t]*:|-)[ \t]*["']?)(.*?)(["']?[ \t]*)$/gm,
    (line, pre: string, v: string, post: string) => (v === from ? pre + to + post : line),
  );
  return fm + md.slice(m[0].length);
}

function toFsPath(baseDir: string, url: string): string {
  const clean = url.replace(/[?#].*$/, "");
  let decoded = clean;
  try {
    decoded = decodeURI(clean);
  } catch {}
  return decoded.startsWith("/") ? path.join(baseDir, decoded) : path.resolve(baseDir, decoded);
}

export async function build(opts: BuildOpts): Promise<void> {
  const mdPath = path.resolve(opts.file);
  const baseDir = path.dirname(mdPath);
  const outDir = path.resolve(opts.outDir);
  const assetsDir = path.join(outDir, "assets");
  let md = await fs.promises.readFile(mdPath, "utf8");

  await fs.promises.mkdir(outDir, { recursive: true });

  // source path -> new URL
  const copied = new Map<string, string>();
  const usedNames = new Set<string>();
  const missing = new Set<string>();

  function assetName(src: string): string {
    const ext = path.extname(src);
    const stem = path.basename(src, ext);
    let name = stem + ext;
    for (let i = 1; usedNames.has(name); i++) {
      name = `${stem}-${i}${ext}`;
    }
    if (name !== stem + ext) {
      console.warn(`warning: file name collision for '${stem + ext}', saved as '${name}'`);
    }
    usedNames.add(name);
    return name;
  }

  md = rewriteMedia(md, (url) => {
    const src = toFsPath(baseDir, url);
    const done = copied.get(src);
    if (done) {
      return done;
    }
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) {
      if (!missing.has(src)) {
        missing.add(src);
        console.warn(`warning: missing file '${path.relative(process.cwd(), src)}'`);
      }
      return url;
    }
    const name = assetName(src);
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.copyFileSync(src, path.join(assetsDir, name));
    const next = `./assets/${encodeURI(name)}`;
    copied.set(src, next);
    return next;
  });

  const { meta } = parseFrontmatter(md);
  // Frontmatter files (css, scripts): keep the relative path when inside the
  // md's folder, so url() in css and relative imports still work. Otherwise
  // copy to assets/ and rewrite the value.
  const fmFiles = [meta.css, ...meta.scripts].filter((v): v is string => !!v && isLocal(v));
  for (const value of new Set(fmFiles)) {
    const src = toFsPath(baseDir, value);
    const rel = path.relative(baseDir, src);
    if (!fs.existsSync(src)) {
      console.warn(`warning: missing file '${path.relative(process.cwd(), src)}'`);
    } else if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
      await fs.promises.mkdir(path.dirname(path.join(outDir, rel)), { recursive: true });
      await fs.promises.copyFile(src, path.join(outDir, rel));
    } else {
      const name = assetName(src);
      await fs.promises.mkdir(assetsDir, { recursive: true });
      await fs.promises.copyFile(src, path.join(assetsDir, name));
      md = rewriteFrontmatterValue(md, value, `./assets/${name}`);
    }
  }

  const title = meta.title ?? path.basename(mdPath, ".md");
  await fs.promises.writeFile(
    path.join(outDir, "index.html"),
    renderHtml({
      md,
      title,
      lang: meta.lang,
      theme: opts.theme,
      transitions: opts.transitions,
      shaders: await loadShaders(mdPath, md),
    }),
  );
  await fs.promises.copyFile(runtimePath(), path.join(outDir, "glide.js"));

  const relOut = path.relative(process.cwd(), outDir);
  const rel = relOut.startsWith("..") ? outDir : relOut || ".";
  console.log(`glide: built ${path.basename(mdPath)} -> ${rel}/index.html (${copied.size} assets)`);
}
