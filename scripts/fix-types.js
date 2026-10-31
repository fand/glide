// tsc keeps `.ts` import specifiers in .d.ts output; rewrite them to `.js`.
import fs from "node:fs";

const dir = new URL("../dist/types/", import.meta.url);
for (const name of fs.readdirSync(dir)) {
  const file = new URL(name, dir);
  const src = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, src.replace(/(from\s+["']\.{1,2}\/[^"']+)\.ts(["'])/g, "$1.js$2"));
}
