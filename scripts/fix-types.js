// tsc keeps `.ts` import specifiers in .d.ts output; rewrite them to `.js`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../dist/types/", import.meta.url));
for (const name of fs.readdirSync(dir, { recursive: true })) {
  const file = path.join(dir, String(name));
  if (!file.endsWith(".d.ts")) {
    continue;
  }
  const src = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, src.replace(/(from\s+["']\.{1,2}\/[^"']+)\.ts(["'])/g, "$1.js$2"));
}
