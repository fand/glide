import { join } from "path";
import { app, BrowserWindow } from "electron";
import { ipcMain } from "electron/main";

// Prepare paths
process.env.DIST = join(__dirname, "..");
process.env.PUBLIC = app.isPackaged
  ? process.env.DIST
  : join(process.env.DIST, "../public");

type State = {
  win1: BrowserWindow | undefined;
  win2: BrowserWindow | undefined;
};

const state: State = {
  win1: undefined,
  win2: undefined,
};

function createWindow() {
  const win = new BrowserWindow({
    icon: join(process.env.PUBLIC, "logo.svg"),
    frame: false,
    // simpleFullscreen: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: true,
      preload: join(__dirname, "./preload.js"),
    },
  });

  if (app.isPackaged) {
    win.loadFile(join(process.env.DIST, "index.html"));
  } else {
    win.loadURL(process.env["VITE_DEV_SERVER_URL"]);
  }

  return win;
}

app.on("window-all-closed", () => {
  state.win1 = undefined;
  state.win2 = undefined;
});

app.whenReady().then(() => {
  const w1 = createWindow();
  const w2 = createWindow();

  w1.setPosition(0, 0);
  w2.setPosition(900, 0);

  w1.webContents.on("did-finish-load", () => {
    w1.webContents.send("load", 1);
  });
  w2.webContents.on("did-finish-load", () => {
    w2.webContents.send("load", 2);
  });
});
