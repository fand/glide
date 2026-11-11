// `pnpm start [file.md] [glide options]`: build, then run the CLI.
// Defaults to examples/demo.md when no .md is given.
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2).filter((a) => a !== "--");
if (!args.some((a) => a.endsWith(".md"))) {
  args.unshift("examples/demo.md");
}

const build = spawnSync("pnpm", ["build"], { stdio: "inherit" });
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}
const run = spawnSync("node", ["dist/cli.js", ...args], { stdio: "inherit" });
process.exit(run.status ?? 1);
