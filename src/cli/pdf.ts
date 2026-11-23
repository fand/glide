import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { startServer, type Server } from "./serve.ts";

export type PdfOpts = {
  file: string;
  /** Output path. Default: `<md basename>.pdf` in the cwd. */
  out?: string;
  theme?: string;
  transitions?: boolean;
  /** Chrome binary. Default: `CHROME_PATH`, then common install paths. */
  chrome?: string;
  /** Max wait (ms) for the deck to load before printing anyway. */
  timeout?: number;
};

type FindEnv = {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  exists: (p: string) => boolean;
};

const MAC_APPS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];

const LINUX_BINS = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];

const WIN_PATHS = [
  "Google\\Chrome\\Application\\chrome.exe",
  "Chromium\\Application\\chrome.exe",
  "Microsoft\\Edge\\Application\\msedge.exe",
];

/** Find a Chrome binary: `explicit`, then `CHROME_PATH`, then common paths. */
export function findChrome(explicit?: string, e: FindEnv = defaultFindEnv()): string | null {
  const given = explicit ?? e.env.CHROME_PATH;
  if (given) {
    return e.exists(given) ? given : null;
  }
  let candidates: string[] = [];
  if (e.platform === "darwin") {
    const home = e.env.HOME;
    candidates = [...MAC_APPS, ...(home ? MAC_APPS.map((p) => path.join(home, p)) : [])];
  } else if (e.platform === "win32") {
    const roots = [e.env.PROGRAMFILES, e.env["PROGRAMFILES(X86)"], e.env.LOCALAPPDATA].filter(
      (r): r is string => !!r,
    );
    candidates = roots.flatMap((r) => WIN_PATHS.map((p) => path.win32.join(r, p)));
  } else {
    const dirs = (e.env.PATH ?? "").split(path.delimiter).filter(Boolean);
    candidates = LINUX_BINS.flatMap((b) => dirs.map((d) => path.join(d, b)));
  }
  return candidates.find((p) => e.exists(p)) ?? null;
}

function defaultFindEnv(): FindEnv {
  return {
    platform: process.platform,
    env: process.env,
    exists: (p) => {
      try {
        return fs.statSync(p).isFile();
      } catch {
        return false;
      }
    },
  };
}

/** Chrome DevTools Protocol over `--remote-debugging-pipe` (fd 3 in, fd 4 out). */
class Cdp {
  private id = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private buf = Buffer.alloc(0);
  private input: Writable;

  constructor(input: Writable, output: Readable) {
    this.input = input;
    output.on("data", (chunk: Buffer) => {
      this.buf = Buffer.concat([this.buf, chunk]);
      let end: number;
      while ((end = this.buf.indexOf(0)) >= 0) {
        const msg = JSON.parse(this.buf.subarray(0, end).toString("utf8"));
        this.buf = this.buf.subarray(end + 1);
        const p = msg.id === undefined ? undefined : this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          if (msg.error) {
            p.reject(new Error(`${msg.error.message}`));
          } else {
            p.resolve(msg.result);
          }
        }
      }
    });
  }

  send(method: string, params: object = {}, sessionId?: string): Promise<any> {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.input.write(JSON.stringify({ id, method, params, sessionId }) + "\0");
    });
  }

  /** Reject every waiting call (e.g. Chrome exited). */
  failAll(err: Error): void {
    for (const p of this.pending.values()) {
      p.reject(err);
    }
    this.pending.clear();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function exportPdf(opts: PdfOpts): Promise<string> {
  const chromePath = findChrome(opts.chrome);
  if (!chromePath) {
    throw new Error(
      opts.chrome || process.env.CHROME_PATH
        ? `Chrome not found at ${opts.chrome ?? process.env.CHROME_PATH}`
        : "Chrome not found. Install Chrome or Chromium, or set --chrome <path> or CHROME_PATH.",
    );
  }
  const out = path.resolve(opts.out ?? `${path.basename(opts.file, path.extname(opts.file))}.pdf`);
  const timeout = opts.timeout ?? 30_000;

  let server: Server | null = null;
  let chrome: ChildProcess | null = null;
  let tmp: string | null = null;
  let cleaned: Promise<void> | null = null;
  const cleanup = () =>
    (cleaned ??= (async () => {
      if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
        const exited = new Promise((r) => chrome?.once("exit", r));
        // Browser.close may already be shutting it down; give it a moment first.
        if (!(await Promise.race([exited.then(() => true), sleep(1000).then(() => false)]))) {
          chrome.kill();
          await Promise.race([exited, sleep(3000)]);
        }
      }
      await server?.close();
      if (tmp) {
        // Chrome helper processes can still write to the profile for a moment
        // after the main process exits. A leftover temp dir is not worth failing over.
        try {
          fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
        } catch {}
      }
    })());
  const onSignal = () => {
    void cleanup().then(() => process.exit(130));
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    server = await startServer({
      file: opts.file,
      port: 0,
      host: false,
      theme: opts.theme,
      transitions: opts.transitions,
      liveReload: false,
    });
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "glide-chrome-"));
    const args = [
      "--headless",
      "--remote-debugging-pipe",
      `--user-data-dir=${tmp}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--mute-audio",
      "about:blank",
    ];
    // Chrome refuses to run as root with the sandbox on (e.g. in Docker).
    if (process.getuid?.() === 0) {
      args.unshift("--no-sandbox");
    }
    chrome = spawn(chromePath, args, { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] });
    let stderr = "";
    chrome.stderr?.on("data", (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-2000);
    });
    const cdp = new Cdp(chrome.stdio[3] as Writable, chrome.stdio[4] as Readable);
    let closing = false;
    const died = new Promise<never>((_, reject) => {
      const fail = (why: string) => {
        if (closing) {
          return;
        }
        const err = new Error(`Chrome ${why}\n${stderr.trim()}`);
        cdp.failAll(err);
        reject(err);
      };
      chrome?.once("error", (e) => fail(`failed to start: ${e.message}`));
      chrome?.once("exit", (code) => fail(`exited early (code ${code})`));
    });
    died.catch(() => {});

    const run = async () => {
      const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
      await cdp.send("Page.navigate", { url: `http://127.0.0.1:${server?.port}/?print` }, sessionId);

      const start = Date.now();
      for (;;) {
        const r = await cdp
          .send(
            "Runtime.evaluate",
            { expression: "document.documentElement.dataset.glideReady", returnByValue: true },
            sessionId,
          )
          .catch(() => null);
        if (r?.result?.value === "1") {
          break;
        }
        if (Date.now() - start > timeout) {
          console.warn(`glide: deck not ready after ${timeout / 1000}s; printing anyway.`);
          break;
        }
        await sleep(100);
      }

      const { data } = await cdp.send(
        "Page.printToPDF",
        { preferCSSPageSize: true, printBackground: true },
        sessionId,
      );
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, Buffer.from(data, "base64"));
      closing = true;
      await cdp.send("Browser.close").catch(() => {});
    };
    await Promise.race([run(), died]);
    return out;
  } finally {
    await cleanup();
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }
}
