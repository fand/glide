import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { watch } from "chokidar";
import { renderHtml } from "./template.ts";
import { parseFrontmatter } from "../runtime/frontmatter.ts";
import { runtimePath } from "./paths.ts";

export type ServeOpts = {
  file: string;
  port: number;
  host: boolean;
  open: boolean;
  theme?: string;
};

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

const IGNORED_DIRS = new Set(["node_modules", ".git", "out"]);

function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  const child = spawn(cmd, args, { stdio: "ignore", detached: true });
  child.on("error", () => {});
  child.unref();
}

function send(res: http.ServerResponse, status: number, body: string | Buffer, type: string): void {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-cache" });
  res.end(body);
}

/** Resolve a URL path inside `root`, or null if it escapes it or does not exist. */
export async function resolveStatic(root: string, urlPath: string): Promise<string | null> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) {
    return null;
  }
  const target = path.resolve(root, "." + decoded);
  try {
    const real = await fs.promises.realpath(target);
    if (real !== root && !real.startsWith(root + path.sep)) {
      return null;
    }
    const stat = await fs.promises.stat(real);
    return stat.isFile() ? real : null;
  } catch {
    return null;
  }
}

export async function serve(opts: ServeOpts): Promise<void> {
  const mdPath = path.resolve(opts.file);
  const root = await fs.promises.realpath(path.dirname(mdPath));
  const runtime = runtimePath();
  const clients = new Set<http.ServerResponse>();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const p = url.pathname;
    try {
      if (p === "/" || p === "/index.html") {
        const md = await fs.promises.readFile(mdPath, "utf8");
        const title = parseFrontmatter(md).meta.title ?? path.basename(mdPath, ".md");
        send(res, 200, renderHtml({ md, title, theme: opts.theme, liveReload: true }), MIME[".html"]);
        return;
      }
      if (p === "/glide.js") {
        send(res, 200, await fs.promises.readFile(runtime), MIME[".js"]);
        return;
      }
      if (p === "/__events") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        res.write(": connected\n\n");
        clients.add(res);
        req.on("close", () => clients.delete(res));
        return;
      }
      const file = await resolveStatic(root, p);
      if (!file) {
        send(res, 404, "Not Found", "text/plain; charset=utf-8");
        return;
      }
      const type = MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      send(res, 500, String(e), "text/plain; charset=utf-8");
    }
  });

  // Keep SSE connections alive through proxies.
  const ping = setInterval(() => {
    for (const c of clients) {
      c.write(": ping\n\n");
    }
  }, 30_000);
  ping.unref();

  let timer: NodeJS.Timeout | undefined;
  const watcher = watch(root, {
    ignoreInitial: true,
    ignored: (p) => path.relative(root, p).split(path.sep).some((s) => IGNORED_DIRS.has(s)),
  });
  watcher.on("all", (_event, changed) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      console.log(`changed: ${path.relative(root, changed) || changed}`);
      for (const c of clients) {
        c.write("data: reload\n\n");
      }
    }, 100);
  });

  const hostname = opts.host ? "0.0.0.0" : "127.0.0.1";
  const port = await listen(server, opts.port, hostname);
  const url = `http://localhost:${port}/`;
  console.log(`glide: serving ${path.relative(process.cwd(), mdPath) || mdPath} at ${url}`);
  if (opts.open) {
    openBrowser(url);
  }

  const shutdown = () => {
    clearInterval(ping);
    void watcher.close();
    for (const c of clients) {
      c.end();
    }
    server.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

/** Listen on `port`, trying the next ports if it is taken. */
function listen(server: http.Server, port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const attempt = (p: number) => {
      const onError = (e: NodeJS.ErrnoException) => {
        if (e.code === "EADDRINUSE" && tries++ < 10) {
          console.log(`port ${p} is in use, trying ${p + 1}`);
          attempt(p + 1);
        } else {
          reject(e);
        }
      };
      server.once("error", onError);
      server.listen(p, host, () => {
        server.off("error", onError);
        resolve(p);
      });
    };
    attempt(port);
  });
}
