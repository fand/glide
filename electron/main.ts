import { join } from "path";
import { app, BrowserWindow } from "electron";
import { globalShortcut } from "electron";

// CONSTANTS
process.env.DIST = join(__dirname, "..");
process.env.PUBLIC = app.isPackaged
  ? process.env.DIST
  : join(process.env.DIST, "../public");

const PAGE_COUNT = 5;

type State = {
  page: number;
  win1: BrowserWindow | undefined;
  win2: BrowserWindow | undefined;
};

const state: State = {
  page: 0,
  win1: undefined,
  win2: undefined,
};

function createWindow() {
  const win = new BrowserWindow({
    icon: join(process.env.PUBLIC, "logo.svg"),
    frame: false,
    simpleFullscreen: true,
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

app.whenReady().then(() => {
  const w1 = createWindow();
  const w2 = createWindow();

  w1.setPosition(0, 0);
  w2.setOpacity(0);

  w1.webContents.on("did-finish-load", () => {
    w1.webContents.send("load", 0);
  });
  w2.webContents.on("did-finish-load", () => {
    w2.webContents.send("load", 1);
  });

  globalShortcut.register("Shift+Right", () => {
    state.page = (state.page + 1) % PAGE_COUNT;
    w1.webContents.send("load", state.page);
    w2.webContents.send("load", state.page + 1);
  });
  globalShortcut.register("Shift+Left", () => {
    state.page = (state.page - 1) % PAGE_COUNT;
    w1.webContents.send("load", state.page);
    w2.webContents.send("load", (state.page + 1) % PAGE_COUNT);
  });
});

app.on("window-all-closed", () => {
  state.win1 = undefined;
  state.win2 = undefined;
});

app.on("quit", () => {
  globalShortcut.unregisterAll();
});
