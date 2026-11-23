import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { watch } from "chokidar";
import { renderHtml } from "./template.ts";
import { loadShaders } from "./shaders.ts";
import { parseFrontmatter } from "../runtime/frontmatter.ts";
import { runtimePath } from "./paths.ts";

export type ServeOpts = {
  file: string;
  port: number;
  host: boolean;
  open: boolean;
  theme?: string;
  transitions?: boolean;
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

export type ServerOpts = {
  file: string;
  port: number;
  host: boolean;
  theme?: string;
  transitions?: boolean;
  /** Watch files and reload the page on change. */
  liveReload: boolean;
};

export type Server = { port: number; close(): Promise<void> };

/** Serve the deck and the files next to it. */
export async function startServer(opts: ServerOpts): Promise<Server> {
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
        const shaders = await loadShaders(mdPath, md);
        send(res, 200, renderHtml({
            md,
            title,
            theme: opts.theme,
            transitions: opts.transitions,
            shaders,
            liveReload: opts.liveReload,
          }), MIME[".html"]);
        return;
      }
      if (p === "/glide.js") {
        send(res, 200, await fs.promises.readFile(runtime), MIME[".js"]);
        return;
      }
      if (p === "/__events" && opts.liveReload) {
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

  let ping: NodeJS.Timeout | undefined;
  let watcher: ReturnType<typeof watch> | undefined;
  if (opts.liveReload) {
    // Keep SSE connections alive through proxies.
    ping = setInterval(() => {
      for (const c of clients) {
        c.write(": ping\n\n");
      }
    }, 30_000);
    ping.unref();

    let timer: NodeJS.Timeout | undefined;
    watcher = watch(root, {
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
  }

  const hostname = opts.host ? "0.0.0.0" : "127.0.0.1";
  const port = await listen(server, opts.port, hostname);

  return {
    port,
    async close() {
      clearInterval(ping);
      await watcher?.close();
      for (const c of clients) {
        c.end();
      }
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    },
  };
}

export async function serve(opts: ServeOpts): Promise<void> {
  const server = await startServer({ ...opts, liveReload: true });
  const url = `http://localhost:${server.port}/`;
  console.log(`glide: serving ${path.relative(process.cwd(), path.resolve(opts.file)) || opts.file} at ${url}`);
  if (opts.open) {
    openBrowser(url);
  }

  const shutdown = () => {
    void server.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

/** True if something already accepts connections on `port` at `host`. */
function isTaken(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host });
    sock.setTimeout(500);
    sock.once("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.once("timeout", () => {
      sock.destroy();
      resolve(false);
    });
    sock.once("error", () => resolve(false));
  });
}

/**
 * Listen on `port`, trying the next ports if it is taken.
 * Bind errors alone miss servers on other addresses (e.g. `*:3000` on IPv6
 * still lets us bind 127.0.0.1:3000), so probe loopback first.
 */
async function listen(server: http.Server, port: number, host: string): Promise<number> {
  for (let p = port; p < port + 20; p++) {
    if (port !== 0) {
      const taken = await Promise.all([isTaken(p, "127.0.0.1"), isTaken(p, "::1")]);
      if (taken.some(Boolean)) {
        console.log(`port ${p} is in use, trying ${p + 1}`);
        continue;
      }
    }
    try {
      return await new Promise<number>((resolve, reject) => {
        server.once("error", reject);
        server.listen(p, host, () => {
          server.off("error", reject);
          const addr = server.address();
          resolve(typeof addr === "object" && addr ? addr.port : p);
        });
      });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EADDRINUSE" || port === 0) {
        throw e;
      }
      console.log(`port ${p} is in use, trying ${p + 1}`);
    }
  }
  throw new Error(`no free port in ${port}-${port + 19}`);
}
