import { parseArgs } from "node:util";
import fs from "node:fs";
import { serve } from "./serve.ts";
import { build } from "./build.ts";
import { readVersion } from "./paths.ts";

const HELP = `glide - Markdown slideshow

Usage:
  glide <file.md> [options]            Start a dev server with live reload
  glide build [-o DIR] <file.md>       Export static HTML to DIR (default: ./out)

Options:
  -p, --port <n>       Dev server port (default: 3000)
      --host           Listen on all interfaces
      --no-open        Do not open the browser
  -t, --theme <name>   Theme (overrides the frontmatter)
  -o, --out <dir>      Output dir for build (default: ./out)
      --export <dir>   Same as \`glide build -o <dir>\`
  -h, --help           Show this help
  -v, --version        Show version
`;

function fail(msg: string): never {
  console.error(`glide: ${msg}\n`);
  console.error(HELP);
  process.exit(1);
}

async function main(): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        port: { type: "string", short: "p" },
        host: { type: "boolean" },
        "no-open": { type: "boolean" },
        theme: { type: "string", short: "t" },
        out: { type: "string", short: "o" },
        export: { type: "string" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
    });
  } catch (e) {
    fail((e as Error).message);
  }
  const { values, positionals } = parsed;

  if (values.help) {
    console.log(HELP);
    return;
  }
  if (values.version) {
    console.log(readVersion());
    return;
  }

  const isBuild = positionals[0] === "build";
  const args = isBuild ? positionals.slice(1) : positionals;
  if (args.length !== 1) {
    fail(args.length === 0 ? "missing markdown file" : "too many arguments");
  }
  const file = args[0];
  if (!fs.existsSync(file)) {
    fail(`file not found: ${file}`);
  }

  if (isBuild || values.export !== undefined) {
    await build({ file, outDir: values.out ?? values.export ?? "out", theme: values.theme });
    return;
  }

  const port = values.port === undefined ? 3000 : Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    fail(`invalid port: ${values.port}`);
  }
  await serve({
    file,
    port,
    host: values.host ?? false,
    open: !values["no-open"],
    theme: values.theme,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
