import fs from "node:fs";
import { fileURLToPath } from "node:url";

// Paths are relative to dist/cli.js after bundling.
export function runtimePath(): string {
  return fileURLToPath(new URL("./glide.iife.js", import.meta.url));
}

export function readVersion(): string {
  const pkg = JSON.parse(
    fs.readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
  ) as { version: string };
  return pkg.version;
}
