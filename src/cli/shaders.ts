import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "../runtime/frontmatter.ts";

/** Real path of `rel` under `root`, or null if it escapes `root` or is not a file. */
async function resolveInside(root: string, rel: string): Promise<string | null> {
  try {
    const realRoot = await fs.promises.realpath(root);
    const real = await fs.promises.realpath(path.resolve(realRoot, rel));
    if (!real.startsWith(realRoot + path.sep)) {
      return null;
    }
    return (await fs.promises.stat(real)).isFile() ? real : null;
  } catch {
    return null;
  }
}

/**
 * Read the shader files listed under `transitions:` in the frontmatter.
 * Paths are relative to the markdown and must stay inside its folder.
 * Bad entries are skipped with a warning; the deck then falls back to crossfade.
 */
export async function loadShaders(mdPath: string, md: string): Promise<Record<string, string>> {
  const { transitions } = parseFrontmatter(md).meta;
  const dir = path.dirname(path.resolve(mdPath));
  const out: Record<string, string> = {};
  for (const [name, rel] of Object.entries(transitions)) {
    const file = await resolveInside(dir, rel);
    if (!file) {
      console.warn(`warning: transition "${name}": cannot read '${rel}' (missing or outside ${dir})`);
      continue;
    }
    out[name] = await fs.promises.readFile(file, "utf8");
  }
  return out;
}
