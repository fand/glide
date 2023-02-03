import { join } from "node:path";
import fs from "node:fs";
import { app, BrowserWindow } from "electron";
import { globalShortcut } from "electron";
import { Client as OSCClient, Bundle } from "node-osc";

// CONSTANTS
process.env.DIST = join(__dirname, "..");
process.env.PUBLIC = app.isPackaged
  ? process.env.DIST
  : join(process.env.DIST, "../public");

const PAGE_COUNT = fs
  .readdirSync(join(__dirname, "../../public"))
  .filter((f) => f.startsWith("page-")).length;

type State = {
  page: number;
  win: BrowserWindow | undefined;
  winNext: BrowserWindow | undefined;
  winPrev: BrowserWindow | undefined;
};

const state: State = {
  page: 0,
  win: undefined,
  winNext: undefined,
  winPrev: undefined,
};

function createWindow() {
  const win = new BrowserWindow({
    icon: join(process.env.PUBLIC, "logo.svg"),
    frame: false,
    opacity: 0.9,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: true,
      preload: join(__dirname, "./preload.js"),
    },
  });
  win.setSimpleFullScreen(true);

  if (app.isPackaged) {
    win.loadFile(join(process.env.DIST, "index.html"));
  } else {
    win.loadURL(process.env["VITE_DEV_SERVER_URL"]);
  }

  return win;
}

app.whenReady().then(async () => {
  const win = createWindow();
  const winNext = createWindow();
  const winPrev = createWindow();

  win.title = "GLIDE-ELECTRON WIN 1";
  winNext.title = "GLIDE-ELECTRON WIN 2";
  winPrev.title = "GLIDE-ELECTRON WIN 0";

  win.on("close", () => (state.win = undefined));
  winNext.on("close", () => (state.winNext = undefined));
  winPrev.on("close", () => (state.winPrev = undefined));

  await new Promise((o) => win.webContents.on("did-finish-load", o));
  await new Promise((o) => winNext.webContents.on("did-finish-load", o));
  await new Promise((o) => winPrev.webContents.on("did-finish-load", o));

  await new Promise((o) => setTimeout(o, 1000));

  win.moveTop();

  win.webContents.send("load", 0);
  winNext.webContents.send("load", 1);
  winPrev.webContents.send("load", PAGE_COUNT - 1);

  const osc = new OSCClient("127.0.0.1", 9999);

  globalShortcut.register("Shift+Space", () => {
    osc.send(new Bundle(["/init", PAGE_COUNT]));
  });

  globalShortcut.register("Shift+Right", () => {
    const oldPage = state.page;
    state.page = (state.page + 1) % PAGE_COUNT;

    let [winPrev, win, winNext] = [state.winPrev, state.win, state.winNext];

    [winPrev, win, winNext] = [win, winNext, winPrev];
    winNext?.webContents.send("load", (state.page + 1) % PAGE_COUNT);

    win.moveTop();

    osc.send(new Bundle(["/page", oldPage, state.page]));

    [state.winPrev, state.win, state.winNext] = [winPrev, win, winNext];
  });

  globalShortcut.register("Shift+Left", () => {
    const oldPage = state.page;
    state.page = (oldPage - 1 + PAGE_COUNT) % PAGE_COUNT;

    let [winPrev, win, winNext] = [state.winPrev, state.win, state.winNext];

    [winPrev, win, winNext] = [winNext, winPrev, win];
    winPrev?.webContents.send(
      "load",
      (state.page - 1 + PAGE_COUNT) % PAGE_COUNT
    );

    win.moveTop();

    osc.send(new Bundle(["/page", oldPage, state.page]));

    [state.winPrev, state.win, state.winNext] = [winPrev, win, winNext];
  });

  state.win = win;
  state.winNext = winNext;
  state.winPrev = winPrev;
});

app.on("window-all-closed", () => {
  state.win = undefined;
  state.winNext = undefined;
  state.winPrev = undefined;
});

app.on("quit", () => {
  globalShortcut.unregisterAll();
});
